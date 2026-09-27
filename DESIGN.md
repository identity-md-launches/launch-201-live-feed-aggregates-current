# IMD Signal design system

## Overview

Signal is a compact reading environment for people following Identity-MD and $IMD. Its flat surfaces, outlined diamond mark, mono labels and green accents reference the inspected imd.fun site. An Arial body keeps multi-entry reading economical. The feed remains the primary content: filtering sits in a desktop rail, while search, collections and view controls sit immediately above the results. There is no wallet or transaction interface.

The implementation lives in `src/styles.css` and the `App`, `Filters`, `EntryCard`, `Mark` and `SourceIcon` patterns in `src/main.tsx`. These are local components, not an exported component library. The preview/live distinction is part of the design: a visible edition banner, example labels and source health prevent illustrative content from looking like live news.

## Colors

Hex semantic tokens are declared on `:root`; `data-theme="day"` and `data-theme="dusk"` override them. Night is the default. Use the role token, rather than copying a value into a new component.

| Role/token | Night | Day | Dusk |
|---|---|---|---|
| Page `--bg` | `#111310` | `#f4f5ef` | `#211d24` |
| Card `--surface` | `#191c17` | `#ffffff` | `#2a2530` |
| Raised `--surface-raised` | `#20241d` | `#e9ecdf` | `#342e3b` |
| Hover `--hover` | `#282e23` | `#e2e8d6` | `#42394a` |
| Main text `--text` | `#eef0e9` | `#24291e` | `#f2eaf0` |
| Body/secondary `--muted` | `#a4ab9c` | `#58624f` | `#bcb0bf` |
| Metadata `--subtle` | `#969f8d` | `#616b56` | `#b5a5b9` |
| Structure `--border` | `#30362b` | `#d7ddce` | `#443b4a` |
| Selected border `--strong-border` | `#69725f` | `#7b866b` | `#84738b` |
| Accent `--accent` | `#c5f277` | `#405e1b` | `#e6bd98` |
| Focus `--focus` | `#c5f277` | `#456c12` | `#e6bd98` |
| On accent `--accent-ink` | `#19230c` | `#ffffff` | `#302015` |
| Subtle accent fill `--accent-soft` | `#2a3420` | `#e6eed8` | `#46362d` |
| Edition background `--notice` | `#1d2419` | `#eaf0df` | `#332a30` |
| Error text/border `--danger` | `#ffc2ac` | `#9f3224` | `#ffb7ae` |

Source categories use the four additional `--blue`, `--red`, `--purple`, `--orange` tokens, always with a source name/icon. Avatar art has fixed muted colors. Decorative artwork retains its green palette across themes. Status is expressed with text, never a dot alone. Selected controls also expose `aria-pressed` or checked state.

Computed card-body contrast measured in Chromium: Night **7.28:1**, Day **6.41:1**, Dusk **7.19:1**. All six measured text/background pairs per theme exceed 4.5:1; complete pairs are in `artifacts/browser-results.json`. These measurements do not cover every image pixel, state or focus boundary.

## Typography

`Arial, Helvetica, sans-serif` is the system body stack. `--mono` is locally bundled **IBM Plex Mono**, then `ui-monospace, monospace`; the bundled face is normal 400 in WOFF2. Use mono for the wordmark, compact section labels and small technical counts, not article paragraphs. Arial/system weights 400, 500 and 600 provide the body hierarchy.

- Main heading: `clamp(27px, 3.3vw, 45px)`, 500, line-height 1.15, letter-spacing −1.8px. Mobile uses `clamp(27px, 5.5vw, 39px)` and −1.3px.
- Entry heading: 17px/1.4 at normal desktop width; 19px above 1500px, 18px in Grid, 15px in Compact, and 16px/1.45 on mobile.
- Entry body: 13px/1.65, 14px above 1500px; max measure 74ch. Expanded paragraphs preserve supplied newlines and wrap long strings.
- Interface controls: generally 11–13px; desktop search 12px, mobile search 16px to avoid iOS input zoom.
- Metadata: 9–11px; small example labels 8px are secondary to the persistent, larger edition disclosure. Section labels use uppercase CSS with 1–1.35px tracking. Tight sizes are deliberate for a dense reader; do not apply them to new long-form content.
- Counts use tabular numerals; headings balance wrapping. Body text remains selectable.

The declared `--text-*` size tokens are a reference scale, while component rules currently specify their exact px values. Do not assume changing a size token alone changes every component.

## Layout

The app shell caps at 1512px. Default columns are 238px plus a flexible content track. Desktop main padding is 40px block-start and 42px inline, with 12px between cards. The underlying spacing vocabulary is 4, 8, 12, 16, 20, 24, 32 and 40px (`--space-*`); component CSS is the source of truth for optical adjustments.

