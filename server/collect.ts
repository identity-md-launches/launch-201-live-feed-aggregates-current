import {
  readFile,
  writeFile,
  mkdir,
  rename,
  open,
  unlink,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { collectSource, type SourceConfig } from "./adapters.ts";
import { curate } from "./quality.ts";
import { parseFeed, sources, type Feed, type Entry } from "../src/model.ts";
export interface PollState {
  failures: number;
  quietRuns: number;
  nextPoll: number;
  health: { name: string; ok: boolean; detail: string };
}
export function nextPollState(
  previous: PollState | undefined,
  receivedNew: boolean,
  error: string | undefined,
  now: number,
  name: string,
): PollState {
  const failures = error ? (previous?.failures ?? 0) + 1 : 0;
  const quietRuns = receivedNew ? 0 : (previous?.quietRuns ?? 0) + 1;
  const wait = error
    ? Math.min(8 * 3600000, 900000 * 2 ** failures)
    : quietRuns >= 4
      ? 3600000
      : 900000;
  return {
    failures,
    quietRuns,
    nextPoll: now + wait,
    health: { name, ok: !error, detail: error ?? "Connected" },
  };
}
async function load<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}
async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await rename(temp, path);
}
async function main() {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : (args[i + 1] ?? fallback);
  };
  const configPath = resolve(option("--config", "server/sources.json"));
  const out = resolve(option("--out", "public/feed.json"));
  const statePath = resolve(
    option("--state", "/tmp/imd-signal-collector-state.json"),
  );
  const configs = await load<SourceConfig[]>(configPath, []);
  if (
    !Array.isArray(configs) ||
    !configs.length ||
    configs.some(
      (c) =>
        !c.id ||
        !["bluesky", "reddit", "x", "rss"].includes(c.kind) ||
        typeof c.enabled !== "boolean" ||
        (c.source && !sources.includes(c.source)),
    ) ||
    new Set(configs.map((c) => c.id)).size !== configs.length
  )
    throw new Error("Invalid source configuration");
  await mkdir(dirname(statePath), { recursive: true });
  const lock = await open(`${statePath}.lock`, "wx");
  try {
    const state = await load<Record<string, PollState>>(statePath, {});
    const previousRaw = await load<Feed | null>(out, null);
    const previous = previousRaw ? parseFeed(previousRaw) : null;
    const existing = previous?.mode === "live" ? previous.entries : [];
    const gathered: Entry[] = [];
    let successes = 0,
      attempts = 0;
    const now = Date.now();
    for (const config of configs) {
      if (!config.enabled) {
        state[config.id] = {
          failures: 0,
          quietRuns: 0,
          nextPoll: 0,
          health: { name: config.id, ok: false, detail: "Not configured" },
        };
        continue;
      }
      if (!args.includes("--force") && state[config.id]?.nextPoll > now)
        continue;
      attempts++;
      try {
        const entries = await collectSource(config);
        gathered.push(...entries);
        successes++;
        const good = curate(entries, now).entries;
        state[config.id] = nextPollState(
          state[config.id],
          good.some((e) => !existing.some((p) => p.id === e.id)),
          undefined,
          now,
          config.id,
        );
      } catch (e) {
        state[config.id] = nextPollState(
          state[config.id],
          false,
          e instanceof Error ? e.message : "Source unavailable",
          now,
          config.id,
        );
      }
    }
    if (attempts) {
      if (successes || previous?.mode === "live") {
        const result = curate([...existing, ...gathered], now);
        const feed: Feed = {
          version: 1,
          mode: "live",
          generatedAt: new Date(now).toISOString(),
          lastSuccessAt: successes
            ? new Date(now).toISOString()
            : previous?.lastSuccessAt,
          entries: result.entries,
          health: configs.map((c) => state[c.id].health),
        };
        parseFeed(feed);
        await atomic(out, feed);
        console.log(
          JSON.stringify(
            {
              published: out,
              entries: feed.entries.length,
              attempts,
              successes,
              rejected: result.rejected,
              health: feed.health,
            },
            null,
            2,
          ),
        );
      } else {
        console.error("No sources succeeded; existing preview is preserved.");
        console.error(
          JSON.stringify(
            configs.map((c) => state[c.id]?.health),
            null,
            2,
          ),
        );
        process.exitCode = 1;
      }
    } else console.log("No sources due. Feed unchanged.");
    await atomic(statePath, state);
  } finally {
    await lock.close();
    await unlink(`${statePath}.lock`);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
)
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  });
