import { mainTitle, normalizeTitle, sameAuthor } from "../normalize";
import type { CheckQuery, FoundRecord } from "../schemas";

export type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
};

export function openLibraryUrl(q: CheckQuery): string {
  const p = new URLSearchParams({
    title: q.title,
    fields: "key,title,author_name,first_publish_year,isbn",
    limit: "8",
  });
  if (q.author) p.set("author", q.author);
  return `https://openlibrary.org/search.json?${p}`;
}

export function openLibraryLink(q: CheckQuery): string {
  const p = new URLSearchParams({ title: q.title });
  if (q.author) p.set("author", q.author);
  return `https://openlibrary.org/search?${p}`;
}

/** Pure matcher: a doc counts when its title matches (full or main title) and, if an author was given, a surname agrees. */
export function matchOpenLibrary(docs: OpenLibraryDoc[], q: CheckQuery): FoundRecord | null {
  const qt = normalizeTitle(q.title);
  const qm = mainTitle(q.title);
  for (const d of docs) {
    const dt = normalizeTitle(d.title ?? "");
    const dm = mainTitle(d.title ?? "");
    const titleOk = dt === qt || dm === qm || (qm.length > 6 && dm === qm);
    if (!titleOk) continue;
    const authors = d.author_name ?? [];
    if (q.author && !authors.some((a) => sameAuthor(a, q.author!))) continue;
    const isbn13 = (d.isbn ?? []).find((i) => /^97[89]\d{10}$/.test(i)) ?? null;
    return { title: d.title ?? q.title, author: authors[0] ?? "", year: d.first_publish_year ?? null, isbn13 };
  }
  return null;
}

export async function queryOpenLibrary(q: CheckQuery, signal: AbortSignal): Promise<{ found: FoundRecord | null; detail: string }> {
  const res = await fetch(openLibraryUrl(q), { signal, headers: { accept: "application/json", "user-agent": "ghost-shelf/0.1 (hackathon demo)" } });
  if (!res.ok) throw new Error(`Open Library answered ${res.status}`);
  const json = (await res.json()) as { numFound?: number; docs?: OpenLibraryDoc[] };
  const docs = json.docs ?? [];
  const found = matchOpenLibrary(docs, q);
  const n = json.numFound ?? docs.length;
  return { found, detail: found ? `found, first published ${found.year ?? "unknown"}` : n ? `${n} near matches, none by this author` : "no matches" };
}
