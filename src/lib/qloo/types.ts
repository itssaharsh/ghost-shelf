import type { RedactedRequest, Seed } from "../schemas";

export type QlooBook = {
  entityId: string;
  name: string;
  author?: string;
  isbn13?: string | null;
  year?: number | null;
  affinity?: number;
  /** per input entity: entityId -> contribution 0..1 */
  explain?: Record<string, number>;
};

export type ResolveResult = { resolved: Seed[]; unresolved: string[]; calls: RedactedRequest["calls"] };

export type RecommendOptions = {
  /** Qloo entity ids of held titles, when the collection map exists; chunked into filter.results.entities */
  heldEntityIds?: string[];
  excludeEntityIds?: string[];
  take: number;
};

export type RecommendResult = {
  books: QlooBook[];
  calls: RedactedRequest["calls"];
  holdingsChunks: number;
  explainAvailable: boolean;
  responseExcerpt?: unknown;
};

export interface QlooClient {
  readonly mode: "qloo" | "sample";
  resolveSeeds(seeds: Seed[]): Promise<ResolveResult>;
  recommendBooks(seedEntityIds: string[], opts: RecommendOptions): Promise<RecommendResult>;
}

export class QlooError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "QlooError";
  }
}

export const QLOO_BASE = "https://hackathon.api.qloo.com";
export const HOLDINGS_CHUNK = 150;

export const KIND_TO_TYPE: Record<Seed["kind"], string | undefined> = {
  film: "urn:entity:movie",
  band: "urn:entity:artist",
  artist: "urn:entity:artist",
  author: "urn:entity:person",
  book: "urn:entity:book",
  tv: "urn:entity:tv_show",
  other: undefined,
};
