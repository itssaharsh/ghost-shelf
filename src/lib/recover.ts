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
      if (norm.length === 1) return { reason: `because you named ${norm[0].seed}`, explain: norm };
      const spread = Math.round((norm[0].share - norm[norm.length - 1].share) * 100);
      // shares within ten points of each other are not a ranking: say it fits all of them
      if (spread <= 10) return { reason: `fits ${norm.map((p) => p.seed).join(" and ")} about equally`, explain: norm };
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

/** True when any avoid word appears as a whole word in the title or a subject ("us" does not hit "The husbands"). */
export function avoided(item: Pick<CollectionItem, "title" | "subjects">, words: string[]): boolean {
  const res = words
    .map((w) => w.trim())
    .filter((w) => w.length > 1)
    .map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "iu"));
  return res.some((r) => r.test(item.title) || item.subjects.some((s) => r.test(s)));
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

export type RecoverCache = { cacheGet<T>(key: string): Promise<T | null>; cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> };
const CACHE_TTL = 24 * 3600; // a day: the same seeds give the same shelf, and the hackathon key is rate-limited per minute

export async function recover(input: RecoverInput, client: QlooClient, deps: { items?: CollectionItem[]; entityMap?: Map<string, string>; fallback?: QlooClient; cache?: RecoverCache } = {}): Promise<RecoverResult> {
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
  let cacheNote: string | undefined;
  let failNote: string | undefined;

  const run = async (c: QlooClient) => {
    // Qloo answers are cached for a day (database only, never the repository): a repeated preset costs no calls
    const cache = c.mode === "qloo" ? deps.cache : undefined;
    const seedKey = `qloo:search:v1:${seeds.map((s) => `${s.kind}:${s.name.trim().toLowerCase()}`).join("|")}`;
    let r = cache ? await cache.cacheGet<Awaited<ReturnType<QlooClient["resolveSeeds"]>>>(seedKey) : null;
    let cachedSearch = false;
    if (r) cachedSearch = true;
    else {
      r = await c.resolveSeeds(seeds);
      if (cache && r.resolved.length) await cache.cacheSet(seedKey, r, CACHE_TTL);
    }
    // a cached answer replays the parameters of the calls, never their timings or statuses: those calls were not made this run
    calls.push(...r.calls.map((x) => (cachedSearch ? { name: `${x.name} (from the day cache)`, url: x.url, params: x.params } : x)));
    resolved = r.resolved;
    unresolved = r.unresolved;
    if (resolved.length === 0) return;
    // the map is ISBN -> Qloo entity id; Qloo wants the entity ids (the holdings gate), and excluded ISBNs become excluded entities
    const heldEntityIds = deps.entityMap ? [...deps.entityMap.values()] : undefined;
    const excludeEntityIds = deps.entityMap ? (input.excludeIsbns ?? []).map((i) => deps.entityMap!.get(i)).filter((x): x is string => Boolean(x)) : [];
    const recKey = `qloo:insights:v1:${resolved.map((s) => s.entityId).sort().join(",")}|x:${excludeEntityIds.sort().join(",")}|held:${heldEntityIds?.length ?? 0}`;
    let rec = cache ? await cache.cacheGet<Awaited<ReturnType<QlooClient["recommendBooks"]>>>(recKey) : null;
    let cachedRec = false;
    if (rec) cachedRec = true;
    else {
      rec = await c.recommendBooks(resolved.map((s) => s.entityId!), { heldEntityIds, excludeEntityIds, take: 50 });
      if (cache && rec.books.length) await cache.cacheSet(recKey, rec, CACHE_TTL);
    }
    calls.push(...rec.calls.map((x) => (cachedRec ? { name: `${x.name} (from the day cache)`, url: x.url, params: x.params } : x)));
    if (cachedSearch || cachedRec) cacheNote = cachedSearch && cachedRec ? "Served from the day cache: these are the calls made the first time this shelf was built; none reached Qloo for this run." : "Part of this run came from the day cache; the calls marked so were not repeated.";
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
    failNote = `Qloo answered ${status ?? "with an error"} on the call marked above; the three books below are the sample stand-in, not a taste ranking.`;
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
  const count = Math.max(1, Math.min(10, input.count ?? RECOVER_COUNT));
  const byEntity = deps.entityMap ? new Map([...deps.entityMap].map(([isbn13, entityId]) => [entityId, isbn13])) : undefined; // entity id -> ISBN for the gate
  // the desk serves adults: juvenile, picture, board and comic titles stay off the shelf unless the patron named a children's book
  const juvenile = (item: CollectionItem) => item.subjects.some((s) => /juvenile|picture book|board book|comic|graphic novel|young adult|manga/i.test(s));
  const childSeed = seeds.some((s) => s.kind === "book" && items.some((i) => juvenile(i) && normalizeTitle(i.title) === normalizeTitle(s.name)));
  const gated = gateToHoldings(books, items, byEntity)
    .filter((g) => !exclude.has(g.item.isbn13) && !avoided(g.item, input.avoid ?? []) && (childSeed || !juvenile(g.item)))
    .slice(0, count);
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
    request: { provider: mode, calls, holdingsChunks, responseExcerpt: excerpt, note: failNote ?? cacheNote ?? (deps.entityMap ? undefined : "holdings gate applied by title and author (no Qloo entity map for this collection yet)") },
  };
}
