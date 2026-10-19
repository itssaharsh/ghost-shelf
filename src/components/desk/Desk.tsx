"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openCheckStream } from "@/lib/client/sse";
import type { Preset } from "@/lib/presets";
import { SOURCE_LABEL, type CheckEvent, type RecoverResult, type Seed, type SourceName, type SourceResult, type Verdict } from "@/lib/schemas";
import { announceRegistryCount } from "../RegistryCount";
import { PatronCard } from "./PatronCard";
import { Shelf } from "./Shelf";
import { SeedsRow } from "./SeedsRow";
import { RequestPanel } from "./RequestPanel";

type DrawerStatus = "closed" | "opening" | "done";
export type Drawer = { source: SourceName; status: DrawerStatus; result?: SourceResult };
type Phase = "idle" | "checking" | "checked";
type ShelfState = { status: "idle" | "loading" | "ready" | "error"; result?: RecoverResult; error?: string };
type ActionState = "idle" | "busy" | "done" | "error";

type Drawers = Partial<Record<SourceName, Drawer>>;
const fresh = (sources: SourceName[], status: DrawerStatus): Drawers => Object.fromEntries(sources.map((s) => [s, { source: s, status }]));

export function Desk({ presets, sources, collectionSize, qlooConfigured, demo }: { presets: Preset[]; sources: SourceName[]; collectionSize: number; qlooConfigured: boolean; demo: boolean }) {
  const [title, setTitle] = useState(presets[0]?.title ?? "");
  const [author, setAuthor] = useState(presets[0]?.author ?? "");
  const [activePreset, setActivePreset] = useState<string | null>(presets[0]?.id ?? null);
  const [seeds, setSeeds] = useState<Seed[]>(presets[0]?.seeds ?? []);
  const [drawers, setDrawers] = useState<Drawers>(() => fresh(sources, "closed"));
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [emptyTitle, setEmptyTitle] = useState(false);
  const [shelf, setShelf] = useState<ShelfState>({ status: "idle" });
  const [holds, setHolds] = useState<{ state: ActionState; message?: string }>({ state: "idle" });
  const [log, setLog] = useState<{ state: ActionState; message?: string; count?: number }>({ state: "idle" });
  const [panelOpen, setPanelOpen] = useState(false);
  const [judgeCard, setJudgeCard] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const titleRef = useRef<HTMLInputElement>(null);
  const checkedRun = useRef<{ title: string; author: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("judge") === "1" || (demo && params.get("judge") !== "0");
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("ghost-shelf:judge-card") === "hidden";
    } catch {}
    setJudgeCard(wanted && !dismissed);
  }, [demo]);

  const recover = useCallback(async (id: string, seedList: Seed[], excludeIsbns: string[] = []) => {
    if (seedList.length === 0) {
      setShelf({ status: "ready", result: { runId: id, mode: qlooConfigured ? "qloo" : "sample", modeNote: "", seeds: [], unresolved: [], books: [] } });
      return;
    }
    setShelf({ status: "loading" });
    try {
      const res = await fetch("/api/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: id, seeds: seedList, excludeIsbns }) });
      if (res.status === 429) throw new Error("Too many requests; try again in a minute");
      if (!res.ok) throw new Error("Couldn't reach the taste graph.");
      const json = (await res.json()) as RecoverResult;
      setShelf({ status: "ready", result: json });
    } catch (err) {
      setShelf({ status: "error", error: err instanceof Error ? err.message : "Couldn't reach the taste graph." });
    }
  }, [qlooConfigured]);

  const startCheck = useCallback((t: string, a: string, seedList: Seed[]) => {
    const tt = t.trim();
    if (!tt) {
      setEmptyTitle(true);
      titleRef.current?.focus();
      return;
    }
    setEmptyTitle(false);
    stopRef.current();
    setDrawers(fresh(sources, "opening"));
    setPhase("checking");
    setVerdict(null);
    setCheckError(null);
    setShelf({ status: "idle" });
    setHolds({ state: "idle" });
    setLog({ state: "idle" });
    setPanelOpen(false);
    checkedRun.current = { title: tt, author: a.trim() };
    stopRef.current = openCheckStream(
      { title: tt, author: a.trim() },
      (e: CheckEvent) => {
        if (e.type === "start") setRunId(e.runId);
        if (e.type === "source") setDrawers((d) => ({ ...d, [e.source]: { source: e.source, status: "done", result: e } }));
        if (e.type === "verdict") {
          setVerdict(e.verdict);
          setPhase("checked");
          setDrawers((d) => {
            const next = { ...d };
            for (const s of sources) if (next[s]?.status !== "done") next[s] = { source: s, status: "done", result: { source: s, result: "failed", ms: 0, detail: "did not answer" } };
            return next;
          });
          if (e.verdict.kind === "no_record" || e.verdict.kind === "unchecked") void recover(e.runId, seedList);
        }
      },
      (message) => {
        setCheckError(message);
        setPhase("checked");
      },
    );
  }, [recover, sources]);

  // The first screen is a finished run of preset 1: start it on mount.
  useEffect(() => {
    if (presets[0]) startCheck(presets[0].title, presets[0].author, presets[0].seeds);
    return () => stopRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPreset = (p: Preset) => {
    setActivePreset(p.id);
    setTitle(p.title);
    setAuthor(p.author);
    setSeeds(p.seeds);
    startCheck(p.title, p.author, p.seeds);
  };

  const onSeedsChange = (next: Seed[]) => {
    setSeeds(next);
    if (runId && verdict && (verdict.kind === "no_record" || verdict.kind === "unchecked")) void recover(runId, next);
  };

  const books = shelf.result?.books ?? [];
  const heldItem = verdict?.kind === "held" ? verdict.heldItem : undefined;
  const reservable = heldItem ? [heldItem.isbn13] : books.map((b) => b.isbn13);

  const reserve = async () => {
    if (!runId || reservable.length === 0) {
      setHolds({ state: "error", message: "Nothing to reserve yet" });
      return;
    }
    setHolds({ state: "busy" });
    try {
      const res = await fetch("/api/holds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, isbns: reservable, title, author }) });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { written: number };
      setHolds({ state: "done", message: `${j.written} ${j.written === 1 ? "book" : "books"} reserved` });
    } catch {
      setHolds({ state: "error", message: "Couldn't reserve them. Nothing was reserved." });
    }
  };

  const logIt = async () => {
    if (!runId || !verdict || verdict.kind !== "no_record") return;
    setLog({ state: "busy" });
    try {
      const res = await fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, title, author, seeds, recovered: books.map((b) => ({ isbn13: b.isbn13, title: b.title })) }) });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { count: number; timesLogged: number };
      announceRegistryCount(j.count);
      setLog({ state: "done", message: j.timesLogged > 1 ? `Logged ${j.timesLogged} times` : "Logged", count: j.count });
    } catch {
      setLog({ state: "error", message: "Couldn't log it" });
    }
  };

  const hideJudgeCard = () => {
    setJudgeCard(false);
    try {
      localStorage.setItem("ghost-shelf:judge-card", "hidden");
    } catch {}
  };

  const canReserve = reservable.length > 0 && holds.state !== "busy";
  const reserveLabel =
    holds.state === "busy" ? "Reserving…" : holds.state === "done" ? holds.message : heldItem ? "Reserve this book" : `Reserve ${reservable.length || "these"} ${reservable.length === 1 ? "book" : "books"}`;
  const modeNote = shelf.result?.modeNote ?? "";
  const presetLabel = useMemo(() => Object.fromEntries(presets.map((p) => [p.id, `${p.title} · ${p.author}`])), [presets]);

  return (
    <div className="flex-1 flex flex-col">
      {/* Presets */}
      <div className="no-print border-b border-line px-4 sm:px-8 lg:px-20 py-2.5">
        <div className="flex items-center gap-2.5 overflow-x-auto [scrollbar-width:thin]" role="group" aria-label="Try one">
          <span className="text-[13px] text-ink-muted shrink-0">Try one:</span>
          {presets.map((p) => {
            const active = activePreset === p.id;
            const invented = p.kind === "invented";
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p)}
                aria-pressed={active}
                aria-label={`${invented ? "Invented title" : "Real title"}: ${p.title} by ${p.author}`}
                className={`shrink-0 h-8 px-3 rounded-md border text-[14px] inline-flex items-center gap-2 transition-colors duration-150 ${active ? "bg-ink text-canvas border-ink" : "bg-canvas text-ink border-line hover:bg-surface-2"}`}
              >
                <span aria-hidden="true" className={`inline-block size-2 rounded-full ${invented ? "bg-danger" : "border-[1.5px] border-current"}`} />
                {presetLabel[p.id]}
              </button>
            );
          })}
          <span className="text-[13px] text-ink-muted shrink-0">or type any title below</span>
        </div>
      </div>

      <div className="relative flex-1 px-4 sm:px-8 lg:px-20 pt-6 pb-28 lg:pb-10 max-w-[1440px] w-full mx-auto">
        {judgeCard && (
          <aside className="no-print lg:absolute lg:right-20 lg:-top-0 lg:w-[360px] mb-4 lg:mb-0 bg-card-stock border border-line rounded-md p-3 text-[13px] leading-[1.45] flex gap-3 items-start" aria-label="How to judge this">
            <div className="flex-1">
              <strong className="font-display font-bold">How to judge this in 90 seconds</strong>
              <br />
              1 Click an invented title (red dot). 2 Watch the three checks answer. 3 Read the card you&rsquo;d turn to the patron. 4 Reserve the 3 books. 5 Open the Qloo request.
            </div>
            <button type="button" onClick={hideJudgeCard} className="text-ink-muted text-[13px] underline-offset-2 hover:underline" aria-label="Hide the judge card">
              Hide
            </button>
          </aside>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-6 lg:mt-14">
          {/* LEFT: title, drawers, patron card, seeds */}
          <section className="lg:col-span-7 flex flex-col gap-4" aria-label="Check a title">
            <form
              className="flex flex-col sm:flex-row sm:items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setActivePreset(null);
                startCheck(title, author, seeds);
              }}
            >
              <label className="flex-1 flex flex-col gap-1 text-[13px] text-ink-muted">
                Title they asked for
                <input
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-invalid={emptyTitle || undefined}
                  aria-describedby={emptyTitle ? "title-error" : undefined}
                  className="h-11 px-3 border border-line-input rounded-md text-[17px] text-ink bg-canvas"
                  autoComplete="off"
                  maxLength={200}
                />
              </label>
              <label className="sm:w-[220px] flex flex-col gap-1 text-[13px] text-ink-muted">
                Author they gave
                <input value={author} onChange={(e) => setAuthor(e.target.value)} className="h-11 px-3 border border-line-input rounded-md text-[17px] text-ink bg-canvas" autoComplete="off" maxLength={200} />
              </label>
              <button
                type="submit"
                aria-disabled={phase === "checking" || undefined}
                className={`h-11 px-4 rounded-md font-display font-bold text-[15px] ${phase === "checking" ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink hover:bg-line"}`}
              >
                {phase === "checking" ? "Checking…" : "Check"}
              </button>
            </form>
            {emptyTitle && (
              <p id="title-error" className="text-[14px] text-danger -mt-2">
                Type the title they asked for
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="The three checks">
              {sources.map((s) => (
                <DrawerView key={s} drawer={drawers[s] ?? { source: s, status: "closed" }} collectionSize={collectionSize} />
              ))}
            </div>

            <PatronCard phase={phase} verdict={verdict} error={checkError} title={title} author={author} sources={sources} />

            {verdict && (verdict.kind === "no_record" || verdict.kind === "unchecked") && <SeedsRow seeds={seeds} onChange={onSeedsChange} unresolved={shelf.result?.unresolved ?? []} />}
          </section>

          {/* RIGHT: the shelf */}
          <section className="lg:col-span-5 flex flex-col gap-3" aria-label="Held books">
            <Shelf phase={phase} verdict={verdict} shelf={shelf} heldItem={heldItem} seeds={seeds} onRetry={() => runId && recover(runId, seeds)} />
            <p className="text-[13px] text-ink-muted leading-[1.45]">
              Demo collection: about {collectionSize.toLocaleString("en-US")} most-borrowed 2025 titles at Seattle Public Library (public domain).{" "}
              {shelf.result ? (shelf.result.mode === "qloo" ? "Books ranked by Qloo, a taste database." : modeNote) : qlooConfigured ? "Books ranked by Qloo, a taste database." : "Sample mode until the Qloo key is active."}{" "}
              Covers from Open Library.
            </p>
            <div className="hidden lg:flex gap-3 items-center flex-wrap">
              <button
                type="button"
                onClick={reserve}
                aria-disabled={!canReserve || undefined}
                className={`h-11 px-4 rounded-md font-display font-bold text-[15px] ${holds.state === "done" ? "bg-success text-accent-ink" : canReserve ? "bg-accent text-accent-ink hover:bg-[var(--accent-hover)]" : "bg-surface-2 text-ink-muted"}`}
              >
                {reserveLabel}
              </button>
              <button
                type="button"
                onClick={logIt}
                aria-disabled={!(verdict?.kind === "no_record") || log.state === "busy" || undefined}
                className="h-11 px-4 rounded-md font-display font-bold text-[15px] bg-surface-2 text-ink hover:bg-line"
              >
                {log.state === "busy" ? "Logging…" : log.state === "done" ? log.message : "Log this invented title"}
              </button>
              {holds.state === "error" && <span className="text-[14px] text-danger">{holds.message}</span>}
              {log.state === "error" && <span className="text-[14px] text-danger">{log.message}</span>}
            </div>
            <button type="button" onClick={() => setPanelOpen((o) => !o)} className="self-start text-[15px] text-accent inline-flex items-center gap-1.5 hover:underline" aria-expanded={panelOpen}>
              {panelOpen ? "Hide the Qloo request" : "Show the Qloo request"}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </section>
        </div>
      </div>

      {panelOpen && <RequestPanel request={shelf.result?.request} mode={shelf.result?.mode} onClose={() => setPanelOpen(false)} />}

      {/* Phone: sticky actions */}
      <div className="no-print lg:hidden fixed inset-x-0 bottom-0 bg-canvas border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex gap-3 items-center">
        <button type="button" onClick={reserve} aria-disabled={!canReserve || undefined} className={`flex-1 h-12 rounded-md font-display font-bold text-[15px] ${holds.state === "done" ? "bg-success text-accent-ink" : canReserve ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-muted"}`}>
          {reserveLabel}
        </button>
        <button type="button" onClick={logIt} aria-disabled={!(verdict?.kind === "no_record") || undefined} className="h-12 px-3 text-[15px] text-accent underline underline-offset-2">
          {log.state === "done" ? "Logged" : "Log"}
        </button>
      </div>
    </div>
  );
}

