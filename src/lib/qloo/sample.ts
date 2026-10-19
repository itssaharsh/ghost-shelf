// Sample mode: a deterministic, labelled stand-in used when the Qloo key is absent or Qloo does not answer.
// It is NOT taste-based: it picks well-borrowed held fiction by a stable hash of the seed names, so a demo is repeatable.
import type { CollectionItem } from "../collection";
import type { Seed } from "../schemas";
import type { QlooBook, QlooClient, RecommendOptions, RecommendResult, ResolveResult } from "./types";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class SampleQloo implements QlooClient {
  readonly mode = "sample" as const;
  constructor(private items: CollectionItem[]) {}

  async resolveSeeds(seeds: Seed[]): Promise<ResolveResult> {
    const resolved = seeds.filter((s) => s.name.trim().length > 1).map((s) => ({ ...s, entityId: `sample:${s.kind}:${s.name.toLowerCase().trim()}` }));
    const unresolved = seeds.filter((s) => s.name.trim().length <= 1).map((s) => s.name);
    return { resolved, unresolved, calls: [{ name: "sample-resolve", url: "sample://resolve", params: { seeds: seeds.map((s) => s.name).join(", ") } }] };
  }

  async recommendBooks(seedEntityIds: string[], opts: RecommendOptions): Promise<RecommendResult> {
    const pool = this.items.filter((it) => it.subjects.some((s) => /fiction|novel|stories/i.test(s))).slice(0, 600);
    const exclude = new Set(opts.excludeEntityIds ?? []);
    const base = hash(seedEntityIds.slice().sort().join("|"));
    const books: QlooBook[] = [];
    const used = new Set<string>();
    for (let i = 0; books.length < opts.take && i < pool.length * 2; i++) {
      const idx = (base + i * 7919) % pool.length;
      const it = pool[idx];
      const id = `sample:book:${it.isbn13}`;
      if (used.has(it.isbn13) || exclude.has(id)) continue;
      used.add(it.isbn13);
      books.push({ entityId: id, name: it.title, author: it.author, isbn13: it.isbn13, year: it.year });
    }
    return { books, calls: [{ name: "sample-pick", url: "sample://recommend", params: { seeds: String(seedEntityIds.length), take: String(opts.take) } }], holdingsChunks: 0, explainAvailable: false };
  }
}
