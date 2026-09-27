import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSource, get, type Fetcher } from "./adapters.ts";
const mock =
  (data: unknown, status = 200): Fetcher =>
  async () =>
    new Response(typeof data === "string" ? data : JSON.stringify(data), {
      status,
    });
test("Bluesky maps originals, replies and image alt text", async () => {
  const entries = await collectSource(
    { id: "b", kind: "bluesky", enabled: true },
    mock({
      posts: [
        {
          uri: "at://did:plc:test/app.bsky.feed.post/1",
          author: { handle: "builder.test", displayName: "Builder" },
          record: {
            text: "Identity-MD illustration",
            createdAt: "2026-09-27T10:00:00Z",
            reply: {},
          },
          embed: {
            images: [
              { fullsize: "https://example.com/a.jpg", alt: "Swarm meme" },
            ],
          },
        },
      ],
    }),
  );
  assert.equal(entries.length, 3);
  assert.equal(entries[0].isReply, true);
  assert.equal(entries[0].imageAlt, "Swarm meme");
  assert.equal(entries[0].type, "Image");
});
test("RSS and Atom normalize text without rendering publisher markup", async () => {
  const rss =
    "<rss><channel><title>Notebook</title><item><title>Identity-MD notes</title><link>https://example.com/article</link><pubDate>Sun, 27 Sep 2026 10:00:00 GMT</pubDate><description><![CDATA[<b>Useful</b> &amp; readable]]></description></item></channel></rss>";
  const [e] = await collectSource(
    { id: "r", kind: "rss", enabled: true, url: "https://example.com/feed" },
    mock(rss),
  );
  assert.equal(e.type, "Article");
  assert.equal(e.text, "Useful & readable");
  const atom =
    '<feed><title>Channel</title><entry><title>Identity-MD explained</title><link rel="alternate" href="https://youtube.com/watch?v=123"/><published>2026-09-27T10:00:00Z</published><summary>Video summary</summary></entry></feed>';
  const [v] = await collectSource(
    {
      id: "y",
      kind: "rss",
      enabled: true,
      source: "YouTube",
      url: "https://example.com/feed",
    },
    mock(atom),
  );
  assert.equal(v.type, "Video");
  assert.equal(v.text, "Video summary");
});
test("Reddit flags crossposts and preserves image content", async () => {
  const [e] = await collectSource(
    { id: "r", kind: "reddit", enabled: true },
    mock({
      data: {
        children: [
          {
            data: {
              permalink: "/r/test/comments/1",
              title: "Identity-MD meme",
              selftext: "",
              author: "Builder",
              created_utc: 1790503200,
              url: "https://example.com/a.jpg",
              crosspost_parent: "t3_2",
            },
          },
        ],
      },
    }),
  );
  assert.equal(e.isRepost, true);
  assert.equal(e.type, "Image");
});
test("X fixture maps author and rejects referenced replies", async () => {
  const before = process.env.X_BEARER_TOKEN;
  process.env.X_BEARER_TOKEN = "fixture-token";
  try {
    const [e] = await collectSource(
      { id: "x", kind: "x", enabled: true },
      mock({
        data: [
          {
            id: "123",
            author_id: "4",
            text: "Identity-MD notes",
            created_at: "2026-09-27T10:00:00Z",
            referenced_tweets: [{ type: "replied_to" }],
          },
        ],
        includes: { users: [{ id: "4", name: "Builder", username: "build" }] },
      }),
    );
    assert.equal(e.author, "Builder");
    assert.equal(e.isReply, true);
  } finally {
    if (before === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = before;
  }
});
test("upstream failure, oversized content, and XML entities fail safely", async () => {
  await assert.rejects(
    get("https://example.com", mock("denied", 403)),
    /HTTP 403/,
  );
  await assert.rejects(
    get("https://example.com", mock("x".repeat(2_000_001))),
    /too large/,
  );
  await assert.rejects(
    collectSource(
      { id: "r", kind: "rss", enabled: true, url: "https://example.com" },
      mock("<!DOCTYPE x><rss/>"),
    ),
    /DTD/,
  );
});
