"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { openCheckStream } from "@/lib/client/sse";
import type { CollectionItem } from "@/lib/collection";
import type { Preset } from "@/lib/presets";
import { SOURCE_LABEL, type CheckEvent, type RecoverResult, type RecoveredBook, type Seed, type SourceName, type Verdict } from "@/lib/schemas";
import { announceRegistryCount } from "../RegistryCount";
import { PatronCard } from "./PatronCard";
import { Shelf } from "./Shelf";
import { SeedsRow } from "./SeedsRow";
import { RequestPanel } from "./RequestPanel";
import { RunLog, type RunLogLine } from "./RunLog";
import { buildFixture, freshDrawers, type Drawer, type Drawers, type HoldsState, type LogState, type Phase, type ShelfState, type Snapshot } from "./fixtures";

type Props = {
  presets: Preset[];
  sources: SourceName[];
  collectionSize: number;
  qlooConfigured: boolean;
  storage: "memory" | "postgres";
  demo: boolean;
  fixtureBooks: RecoveredBook[];
  heldExample?: { item: CollectionItem; coverUrl: string | null };
};

const label = (s: SourceName) => (s === "catalog" ? "our catalog" : SOURCE_LABEL[s]);

function headlineFor(v: Verdict): string {
  if (v.kind === "held") return "Exists, and we hold it.";
  if (v.kind === "not_held") return "Exists; we don't hold it.";
  if (v.kind === "unchecked") return "Couldn't check any source.";
  return `No record in ${v.checked} ${v.checked === 1 ? "source" : "sources"}.`;
}

