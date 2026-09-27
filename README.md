# IMD Signal

A responsive reader for the Identity-MD / $IMD conversation. Includes chronological Feed, Compact and Grid views; source and content filters; search; inline reading; save, hide, restore and Undo; and Day, Dusk and Night themes.

**The delivered export is a clearly labeled preview, not a live news service.** Its eight illustrative entries are original examples, not real social posts or announcements. The separately deployable collector is implemented and tested, but live activation remains incomplete: Bluesky and Reddit returned HTTP 403 from this environment, X credentials were not provided, and no production scheduler or hosting account was supplied. Nothing is represented as collected live when it was not.

## Install and run

Use Node.js 24 LTS (Node 22.12+ also meets Vite's minimum) and npm.

```sh
npm ci
npm run dev
```

To rebuild and preview the production site:

```sh
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Open the local URL printed by Vite. Serve over HTTP, rather than opening `index.html` as a `file:` URL, because the reader fetches `feed.json`.

`dist/index.html`, `dist/feed.json` and all runtime assets are included in this submission alongside the source and `package-lock.json`. Vite uses `base: './'`; the export has relative asset URLs and uses only page anchors, with no route rewrite requirement. The bundled IBM Plex Mono font and preview illustrations need no external requests.

## Publish the static website

Upload **the contents of `dist/`**, including its assets and `feed.json`, to any static host. A subdirectory such as `/signal/` works. Configure correct MIME types for JSON, JavaScript, CSS, SVG and WOFF2. Serve `feed.json` and `index.html` with revalidation (`Cache-Control: no-cache`); hashed JavaScript/CSS can be cached immutably. Preview the deployed subpath before updating a public link.

The publisher serves this export directly; it does not need to rebuild it. Do not upload `server/`, source files, dependencies, caches, collector state, credentials or test artifacts as website assets. Do not create a git submodule. Keep dependency/cache directories out of submissions at every level; this repository ships none and contains no ignore-file changes.

A permanently immutable IPFS export is a snapshot. For ongoing updates, use a mutable static origin for `feed.json`, or republish the updated export and update the gateway/ENS target. A static page cannot run a cron job itself.

## Connect real sources

The Node collector runs separately from the browser. Source access must be authorized by each provider. Edit `server/sources.json` to enable available sources:

- **Bluesky:** public search for `Identity-MD`, `imd.fun` and `$IMD`; top-level posts, image alt text and video previews are normalized.
- **Reddit:** public recent search; comments and crossposts are rejected. Some hosts/providers require an OAuth adapter instead of anonymous search.
- **X:** enable its configuration entry and supply `X_BEARER_TOKEN` through the server process environment or a secret manager. Requires a suitable X API plan. No key enters the browser or export.
- **RSS / Atom:** add operator-selected HTTPS feeds, including YouTube channel feeds, publications or other websites. `source` selects the UI category. Example configuration objects (replace the URLs before enabling):

```json
{
  "id": "Project publication",
  "kind": "rss",
  "enabled": true,
  "source": "Web",
  "url": "https://publisher.example/feed.xml"
}
```

```json
{
  "id": "Project videos",
  "kind": "rss",
  "enabled": true,
  "source": "YouTube",
  "url": "https://www.youtube.com/feeds/videos.xml?channel_id=YOUR_CHANNEL_ID"
}
```

Other supported display categories are `X`, `Bluesky`, `Mirror`, `Reddit` and `Web`. Private networks and sites without an accessible API/feed need another adapter; this is not a universal social crawler. An RSS excerpt remains an excerpt, labeled with a `Source excerpt` tag. Source-provided full text can expand inline. Direct video files can play inline; platform-only videos have an external source link and available details, without third-party autoplay or embeds.

To collect, rebuild and publish the first live edition:

```sh
npm run collect -- --config server/sources.json --out public/feed.json --state /tmp/imd-signal-state.json --force
npm run build
```

Only run the second command after reviewing the collection result. The collector reports successes, rejected-item counts and source health. If all first-time sources fail, it exits 1 and preserves the existing preview byte-for-byte. A successful but empty search creates an honestly empty live feed. Existing live entries survive later upstream failures; the last successful collection time stays unchanged. Responses are limited to 2 MB, use 12-second timeouts, and fail on redirects. Use a source's final HTTPS feed URL.

For a mutable static server, run the collector every 15 minutes and write **only `feed.json`** into the published directory. Example cron entry; replace paths and use an absolute Node/npm environment suitable for your host:

```cron
*/15 * * * * cd /srv/imd-signal && /usr/bin/npm run collect -- --out /srv/www/signal/feed.json --state /var/lib/imd-signal/state.json >> /var/log/imd-signal.log 2>&1
```

The collector process must own the state/output directories. Use persistent private state in production, rather than `/tmp`. Writes use a temporary sibling and atomic rename; a lock prevents overlapping runs. A killed process can leave `state.json.lock`: verify no collector is running before removing that lock. Do not schedule `--force`; it bypasses source-specific backoff.

### Refresh pace and quality rules

- Active sources: every 15 minutes. After four collections with no newly accepted entries: hourly. New accepted content returns the source to 15-minute checks.
- Errors: exponential backoff from 30 minutes, capped at 8 hours. The next normal cron invocation observes the source's stored due time.
- Reader: checks the published JSON every 15 minutes while visible, or on Refresh. Changes wait behind **Show updates**, preserving reading position. Returning to a backgrounded tab may wait until the next interval or manual refresh.
- Retains up to 500 accepted entries in a rolling 30-day window, newest first. An older-first option changes only presentation.
- Requires an Identity-MD name, `imd.fun`, or `$IMD` mention in the title/opening/image description. Rejects replies, flagged reposts, known spam language, excessive links/hashtags, invalid dates and low-substance text (under 85 normalized characters or 12 distinct substantive words).
- Relevant images and memes bypass the text-length rule, but still pass relevance and spam checks. Canonical source URLs, identical image URLs and text trigram similarity (Jaccard ≥ 0.76) remove duplicates, preferring the earliest available original.

These are transparent heuristics, not semantic moderation. They can miss spam or reject good material. Quote posts with original commentary can pass. Copies with different images or substantially rewritten text may pass. The first page of recent API search is sampled (100 results per query; no exhaustive history/pagination), so a high-volume burst can exceed coverage. No promise of complete coverage, truth checking or perfect original attribution is made.

## Check the implementation

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run check:bundle
```

The browser script owns a temporary local HTTP server and Chromium, serves the production export at `/preview/`, and closes both when done. It writes screenshots and actual findings to `artifacts/`. Unit and collector integration tests are deterministic and use source fixtures; they do not need social API credentials.

Actual results on 2026-09-27:

- Lockfile installation, TypeScript check and production build passed.
- 19 automated model, adapter, quality and collector tests passed, including atomic publication and preserving the preview on total upstream failure.
- 20 browser interaction/check groups passed. All three themes and the 320px mobile page had zero violations in the configured axe WCAG A/AA scans. This is not a full accessibility certification.
- Inspected export at 1440, 1024, 768, 640, 390 and 320 CSS pixels; no horizontal overflow at those widths. No browser console errors or failed resource requests.
- Real collection attempt: Bluesky HTTP 403, Reddit HTTP 403, X not configured. No actual live feed or production cron was verified.

See [the consolidated six-domain review](artifacts/validation.md), [machine-readable browser results](artifacts/browser-results.json) and [implemented design system](DESIGN.md). Native browser 200% zoom, physical devices, assistive-technology sessions, other browser engines, private/social API production access and actual live video playback remain unverified.

The worker installed dependencies and browser binaries in `/tmp`, then built an identical isolated copy to honor the repository's protected `node_modules/` path. No registry mirror, vendored dependency archive, browser binary or cache is submitted. The supplied browser MCP could not start because its expected Chrome binary was missing; standalone Playwright provided the rendered checks instead.

## Files and attribution

- `src/`: React reader, presentation and validated feed model.
- `server/`: source adapters, filtering, scheduling and atomic publisher.
- `public/`: self-contained preview JSON, original SVG illustrations and local font.
- `dist/`: ready-to-host production export.
- `scripts/`: repeatable browser checks and 8 MiB submission budget check.
- `artifacts/`: validation evidence; not part of the runtime export.

Brand reference: `https://imd.fun`, inspected on 2026-09-27 (monochrome chrome, IBM Plex Mono, diamond mark and green monitor accents). Signal is an independent community reader, not a claim of official authorship. The two preview illustrations were created for this assignment. IBM Plex Mono is SIL OFL 1.1; its notice and license are bundled in `public/assets/FONT-LICENSE.txt` and the export. React, Lucide and the remaining packages retain their upstream licenses.

Design guidance applied from Jakub Krehel's Better Interface, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation method adapted from Paul Bakaus's Impeccable, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. The pinned guides were read as assignment inputs; they are not copied into the website.
