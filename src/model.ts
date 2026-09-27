export const sources = [
  "X",
  "Bluesky",
  "YouTube",
  "Mirror",
  "Reddit",
  "Web",
] as const;
export const types = ["Post", "Article", "Video", "Image", "Story"] as const;
export type Source = (typeof sources)[number];
export type EntryType = (typeof types)[number];
export interface Entry {
  id: string;
  source: Source;
  type: EntryType;
  author: string;
  handle?: string;
  title: string;
  text: string;
  publishedAt: string;
  url: string;
  image?: string;
  imageAlt?: string;
  video?: string;
  tags: string[];
  example?: boolean;
  isReply?: boolean;
  isRepost?: boolean;
  originalUrl?: string;
}
export interface Feed {
  version: 1;
  mode: "preview" | "live";
  generatedAt: string;
  lastSuccessAt?: string;
  entries: Entry[];
  health: { name: string; ok: boolean; detail: string }[];
}
export function safeUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
export function parseFeed(value: unknown): Feed {
  if (!value || typeof value !== "object") throw new Error("Invalid feed");
  const feed = value as Feed;
  if (
    feed.version !== 1 ||
    !["preview", "live"].includes(feed.mode) ||
    !Number.isFinite(Date.parse(feed.generatedAt)) ||
    !Array.isArray(feed.entries) ||
    !Array.isArray(feed.health)
  )
    throw new Error("Invalid feed format");
  const ids = new Set<string>();
  for (const e of feed.entries) {
    if (
      !e ||
      typeof e.id !== "string" ||
      ids.has(e.id) ||
      !sources.includes(e.source) ||
      !types.includes(e.type) ||
      !["title", "text", "author"].every(
        (k) => typeof e[k as keyof Entry] === "string",
      ) ||
      !safeUrl(e.url) ||
      !Number.isFinite(Date.parse(e.publishedAt)) ||
      !Array.isArray(e.tags) ||
      !e.tags.every((t) => typeof t === "string")
    )
      throw new Error("Invalid feed entry");
    if (
      e.image &&
      !safeUrl(e.image) &&
      !/^\.\/assets\/[a-zA-Z0-9._-]+$/.test(e.image)
    )
      throw new Error("Invalid media URL");
    if (e.video && !safeUrl(e.video)) throw new Error("Invalid video URL");
    if (feed.mode === "live" && e.example)
      throw new Error("Example in live feed");
    ids.add(e.id);
  }
  for (const h of feed.health)
    if (
      !h ||
      typeof h.name !== "string" ||
      typeof h.ok !== "boolean" ||
      typeof h.detail !== "string"
    )
      throw new Error("Invalid health");
  return feed;
}
export interface Filters {
  sources: Source[];
  types: EntryType[];
  query: string;
  tab: "all" | "saved" | "hidden";
  saved: string[];
  hidden: string[];
  order: "newest" | "oldest";
}
export function filterEntries(entries: Entry[], f: Filters) {
  return entries
    .filter(
      (e) =>
        (f.tab === "hidden"
          ? f.hidden.includes(e.id)
          : !f.hidden.includes(e.id)) &&
        (f.tab !== "saved" || f.saved.includes(e.id)) &&
        f.sources.includes(e.source) &&
        f.types.includes(e.type) &&
        `${e.title} ${e.text} ${e.author} ${e.tags.join(" ")}`
          .toLowerCase()
          .includes(f.query.toLowerCase().trim()),
    )
    .sort(
      (a, b) =>
        (Date.parse(b.publishedAt) - Date.parse(a.publishedAt)) *
        (f.order === "newest" ? 1 : -1),
    );
}
