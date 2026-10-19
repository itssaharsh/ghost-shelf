// The three-source check: run every source with a timeout, emit each result as it arrives, then the verdict.
import { collection, findHeld, sameTitleOtherAuthor } from "./collection";
import { googleBooksLink, queryGoogleBooks } from "./sources/googlebooks";
import { openLibraryLink, queryOpenLibrary } from "./sources/openlibrary";
import type { CheckEvent, CheckQuery, FoundRecord, SourceName, SourceResult, Verdict } from "./schemas";

export type SourceFn = (q: CheckQuery, signal: AbortSignal) => Promise<{ found: FoundRecord | null; detail: string; titleOnlyBy?: string }>;

export type CheckDeps = {
  sources: Record<SourceName, SourceFn>;
  timeoutMs?: number;
  now?: () => number;
};

export const catalogSource: SourceFn = async (q) => {
  const hit = findHeld({ title: q.title, author: q.author });
  if (hit) {
    const it = hit.item;
    return {
      found: { title: it.title, author: it.author, year: it.year, isbn13: it.isbn13, held: true, checkouts2025: it.checkouts2025, publisher: it.publisher },
      detail: `held, borrowed ${it.checkouts2025.toLocaleString("en-US")} times in 2025`,
    };
  }
  const others = q.author ? sameTitleOtherAuthor({ title: q.title, author: q.author }) : [];
  return {
    found: null,
    detail: `no record among ${collection.meta.size.toLocaleString("en-US")} held titles`,
    titleOnlyBy: others[0]?.author,
  };
};

export const defaultDeps: CheckDeps = {
  sources: { catalog: catalogSource, openlibrary: queryOpenLibrary, googlebooks: queryGoogleBooks },
  timeoutMs: 6000,
};

const ORDER: SourceName[] = ["catalog", "openlibrary", "googlebooks"];

function linkFor(source: SourceName, q: CheckQuery): string | undefined {
  if (source === "openlibrary") return openLibraryLink(q);
  if (source === "googlebooks") return googleBooksLink(q);
  return undefined;
}

async function runSource(source: SourceName, q: CheckQuery, deps: CheckDeps): Promise<SourceResult> {
  const now = deps.now ?? (() => performance.now());
  const t0 = now();
  const ctrl = new AbortController();
  const timeoutMs = deps.timeoutMs ?? 6000;
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
  try {
    const r = await deps.sources[source](q, ctrl.signal);
    const ms = Math.round(now() - t0);
    return r.found
      ? { source, result: "found", ms, detail: r.detail, link: linkFor(source, q), found: r.found }
      : { source, result: "no_record", ms, detail: r.detail, link: linkFor(source, q), titleOnlyBy: r.titleOnlyBy };
  } catch (err) {
    const ms = Math.round(now() - t0);
    const reason = ctrl.signal.aborted ? "timeout" : err instanceof Error ? err.message : "error";
    return { source, result: "failed", ms, detail: `did not answer (${reason})`, link: linkFor(source, q) };
  } finally {
    clearTimeout(timer);
  }
}

export function computeVerdict(results: SourceResult[]): Verdict {
  const failed = results.filter((r) => r.result === "failed").map((r) => r.source);
  const checked = results.length - failed.length;
  const cat = results.find((r) => r.source === "catalog");
  if (cat?.result === "found" && cat.found?.isbn13) {
    const item = collection.byIsbn(cat.found.isbn13);
    return { kind: "held", checked, failed, heldItem: item };
  }
  const elsewhere = results.find((r) => r.source !== "catalog" && r.result === "found");
  if (elsewhere?.found) return { kind: "not_held", checked, failed, foundElsewhere: { source: elsewhere.source, record: elsewhere.found } };
  if (checked === 0) return { kind: "unchecked", checked, failed };
  const titleOnlyBy = results.find((r) => r.titleOnlyBy)?.titleOnlyBy;
  return { kind: "no_record", checked, failed, titleOnlyBy };
}

/** Runs all sources concurrently, emits each as it arrives (catalog first since it is instant), then the verdict. */
export async function runCheck(q: CheckQuery, onEvent: (e: CheckEvent) => void, deps: CheckDeps = defaultDeps, runId = crypto.randomUUID()): Promise<Verdict> {
  const query: CheckQuery = { title: q.title.trim(), author: (q.author ?? "").trim() || undefined };
  onEvent({ type: "start", runId, title: query.title, author: query.author ?? "" });
  const results: SourceResult[] = [];
  await Promise.all(
    ORDER.map(async (source) => {
      const r = await runSource(source, query, deps);
      results.push(r);
      onEvent({ type: "source", ...r });
    }),
  );
  const verdict = computeVerdict(results);
  onEvent({ type: "verdict", runId, verdict });
  return verdict;
}
