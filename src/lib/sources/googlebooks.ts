import { mainTitle, normalizeTitle, sameAuthor } from "../normalize";
import type { CheckQuery, FoundRecord } from "../schemas";

export type GoogleVolume = {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    publisher?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
  };
};

export function googleBooksUrl(q: CheckQuery, apiKey?: string): string {
  const parts = [`intitle:"${q.title.replace(/"/g, "")}"`];
  if (q.author) parts.push(`inauthor:"${q.author.replace(/"/g, "")}"`);
  const p = new URLSearchParams({ q: parts.join(" "), maxResults: "8", printType: "books" });
  if (apiKey) p.set("key", apiKey);
  return `https://www.googleapis.com/books/v1/volumes?${p}`;
}

export function googleBooksLink(q: CheckQuery): string {
  const p = new URLSearchParams({ q: [q.title, q.author].filter(Boolean).join(" ") });
  return `https://www.google.com/books?${p}`;
}

export function matchGoogleBooks(items: GoogleVolume[], q: CheckQuery): FoundRecord | null {
  const qt = normalizeTitle(q.title);
  const qm = mainTitle(q.title);
  for (const v of items) {
    const info = v.volumeInfo ?? {};
    const full = [info.title, info.subtitle].filter(Boolean).join(": ");
    const dt = normalizeTitle(full);
    const dm = mainTitle(info.title ?? "");
    const titleOk = dt === qt || dm === qm;
    if (!titleOk) continue;
    const authors = info.authors ?? [];
    if (q.author && !authors.some((a) => sameAuthor(a, q.author!))) continue;
    const year = info.publishedDate ? Number(info.publishedDate.slice(0, 4)) : null;
    const isbn13 = (info.industryIdentifiers ?? []).find((i) => i.type === "ISBN_13")?.identifier ?? null;
    return { title: info.title ?? q.title, author: authors[0] ?? "", year: Number.isFinite(year) ? year : null, isbn13, publisher: info.publisher };
  }
  return null;
}

export async function queryGoogleBooks(q: CheckQuery, signal: AbortSignal, apiKey = process.env.GOOGLE_BOOKS_API_KEY): Promise<{ found: FoundRecord | null; detail: string }> {
  const res = await fetch(googleBooksUrl(q, apiKey), { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Google Books answered ${res.status}`);
  const json = (await res.json()) as { totalItems?: number; items?: GoogleVolume[] };
  const items = json.items ?? [];
  const found = matchGoogleBooks(items, q);
  const n = json.totalItems ?? items.length;
  return { found, detail: found ? `found, published ${found.year ?? "unknown"}` : n ? `${n} near matches, none by this author` : "no matches" };
}
