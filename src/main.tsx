import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Grid2X2,
  Image as ImageIcon,
  List,
  ListFilter,
  Menu,
  MessageSquare,
  Moon,
  Play,
  Radio,
  RefreshCw,
  Rss,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Sunset,
  X,
} from "lucide-react";
import {
  filterEntries,
  parseFeed,
  sources,
  types,
  type Entry,
  type EntryType,
  type Feed,
  type Source,
} from "./model";
import "./styles.css";

type Theme = "day" | "dusk" | "night";
type View = "feed" | "compact" | "grid";
type Tab = "all" | "saved" | "hidden";
function read<T>(key: string, fallback: T, valid: (v: unknown) => boolean): T {
  try {
    const v: unknown = JSON.parse(
      localStorage.getItem(`imd-signal:${key}`) || "null",
    );
    return valid(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
const stringList = (v: unknown) =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
function useStored<T>(
  key: string,
  fallback: T,
  valid: (v: unknown) => boolean,
) {
  const [value, set] = useState<T>(() => read(key, fallback, valid));
  useEffect(() => {
    try {
      localStorage.setItem(`imd-signal:${key}`, JSON.stringify(value));
    } catch {
      /* Reading remains usable when storage is unavailable. */
    }
  }, [key, value]);
  return [value, set] as const;
}
function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "mark small" : "mark"}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m16 3 13 13-13 13L3 16Zm0 0v26M3 16h26"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
function SourceIcon({ source }: { source: Source }) {
  if (source === "X")
    return (
      <span className="x-symbol" aria-hidden="true">
        𝕏
      </span>
    );
  if (source === "Bluesky")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 11C9 5 3 2 3 6c0 5 1 7 6 7-7 0-5 8 0 5l3-3 3 3c5 3 7-5 0-5 5 0 6-2 6-7 0-4-6-1-9 5Z" />
      </svg>
    );
  if (source === "YouTube") return <Play aria-hidden="true" />;
  if (source === "Mirror") return <FileText aria-hidden="true" />;
  if (source === "Reddit") return <MessageSquare aria-hidden="true" />;
  return <Rss aria-hidden="true" />;
}
const typeIcons = {
  Post: MessageSquare,
  Article: FileText,
  Video: Play,
  Image: ImageIcon,
  Story: Sparkles,
};
function App() {
  const [theme, setTheme] = useStored<Theme>("theme", "night", (v) =>
    ["day", "dusk", "night"].includes(v as string),
  );
  const [view, setView] = useStored<View>("view", "feed", (v) =>
    ["feed", "compact", "grid"].includes(v as string),
  );
  const [saved, setSaved] = useStored<string[]>("saved", [], stringList);
  const [hidden, setHidden] = useStored<string[]>("hidden", [], stringList);
  const [selectedSources, setSources] = useState<Source[]>([...sources]);
  const [selectedTypes, setTypes] = useState<EntryType[]>([...types]);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [feed, setFeed] = useState<Feed | null>(null);
  const feedRef = useRef<Feed | null>(null);
  const [pending, setPending] = useState<Feed | null>(null);
  const [busy, setBusy] = useState(true);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [announcement, announce] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    undo?: () => void;
  } | null>(null);
  const [dialogKind, setDialogKind] = useState<"about" | "filters">("about");
  const dialog = useRef<HTMLDialogElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  function applyFeed(next: Feed) {
    feedRef.current = next;
    setFeed(next);
  }
  async function refresh(manual = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}feed.json`, {
        cache: "no-cache",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Unavailable");
      const next = parseFeed(await response.json());
      const current = feedRef.current;
      if (!current) applyFeed(next);
      else if (JSON.stringify(current) !== JSON.stringify(next)) {
        setPending(next);
        announce("An updated feed is ready. Select Show updates to load it.");
      } else if (manual) {
        setNotice({
          text:
            next.mode === "preview"
              ? "You’re viewing the preview edition. No live sources are connected."
              : "You’re up to date. No new entries.",
        });
      }
    } catch {
      setError(
        "Unable to refresh the feed. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void refresh();
      },
      15 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const entries = feed?.entries ?? [];
  const filtered = useMemo(
    () =>
      filterEntries(entries, {
        sources: selectedSources,
        types: selectedTypes,
        query,
        tab,
        saved,
        hidden,
        order,
      }),
    [entries, selectedSources, selectedTypes, query, tab, saved, hidden, order],
  );
  const filterCount =
    sources.length -
    selectedSources.length +
    types.length -
    selectedTypes.length;
  function reset() {
    setSources([...sources]);
    setTypes([...types]);
    setQuery("");
  }
  function openDialog(kind: "about" | "filters") {
    setDialogKind(kind);
    dialog.current?.showModal();
  }
  function save(e: Entry) {
    const exists = saved.includes(e.id);
    setSaved((v) => (exists ? v.filter((id) => id !== e.id) : [...v, e.id]));
    announce(
      exists ? "Entry removed from saved." : "Entry saved in this browser.",
    );
  }
  function hide(e: Entry) {
    const wasHidden = hidden.includes(e.id);
    setHidden((v) =>
      wasHidden ? v.filter((id) => id !== e.id) : [...v, e.id],
    );
    setNotice({
      text: wasHidden
        ? "Entry restored to the feed."
        : "Entry hidden. You can find it in Hidden.",
      undo: () => {
        setHidden((v) =>
          wasHidden ? [...v, e.id] : v.filter((id) => id !== e.id),
        );
        setNotice(null);
        announce("Action undone.");
      },
    });
    requestAnimationFrame(() => undoRef.current?.focus());
  }
  const filterProps = {
    selectedSources,
    selectedTypes,
    setSources,
    setTypes,
    entries,
    reset,
  };
  return (
    <>
      <a className="skip-link" href="#feed">
        Skip to feed
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="#"
          aria-label="IMD Signal home"
          onClick={() => {
            setTab("all");
            reset();
          }}
        >
          <span className="brand-mark">
            <Mark />
          </span>
          <span>
            IMD<span className="brand-slash">/</span>
            <strong>SIGNAL</strong>
          </span>
        </a>
        <nav className="top-nav" aria-label="Main navigation">
          <a className="active" href="#feed">
            Newsfeed
          </a>
          <button onClick={() => openDialog("about")}>About the feed</button>
        </nav>
        <div className="header-right">
          <div className="theme-switch" role="group" aria-label="Color theme">
            {(["day", "dusk", "night"] as Theme[]).map((t) => {
              const Icon = t === "day" ? Sun : t === "dusk" ? Sunset : Moon;
              return (
                <button
                  key={t}
                  aria-label={`${t === "night" ? "Dark / Night" : t === "day" ? "Day" : "Dusk"} mode`}
                  title={`${t[0].toUpperCase() + t.slice(1)} mode`}
                  aria-pressed={theme === t}
                  onClick={() => setTheme(t)}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
          <a
            className="home-link"
            href="https://imd.fun"
            target="_blank"
            rel="noreferrer"
          >
            imd.fun <ArrowUpRight size={15} />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </header>
      <div className="app-shell">
        <aside className="sidebar" aria-label="Feed filters">
          <div className="sidebar-heading">
            <SlidersHorizontal size={16} />
            <h2>Make it your feed</h2>
          </div>
          <Filters {...filterProps} />
          <div className="quality-note">
            <ShieldCheck size={21} />
            <h3>Signal, with less noise.</h3>
            <p>
              Original posts. Useful context.
              <br />A little room for memes.
            </p>
            <button onClick={() => openDialog("about")}>
              How the feed works <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="sidebar-footer">
            <span className="status-dot" /> Made for the swarm.
            <span>Independent community reader</span>
          </div>
        </aside>
        <main id="feed" tabIndex={-1}>
          <section className="intro" aria-labelledby="page-title">
            <div>
              <div className="eyebrow">
                <span className="tiny-diamond" /> The Identity-MD newsfeed
              </div>
              <h1 id="page-title">
                Less noise. More signal<span>.</span>
              </h1>
              <p>The latest on Identity-MD &amp; $IMD, all in one place.</p>
            </div>
            <div className="intro-status">
              <span className="edition">
                <span className="status-dot" />
                {feed?.mode === "live" ? "Connected feed" : "Preview edition"}
              </span>
              <button onClick={() => openDialog("about")}>
                <Radio size={13} /> A fresh check every 15 min
              </button>
            </div>
          </section>
          <div className="edition-note">
            <span>
              <CircleHelp size={15} />
              {feed?.mode === "live"
                ? `Collected ${new Date(feed.lastSuccessAt ?? feed.generatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}. ${feed.health.filter((h) => !h.ok).length ? "Some sources are unavailable." : "Original sources, automatically filtered."}`
                : "You’re exploring a preview. Entries are illustrative, not live news."}
            </span>
            <button onClick={() => openDialog("about")}>
              Feed details <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="feed-navigation">
            <div
              className="feed-tabs"
              role="group"
              aria-label="Feed collection"
            >
              {(
                [
                  {
                    id: "all",
                    label: "All activity",
                    Icon: Radio,
                    count: entries.filter((e) => !hidden.includes(e.id)).length,
                  },
                  {
                    id: "saved",
                    label: "Saved",
                    Icon: Bookmark,
                    count: entries.filter(
                      (e) => saved.includes(e.id) && !hidden.includes(e.id),
                    ).length,
                  },
                  {
                    id: "hidden",
                    label: "Hidden",
                    Icon: EyeOff,
                    count: entries.filter((e) => hidden.includes(e.id)).length,
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  aria-pressed={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  <t.Icon size={15} />
                  {t.label}
                  <span className="tab-count">{t.count}</span>
                </button>
              ))}
            </div>
            <div className="view-switch" role="group" aria-label="Feed layout">
              {(
                [
                  { id: "feed", label: "Feed", Icon: List },
                  { id: "compact", label: "Compact", Icon: Menu },
                  { id: "grid", label: "Grid", Icon: Grid2X2 },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  aria-label={`${v.label} view`}
                  aria-pressed={view === v.id}
                  title={`${v.label} view`}
                  onClick={() => setView(v.id)}
                >
                  <v.Icon size={16} />
                  <span>{v.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="feed-toolbar">
            <label className="search-field">
              <Search size={17} />
              <span className="sr-only">Search the feed</span>
              <input
                type="search"
                placeholder="Search the signal…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery("")}>
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="toolbar-actions">
              <button
                className="filter-trigger secondary"
                onClick={() => openDialog("filters")}
              >
                <ListFilter size={16} />
                Filters{filterCount > 0 && ` (${filterCount})`}
              </button>
              <label className="sort-control">
                <ArrowDown size={14} />
                <span className="sr-only">Sort entries</span>
                <select
                  value={order}
                  onChange={(e) => setOrder(e.target.value as typeof order)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
              <button
                className="icon-button refresh"
                aria-label="Refresh feed"
                title="Refresh feed"
                disabled={busy}
                onClick={() => void refresh(true)}
              >
                <RefreshCw size={16} className={busy ? "spinning" : ""} />
              </button>
            </div>
          </div>
          {pending && (
            <button
              className="updates-button"
              onClick={() => {
                applyFeed(pending);
                setPending(null);
                announce("Feed updated.");
              }}
            >
              <ArrowUp size={15} /> Show updates
            </button>
          )}
          {error && (
            <div className="error-message" role="alert">
              <span>{error}</span>
              <button onClick={() => void refresh(true)}>Try again</button>
            </div>
          )}
          <div className="result-heading">
            <span>
              {tab === "hidden"
                ? "Hidden from your feed"
                : tab === "saved"
                  ? "Your reading list"
                  : "Across the swarm"}{" "}
              <span className="result-number">
                / {String(filtered.length).padStart(2, "0")}
              </span>
            </span>
            <span className="results-status" role="status">
              {busy && !feed
                ? "Loading entries…"
                : `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}${filterCount || query ? " matching your filters" : " · chronological"}`}
            </span>
          </div>
          {busy && !feed ? (
            <div className="empty-state">
              <Radio size={30} />
              <h2>Finding the signal…</h2>
              <p>Loading the latest available feed.</p>
            </div>
          ) : !filtered.length ? (
            <div className="empty-state">
              <Search size={30} />
              <h2>
                {tab === "saved" && !saved.length
                  ? "Good reads belong here."
                  : tab === "hidden" && !hidden.length
                    ? "Nothing hidden. A clear view."
                    : "No entries in this view."}
              </h2>
              <p>
                {tab === "saved" && !saved.length
                  ? "Use the bookmark on any entry to keep it for later."
                  : tab === "hidden" && !hidden.length
                    ? "Entries you hide will appear here. Restore them whenever you like."
                    : query
                      ? `No matches for “${query}”. Try a different search or clear your filters.`
                      : "Try another source or content type to find more of the conversation."}
              </p>
              <button
                className="primary"
                onClick={() => {
                  reset();
                  setTab("all");
                }}
              >
                Back to all activity <ArrowUpRight size={15} />
              </button>
            </div>
          ) : (
            <div className={`entries view-${view}`}>
              {filtered.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  saved={saved.includes(e.id)}
                  hidden={hidden.includes(e.id)}
                  onSave={() => save(e)}
                  onHide={() => hide(e)}
                />
              ))}
            </div>
          )}
          {filtered.length > 0 && (
            <div className="feed-end">
              <span className="end-symbol">
                <Check size={17} />
              </span>
              <p>You’re all caught up.</p>
              <span>
                {feed?.mode === "preview"
                  ? "That’s the preview. Make yourself at home."
                  : "New entries appear here after the next collection."}
              </span>
              <a href="#feed">
                Back to top <ArrowUp size={13} />
              </a>
            </div>
          )}
          <footer className="main-footer">
            <span>
              <Mark small /> A clearer view of Identity-MD.
            </span>
            <button onClick={() => openDialog("about")}>
              About Signal <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      <div className="sr-only" role="status">
        {announcement}
      </div>
      {notice && (
        <div className="toast">
          <span role="status">{notice.text}</span>
          {notice.undo && (
            <button ref={undoRef} onClick={notice.undo}>
              Undo
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        className={dialogKind === "filters" ? "filter-dialog" : ""}
        aria-labelledby="dialog-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="dialog-inner">
          <div className="dialog-heading">
            <h2 id="dialog-title">
              {dialogKind === "filters"
                ? "Make it your feed"
                : "A clearer view of the swarm."}
            </h2>
            <button
              className="icon-button"
              aria-label="Close dialog"
              onClick={() => dialog.current?.close()}
            >
              <X size={20} />
            </button>
          </div>
          {dialogKind === "filters" ? (
            <>
              <Filters {...filterProps} />
              <button
                className="primary full-width"
                onClick={() => dialog.current?.close()}
              >
                Show {filtered.length} {filtered.length === 1 ? "entry" : "entries"} <ArrowUpRight size={16} />
              </button>
            </>
          ) : (
            <>
              <p>
                Signal gathers articles, posts, videos and community creations
                about Identity-MD and $IMD into one chronological feed.
              </p>
              <div className="about-callout">
                <Radio size={22} />
                <div>
                  <h3>
                    {feed?.mode === "live"
                      ? "Connected sources"
                      : "You’re in the preview edition"}
                  </h3>
                  <p>
                    {feed?.mode === "live"
                      ? "This feed was published by the collector. Source availability is shown below."
                      : "These are illustrative entries, not actual posts or project announcements. Example links open the project or a source search. Live collection requires a separately deployed collector."}
                  </p>
                </div>
              </div>
              <h3>A thoughtful pace</h3>
              <p>
                The reader checks for updates every 15 minutes while this tab is
                visible. The collector checks active sources every 15 minutes
                and slows quiet sources to hourly. New entries wait for you to
                load them, so the page stays still while you read.
              </p>
              <h3>Originals earn their place</h3>
              <p>
                Top-level posts need substance. Ticker-only messages, replies,
                spam and near-identical reposts are filtered out. Relevant memes
                and image posts are welcome. Automated rules can miss context;
                they are not a guarantee of quality.
              </p>
              <h3>Your reading space</h3>
              <p>
                Saved entries, hidden entries, layout and theme stay in this
                browser. Hiding an entry is reversible and does not delete the
                original.
              </p>
              <div className="source-health">
                <h3>Source status</h3>
                {feed?.health.map((h) => (
                  <div key={h.name}>
                    <span>{h.name}</span>
                    <span>{h.ok ? "Connected" : h.detail}</span>
                  </div>
                ))}
              </div>
              <a
                className="text-link"
                href="https://imd.fun"
                target="_blank"
                rel="noreferrer"
              >
                Visit Identity-MD <ExternalLink size={14} />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
interface FilterProps {
  selectedSources: Source[];
  selectedTypes: EntryType[];
  setSources: React.Dispatch<React.SetStateAction<Source[]>>;
  setTypes: React.Dispatch<React.SetStateAction<EntryType[]>>;
  entries: Entry[];
  reset: () => void;
}
function Filters({
  selectedSources,
  selectedTypes,
  setSources,
  setTypes,
  entries,
  reset,
}: FilterProps) {
  const id = useId();
  return (
    <div className="filters-content">
      <fieldset>
        <legend>
          Sources{" "}
          <span>
            {selectedSources.length}/{sources.length}
          </span>
        </legend>
        <label className="all-sources">
          <input
            type="checkbox"
            checked={selectedSources.length === sources.length}
            ref={(el) => {
              if (el)
                el.indeterminate =
                  selectedSources.length > 0 &&
                  selectedSources.length < sources.length;
            }}
            onChange={() =>
              setSources(
                selectedSources.length === sources.length ? [] : [...sources],
              )
            }
          />
          <span>All sources</span>
        </label>
        <div className="source-options">
          {sources.map((s) => (
            <label key={s} className="source-option">
              <input
                type="checkbox"
                name={`${id}-source`}
                checked={selectedSources.includes(s)}
                onChange={() =>
                  setSources((v) =>
                    v.includes(s) ? v.filter((x) => x !== s) : [...v, s],
                  )
                }
              />
              <span className={`source-icon source-${s.toLowerCase()}`}>
                <SourceIcon source={s} />
              </span>
              <span>
                {s === "X" ? "X (Twitter)" : s === "Web" ? "Other websites" : s}
              </span>
              <span className="source-count">
                {entries.filter((e) => e.source === s).length}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="type-fieldset">
        <legend>Content type</legend>
        <div className="type-options">
          {types.map((t) => {
            const Icon = typeIcons[t];
            return (
              <label
                key={t}
                className={
                  selectedTypes.includes(t)
                    ? "type-option selected"
                    : "type-option"
                }
              >
                <input
                  type="checkbox"
                  name={`${id}-type`}
                  checked={selectedTypes.includes(t)}
                  onChange={() =>
                    setTypes((v) =>
                      v.includes(t) ? v.filter((x) => x !== t) : [...v, t],
                    )
                  }
                />
                <Icon size={13} />
                <span>{t === "Image" ? "Images & memes" : t === "Story" ? "Stories" : `${t}s`}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <button className="reset-filters" onClick={reset}>
        <RefreshCw size={13} /> Reset filters
      </button>
    </div>
  );
}
function EntryCard({
  entry: e,
  saved,
  hidden,
  onSave,
  onHide,
}: {
  entry: Entry;
  saved: boolean;
  hidden: boolean;
  onSave: () => void;
  onHide: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const id = useId();
  const Icon = typeIcons[e.type];
  const paragraphs = e.text.split("\n\n");
  return (
    <article
      className={`entry ${expanded ? "expanded" : ""} ${e.image ? "has-image" : ""}`}
      aria-labelledby={`${id}-title`}
    >
      <div
        className={`avatar avatar-${e.source.toLowerCase()}`}
        aria-hidden="true"
      >
        {e.source === "Web" ? (
          <Mark small />
        ) : e.source === "YouTube" ? (
          <Play size={19} />
        ) : (
          e.author
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
        )}
      </div>
      <div className="entry-content">
        <div className="entry-meta">
          <span className="author">{e.author}</span>
          <span className={`platform source-${e.source.toLowerCase()}`}>
            <SourceIcon source={e.source} />
            <span>{e.source}</span>
          </span>
          <time
            dateTime={e.publishedAt}
            title={new Date(e.publishedAt).toLocaleString()}
          >
            {new Date(e.publishedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}{" "}
            <span className="entry-time">
              ·{" "}
              {new Date(e.publishedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
          </time>
          <span className="entry-type">
            <Icon size={11} />
            {e.type}
          </span>
        </div>
        <h2 id={`${id}-title`}>{e.title}</h2>
        <div id={`${id}-body`} className="entry-body">
          <p>{paragraphs[0]}</p>
          {expanded && (
            <div className="expanded-text">
              {paragraphs.slice(1).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
        </div>
        {e.image && !imageFailed && (
          <img
            className="entry-image"
            src={e.image}
            alt={e.imageAlt || `Image accompanying ${e.title}`}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
        {imageFailed && (
          <p className="media-unavailable">
            Image unavailable. You can still read the entry or open the source.
          </p>
        )}
        {e.type === "Video" && (
          <div className="video-preview">
            <div className="video-art">
              <Mark />
              <span>
                FIELD
                <br />
                NOTES<span className="video-art-number">/ 001</span>
              </span>
            </div>
            <div className="video-caption">
              <span className="eyebrow">
                {e.example ? "Example video" : "Video from the source"}
              </span>
              <strong>
                {e.example
                  ? "A closer look at the contributor network"
                  : e.title}
              </strong>
              <button onClick={() => setExpanded((v) => !v)}>
                <Play size={13} />
                {expanded ? "Hide details" : "Explore video"}
              </button>
            </div>
          </div>
        )}
        {expanded && e.video && (
          <video
            className="inline-video"
            src={e.video}
            controls
            preload="none"
            aria-label={e.title}
          />
        )}
        <div className="entry-footer">
          <button
            className="read-more"
            aria-expanded={expanded}
            aria-controls={`${id}-body`}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Read less" : "Read more"}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <div className="entry-tags">
            {e.tags.slice(0, 2).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <div className="entry-actions">
            {e.example && <span className="example-label">Example</span>}
            <a
              className="icon-button"
              href={e.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open source for ${e.title} (opens in a new tab)`}
              title="Open source"
            >
              <ArrowUpRight size={17} />
            </a>
            <button
              className={`icon-button ${saved ? "is-saved" : ""}`}
              aria-label={`${saved ? "Unsave" : "Save"} ${e.title}`}
              title={saved ? "Remove from saved" : "Save for later"}
              aria-pressed={saved}
              onClick={onSave}
            >
              <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
            </button>
            <button
              className="icon-button"
              aria-label={`${hidden ? "Restore" : "Hide"} ${e.title}`}
              title={hidden ? "Restore entry" : "Hide entry"}
              onClick={onHide}
            >
              {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
