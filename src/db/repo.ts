// The storage boundary. Two adapters implement it: memory (tests, and any deploy without DATABASE_URL) and Postgres (Neon).
import { inventedPresets } from "../lib/presets";
import { authorKey, normalizeTitle } from "../lib/normalize";
import type { RecoverMode, RedactedRequest, Seed, SourceName, VerdictKind } from "../lib/schemas";
import type { RecoveredRef } from "./schema";

export type StoredRun = {
  id: string;
  title: string;
  author: string;
  verdictKind?: VerdictKind | null;
  checked?: number | null;
  failed?: SourceName[] | string[] | null;
  seeds?: Seed[] | null;
  mode?: RecoverMode | string | null;
  request?: RedactedRequest | null;
  books?: RecoveredRef[] | null;
  createdAt: string;
  updatedAt: string;
};

export type RunPatch = Partial<Omit<StoredRun, "id" | "createdAt" | "updatedAt">> & { id: string };

export type Hold = { runId: string; isbn13s: string[]; title: string; author: string; createdAt: string };

export type RegistryRow = {
  id: string;
  key: string;
  title: string;
  author: string;
  count: number;
  example: boolean;
  seeds: Seed[];
  recovered: RecoveredRef[];
  lastRunId: string | null;
  firstSeen: string;
  lastSeen: string;
};

export type LogInput = { runId?: string; title: string; author: string; seeds: Seed[]; recovered: RecoveredRef[] };
export type ExampleRow = { title: string; author: string; seeds: Seed[] };

export interface Repo {
  readonly mode: "memory" | "postgres";
  upsertRun(patch: RunPatch): Promise<void>;
  getRun(id: string): Promise<StoredRun | null>;
  /** the newest stored provider request (redacted at write time), optionally for one run */
  lastRequest(runId?: string): Promise<{ runId: string; request: RedactedRequest; createdAt: string } | null>;
  /** idempotent per run id: a second call returns the first hold and created=false */
  placeHold(input: { runId: string; isbn13s: string[]; title: string; author: string }): Promise<{ created: boolean; hold: Hold }>;
  /** insert, or increment the count of the same title+author */
  logInvented(input: LogInput): Promise<{ row: RegistryRow; created: boolean; total: number }>;
  registry(): Promise<RegistryRow[]>;
  registryCount(): Promise<number>;
  /** inserts the documented examples once; existing keys are left alone */
  seedExamples(rows: ExampleRow[]): Promise<number>;
  entityMap(): Promise<Map<string, string>>;
  setEntityMap(entries: { isbn13: string; entityId: string; name?: string }[]): Promise<void>;
  cacheGet<T>(key: string): Promise<T | null>;
  cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
}

/** Same title by the same author counts as one invented title, whatever the casing, punctuation or name order. */
export function registryKey(title: string, author: string): string {
  return `${normalizeTitle(title)}|${authorKey(author)}`;
}

/** The ten documented invented titles, marked example in the registry. */
export function exampleRows(): ExampleRow[] {
  return inventedPresets.map((p) => ({ title: p.title, author: p.author, seeds: p.seeds }));
}

export const EXAMPLE_SEEN = "2026-10-19T00:00:00.000Z";
