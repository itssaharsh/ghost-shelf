// The live Qloo client. Server only: the key travels in the X-Api-Key header and never appears in a URL, a log or a response.
import type { RedactedRequest, Seed } from "../schemas";
import { HOLDINGS_CHUNK, KIND_TO_TYPE, QLOO_BASE, QlooError, type QlooBook, type QlooClient, type RecommendOptions, type RecommendResult, type ResolveResult } from "./types";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type LiveQlooOptions = { apiKey: string; fetchImpl?: FetchLike; timeoutMs?: number; base?: string };

type SearchResponse = { results?: Array<{ entity_id?: string; id?: string; name?: string; types?: string[] }> };
type InsightsResponse = {
  results?: { entities?: Array<Record<string, unknown>> };
  query?: { explainability?: unknown };
};

export function searchUrl(base: string, seed: Seed): string {
  const p = new URLSearchParams({ query: seed.name, take: "3" });
  const t = KIND_TO_TYPE[seed.kind];
  if (t) p.set("types", t);
  return `${base}/search?${p}`;
}

export function insightsUrl(base: string, seedIds: string[], chunk: string[] | undefined, exclude: string[] | undefined, take: number): string {
  const p = new URLSearchParams({
    "filter.type": "urn:entity:book",
    "signal.interests.entities": seedIds.join(","),
    "feature.explainability": "true",
    take: String(Math.min(50, Math.max(1, take))),
  });
  if (chunk?.length) p.set("filter.results.entities", chunk.join(","));
  if (exclude?.length) p.set("filter.exclude.entities", exclude.join(","));
  return `${base}/v2/insights?${p}`;
}

/** Runs fn over items with at most `limit` in flight; results keep the items' order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export function chunkIds(ids: string[], size = HOLDINGS_CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Parses one entity from /v2/insights defensively: the response schema leaves the entity object undocumented. */
export function parseBook(e: Record<string, unknown>): QlooBook | null {
  const entityId = (e.entity_id ?? e.id) as string | undefined;
  const name = e.name as string | undefined;
  if (!entityId || !name) return null;
  const props = (e.properties ?? {}) as Record<string, unknown>;
  const query = (e.query ?? {}) as Record<string, unknown>;
  const explainRaw = query.explainability as Record<string, unknown> | undefined;
  let explain: Record<string, number> | undefined;
  if (explainRaw && typeof explainRaw === "object") {
    const sig = (explainRaw["signal.interests.entities"] ?? explainRaw) as Record<string, unknown>;
    if (Array.isArray(sig)) {
      explain = {};
      for (const s of sig as Array<Record<string, unknown>>) {
        const id = (s.entity_id ?? s.id) as string | undefined;
        const score = num(s.score ?? s.value ?? s.contribution);
        if (id && score !== undefined) explain[id] = score;
      }
    } else if (sig && typeof sig === "object") {
      explain = {};
      for (const [k, v] of Object.entries(sig)) {
        const score = num(v);
        if (score !== undefined) explain[k] = score;
      }
    }
    if (explain && Object.keys(explain).length === 0) explain = undefined;
  }
  const year = num(props.publication_year) ?? num(props.release_year) ?? (typeof props.publication_date === "string" ? Number(String(props.publication_date).slice(0, 4)) : undefined);
  const isbn13 = (props.isbn13 ?? props.isbn ?? (props.external as Record<string, unknown> | undefined)?.isbn13) as string | undefined;
  const authorField = props.author ?? props.authors;
  const author = Array.isArray(authorField) ? String(authorField[0]) : typeof authorField === "string" ? authorField : undefined;
  return { entityId, name, author, isbn13: isbn13 ?? null, year: year ?? null, affinity: num(query.affinity), explain };
}

export class LiveQloo implements QlooClient {
  readonly mode = "qloo" as const;
  private fetchImpl: FetchLike;
  private timeoutMs: number;
  private base: string;
  constructor(private opts: LiveQlooOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((u, i) => fetch(u, i));
    this.timeoutMs = opts.timeoutMs ?? 6000;
    this.base = opts.base ?? QLOO_BASE;
  }

  private async get<T>(url: string, calls: RedactedRequest["calls"], name: string): Promise<T> {
    const t0 = performance.now();
    const u = new URL(url);
    const params = Object.fromEntries(u.searchParams.entries());
    const res = await this.fetchImpl(url, { headers: { "X-Api-Key": this.opts.apiKey, accept: "application/json" }, signal: AbortSignal.timeout(this.timeoutMs) });
    const ms = Math.round(performance.now() - t0);
    calls.push({ name, url: `${u.origin}${u.pathname}`, params, ms, status: res.status });
    if (!res.ok) throw new QlooError(`Qloo answered ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  async resolveSeeds(seeds: Seed[]): Promise<ResolveResult> {
    const calls: RedactedRequest["calls"] = [];
    const resolved: Seed[] = [];
    const unresolved: string[] = [];
    const answers = await mapLimit(seeds, 3, (s) => this.get<SearchResponse>(searchUrl(this.base, s), calls, "search"));
    seeds.forEach((s, i) => {
      const hit = (answers[i].results ?? []).find((r) => r.entity_id || r.id);
      const id = hit?.entity_id ?? hit?.id;
      if (id) resolved.push({ ...s, entityId: id, canonical: hit?.name && hit.name !== s.name ? hit.name : undefined });
      else unresolved.push(s.name);
    });
    return { resolved, unresolved, calls };
  }

  async recommendBooks(seedEntityIds: string[], opts: RecommendOptions): Promise<RecommendResult> {
    const calls: RedactedRequest["calls"] = [];
    const chunks = opts.heldEntityIds?.length ? chunkIds(opts.heldEntityIds) : [undefined];
    const seen = new Map<string, QlooBook>();
    let excerpt: unknown;
    // the holdings gate is ~20 chunks of 150 ids; four in flight keeps a 3,000-title collection under the 3 s target
    const answers = await mapLimit(chunks, 4, (chunk) => this.get<InsightsResponse>(insightsUrl(this.base, seedEntityIds, chunk, opts.excludeEntityIds, 50), calls, "insights"));
    for (const json of answers) {
      const entities = json.results?.entities ?? [];
      if (!excerpt) excerpt = entities.slice(0, 3);
      for (const e of entities) {
        const b = parseBook(e);
        if (b && !seen.has(b.entityId)) seen.set(b.entityId, b);
      }
    }
    const books = [...seen.values()].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
    const explainAvailable = books.some((b) => b.explain && Object.keys(b.explain).length > 0);
    return { books, calls, holdingsChunks: opts.heldEntityIds?.length ? chunks.length : 0, explainAvailable, responseExcerpt: excerpt };
  }
}
