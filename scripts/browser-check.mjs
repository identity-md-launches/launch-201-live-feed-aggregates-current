import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
const root = resolve(process.env.SITE_ROOT ?? ".");
const output = resolve(root, "artifacts");
await mkdir(output, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith("/preview/")) {
      res.writeHead(404).end();
      return;
    }
    const file = resolve(root, "dist", pathname.slice(9) || "index.html");
    if (!file.startsWith(resolve(root, "dist") + sep))
      throw new Error("Invalid path");
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const address = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const results = {
  checks: [],
  screenshots: [],
  audits: [],
  contrast: [],
  errors: [],
  failedRequests: [],
};
page.setDefaultTimeout(8000);
page.on("pageerror", (e) => results.errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") results.errors.push(m.text());
});
page.on("requestfailed", (r) =>
  results.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }),
);
const check = (name) => {
  results.checks.push(name);
  console.log(`PASS ${name}`);
};
const count = async (n) => {
  await page
    .locator("article")
    .first()
    .waitFor({ state: n ? "visible" : "hidden" });
  assert.equal(await page.locator("article").count(), n);
};
const screenshot = async (name, fullPage = false) => {
  await page.screenshot({ path: resolve(output, name), fullPage });
  results.screenshots.push(`artifacts/${name}`);
};
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
try {
  await page.goto(address);
  await count(8);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.evaluate(() => document.fonts.check('12px "IBM Plex Mono"')),
    true,
  );
  check(
    "Production export loads at /preview/ with local font and eight entries",
  );
  await noOverflow();
  await screenshot("desktop-night.png", true);
  if (process.argv.includes("--screenshots-only")) {
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot("mobile-night.png", true);
  } else {
    const first = page.locator("article").first();
    await first.getByRole("button", { name: "Read more", exact: true }).click();
    assert.equal(
      await first
        .getByRole("button", { name: "Read less", exact: true })
        .getAttribute("aria-expanded"),
      "true",
    );
    await first
      .getByText("Open the project website", { exact: false })
      .waitFor();
    await first.getByRole("button", { name: "Read less", exact: true }).click();
    check("Inline expansion and collapse expose complete text");
    await first.getByRole("button", { name: /^Save / }).click();
    await page.getByRole("button", { name: "Saved 1", exact: true }).click();
    await count(1);
    await page.reload();
    await count(8);
    await page.getByRole("button", { name: "Saved 1", exact: true }).click();
    await count(1);
    check("Saved entries persist across reload");
    await page
      .locator("article")
      .getByRole("button", { name: /^Hide / })
      .click();
    await count(0);
    assert.equal(
      await page
        .getByRole("button", { name: "Undo", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await count(1);
    check("Hide removes an entry and Undo restores it with keyboard focus");
    await page
      .locator("article")
      .getByRole("button", { name: /^Hide / })
      .click();
    await page.getByRole("button", { name: "Hidden 1", exact: true }).click();
    await count(1);
    await page
      .locator("article")
      .getByRole("button", { name: /^Restore / })
      .click();
    await count(0);
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await page
      .getByRole("button", { name: "All activity 8", exact: true })
      .click();
    check("Hidden collection supports restoration");
    await page
      .locator(".sidebar")
      .getByRole("checkbox", { name: "All sources", exact: true })
      .uncheck();
    await count(0);
    await page
      .locator(".sidebar")
      .getByRole("checkbox", { name: /X \(Twitter\)/ })
      .check();
    await count(2);
    await page
      .getByRole("searchbox", { name: "Search the feed" })
      .fill("ordinary things");
    await count(1);
    await page.getByRole("searchbox").fill("nothing-matches-this");
    await count(0);
    await page.getByRole("button", { name: "Back to all activity" }).click();
    await count(8);
    check("Source and search filters combine; empty state resets the feed");
    for (const name of ["Posts", "Articles", "Videos", "Stories"])
      await page
        .locator(".sidebar")
        .getByRole("checkbox", { name, exact: true })
        .uncheck();
    await count(1);
    assert.match(await page.locator("article").innerText(), /five minutes/);
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "Reset filters" })
      .click();
    check("Images and memes remain available through type filtering");
    await page
      .getByRole("combobox", { name: "Sort entries" })
      .selectOption("oldest");
    assert.match(
      await page.locator("article").first().innerText(),
      /small details/,
    );
    await page.getByRole("combobox").selectOption("newest");
    check("Newest and oldest sorts reverse chronological order");
    for (const view of ["Compact", "Grid"]) {
      await page
        .getByRole("button", { name: `${view} view`, exact: true })
        .click();
      await noOverflow();
      assert.equal(
        await page.locator(`.view-${view.toLowerCase()}`).count(),
        1,
      );
      await screenshot(`desktop-${view.toLowerCase()}.png`);
    }
    await page.reload();
    assert.equal(
      await page
        .getByRole("button", { name: "Grid view" })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: "Feed view", exact: true }).click();
    check("Three desktop views work and layout preference persists");
    for (const [label, theme] of [
      ["Dusk mode", "dusk"],
      ["Day mode", "day"],
      ["Dark / Night mode", "night"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        theme,
      );
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      results.audits.push({
        theme,
        violations: scan.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => ({
            html: n.html,
            summary: n.failureSummary,
          })),
        })),
      });
      results.contrast.push(
        await page.evaluate((theme) => {
          function bg(el) {
            for (let node = el; node; node = node.parentElement) {
              const v = getComputedStyle(node).backgroundColor;
              if (v !== "rgba(0, 0, 0, 0)" && v !== "transparent") return v;
            }
            return getComputedStyle(document.body).backgroundColor;
          }
          function lum(c) {
            return c
              .match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number)
              .map((n) => {
                n /= 255;
                return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
              })
              .reduce((v, n, i) => v + n * [0.2126, 0.7152, 0.0722][i], 0);
          }
          return {
            theme,
            pairs: [
              ".entry h2",
              ".entry-body",
              ".read-more",
              ".edition-note",
              ".example-label",
              ".result-heading .results-status",
            ].map((s) => {
              const e = document.querySelector(s),
                fg = getComputedStyle(e).color,
                b = bg(e),
                a = lum(fg),
                z = lum(b);
              return {
                selector: s,
                foreground: fg,
                background: b,
                ratio: +(
                  (Math.max(a, z) + 0.05) /
                  (Math.min(a, z) + 0.05)
                ).toFixed(2),
              };
            }),
          };
        }, theme),
      );
      await screenshot(`desktop-${theme}-theme.png`);
    }
    await page.reload();
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "night",
    );
    check("Day, Dusk and Night themes render and persist; axe audits recorded");
    await page
      .getByRole("button", { name: "About the feed", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() =>
        Boolean(document.activeElement.closest("dialog")),
      ),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByRole("button", { name: "About the feed", exact: true })
        .evaluate((e) => document.activeElement === e),
      true,
    );
    check(
      "Keyboard opens the dialog, contains focus and restores it on Escape",
    );
    await page.goto(address);
    await count(8);
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent),
      "Skip to feed",
    );
    await screenshot("keyboard-focus.png");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "feed");
    check("Keyboard skip link reaches the feed");
    const keyboardRead = page.locator("article").first().getByRole("button", { name: "Read more", exact: true });
    await keyboardRead.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("article").first().getByRole("button", { name: "Read less", exact: true }).getAttribute("aria-expanded"), "true");
    await screenshot("keyboard-reader-focus.png");
    await page.keyboard.press("Enter");
    const keyboardSource = page.locator(".sidebar").getByRole("checkbox", { name: /X \(Twitter\)/ });
    await keyboardSource.focus();
    await page.keyboard.press("Space");
    await count(6);
    await page.keyboard.press("Space");
    await count(8);
    check("Keyboard Enter expands reading and Space toggles source filters");
    await page.locator("h1").click();
    for (const width of [1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow();
      if (width === 390 || width === 320)
        await screenshot(`mobile-${width}.png`, true);
    }
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("checkbox", { name: "All sources", exact: true })
      .uncheck();
    await page
      .getByRole("dialog")
      .getByRole("checkbox", { name: "Bluesky", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Show 1 entry", exact: true })
      .click();
    await count(1);
    await page.getByRole("button", { name: /Filters/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Reset filters" })
      .click();
    await page.keyboard.press("Escape");
    await count(8);
    check("Responsive reflow at 1024, 768, 390 and 320px; mobile filters work");
    const mobileScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    results.audits.push({
      theme: "night-mobile-320",
      violations: mobileScan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          html: n.html,
          summary: n.failureSummary,
        })),
      })),
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
      true,
    );
    assert.equal(
      await page
        .locator(".refresh")
        .evaluate((e) => getComputedStyle(e).transitionDuration),
      "0s",
    );
    check("Reduced-motion preference disables interactive transitions");
    await page.setViewportSize({ width: 640, height: 500 });
    await noOverflow();
    await screenshot("reflow-640.png");
    check(
      "640 CSS pixel reflow passes; native browser 200% zoom remains unverified",
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route("**/feed.json", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"invalid":true}',
      }),
    );
    await page
      .getByRole("button", { name: "Refresh feed", exact: true })
      .click();
    await page.getByRole("alert").waitFor();
    await count(8);
    await page.unroute("**/feed.json");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByRole("alert").waitFor({ state: "hidden" });
    check("Malformed refresh preserves the current feed and supports retry");
    const fresh = JSON.parse(
      await readFile(resolve(root, "public/feed.json"), "utf8"),
    );
    fresh.entries.unshift({
      ...fresh.entries[0],
      id: "interaction-new-entry",
      title: "A new illustrative entry",
      publishedAt: "2026-09-27T10:00:00Z",
    });
    await page.route("**/feed.json", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fresh),
      }),
    );
    await page
      .getByRole("button", { name: "Refresh feed", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Show updates", exact: true })
      .waitFor();
    await count(8);
    await page
      .getByRole("button", { name: "Show updates", exact: true })
      .click();
    await count(9);
    await page.unroute("**/feed.json");
    check(
      "New arrivals wait for explicit Show updates instead of moving the feed",
    );
    await page.route("**/feed.json", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto(address);
    await page.getByRole("alert").waitFor();
    await count(0);
    await page.unroute("**/feed.json");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await count(8);
    check("Initial feed failure presents a recoverable error and retry loads entries");
  }
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.failedRequests, []);
  check("No browser console errors or failed resource requests");
  await writeFile(
    resolve(output, "browser-results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  const violations = results.audits.flatMap((a) => a.violations);
  if (violations.length)
    throw new Error(
      `${violations.length} accessibility audit findings; see artifacts/browser-results.json`,
    );
} finally {
  await writeFile(resolve(output, "browser-results.json"), JSON.stringify(results, null, 2) + "\n");
  await browser.close();
  await new Promise((r) => server.close(r));
}
