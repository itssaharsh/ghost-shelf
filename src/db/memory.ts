// In-memory adapter: used by tests and by any deploy without DATABASE_URL (labelled in the UI; records reset on deploy).
import type { RedactedRequest } from "../lib/schemas";
import { EXAMPLE_SEEN, registryKey, type ExampleRow, type Hold, type LogInput, type RegistryRow, type Repo, type RunPatch, type StoredRun } from "./repo";

export class MemoryRepo implements Repo {
  readonly mode = "memory" as const;
  private runs = new Map<string, StoredRun>();
  private holds = new Map<string, Hold>();
  private rows = new Map<string, RegistryRow>();
  private map = new Map<string, string>();
  private cache = new Map<string, { value: unknown; expires: number | null }>();
  private seq = 0;

  constructor(examples: ExampleRow[] = [], private now: () => Date = () => new Date()) {
    void this.seedExamples(examples);
  }

  async upsertRun(patch: RunPatch): Promise<void> {
    const t = this.now().toISOString();
    const base: StoredRun = this.runs.get(patch.id) ?? { id: patch.id, title: "", author: "", createdAt: t, updatedAt: t };
    const next: StoredRun = { ...base, ...stripUndefined(patch), updatedAt: t };
    this.runs.set(patch.id, next);
  }

  async getRun(id: string): Promise<StoredRun | null> {
    return this.runs.get(id) ?? null;
  }

  async lastRequest(runId?: string) {
    const candidates = [...this.runs.values()].filter((r) => r.request && (!runId || r.id === runId)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const r = candidates[0];
    return r ? { runId: r.id, request: r.request as RedactedRequest, createdAt: r.updatedAt } : null;
  }

  async placeHold(input: { runId: string; isbn13s: string[]; title: string; author: string }) {
    const existing = this.holds.get(input.runId);
    const wanted = [...new Set(input.isbn13s)];
    if (existing) {
      const same = existing.isbn13s.length === wanted.length && existing.isbn13s.every((i) => wanted.includes(i));
      if (same) return { created: false, replaced: false, hold: existing };
      const hold: Hold = { ...existing, isbn13s: wanted, title: input.title, author: input.author };
      this.holds.set(input.runId, hold);
      return { created: false, replaced: true, hold }; // the patron changed their mind within the run: one hold per run, the newest set
    }
    const hold: Hold = { runId: input.runId, isbn13s: wanted, title: input.title, author: input.author, createdAt: this.now().toISOString() };
    this.holds.set(input.runId, hold);
    return { created: true, replaced: false, hold };
  }

  async logInvented(input: LogInput) {
    const key = registryKey(input.title, input.author);
    const t = this.now().toISOString();
    const prev = this.rows.get(key);
    let row: RegistryRow;
    if (prev) {
      row = { ...prev, count: prev.count + 1, lastSeen: t, seeds: input.seeds.length ? input.seeds : prev.seeds, recovered: input.recovered.length ? input.recovered : prev.recovered, lastRunId: input.runId ?? prev.lastRunId };
    } else {
      row = { id: `mem-${++this.seq}`, key, title: input.title.trim(), author: input.author.trim(), count: 1, example: false, seeds: input.seeds, recovered: input.recovered, lastRunId: input.runId ?? null, firstSeen: t, lastSeen: t };
    }
    this.rows.set(key, row);
    return { row, created: !prev, total: this.rows.size };
  }

  async findRegistry(title: string, author: string): Promise<RegistryRow | null> {
    return this.rows.get(registryKey(title, author)) ?? null;
  }

  async registry(): Promise<RegistryRow[]> {
    return [...this.rows.values()].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : a.title.localeCompare(b.title)));
  }

  async registryCount(): Promise<number> {
    return this.rows.size;
  }

  async seedExamples(rows: ExampleRow[]): Promise<number> {
    let n = 0;
    for (const r of rows) {
      const key = registryKey(r.title, r.author);
      if (this.rows.has(key)) continue;
      this.rows.set(key, { id: `mem-${++this.seq}`, key, title: r.title, author: r.author, count: 1, example: true, seeds: r.seeds, recovered: [], lastRunId: null, firstSeen: EXAMPLE_SEEN, lastSeen: EXAMPLE_SEEN });
      n++;
    }
    return n;
  }

  async entityMap(): Promise<Map<string, string>> {
    return new Map(this.map);
  }

  async setEntityMap(entries: { isbn13: string; entityId: string }[]): Promise<void> {
    for (const e of entries) this.map.set(e.isbn13, e.entityId);
  }

  async cacheGet<T>(key: string): Promise<T | null> {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (hit.expires !== null && hit.expires < this.now().getTime()) {
      this.cache.delete(key);
      return null;
    }
    return hit.value as T;
  }

  async cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    this.cache.set(key, { value, expires: ttlSeconds ? this.now().getTime() + ttlSeconds * 1000 : null });
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
