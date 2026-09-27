import { createHash } from "node:crypto";
import { safeUrl, type Entry } from "../src/model.ts";
export function canonicalUrl(value: string) {
  const u = new URL(value);
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|ref$|source$|fbclid$|gclid$)/i.test(key))
      u.searchParams.delete(key);
  u.hostname = u.hostname
    .replace(/^www\./, "")
    .replace(/^twitter\.com$/, "x.com");
  u.pathname = u.pathname.replace(/\/$/, "");
  u.searchParams.sort();
  return u.toString();
}
export const normalized = (s: string) =>
  s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
function shingles(s: string) {
  const words = normalized(s).split(" ");
  return new Set(
    words.slice(0, -2).map((_, i) => words.slice(i, i + 3).join(" ")),
  );
}
export function similarity(a: string, b: string) {
  if (normalized(a) === normalized(b)) return 1;
  const x = shingles(a),
    y = shingles(b);
  if (!x.size || !y.size) return 0;
  const overlap = [...x].filter((s) => y.has(s)).length;
  return overlap / (x.size + y.size - overlap);
}
export function rejectReason(e: Entry, now = Date.now()): string | null {
  if (!safeUrl(e.url)) return "unsafe-url";
  if (
    !Number.isFinite(Date.parse(e.publishedAt)) ||
    Date.parse(e.publishedAt) > now + 300000 ||
    Date.parse(e.publishedAt) < now - 30 * 86400000
  )
    return "outside-window";
  if (e.isReply) return "reply";
  if (e.isRepost) return "repost";
  const text = `${e.title}\n${e.text}\n${e.imageAlt ?? ""}`;
  const topic = /(?:identity[.\s_-]*md\b|imd\.fun\b|\$IMD\b)/i;
  // Require the topic in the headline or opening, not one incidental mention in a long article.
  if (!topic.test(`${e.title} ${e.text.slice(0, 280)} ${e.imageAlt ?? ""}`))
    return "off-topic";
  if (
    !/(?:identity[.\s_-]*md\b|imd\.fun\b)/i.test(text) &&
    !/(?:token|crypto|blockchain|swarm|contributor|ethereum|onchain|on-chain|\$IMD)/i.test(
      text,
    )
  )
    return "ambiguous-ticker";
  if (
    /(?:guaranteed\s+(?:profit|return)|send.{0,30}(?:eth|btc).{0,30}(?:double|back)|claim\s+(?:your\s+)?(?:free\s+)?airdrop|100x\s+(?:gem|guaranteed)|dm\s+(?:me|us)\s+to\s+(?:buy|invest))/i.test(
      text,
    )
  )
    return "spam";
  if (
    (text.match(/https?:\/\/\S+/g) || []).length > 4 ||
    (text.match(/#[\w]+/g) || []).length > 8
  )
    return "link-or-tag-spam";
  if (e.image && ["Image", "Post"].includes(e.type) && safeUrl(e.image))
    return null;
  const words = new Set(
    normalized(e.text)
      .split(" ")
      .filter((w) => w.length > 2 && !["imd", "identitymd"].includes(w)),
  );
  if (words.size < 12 || normalized(e.text).length < 85) return "low-substance";
  return null;
}
export function curate(entries: Entry[], now = Date.now()) {
  const accepted: Entry[] = [];
  const rejected: Record<string, number> = {};
  const urls = new Set<string>();
  for (const e of [...entries].sort(
    (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
  )) {
    let reason = rejectReason(e, now);
    const url = safeUrl(e.originalUrl)
      ? canonicalUrl(e.originalUrl)
      : safeUrl(e.url)
        ? canonicalUrl(e.url)
        : "";
    if (
      !reason &&
      (urls.has(url) ||
        accepted.some(
          (a) =>
            a.id === e.id ||
            similarity(`${a.title} ${a.text}`, `${e.title} ${e.text}`) >=
              0.76 ||
            Boolean(
              e.image &&
              a.image &&
              canonicalUrl(e.image) === canonicalUrl(a.image),
            ),
        ))
    )
      reason = "duplicate";
    if (reason) {
      rejected[reason] = (rejected[reason] ?? 0) + 1;
      continue;
    }
    urls.add(url);
    accepted.push(e);
  }
  return {
    entries: accepted
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, 500),
    rejected,
  };
}
export function entryId(url: string) {
  return createHash("sha256")
    .update(canonicalUrl(url))
    .digest("hex")
    .slice(0, 24);
}