export function Desk({ presets, sources, collectionSize, qlooConfigured, storage, demo, fixtureBooks, heldExample }: Props) {
  const [title, setTitle] = useState(presets[0]?.title ?? "");
  const [author, setAuthor] = useState(presets[0]?.author ?? "");
  const [activePreset, setActivePreset] = useState<string | null>(presets[0]?.id ?? null);
  const [seeds, setSeeds] = useState<Seed[]>(presets[0]?.seeds ?? []);
  const [drawers, setDrawers] = useState<Drawers>(() => freshDrawers(sources, "closed"));
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [prior, setPrior] = useState<{ count: number; firstSeen: string; example: boolean } | null>(null); // what the registry already knows about this title
  const [emptyTitle, setEmptyTitle] = useState(false);
  const [shelf, setShelf] = useState<ShelfState>({ status: "idle" });
  const [holds, setHolds] = useState<HoldsState>({ state: "idle" });
  const [log, setLog] = useState<LogState>({ state: "idle" });
  const [panelOpen, setPanelOpen] = useState(false);
  const [judgeCard, setJudgeCard] = useState(false);
  const [record, setRecord] = useState(false);
  const [fixture, setFixture] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [runLog, setRunLog] = useState<RunLogLine[]>([]);
  const [runKey, setRunKey] = useState(0);
  const stopRef = useRef<() => void>(() => {});
  const timerRef = useRef<number | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const checkedRun = useRef<{ title: string; author: string } | null>(null);
  const [checked, setChecked] = useState<{ title: string; author: string } | null>(null); // the same value, for rendering
  const runSeq = useRef(0); // a late /api/recover answer from an earlier run must not land on the current shelf
  const recoverSeq = useRef(0); // and within a run, only the newest recovery (seed edits) may fill the shelf

  // Every announcement is also a line in the run log (the agent's steps, timed from the first).
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const announce = useCallback((s: string) => {
    setStatus(s);
    setRunLog((l) => [...l, { at: Date.now(), text: s }]);
  }, []);

  const onCopied = useCallback(() => announce("Copied as curl"), [announce]);

  const applySnapshot = useCallback((s: Snapshot) => {
    setTitle(s.title);
    setAuthor(s.author);
    setSeeds(s.seeds);
    setActivePreset(s.activePreset);
    setDrawers(s.drawers);
    setPhase(s.phase);
    setVerdict(s.verdict);
    setRunId(s.runId);
    setShelf(s.shelf);
    setHolds(s.holds);
    setLog(s.log);
    setPanelOpen(s.panelOpen);
    setEmptyTitle(s.emptyTitle);
    setCheckError(s.checkError);
    setPrior(s.title === "The Last Algorithm" && s.verdict?.kind === "no_record" ? { count: 4, firstSeen: "2026-10-19T00:00:00.000Z", example: true } : null);
    checkedRun.current = s.title ? { title: s.title, author: s.author } : null;
    setChecked(checkedRun.current);
    runSeq.current += 1;
    setRunKey((k) => k + 1);
  }, []);

  const recover = useCallback(
    async (id: string, seedList: Seed[], excludeIsbns: string[] = [], seq: number = runSeq.current) => {
      const mine = ++recoverSeq.current;
      setHolds({ state: "idle" }); // whatever lands next is a new shelf; the earlier reservation does not carry over
      if (seedList.length === 0) {
        setShelf({ status: "ready", result: { runId: id, mode: qlooConfigured ? "qloo" : "sample", modeNote: "", seeds: [], unresolved: [], books: [], request: { provider: qlooConfigured ? "qloo" : "sample", calls: [], note: "No seeds named for this run, so nothing was sent to Qloo." } } });
        return;
      }
      setShelf({ status: "loading" });
      try {
        const res = await fetch("/api/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: id, seeds: seedList, excludeIsbns }) });
        if (!res.ok) throw new Error("Couldn't reach the taste graph.");
        const json = (await res.json()) as RecoverResult;
        if (seq !== runSeq.current || mine !== recoverSeq.current) return; // a newer run or a newer seed edit owns the shelf now
        setShelf({ status: "ready", result: json });
        announce(json.mode === "qloo" ? `Qloo: ${json.seeds.length} seed${json.seeds.length === 1 ? "" : "s"} resolved, ${json.books.length} held books on the shelf` : `Sample mode: ${json.books.length} held books on the shelf (not ranked by taste)`);
      } catch (err) {
        if (seq !== runSeq.current || mine !== recoverSeq.current) return;
        setShelf({ status: "error", error: err instanceof Error ? err.message : "Couldn't reach the taste graph." });
      }
    },
    [qlooConfigured, announce],
  );

  const startCheck = useCallback(
    (t: string, a: string, seedList: Seed[]) => {
      const tt = t.trim();
      if (!tt) {
        setEmptyTitle(true);
        titleRef.current?.focus();
        return;
      }
      setEmptyTitle(false);
      stopRef.current();
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const hadRun = checkedRun.current !== null;
      setFixture(null);
      // T-07: the drawers close together, the card and shelf fade through, then T-01 runs.
      setDrawers(freshDrawers(sources, "closed"));
      setPhase("checking");
      setVerdict(null);
      setPrior(null);
      setCheckError(null);
      setShelf({ status: "idle" });
      setHolds({ state: "idle" });
      setLog({ state: "idle" });
      setPanelOpen(false);
      setRunKey((k) => k + 1);
      setRunLog([]);
      const seq = ++runSeq.current;
      checkedRun.current = { title: tt, author: a.trim() };
      setChecked(checkedRun.current);
      announce(`Checking ${sources.map(label).join(", ")} for "${tt}"${a.trim() ? ` by ${a.trim()}` : ""}`);
      const go = () => {
        setDrawers(freshDrawers(sources, "opening"));
        let lastEvent = Date.now();
        // the stream died (offline, a 429, a server error): every drawer still open says so, and the card names the failure
        const fail = (message: string) => {
          stopRef.current();
          setDrawers((d) => {
            const next = { ...d };
            for (const s of sources) if (next[s]?.status !== "done") next[s] = { source: s, status: "done", result: { source: s, result: "failed", ms: 0, detail: "did not answer (no connection)" } };
            return next;
          });
          setCheckError(message);
          setPhase("checked");
          announce(message);
        };
        stopRef.current = openCheckStream(
          { title: tt, author: a.trim() },
          (e: CheckEvent) => {
            lastEvent = Date.now();
            if (e.type === "start") setRunId(e.runId);
            if (e.type === "registry") {
              setPrior({ count: e.count, firstSeen: e.firstSeen, example: e.example });
              announce(e.example ? `One of the ten newspaper titles; asked for ${e.count} times here` : `Asked for ${e.count} times at this desk before`);
            }
            if (e.type === "source") {
              setDrawers((d) => ({ ...d, [e.source]: { source: e.source, status: "done", result: e } }));
              announce(`${SOURCE_LABEL[e.source]}: ${e.result === "found" ? "found" : e.result === "no_record" ? "no record" : "did not answer"}, ${(e.ms / 1000).toFixed(2)} seconds`);
            }
            if (e.type === "verdict") {
              stopRef.current();
              setVerdict(e.verdict);
              setPhase("checked");
              setDrawers((d) => {
                const next = { ...d };
                for (const s of sources) if (next[s]?.status !== "done") next[s] = { source: s, status: "done", result: { source: s, result: "failed", ms: 0, detail: "did not answer" } };
                return next;
              });
              announce(headlineFor(e.verdict));
              if (e.verdict.kind === "no_record" || e.verdict.kind === "unchecked") void recover(e.runId, seedList, [], seq);
            }
          },
          fail,
        );
        // a stream that goes silent for 12 s (offline, a dropped connection) is over: the server gives each source 6 s
        const watchdog = window.setInterval(() => {
          if (Date.now() - lastEvent > 12000) fail("The checks did not answer. Check the connection and try again.");
        }, 1000);
        const stopStream = stopRef.current;
        stopRef.current = () => {
          window.clearInterval(watchdog);
          stopStream();
        };
      };
      timerRef.current = window.setTimeout(go, hadRun ? 150 : 0);
    },
    [recover, sources, announce],
  );

  // Mount: ?state= renders a fixture; ?judge=1 shows the judge card; ?record=1 is the recording view. Otherwise the finished run of preset 1.
  // The URL only exists in the browser, so this state is set from an effect on purpose (a lazy initialiser would mismatch the server HTML).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rec = params.get("record") === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecord(rec);
    const wanted = !rec && (params.get("judge") === "1" || (demo && params.get("judge") !== "0"));
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("ghost-shelf:judge-card") === "hidden";
    } catch {}
    setJudgeCard(wanted && !dismissed);
    const state = params.get("state");
    if (state) {
      const snap = buildFixture(state, { sources, presets, books: fixtureBooks, collectionSize, held: heldExample });
      if (snap) {
        setFixture(state);
        applySnapshot(snap);
        return;
      }
    }
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

  // Reset: back to the first screen (preset 1, nothing reserved or logged). Replay: run the current title again.
  const reset = () => {
    try {
      localStorage.removeItem("ghost-shelf:judge-card");
    } catch {}
    if (window.location.search.includes("state=")) {
      const u = new URL(window.location.href);
      u.searchParams.delete("state");
      window.history.replaceState(null, "", u.toString());
    }
    if (presets[0]) pickPreset(presets[0]);
    announce("Reset to the first screen");
  };
  const replay = () => startCheck(title, author, seeds);
  const shortcuts = useRef({ reset, replay });
  useEffect(() => {
    shortcuts.current = { reset, replay };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "r" || e.code === "KeyR") {
        e.preventDefault();
        shortcuts.current.reset();
      } else if (k === "p" || e.code === "KeyP") {
        e.preventDefault();
        shortcuts.current.replay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSeedsChange = (next: Seed[]) => {
    setSeeds(next);
    if (fixture) return;
    if (runId && verdict && (verdict.kind === "no_record" || verdict.kind === "unchecked")) void recover(runId, next);
  };

  const books = shelf.result?.books ?? [];
  const heldItem = verdict?.kind === "held" ? verdict.heldItem : undefined;
  const reservable = heldItem ? [heldItem.isbn13] : books.map((b) => b.isbn13);

  const reserve = async () => {
    if (holds.state === "busy") return;
    if (!runId || reservable.length === 0) {
      setHolds({ state: "error", message: "Nothing to reserve yet" });
      announce("Nothing to reserve yet");
      return;
    }
    setHolds({ state: "busy" });
    const done = (written: number) => {
      const msg = `${written} ${written === 1 ? "book" : "books"} reserved`;
      setHolds({ state: "done", message: msg });
      toast(`${msg} in the demo holds list`);
      announce(`${msg} in the demo holds list`);
    };
    if (fixture) {
      window.setTimeout(() => done(reservable.length), 400);
      return;
    }
    try {
      const checked = checkedRun.current ?? { title, author }; // the run that was checked, not whatever is in the fields now
      const res = await fetch("/api/holds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, isbns: reservable, title: checked.title, author: checked.author }) });
      if (!res.ok) throw new Error("hold failed");
      const j = (await res.json()) as { written: number; replaced?: boolean };
      done(j.written);
      if (j.replaced) announce("This run's earlier hold was replaced by the new three");
    } catch {
      setHolds({ state: "error", message: "Couldn't reserve them. Nothing was reserved." });
      announce("Couldn't reserve them. Nothing was reserved.");
    }
  };

  const canLog = verdict?.kind === "no_record";
  const logIt = async () => {
    if (!canLog || log.state === "busy") return;
    if (log.state === "done") {
      setLog((l) => ({ ...l, state: "again", message: l.times && l.times > 1 ? `Logged ${l.times} times` : "Logged" }));
      return;
    }
    setLog((l) => ({ ...l, state: "busy" }));
    const done = (count: number, times: number) => {
      announceRegistryCount(count);
      setLog({ state: "done", count, times, message: times > 1 ? `Logged ${times} times` : "Logged" });
      toast("Logged to the registry");
      announce("Logged to the registry");
    };
    if (fixture) {
      window.setTimeout(() => done((log.count ?? 10) + (log.times ? 0 : 1), (log.times ?? 0) + 1), 300);
      return;
    }
    try {
      const checked = checkedRun.current ?? { title, author };
      const res = await fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, title: checked.title, author: checked.author, seeds, recovered: books.map((b) => ({ isbn13: b.isbn13, title: b.title })) }) });
      if (!res.ok) throw new Error("log failed");
      const j = (await res.json()) as { count: number; timesLogged: number };
      done(j.count, j.timesLogged);
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
    holds.state === "busy" ? "Reserving…" : holds.state === "done" ? `✓ ${holds.message}` : heldItem ? "Reserve this book" : `Reserve ${reservable.length ? `these ${reservable.length}` : "these"} ${reservable.length === 1 ? "book" : "books"}`;
  const logLabel = log.state === "busy" ? "Logging…" : log.state === "done" ? log.message : log.state === "again" ? "Press again to count it twice" : "Log this invented title";
  const logLabelShort = log.state === "busy" ? "Logging…" : log.state === "done" ? "Logged" : log.state === "again" ? "Log again" : "Log";
  const modeNote = shelf.result?.modeNote ?? "";
  const presetLabel = useMemo(() => Object.fromEntries(presets.map((p) => [p.id, `${p.title} · ${p.author}`])), [presets]);
  // Check takes the accent only when the fields hold a title that has not been checked yet (then it is the only action).
  const dirty = !checked || checked.title !== title.trim() || checked.author !== author.trim();
  const checkAccent = dirty && phase !== "checking" && title.trim().length > 0;
  const holdsPlaced = holds.state === "done";
  const buttonBase = "h-11 px-4 rounded-md font-display font-bold text-[15px] transition-colors duration-150 active:scale-[.97]";

  return (
    <div className="flex-1 flex flex-col" data-record={record || undefined} data-fixture={fixture ?? undefined}>
      <div className="sr-only" role="status" aria-live="polite">
        {status}
      </div>

      {/* Presets */}
      <div className="no-print border-b border-line px-4 sm:px-8 lg:px-20 py-2 sm:py-2.5">
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
                className={`relative shrink-0 h-8 px-3 rounded-md border text-[14px] inline-flex items-center gap-2 transition-colors duration-150 ${active ? "bg-ink text-canvas border-ink" : "bg-canvas text-ink border-line hover:bg-surface-2"}`}
              >
                <span aria-hidden="true" className={`inline-block size-2 rounded-full ${invented ? "bg-danger" : "border-[1.5px] border-current"}`} />
                <span className="sr-only">{invented ? "Invented title: " : "Real title: "}</span>
                {presetLabel[p.id]}
              </button>
            );
          })}
          <span className="text-[13px] text-ink-muted shrink-0 not-for-record">or type any title below</span>
        </div>
      </div>

      <div className="relative flex-1 px-4 sm:px-8 lg:px-20 pt-4 sm:pt-6 pb-28 lg:pb-10 max-w-[1440px] w-full mx-auto">
        {judgeCard && (
          <aside className="judge-card no-print lg:ml-auto lg:w-[360px] mb-4 bg-card-stock border border-line rounded-md p-3 text-[13px] leading-[1.45] flex gap-3 items-start" aria-label="How to judge this">
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-6">
          {/* LEFT: title, drawers, patron card, seeds */}
          <section className="lg:col-span-7 flex flex-col gap-3 sm:gap-4" aria-label="Check a title">
            <p className="hidden sm:block m-0 text-[15px] text-ink-muted max-w-[64ch] not-for-record">Patrons arrive with titles a chatbot made up. Check three sources, show them the card, then hand them three books you hold.</p>
            <form
              className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3"
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
                  readOnly={phase === "checking"}
                  className="h-11 px-3 border border-line-input rounded-md text-[17px] text-ink bg-canvas read-only:bg-surface-1"
                  autoComplete="off"
                  maxLength={200}
                />
              </label>
              <label className="sm:w-[220px] flex flex-col gap-1 text-[13px] text-ink-muted">
                Author they gave
                <input value={author} onChange={(e) => setAuthor(e.target.value)} readOnly={phase === "checking"} className="h-11 px-3 border border-line-input rounded-md text-[17px] text-ink bg-canvas read-only:bg-surface-1" autoComplete="off" maxLength={200} />
              </label>
              <button
                type="submit"
                aria-disabled={phase === "checking" || undefined}
                className={`${buttonBase} ${phase === "checking" ? "bg-surface-2 text-ink-muted" : checkAccent ? "bg-accent text-accent-ink hover:bg-[var(--accent-hover)]" : "bg-surface-2 text-ink hover:bg-line"}`}
              >
                {phase === "checking" ? "Checking…" : "Check"}
              </button>
            </form>
            {emptyTitle && (
              <p id="title-error" className="text-[14px] text-danger -mt-2">
                Type the title they asked for
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3" aria-label="The three checks">
              {sources.map((s) => (
                <DrawerView key={s} drawer={drawers[s] ?? { source: s, status: "closed" }} collectionSize={collectionSize} onRetry={replay} />
              ))}
            </div>

            <div key={verdict ? `card-${runKey}` : `wait-${runKey}`} className={verdict ? "card-rise" : undefined}>
              <PatronCard phase={phase} verdict={verdict} error={checkError} title={title} author={author} sources={sources} prior={prior} />
            </div>

            {verdict && (verdict.kind === "no_record" || verdict.kind === "unchecked") && <SeedsRow seeds={seeds} onChange={onSeedsChange} unresolved={shelf.result?.unresolved ?? []} />}
            <RunLog lines={runLog} />
          </section>

          {/* RIGHT: the shelf */}
          <section className="lg:col-span-5 flex flex-col gap-3" aria-label="Held books">
            <div key={`shelf-${runKey}`} className="fade-through">
              <Shelf phase={phase} verdict={verdict} shelf={shelf} heldItem={heldItem} heldCoverUrl={verdict?.heldCoverUrl} seeds={seeds} held={holdsPlaced} onRetry={() => !fixture && runId && recover(runId, seeds)} />
            </div>
            <p className="text-[13px] text-ink-muted leading-[1.45]">
              Demo collection: about {collectionSize.toLocaleString("en-US")} most-borrowed 2025 titles at Seattle Public Library (public domain).{" "}
              {shelf.result ? (shelf.result.mode === "qloo" ? "Books ranked by Qloo, a taste database." : modeNote) : qlooConfigured ? "Books ranked by Qloo, a taste database." : "Sample mode until the Qloo key is active."}{" "}
              Covers from Open Library.{storage === "memory" ? " Holds and the log are kept for this demo session only." : ""}
            </p>
            <div className="hidden lg:flex gap-3 items-center flex-wrap">
              <button type="button" data-primary="reserve" onClick={reserve} aria-disabled={!canReserve || undefined} className={`${buttonBase} min-w-[200px] ${holdsPlaced ? "bg-success text-accent-ink" : canReserve ? "bg-accent text-accent-ink hover:bg-[var(--accent-hover)]" : "bg-surface-2 text-ink-muted"}`}>
                {reserveLabel}
              </button>
              <button type="button" onClick={logIt} aria-disabled={!canLog || log.state === "busy" || undefined} className={`${buttonBase} ${canLog ? "bg-surface-2 text-ink hover:bg-line" : "bg-surface-2 text-ink-muted"}`}>
                {logLabel}
              </button>
              {holds.state === "error" && (
                <span className="text-[14px] text-danger inline-flex items-center gap-2">
                  {holds.message}
                  {holds.message?.startsWith("Couldn") && (
                    <button type="button" onClick={reserve} className="underline underline-offset-2">
                      Retry
                    </button>
                  )}
                </span>
              )}
              {log.state === "error" && <span className="text-[14px] text-danger">{log.message}</span>}
              {log.state === "again" && <span className="text-[14px] text-ink-muted">{log.message}</span>}
            </div>
            <button type="button" onClick={() => setPanelOpen((o) => !o)} className="self-start text-[15px] text-accent inline-flex items-center gap-1.5 hover:underline" aria-expanded={panelOpen}>
              {panelOpen ? "Hide the Qloo request" : "Show the Qloo request"}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform duration-150 ${panelOpen ? "rotate-90" : ""}`}>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </section>
        </div>
      </div>

      {panelOpen && <RequestPanel request={shelf.result?.request} mode={shelf.result?.mode} onClose={closePanel} onCopied={onCopied} />}

      {/* Phone: sticky actions */}
      <div className="no-print lg:hidden fixed inset-x-0 bottom-0 z-10 bg-canvas border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex gap-3 items-center">
        <button type="button" data-primary="reserve" onClick={reserve} aria-disabled={!canReserve || undefined} className={`flex-1 h-12 rounded-md font-display font-bold text-[15px] active:scale-[.97] ${holdsPlaced ? "bg-success text-accent-ink" : canReserve ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-muted"}`}>
          {reserveLabel}
        </button>
        <button type="button" onClick={logIt} aria-disabled={!canLog || undefined} className={`h-12 px-3 text-[15px] underline underline-offset-2 ${canLog ? "text-accent" : "text-ink-muted"}`}>
          {logLabelShort}
        </button>
      </div>
      {(holds.state === "error" || log.state === "error" || log.state === "again") && (
        <p className={`lg:hidden fixed inset-x-4 bottom-[84px] z-10 m-0 text-[14px] bg-canvas border border-line rounded-md px-3 py-2 ${log.state === "again" && holds.state !== "error" ? "text-ink-muted" : "text-danger"}`} role={log.state === "again" && holds.state !== "error" ? "status" : "alert"}>
          {holds.state === "error" ? holds.message : log.message}
        </p>
      )}
    </div>
  );
}

function DrawerView({ drawer, collectionSize, onRetry }: { drawer: Drawer; collectionSize: number; onRetry: () => void }) {
  const r = drawer.result;
  const open = drawer.status !== "closed";
  const failed = r?.result === "failed";
  const headline = r ? (r.result === "found" ? "found" : r.result === "no_record" ? "no record" : "did not answer") : drawer.status === "opening" ? "checking…" : "not checked yet";
  const detail = r
    ? `${(r.ms / 1000).toFixed(2)} s${r.detail ? ` · ${r.detail}` : ""}`
    : drawer.source === "catalog"
      ? `${collectionSize.toLocaleString("en-US")} held titles`
      : "";
  return (
    <section aria-labelledby={`drawer-${drawer.source}`} aria-busy={drawer.status === "opening" || undefined} className="border border-line sm:min-h-[152px] flex flex-row sm:flex-col items-stretch">
      <h3 id={`drawer-${drawer.source}`} className="m-0 px-3 py-1.5 sm:py-[7px] font-display font-bold text-[13px] uppercase tracking-[0.08em] border-r sm:border-r-0 sm:border-b border-line w-[104px] min-[400px]:w-[112px] sm:w-auto shrink-0 flex items-center sm:block">
        {SOURCE_LABEL[drawer.source]}
      </h3>
      <div data-open={open} className="drawer-card m-1.5 sm:m-2.5 flex-1 min-w-0 bg-card-stock border border-line rounded-md shadow-[var(--shadow-raised)] px-3 py-1.5 sm:p-3 font-display">
        <div className="flex flex-wrap items-baseline gap-x-2 sm:block">
          <div className={`text-[15px] ${failed ? "text-ink-muted" : "text-ink"}`}>{headline}</div>
          <div className="text-[13px] text-ink-muted sm:mt-1 tnum">{detail}</div>
        </div>
        {r?.titleOnlyBy && <div className="text-[13px] text-ink-muted mt-1">a book with this title exists by {r.titleOnlyBy}</div>}
        <div className="flex gap-3 flex-wrap">
          {failed && (
            <button type="button" onClick={onRetry} className="text-[13px] text-accent underline underline-offset-2 mt-1">
              Retry
            </button>
          )}
          {r?.link && (
            <a href={r.link} target="_blank" rel="noreferrer" className="hidden sm:inline-block text-[13px] text-ink-muted underline underline-offset-2 mt-1">
              search {SOURCE_LABEL[drawer.source]}&nbsp;↗
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
