import { test } from "node:test";
import assert from "node:assert/strict";
import { curate, rejectReason, canonicalUrl } from "./quality.ts";
import { nextPollState } from "./collect.ts";
import type { Entry } from "../src/model.ts";
const now = Date.parse("2026-09-27T12:00:00Z");
const original: Entry = {
  id: "1",
  source: "X",
  type: "Post",
  author: "Contributor",
  title: "Identity-MD contributor progress",
  text: "The Identity-MD network now brings together contributors who document their work, review each change, and build useful tools for the community.",
  publishedAt: "2026-09-27T10:00:00Z",
  url: "https://x.com/a/status/1",
  tags: [],
};
test("substantive top-level Identity-MD posts are accepted", () =>
  assert.equal(rejectReason(original, now), null));
test("ticker-only posts, replies and reposts are rejected", () => {
  assert.equal(
    rejectReason({ ...original, title: "$IMD", text: "$IMD $IMD" }, now),
    "low-substance",
  );
  assert.equal(rejectReason({ ...original, isReply: true }, now), "reply");
  assert.equal(rejectReason({ ...original, isRepost: true }, now), "repost");
});
test("image-first memes pass despite a short caption", () =>
  assert.equal(
    rejectReason(
      {
        ...original,
        title: "$IMD",
        text: "just one more build",
        type: "Image",
        image: "https://example.com/meme.jpg",
      },
      now,
    ),
    null,
  ));
test("image posts still require relevance and reject spam", () => {
  assert.equal(
    rejectReason(
      {
        ...original,
        title: "A cat",
        text: "A cat",
        image: "https://example.com/cat.jpg",
      },
      now,
    ),
    "off-topic",
  );
  assert.equal(
    rejectReason(
      {
        ...original,
        text: "Identity-MD claim your free airdrop",
        image: "https://example.com/spam.jpg",
      },
      now,
    ),
    "spam",
  );
});
test("incidental mentions and stale or future dates are rejected", () => {
  assert.equal(
    rejectReason(
      {
        ...original,
        title: "General crypto news",
        text: "Other news. ".repeat(80) + " Identity-MD",
      },
      now,
    ),
    "off-topic",
  );
  assert.equal(
    rejectReason({ ...original, publishedAt: "2025-09-27T10:00:00Z" }, now),
    "outside-window",
  );
  assert.equal(
    rejectReason({ ...original, publishedAt: "2026-09-28T10:00:00Z" }, now),
    "outside-window",
  );
});
test("near-identical copies retain the earliest original across sources", () => {
  const copy = {
    ...original,
    id: "2",
    source: "Bluesky" as const,
    url: "https://bsky.app/profile/a/post/2",
    publishedAt: "2026-09-27T11:00:00Z",
    text: original.text + " Great work!",
  };
  const result = curate([copy, original], now);
  assert.deepEqual(
    result.entries.map((e) => e.id),
    ["1"],
  );
  assert.equal(result.rejected.duplicate, 1);
});
test("canonical links remove tracking and normalize Twitter", () =>
  assert.equal(
    canonicalUrl("https://www.twitter.com/a/status/1?utm_source=test#top"),
    "https://x.com/a/status/1",
  ));
test("unsafe source URLs are rejected without interrupting the batch", () =>
  assert.equal(
    curate([{ ...original, url: "javascript:alert(1)" }], now).entries.length,
    0,
  ));
test("collector backs off quiet sources and failures, then resets on new work", () => {
  let state = nextPollState(undefined, false, undefined, now, "X");
  for (let i = 0; i < 3; i++)
    state = nextPollState(state, false, undefined, now, "X");
  assert.equal(state.nextPoll - now, 3600000);
  state = nextPollState(state, true, undefined, now, "X");
  assert.equal(state.nextPoll - now, 900000);
  state = nextPollState(state, false, "HTTP 429", now, "X");
  assert.equal(state.nextPoll - now, 1800000);
  for (let i = 0; i < 8; i++)
    state = nextPollState(state, false, "HTTP 429", now, "X");
  assert.equal(state.nextPoll - now, 8 * 3600000);
});
