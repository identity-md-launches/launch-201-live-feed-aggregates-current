import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  filterEntries,
  parseFeed,
  sources,
  types,
  type Filters,
} from "./model.ts";
const feed = parseFeed(JSON.parse(readFileSync("public/feed.json", "utf8")));
const filters: Filters = {
  sources: [...sources],
  types: [...types],
  query: "",
  tab: "all",
  saved: [],
  hidden: [],
  order: "newest",
};
test("filters combine source, type and case-insensitive search", () => {
  const result = filterEntries(feed.entries, {
    ...filters,
    sources: ["X"],
    types: ["Post"],
    query: "identity-MD",
  });
  assert.equal(result.length, 2);
  assert.equal(
    filterEntries(feed.entries, { ...filters, sources: [] }).length,
    0,
  );
  assert.equal(
    filterEntries(feed.entries, { ...filters, types: ["Image"] })[0].source,
    "Reddit",
  );
});
test("hidden items leave main and saved collections; hidden view supports restore", () => {
  const id = feed.entries[0].id;
  assert.equal(
    filterEntries(feed.entries, { ...filters, hidden: [id] }).length,
    7,
  );
  assert.equal(
    filterEntries(feed.entries, {
      ...filters,
      tab: "saved",
      saved: [id],
      hidden: [id],
    }).length,
    0,
  );
  assert.equal(
    filterEntries(feed.entries, { ...filters, tab: "hidden", hidden: [id] })[0]
      .id,
    id,
  );
});
test("both sort directions are chronological, without mutating data", () => {
  const a = filterEntries(feed.entries, filters),
    b = filterEntries(feed.entries, { ...filters, order: "oldest" });
  assert.equal(a[0].id, b.at(-1)?.id);
  assert.equal(feed.entries[0].id, a[0].id);
});
test("published feed rejects unsafe URLs, duplicate IDs and mislabeled samples", () => {
  assert.throws(() => parseFeed({ ...feed, mode: "live" }));
  assert.throws(() =>
    parseFeed({ ...feed, entries: [feed.entries[0], feed.entries[0]] }),
  );
  assert.throws(() =>
    parseFeed({
      ...feed,
      entries: [{ ...feed.entries[0], url: "javascript:alert(1)" }],
    }),
  );
});
