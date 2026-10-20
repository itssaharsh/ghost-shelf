// Shared types for the check, recovery, holds and registry boundaries. Plain types, no runtime dependency.
import type { CollectionItem } from "./collection";

export type SourceName = "catalog" | "openlibrary" | "googlebooks" | "internetarchive";

export const SOURCE_LABEL: Record<SourceName, string> = {
  catalog: "Our catalog",
  openlibrary: "Open Library",
  googlebooks: "Google Books",
  internetarchive: "Internet Archive",
};

export type FoundRecord = {
  title: string;
  author: string;
  year?: number | null;
  isbn13?: string | null;
  /** catalog only: the held item */
  held?: boolean;
  checkouts2025?: number;
  publisher?: string;
};

export type SourceResult = {
  source: SourceName;
  result: "no_record" | "found" | "failed";
  ms: number;
  /** a short human line: "did not answer (timeout)", "3,012 held titles", "edition count 4" */
  detail?: string;
  /** where a person can repeat the check */
  link?: string;
  found?: FoundRecord;
  /** a record with this title exists under a different author (reported, never counted as found) */
  titleOnlyBy?: string;
};

export type VerdictKind = "no_record" | "held" | "not_held" | "unchecked";

export type Verdict = {
  kind: VerdictKind;
  /** sources that answered */
  checked: number;
  failed: SourceName[];
  heldItem?: CollectionItem;
  heldCoverUrl?: string | null;
  /** for not_held: the first external source that found it */
  foundElsewhere?: { source: SourceName; record: FoundRecord };
  titleOnlyBy?: string;
};

export type CheckQuery = { title: string; author?: string };

export type CheckEvent =
  | { type: "start"; runId: string; title: string; author: string }
  | ({ type: "source" } & SourceResult)
  | { type: "verdict"; runId: string; verdict: Verdict }
  | { type: "registry"; runId: string; count: number; firstSeen: string; example: boolean };

export type Seed = { name: string; kind: "film" | "band" | "artist" | "author" | "book" | "tv" | "other"; entityId?: string; /** the taste graph's own name for it, when it differs from what the patron said */ canonical?: string };

export type RecoveredBook = {
  isbn13: string;
  title: string;
  author: string;
  publisher?: string;
  year?: number | null;
  checkouts2025?: number;
  affinity?: number;
  /** per-seed contribution, 0..1, when the taste API returns it */
  explain?: { seed: string; share: number }[];
  reason: string;
  /** by Open Library cover id when the collection map has one; null means "show the spine" */
  coverUrl: string | null;
};

export type RecoverMode = "qloo" | "sample";

export type RecoverResult = {
  runId: string;
  mode: RecoverMode;
  modeNote: string;
  seeds: Seed[];
  unresolved: string[];
  books: RecoveredBook[];
  request?: RedactedRequest;
};

export type RedactedRequest = {
  provider: "qloo" | "sample";
  calls: { name: string; url: string; params: Record<string, string>; ms?: number; status?: number; /** Qloo's own error line on a failed call, never the key */ error?: string }[];
  holdingsChunks?: number;
  responseExcerpt?: unknown;
  note?: string;
};
