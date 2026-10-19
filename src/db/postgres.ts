// Postgres adapter over Neon's HTTP driver. One connection string, no pool to manage.
import { neon } from "@neondatabase/serverless";
import { count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { RedactedRequest } from "../lib/schemas";
import { EXAMPLE_SEEN, registryKey, type ExampleRow, type Hold, type LogInput, type RegistryRow, type Repo, type RunPatch, type StoredRun } from "./repo";
import * as schema from "./schema";

export class PostgresRepo implements Repo {
  readonly mode = "postgres" as const;
  private db;
  private seeded: Promise<void> | null = null;

  constructor(url: string, private examples: ExampleRow[] = []) {
    this.db = drizzle({ client: neon(url), schema });
  }

  /** The documented examples go in once, on the first registry read or write of a fresh database. */
  private ensureSeeded(): Promise<void> {
    if (!this.seeded)
      this.seeded = this.seedExamples(this.examples)
        .then(() => undefined)
        .catch((e) => {
          this.seeded = null; // try again on the next call instead of caching the failure
          throw e;
        });
    return this.seeded;
  }

  async upsertRun(patch: RunPatch): Promise<void> {
    const { id, ...rest } = patch;
    const set = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    await this.db
      .insert(schema.runs)
      .values({ id, title: patch.title ?? "", author: patch.author ?? "", ...set })
      .onConflictDoUpdate({ target: schema.runs.id, set: { ...set, updatedAt: sql`now()` } });
  }

  async getRun(id: string): Promise<StoredRun | null> {
    const [r] = await this.db.select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1);
    return r ? toRun(r) : null;
  }

  async lastRequest(runId?: string) {
    const q = this.db.select().from(schema.runs).where(runId ? eq(schema.runs.id, runId) : isNotNull(schema.runs.request)).orderBy(desc(schema.runs.updatedAt)).limit(1);
    const [r] = await q;
    return r?.request ? { runId: r.id, request: r.request as RedactedRequest, createdAt: r.updatedAt } : null;
  }

  async placeHold(input: { runId: string; isbn13s: string[]; title: string; author: string }) {
    const inserted = await this.db
      .insert(schema.holds)
      .values({ runId: input.runId, isbn13s: [...new Set(input.isbn13s)], title: input.title, author: input.author })
      .onConflictDoNothing({ target: schema.holds.runId })
      .returning();
    if (inserted[0]) return { created: true, hold: inserted[0] as Hold };
    const [existing] = await this.db.select().from(schema.holds).where(eq(schema.holds.runId, input.runId)).limit(1);
    return { created: false, hold: existing as Hold };
  }

  async logInvented(input: LogInput) {
    await this.ensureSeeded();
    const key = registryKey(input.title, input.author);
    const [row] = await this.db
      .insert(schema.registry)
      .values({ id: crypto.randomUUID(), key, title: input.title.trim(), author: input.author.trim(), count: 1, seeds: input.seeds, recovered: input.recovered, lastRunId: input.runId ?? null })
      .onConflictDoUpdate({
        target: schema.registry.key,
        set: {
          count: sql`${schema.registry.count} + 1`,
          lastSeen: sql`now()`,
          seeds: input.seeds.length ? input.seeds : sql`${schema.registry.seeds}`,
          recovered: input.recovered.length ? input.recovered : sql`${schema.registry.recovered}`,
          lastRunId: input.runId ?? sql`${schema.registry.lastRunId}`,
        },
      })
      .returning();
    const [{ n }] = await this.db.select({ n: count() }).from(schema.registry);
    return { row: row as RegistryRow, created: row.count === 1, total: Number(n) };
  }

  async registry(): Promise<RegistryRow[]> {
    await this.ensureSeeded();
    const rows = await this.db.select().from(schema.registry).orderBy(desc(schema.registry.lastSeen), schema.registry.title);
    return rows as RegistryRow[];
  }

  async registryCount(): Promise<number> {
    await this.ensureSeeded();
    const [{ n }] = await this.db.select({ n: count() }).from(schema.registry);
    return Number(n);
  }

  async seedExamples(rows: ExampleRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await this.db
      .insert(schema.registry)
      .values(rows.map((r) => ({ id: crypto.randomUUID(), key: registryKey(r.title, r.author), title: r.title, author: r.author, count: 1, example: true, seeds: r.seeds, recovered: [], firstSeen: EXAMPLE_SEEN, lastSeen: EXAMPLE_SEEN })))
      .onConflictDoNothing({ target: schema.registry.key })
      .returning({ id: schema.registry.id });
    return inserted.length;
  }

  async entityMap(): Promise<Map<string, string>> {
    const rows = await this.db.select({ isbn13: schema.entityMap.isbn13, entityId: schema.entityMap.entityId }).from(schema.entityMap);
    return new Map(rows.map((r) => [r.isbn13, r.entityId]));
  }

  async setEntityMap(entries: { isbn13: string; entityId: string; name?: string }[]): Promise<void> {
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500);
      await this.db
        .insert(schema.entityMap)
        .values(chunk.map((e) => ({ isbn13: e.isbn13, entityId: e.entityId, name: e.name ?? null })))
        .onConflictDoUpdate({ target: schema.entityMap.isbn13, set: { entityId: sql`excluded.entity_id`, name: sql`excluded.name`, updatedAt: sql`now()` } });
    }
  }

  async cacheGet<T>(key: string): Promise<T | null> {
    const [r] = await this.db.select().from(schema.qlooCache).where(eq(schema.qlooCache.key, key)).limit(1);
    if (!r) return null;
    if (r.expiresAt && new Date(r.expiresAt).getTime() < Date.now()) return null;
    return r.value as T;
  }

  async cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
    await this.db
      .insert(schema.qlooCache)
      .values({ key, value, expiresAt })
      .onConflictDoUpdate({ target: schema.qlooCache.key, set: { value, expiresAt, createdAt: sql`now()` } });
  }
}

function toRun(r: typeof schema.runs.$inferSelect): StoredRun {
  return { ...r, verdictKind: r.verdictKind as StoredRun["verdictKind"], request: r.request ?? null };
}
