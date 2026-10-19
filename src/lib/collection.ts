// The demo collection: a public-domain slice of Seattle Public Library's 2025 checkouts (data/collection.json).
// It stands in for a library catalog: the catalog check and the holdings gate run against it.
import raw from "../../data/collection.json";
import { mainTitle, normalizeTitle, sameAuthor, toIsbn13 } from "./normalize";

export type CollectionItem = {
  isbn13: string;
  title: string;
  author: string;
  authorRaw: string;
  publisher: string;
  year: number | null;
  subjects: string[];
  checkouts2025: number;
};

type CollectionFile = { source: string; fetched: string; rule: string; items: CollectionItem[] };

const file = raw as CollectionFile;
const items: CollectionItem[] = file.items;

const byIsbn = new Map<string, CollectionItem>();
const byTitle = new Map<string, CollectionItem[]>();
const byMainTitle = new Map<string, CollectionItem[]>();
for (const it of items) {
  byIsbn.set(it.isbn13, it);
  const t = normalizeTitle(it.title);
  byTitle.set(t, [...(byTitle.get(t) ?? []), it]);
  const m = mainTitle(it.title);
  byMainTitle.set(m, [...(byMainTitle.get(m) ?? []), it]);
}

export const collection = {
  meta: { source: file.source, fetched: file.fetched, rule: file.rule, size: items.length },
  all(): CollectionItem[] {
    return items;
  },
  byIsbn(isbn: string): CollectionItem | undefined {
    const k = toIsbn13(isbn);
    return k ? byIsbn.get(k) : undefined;
  },
};

export type CatalogHit = { item: CollectionItem; match: "isbn" | "title+author" | "title" };

/**
 * Find a held title. With an author, the title must match (full or main title) and the surname must agree.
 * Without an author, a title that matches exactly one held item is returned.
 */
export function findHeld(q: { title?: string; author?: string; isbn?: string }): CatalogHit | null {
  if (q.isbn) {
    const it = collection.byIsbn(q.isbn);
    if (it) return { item: it, match: "isbn" };
  }
  const t = normalizeTitle(q.title ?? "");
  if (!t) return null;
  const candidates = [...(byTitle.get(t) ?? []), ...(byMainTitle.get(mainTitle(q.title ?? "")) ?? [])];
  const unique = [...new Map(candidates.map((c) => [c.isbn13, c])).values()];
  if (q.author && q.author.trim()) {
    const hit = unique.find((c) => sameAuthor(c.author, q.author!) || sameAuthor(c.authorRaw, q.author!));
    return hit ? { item: hit, match: "title+author" } : null;
  }
  return unique.length === 1 ? { item: unique[0], match: "title" } : null;
}

/** Held titles that share a title with the query but not the author (for the "exists by someone else" note). */
export function sameTitleOtherAuthor(q: { title: string; author?: string }): CollectionItem[] {
  const t = normalizeTitle(q.title);
  const hits = [...(byTitle.get(t) ?? []), ...(byMainTitle.get(mainTitle(q.title)) ?? [])];
  const unique = [...new Map(hits.map((c) => [c.isbn13, c])).values()];
  return q.author ? unique.filter((c) => !sameAuthor(c.author, q.author!)) : unique;
}
