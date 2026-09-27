import { XMLParser } from "fast-xml-parser";
import { safeUrl, type Entry, type Source } from "../src/model.ts";
import { entryId } from "./quality.ts";
export interface SourceConfig {
  id: string;
  kind: "bluesky" | "reddit" | "x" | "rss";
  enabled: boolean;
  url?: string;
  source?: Source;
}
export type Fetcher = typeof fetch;
// The configuration is operator controlled. Source content never chooses a request URL.
export async function get(
  url: string,
  fetcher: Fetcher = fetch,
  token?: string,
) {
  if (!safeUrl(url)) throw new Error("Source URL must use HTTPS");
  const response = await fetcher(url, {
    headers: {
      "User-Agent": "IMD-Signal/1.0 (+https://imd.fun)",
      Accept:
        "application/json, application/rss+xml, application/atom+xml, application/xml",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > 2_000_000)
    throw new Error("Source too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 2_000_000) {
      await reader.cancel();
      throw new Error("Source too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Math.min(Number(n), 0x10ffff)),
    )
    .replace(/[ \t]+/g, " ")
    .trim();
const arr = <T>(v: T | T[] | undefined): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];
function base(
  source: Source,
  url: string,
  date: string,
  title: string,
  text: string,
  author: string,
): Entry {
  return {
    id: entryId(url),
    source,
    url,
    publishedAt: date,
    title: clean(title),
    text: clean(text),
    author: clean(author),
    type: "Post",
    tags: ["Identity-MD"],
  };
}
export async function collectSource(
  config: SourceConfig,
  fetcher: Fetcher = fetch,
): Promise<Entry[]> {
  if (config.kind === "bluesky") {
    const entries: Entry[] = [];
    for (const q of ['"Identity-MD"', '"imd.fun"', "$IMD"]) {
      const data = JSON.parse(
        await get(
          `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=latest&limit=100`,
          fetcher,
        ),
      );
      if (!Array.isArray(data.posts))
        throw new Error("Unexpected Bluesky response");
      for (const p of data.posts) {
        if (!p.record?.text || !p.uri || !p.author?.handle) continue;
        const url = `https://bsky.app/profile/${encodeURIComponent(p.author.handle)}/post/${encodeURIComponent(p.uri.split("/").pop())}`;
        const e = base(
          "Bluesky",
          url,
          p.record.createdAt,
          "",
          p.record.text,
          p.author.displayName || p.author.handle,
        );
        e.handle = p.author.handle;
        e.isReply = Boolean(p.record.reply);
        e.title = clean(p.record.text.split("\n")[0]).slice(0, 180);
        const embed = p.embed?.media ?? p.embed;
        const im = embed?.images?.[0];
        if (safeUrl(im?.fullsize)) {
          e.image = im.fullsize;
          e.imageAlt = clean(im.alt);
          e.type = "Image";
        }
        if (embed?.$type?.includes("video")) {
          e.type = "Video";
          if (safeUrl(embed.thumbnail)) e.image = embed.thumbnail;
        }
        entries.push(e);
      }
    }
    return entries;
  }
  if (config.kind === "reddit") {
    const data = JSON.parse(
      await get(
        "https://www.reddit.com/search.json?q=%22Identity-MD%22%20OR%20%22imd.fun%22%20OR%20%22%24IMD%22&sort=new&t=month&limit=100",
        fetcher,
      ),
    );
    if (!Array.isArray(data.data?.children))
      throw new Error("Unexpected Reddit response");
    return data.data.children.map((p: { data: Record<string, any> }) => {
      const d = p.data;
      const e = base(
        "Reddit",
        `https://www.reddit.com${d.permalink}`,
        new Date(d.created_utc * 1000).toISOString(),
        d.title,
        d.selftext || d.title,
        d.author,
      );
      e.isRepost = Boolean(d.crosspost_parent);
      e.isReply = p.data.name?.startsWith("t1_");
      if (safeUrl(d.url) && /\.(?:png|jpg|jpeg|webp)(?:\?|$)/i.test(d.url)) {
        e.image = d.url;
        e.imageAlt = clean(d.title);
        e.type = "Image";
      }
      if (d.is_video) {
        e.type = "Video";
        const v = d.media?.reddit_video?.fallback_url;
        if (safeUrl(v)) e.video = v;
      }
      return e;
    });
  }
  if (config.kind === "x") {
    const token = process.env.X_BEARER_TOKEN;
    if (!token) throw new Error("X API credentials not configured");
    const q = '("Identity-MD" OR "imd.fun" OR $IMD) -is:reply -is:retweet';
    const data = JSON.parse(
      await get(
        `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=100&tweet.fields=created_at,author_id,referenced_tweets,attachments&expansions=author_id,attachments.media_keys&user.fields=name,username&media.fields=type,url,preview_image_url,alt_text`,
        fetcher,
        token,
      ),
    );
    if (data.errors && !data.data)
      throw new Error("X API could not return posts");
    return (data.data ?? []).map((p: Record<string, any>) => {
      const author = data.includes?.users?.find(
        (u: Record<string, any>) => u.id === p.author_id,
      );
      const e = base(
        "X",
        `https://x.com/i/status/${p.id}`,
        p.created_at,
        "",
        p.text,
        author?.name ?? "X contributor",
      );
      e.handle = author?.username;
      e.title = clean(p.text.split("\n")[0]).slice(0, 180);
      e.isReply = p.referenced_tweets?.some(
        (r: Record<string, string>) => r.type === "replied_to",
      );
      e.isRepost = p.referenced_tweets?.some(
        (r: Record<string, string>) => r.type === "retweeted",
      );
      const media = data.includes?.media?.find((m: Record<string, any>) =>
        p.attachments?.media_keys?.includes(m.media_key),
      );
      if (media) {
        if (safeUrl(media.url)) {
          e.image = media.url;
          e.imageAlt = clean(media.alt_text || p.text);
          e.type = "Image";
        }
        if (media.type === "video") {
          e.type = "Video";
          if (safeUrl(media.preview_image_url))
            e.image = media.preview_image_url;
        }
      }
      return e;
    });
  }
  if (!config.url) throw new Error("RSS source URL is missing");
  const raw = await get(config.url, fetcher);
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error("DTD is not supported");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
  }).parse(raw);
  const items = parsed.rss?.channel?.item ?? parsed.feed?.entry;
  if (!parsed.rss && !parsed.feed) throw new Error("Expected RSS or Atom");
  return arr<Record<string, any>>(items).flatMap((d) => {
    const link =
      typeof d.link === "string"
        ? d.link
        : arr<Record<string, any>>(d.link).find(
            (l) => !l["@_rel"] || l["@_rel"] === "alternate",
          )?.["@_href"];
    if (!safeUrl(link)) return [];
    const content =
      d["content:encoded"] ??
      d.content?.["#text"] ??
      d.content ??
      d.description ??
      d.summary?.["#text"] ??
      d.summary ??
      d["media:group"]?.["media:description"] ??
      "";
    const e = base(
      config.source ?? "Web",
      link,
      d.pubDate ?? d.published ?? d.updated,
      clean(d.title?.["#text"] ?? d.title),
      clean(content),
      clean(
        d.author?.name ??
          d["dc:creator"] ??
          parsed.rss?.channel?.title ??
          parsed.feed?.title ??
          "Publication",
      ),
    );
    e.type = e.source === "YouTube" ? "Video" : "Article";
    e.tags = ["Identity-MD", "Source excerpt"];
    const media =
      d["media:content"] ??
      d["media:group"]?.["media:thumbnail"] ??
      d.enclosure;
    const im = media?.["@_url"];
    if (
      safeUrl(im) &&
      /^(?:image\/|image$)/.test(media?.["@_type"] ?? media?.["@_medium"] ?? "")
    ) {
      e.image = im;
      e.imageAlt = e.title;
    }
    return [e];
  });
}
