// Every desk state, reachable with ?state=<name> (UI-SPEC §6 acceptance). Fixtures never call the network; reserve and log stay local in a fixture.
import type { CollectionItem } from "@/lib/collection";
import type { Preset } from "@/lib/presets";
import type { RecoverResult, RecoveredBook, RedactedRequest, Seed, SourceName, SourceResult, Verdict } from "@/lib/schemas";

export type DrawerStatus = "closed" | "opening" | "done";
export type Drawer = { source: SourceName; status: DrawerStatus; result?: SourceResult };
export type Drawers = Partial<Record<SourceName, Drawer>>;
export type Phase = "idle" | "checking" | "checked";
export type ShelfState = { status: "idle" | "loading" | "ready" | "error"; result?: RecoverResult; error?: string };
export type ActionState = "idle" | "busy" | "done" | "again" | "error";
export type HoldsState = { state: ActionState; message?: string };
export type LogState = { state: ActionState; message?: string; count?: number; times?: number };

export type Snapshot = {
  title: string;
  author: string;
  seeds: Seed[];
  activePreset: string | null;
  drawers: Drawers;
  phase: Phase;
  verdict: Verdict | null;
  runId: string | null;
  shelf: ShelfState;
  holds: HoldsState;
  log: LogState;
  panelOpen: boolean;
  emptyTitle: boolean;
  checkError: string | null;
};

export const freshDrawers = (sources: SourceName[], status: DrawerStatus): Drawers => Object.fromEntries(sources.map((s) => [s, { source: s, status }]));

export const STATE_NAMES = [
  "checking",
  "no-record",
  "exists-held",
  "exists-not-held",
  "source-failed",
  "unchecked",
  "no-seed",
  "shelf-loading",
  "shelf-missing-cover",
  "recovery-error",
  "holds-blocked",
  "holds-placing",
  "holds-placed",
  "holds-error",
  "logged",
  "already-logged",
  "panel-open",
  "panel-empty",
  "empty-title",
  "check-error",
] as const;
export type StateName = (typeof STATE_NAMES)[number];

export type FixtureContext = { sources: SourceName[]; presets: Preset[]; books: RecoveredBook[]; collectionSize: number; held?: { item: CollectionItem; coverUrl: string | null } };

const MS: Record<string, number> = { catalog: 8, openlibrary: 610, googlebooks: 440, internetarchive: 440 };

function link(source: SourceName, title: string, author: string): string | undefined {
  if (source === "openlibrary") return `https://openlibrary.org/search?${new URLSearchParams({ title, author })}`;
  if (source === "googlebooks") return `https://www.google.com/books?${new URLSearchParams({ q: `${title} ${author}` })}`;
  if (source === "internetarchive") return `https://archive.org/search?${new URLSearchParams({ query: `${title} ${author}` })}&and[]=mediatype%3A%22texts%22`;
  return undefined;
}

function answered(ctx: FixtureContext, title: string, author: string, kinds: Partial<Record<SourceName, SourceResult["result"]>> = {}, found: Partial<Record<SourceName, SourceResult["found"]>> = {}): Drawers {
  const out: Drawers = {};
  for (const s of ctx.sources) {
    const result = kinds[s] ?? "no_record";
    const f = found[s];
    const detail =
      result === "failed"
        ? "did not answer (timeout)"
        : result === "found"
          ? s === "catalog"
            ? `held, borrowed ${(f?.checkouts2025 ?? 0).toLocaleString("en-US")} times in 2025`
            : `found, first published ${f?.year ?? "unknown"}`
          : s === "catalog"
            ? `no record among ${ctx.collectionSize.toLocaleString("en-US")} held titles`
            : "no matches";
    out[s] = { source: s, status: "done", result: { source: s, result, ms: MS[s] ?? 400, detail, link: link(s, title, author), found: result === "found" ? f : undefined } };
  }
  return out;
}

const SAMPLE_NOTE = "Sample mode: Qloo key pending. These three are a deterministic stand-in, not ranked by taste.";

function liveShapeRequest(seeds: Seed[]): RedactedRequest {
  return {
    provider: "sample",
    note: "Fixture: these are the calls the live client sends; no request reached Qloo for this screen.",
    calls: [
      ...seeds.map((s) => ({ name: "search", url: "https://hackathon.api.qloo.com/search", params: { query: s.name, types: s.kind === "film" ? "urn:entity:movie" : s.kind === "band" || s.kind === "artist" ? "urn:entity:artist" : s.kind === "author" ? "urn:entity:person" : s.kind === "book" ? "urn:entity:book" : "urn:entity:tv_show", take: "3" } })),
      {
        name: "insights",
        url: "https://hackathon.api.qloo.com/v2/insights",
        params: { "filter.type": "urn:entity:book", "signal.interests.entities": `<${seeds.length} resolved entity ids>`, "filter.results.entities": "<up to 150 held entity ids per chunk>", "feature.explainability": "true", take: "50" },
      },
    ],
    holdingsChunks: 0,
  };
}

function ready(seeds: Seed[], books: RecoveredBook[], request?: RedactedRequest): RecoverResult {
  return { runId: "fixture", mode: "sample", modeNote: SAMPLE_NOTE, seeds: seeds.map((s) => ({ ...s, entityId: `sample:${s.kind}:${s.name.toLowerCase()}` })), unresolved: [], books, request: request ?? liveShapeRequest(seeds) };
}