- Above 1500px: 254px rail, 50px content gutters, slightly larger article text.
- At 1180px and below: 216px rail, 27px gutters, icon-only view selector, less metadata.
- At 900px and below: 194px rail, 22px gutters; Grid returns to one column to maintain readable card widths.
- At 720px and below: rail becomes a native modal filter panel, view selector is hidden, all stored views present a consistent mobile list, search occupies a full row and sort/refresh remain visible. Header secondary navigation is removed; About remains available in the footer and edition details remain accessible elsewhere.
- At 380px and below: 14px gutters, avatars and redundant example labels are removed, filter source rows become one column. The preview banner remains visible.

Feed is one column with complete summaries. Compact hides media and clamps the summary until expanded. Grid is two columns, in chronological **row-major DOM order**, not a masonry reorder. Expanding a card shows the remaining content in place. At mobile widths summary clamping uses three lines and a persistent Read more action. Informative images use `object-fit: contain` so labels inside the artwork are not cropped.

Rendered reflow was checked at 1440, 1024, 768, 640, 390 and 320px. Native browser zoom and RTL/localized variants were not verified; this is an English UI.

## Elevation & Depth

Cards are flat, separated by a 1px structural border and a small surface luminance change. Only the toast (`0 8px 30px #0004`) and native dialog (`0 24px 80px #0005`) use elevation shadows. The dialog backdrop uses `--shade` and 4px blur. Chrome stays in normal document flow, avoiding sticky content occlusion. The toast is fixed at z-index 30; the keyboard skip link uses 100; native dialogs use the browser top layer.

## Shapes

Cards use `--radius: 9px`; inputs and segmented switches use 6–7px; nested controls use 3–5px. Dialog radius is 14px and toast radius is 8px. The diamond is the repeated brand motif; avatars are circular except the project avatar. Image outlines are translucent pure white in dark themes and pure black in Day. Borders communicate structure or state, not decorative depth.

## Components

- **App / edition status:** owns theme, collection, search, sort, loading, refresh, pending updates, errors and dialogs. Fetched data passes `parseFeed` before use. Changed data waits for Show updates. Errors retain the current content and provide Try again; no results offers Back to all activity.
- **Filters:** shared by desktop rail and mobile dialog. Native checkboxes select sources and types. All sources has an indeterminate state for partial selection. Labels are full hit areas; Reset filters restores sources, types and query. Counts refer to all entries in the current dataset.
- **EntryCard:** receives `entry`, `saved`, `hidden`, `onSave` and `onHide`. Uses native article/heading/time semantics, expandable text, optional image or direct video, tags and source/save/hide controls. Read more exposes `aria-expanded` and `aria-controls`. Media failures leave a readable explanation and source link.
- **Collections and views:** button groups with explicit pressed state. Saved and Hidden are local collections. Theme, view, saved IDs and hidden IDs persist under the `imd-signal:` localStorage prefix, with an in-memory fallback if storage is denied.
- **Buttons:** `.primary` is filled for the empty-state recovery/mobile filter action. `.secondary` is outlined. `.icon-button` uses a consistent zone and accessible name. Most desktop icon targets are 30–40px, mobile card targets 32×40px; source labels reach 44px in the dialog. All meet the 24px baseline in the tested layouts.
- **Dialog:** native `<dialog>.showModal()` contains focus and makes the background inert. Escape, close button and backdrop close it; the browser returns focus to the trigger. Filters apply immediately and Show entries closes the dialog.
- **Toast:** persists until dismissed or replaced. Hide provides Undo and moves keyboard focus to it. Restoring does not delete the original source post.
- **Focus/motion:** focus-visible uses a 2px `--focus` outline with 4px offset (2px for native inputs); custom checkbox chips show an outline on their label. Forced-colors overrides use system Highlight. Button press scale is 0.96 for 120ms, and refresh rotation is 1.3s; both exist only with no reduced-motion preference. Theme colors have no transitions. No autoplay.

## Do's and Don'ts

- Reuse semantic color roles and `EntryCard` for added sources. Source data must pass `parseFeed`; never render publisher HTML directly.
- Keep chronological DOM order and the reader-controlled update banner. Do not move cards while someone is reading.
- Keep every clamped or partial entry expandable, with a source link for unavailable full text.
- Keep preview, failed collection and stale/last-success status factual. Do not simulate fresh timestamps or invent social engagement metrics.
- Preserve text/icon/pressed-state cues alongside color. Do not introduce a theme color animation or autoplay media.
- To add another page, reuse the header, app-shell widths, semantic tokens, heading/body hierarchy and normal-flow footer. Use a hash view unless the page is also exported; do not introduce paths requiring a server rewrite.

Design guidance: Better Interface by Jakub Krehel (MIT); documentation method: Impeccable by Paul Bakaus (Apache-2.0). See README for pinned revisions and the consolidated review for evidence and limitations.