function DrawerView({ drawer, collectionSize }: { drawer: Drawer; collectionSize: number }) {
  const r = drawer.result;
  const open = drawer.status !== "closed";
  const headline = r ? (r.result === "found" ? "found" : r.result === "no_record" ? "no record" : "did not answer") : drawer.status === "opening" ? "checking…" : "not checked yet";
  const detail = r
    ? `${(r.ms / 1000).toFixed(2)} s${r.detail ? ` · ${r.detail}` : ""}`
    : drawer.source === "catalog"
      ? `${collectionSize.toLocaleString("en-US")} held titles`
      : "";
  return (
    <section aria-labelledby={`drawer-${drawer.source}`} aria-busy={drawer.status === "opening" || undefined} className="border border-line sm:min-h-[152px] flex flex-row sm:flex-col items-stretch">
      <h3 id={`drawer-${drawer.source}`} className="m-0 px-3 py-[7px] font-display font-bold text-[13px] uppercase tracking-[0.08em] border-r sm:border-r-0 sm:border-b border-line w-[112px] sm:w-auto shrink-0 flex items-center sm:block">
        {SOURCE_LABEL[drawer.source]}
      </h3>
      <div data-open={open} className="drawer-card m-2 sm:m-2.5 flex-1 min-w-0 bg-card-stock border border-line rounded-md shadow-[var(--shadow-raised)] px-3 py-2 sm:p-3 font-display">
        <div className={`text-[15px] ${r?.result === "failed" ? "text-ink-muted" : "text-ink"}`}>{headline}</div>
        <div className="text-[13px] text-ink-muted mt-0.5 sm:mt-1 tnum">{detail}</div>
        {r?.titleOnlyBy && <div className="text-[13px] text-ink-muted mt-1">a book with this title exists by {r.titleOnlyBy}</div>}
        {r?.link && (
          <a href={r.link} target="_blank" rel="noreferrer" className="text-[13px] text-ink-muted underline underline-offset-2 mt-1 inline-block">
            search {SOURCE_LABEL[drawer.source]} ↗
          </a>
        )}
      </div>
    </section>
  );
}