export function buildFixture(name: string, ctx: FixtureContext): Snapshot | null {
  const p1 = ctx.presets[0];
  if (!p1) return null;
  const n = ctx.sources.length;
  const third = ctx.sources[n - 1];
  const noRecord = (checked = n, failed: SourceName[] = []): Verdict => ({ kind: "no_record", checked, failed });
  const base = (over: Partial<Snapshot> = {}): Snapshot => ({
    title: p1.title,
    author: p1.author,
    seeds: p1.seeds,
    activePreset: p1.id,
    drawers: answered(ctx, p1.title, p1.author),
    phase: "checked",
    verdict: noRecord(),
    runId: "fixture",
    shelf: { status: "ready", result: ready(p1.seeds, ctx.books) },
    holds: { state: "idle" },
    log: { state: "idle" },
    panelOpen: false,
    emptyTitle: false,
    checkError: null,
    ...over,
  });

  switch (name as StateName) {
    case "checking":
      return base({ drawers: freshDrawers(ctx.sources, "opening"), phase: "checking", verdict: null, shelf: { status: "idle" } });
    case "no-record":
      return base();
    case "exists-held": {
      const held = ctx.held;
      const preset = ctx.presets.find((p) => p.kind === "real-held");
      if (!held || !preset) return null;
      const it = held.item;
      const rec = { title: it.title, author: it.author, year: it.year, isbn13: it.isbn13, held: true, checkouts2025: it.checkouts2025, publisher: it.publisher };
      return base({
        title: preset.title,
        author: preset.author,
        seeds: [],
        activePreset: preset.id,
        drawers: answered(ctx, preset.title, preset.author, { catalog: "found", openlibrary: "found", [third]: "found" }, { catalog: rec, openlibrary: { ...rec, held: undefined }, [third]: { ...rec, held: undefined } }),
        verdict: { kind: "held", checked: n, failed: [], heldItem: it, heldCoverUrl: held.coverUrl },
        shelf: { status: "idle" },
      });
    }
    case "exists-not-held": {
      const preset = ctx.presets.find((p) => p.kind === "real-not-held");
      const title = preset?.title ?? "Beautiful Ruins";
      const author = preset?.author ?? "Jess Walter";
      const rec = { title, author, year: 2012, isbn13: "9780061928123" };
      return base({
        title,
        author,
        seeds: [],
        activePreset: preset?.id ?? null,
        drawers: answered(ctx, title, author, { openlibrary: "found", [third]: "found" }, { openlibrary: rec, [third]: rec }),
        verdict: { kind: "not_held", checked: n, failed: [], foundElsewhere: { source: "openlibrary", record: rec } },
        shelf: { status: "idle" },
      });
    }
    case "source-failed":
      return base({ drawers: answered(ctx, p1.title, p1.author, { [third]: "failed" }), verdict: noRecord(n - 1, [third]) });
    case "unchecked":
      return base({ drawers: answered(ctx, p1.title, p1.author, Object.fromEntries(ctx.sources.map((s) => [s, "failed"]))), verdict: { kind: "unchecked", checked: 0, failed: ctx.sources }, shelf: { status: "idle" } });
    case "no-seed": {
      const preset = ctx.presets.find((p) => p.kind === "invented" && p.seeds.length === 0) ?? p1;
      return base({ title: preset.title, author: preset.author, seeds: [], activePreset: preset.id, drawers: answered(ctx, preset.title, preset.author), shelf: { status: "ready", result: ready([], []) } });
    }
    case "shelf-loading":
      return base({ shelf: { status: "loading" } });
    case "shelf-missing-cover":
      return base({ shelf: { status: "ready", result: ready(p1.seeds, ctx.books.map((b) => ({ ...b, coverUrl: null }))) } });
    case "recovery-error":
      return base({ shelf: { status: "error", error: "Couldn't reach the taste graph." } });
    case "holds-blocked": {
      const s = buildFixture("no-seed", ctx)!;
      return { ...s, holds: { state: "error", message: "Nothing to reserve yet" } };
    }
    case "holds-placing":
      return base({ holds: { state: "busy" } });
    case "holds-placed":
      return base({ holds: { state: "done", message: `${Math.min(3, ctx.books.length) || 3} books reserved` } });
    case "holds-error":
      return base({ holds: { state: "error", message: "Couldn't reserve them. Nothing was reserved." } });
    case "logged":
      return base({ holds: { state: "done", message: "3 books reserved" }, log: { state: "done", message: "Logged", count: 11, times: 1 } });
    case "already-logged":
      return base({ log: { state: "again", message: "Logged 12 times", count: 11, times: 12 } });
    case "panel-open":
      return base({ panelOpen: true });
    case "panel-empty":
      return base({ panelOpen: true, shelf: { status: "idle" }, verdict: null, phase: "idle", drawers: freshDrawers(ctx.sources, "closed") });
    case "empty-title":
      return base({ title: "", author: "", seeds: [], activePreset: null, drawers: freshDrawers(ctx.sources, "closed"), phase: "idle", verdict: null, shelf: { status: "idle" }, emptyTitle: true });
    case "check-error":
      return base({ drawers: freshDrawers(ctx.sources, "closed"), verdict: null, shelf: { status: "idle" }, checkError: "Couldn't run the checks. Try again." });
    default:
      return null;
  }
}
