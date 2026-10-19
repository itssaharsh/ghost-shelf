// Recovery: the patron's seeds -> three held books with the reason each was chosen.
import { collection, findHeld, type CollectionItem } from "./collection";
import { coverUrl } from "./covers";
import { normalizeTitle } from "./normalize";
import { QlooError, type QlooBook, type QlooClient } from "./qloo/types";
import { SampleQloo } from "./qloo/sample";
import type { RecoverResult, RecoveredBook, RedactedRequest, Seed } from "./schemas";

export const RECOVER_COUNT = 3;

export { coverUrl } from "./covers";

export function reasonLine(seeds: Seed[], book: QlooBook, explainAvailable: boolean): { reason: string; explain?: { seed: string; share: number }[] } {
  if (explainAvailable && book.explain) {
    const parts = seeds
      .map((s) => ({ seed: s.name, share: s.entityId ? book.explain![s.entityId] ?? 0 : 0 }))
      .filter((p) => p.share > 0)
      .sort((a, b) => b.share - a.share);
    const total = parts.reduce((a, p) => a + p.share, 0);
    if (parts.length && total > 0) {
      const norm = parts.map((p) => ({ seed: p.seed, share: Math.round((p.share / total) * 100) / 100 }));
      return { reason: `because you named ${norm.map((p) => `${p.seed} ${Math.round(p.share * 100)}%`).join(", ")}`, explain: norm };
    }
  }
  return { reason: `because you named ${seeds.map((s) => s.name).join(" and ")}` };
}

/** Keep only books the demo library holds: by Qloo entity map when present, else by title and author. */
export function gateToHoldings(books: QlooBook[], items: CollectionItem[], map?: Map<string, string>): { book: QlooBook; item: CollectionItem }[] {
  const out: { book: QlooBook; item: CollectionItem }[] = [];
  const seen = new Set<string>();
  const byIsbn = new Map(items.map((i) => [i.isbn13, i]));
  for (const b of books) {
    let item: CollectionItem | undefined;
    const mapped = map?.get(b.entityId);
    if (mapped) item = byIsbn.get(mapped);
    if (!item && b.isbn13) item = byIsbn.get(b.isbn13);
    if (!item && b.entityId.startsWith("sample:book:")) item = byIsbn.get(b.entityId.slice("sample:book:".length));
    if (!item) {
      const hit = findHeld({ title: b.name, author: b.author });
      if (hit) item = hit.item;
      else if (!b.author) {
        const t = normalizeTitle(b.name);
        item = items.find((i) => normalizeTitle(i.title) === t);
      }
    }
    if (item && !seen.has(item.isbn13)) {
      seen.add(item.isbn13);
      out.push({ book: b, item });
    }
  }
  return out;
}

export type RecoverInput = {
  runId: string;
  seeds: Seed[];
  excludeIsbns?: string[];
  /** how many held titles to return (3 on the desk, 5 to 10 for a reading list) */
  count?: number;
  /** words the patron wants kept out: matched against title and subjects */
  avoid?: string[];
};

export async function recover(input: RecoverInput, client: QlooClient, deps: { items?: CollectionItem[]; entityMap?: Map<string, string>; fallback?: QlooClient } = {}): Promise<RecoverResult> {
  const items = deps.items ?? collection.all();
  const seeds = input.seeds.filter((s) => s.name && s.name.trim()).slice(0, 5);
  const calls: RedactedRequest["calls"] = [];
  let mode = client.mode;
  let modeNote = mode === "qloo" ? "Books ranked by Qloo's taste graph." : "Sample mode: Qloo key pending. These three are a deterministic stand-in, not ranked by taste.";
  let active: QlooClient = client;

  if (seeds.length === 0) {
    return { runId: input.runId, mode, modeNote, seeds: [], unresolved: [], books: [], request: { provider: mode, calls, note: "no seeds; nothing sent" } };
  }

  let resolved: Seed[] = [];
  let unresolved: string[] = [];
  let books: QlooBook[] = [];
  let holdingsChunks = 0;
  let explainAvailable = false;
  let excerpt: unknown;

  const run = async (c: QlooClient) => {
    const r = await c.resolveSeeds(seeds);
    calls.push(...r.calls);
    resolved = r.resolved;
    unresolved = r.unresolved;
    if (resolved.length === 0) return;
    const heldEntityIds = deps.entityMap ? [...deps.entityMap.keys()] : undefined;
    const rec = await c.recommendBooks(resolved.map((s) => s.entityId!), { heldEntityIds, excludeEntityIds: [], take: 50 });
    calls.push(...rec.calls);
    books = rec.books;
    holdingsChunks = rec.holdingsChunks;
    explainAvailable = rec.explainAvailable;
    excerpt = rec.responseExcerpt;
  };

  try {
    await run(active);
  } catch (err) {
    const status = err instanceof QlooError ? err.status : undefined;
    const fallback = deps.fallback ?? new SampleQloo(items);
    calls.push({ name: "qloo-error", url: "qloo", params: {}, status, ms: 0 });
    mode = "sample";
    modeNote = status === 401 || status === 403 ? "Sample mode: Qloo key pending (the API answered " + status + ")." : `Sample mode: Qloo did not answer${status ? ` (${status})` : ""}. These three are a deterministic stand-in, not ranked by taste.`;
    active = fallback;
    resolved = [];
    unresolved = [];
    books = [];
    await run(fallback);
  }

  if (resolved.length === 0) {
    return { runId: input.runId, mode, modeNote, seeds: [], unresolved, books: [], request: { provider: mode, calls, note: "no seed resolved; nothing to recover from" } };
  }

  const exclude = new Set(input.excludeIsbns ?? []);
  const avoid = (input.avoid ?? []).map((w) => w.trim().toLowerCase()).filter((w) => w.length > 1);
  const avoided = (item: CollectionItem) => avoid.some((w) => item.title.toLowerCase().includes(w) || item.subjects.some((s) => s.toLowerCase().includes(w)));
  const count = Math.max(1, Math.min(10, input.count ?? RECOVER_COUNT));
  const gated = gateToHoldings(books, items, deps.entityMap).filter((g) => !exclude.has(g.item.isbn13) && !avoided(g.item)).slice(0, count);
  const out: RecoveredBook[] = gated.map(({ book, item }) => {
    const r = reasonLine(resolved, book, explainAvailable);
    return {
      isbn13: item.isbn13,
      title: item.title,
      author: item.author,
      publisher: item.publisher,
      year: item.year,
      checkouts2025: item.checkouts2025,
      affinity: book.affinity,
      explain: r.explain,
      reason: mode === "sample" ? "sample mode: not ranked by taste" : r.reason,
      coverUrl: coverUrl(item.isbn13),
    };
  });
  const noneHeld = resolved.length > 0 && out.length === 0;
  return {
    runId: input.runId,
    mode,
    modeNote: noneHeld ? `${modeNote} None of the top results is held here.` : modeNote,
    seeds: resolved,
    unresolved,
    books: out,
    request: { provider: mode, calls, holdingsChunks, responseExcerpt: excerpt, note: deps.entityMap ? undefined : "holdings gate applied by title and author (the Qloo entity map is built when the key arrives)" },
  };
}
