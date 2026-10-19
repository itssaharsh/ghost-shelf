// Internet Archive: the keyless third source. It answers title-only queries, so the matcher does the author check here.
import { mainTitle, normalizeTitle, sameAuthor, toIsbn13 } from "../normalize";
import type { CheckQuery, FoundRecord } from "../schemas";

export type ArchiveDoc = {
  identifier?: string;
  title?: string | string[];
  creator?: string | string[];
  date?: string | string[];
  isbn?: string | string[];
  publisher?: string | string[];
};

const list = (v?: string | string[]): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const first = (v?: string | string[]): string | undefined => list(v)[0];

function phrase(s: string): string {
  return `"${s.replace(/["\\()]/g, " ").replace(/\s+/g, " ").trim()}"`;
}

/** Title + texts only: the archive's creator field is inverted ("Walter, Jess, 1965-"), so a creator clause would miss. */
export function internetArchiveUrl(q: CheckQuery): string {
  const p = new URLSearchParams({ q: `title:(${phrase(q.title)}) AND mediatype:(texts)`, rows: "12", output: "json" });
  for (const f of ["identifier", "title", "creator", "date", "isbn", "publisher"]) p.append("fl[]", f);
  return `https://archive.org/advancedsearch.php?${p}`;
}

export function internetArchiveLink(q: CheckQuery): string {
  const p = new URLSearchParams({ query: [q.title, q.author].filter(Boolean).join(" ") });
  return `https://archive.org/search?${p}&and[]=mediatype%3A%22texts%22`;
}

export function matchInternetArchive(docs: ArchiveDoc[], q: CheckQuery): FoundRecord | null {
  const qt = normalizeTitle(q.title);
  const qm = mainTitle(q.title);
  for (const d of docs) {
    const title = first(d.title) ?? "";
    if (!title) continue;
    const titleOk = normalizeTitle(title) === qt || (mainTitle(title) === qm && qm.length > 3);
    if (!titleOk) continue;
    const creators = list(d.creator);
    // Without an author, a named creator is not enough (the archive holds essays, notes and uploads titled after famous books):
    // the record must look like a published book, with an ISBN or a publisher.
    const published = list(d.isbn).length > 0 || Boolean(first(d.publisher));
    if (q.author ? !creators.some((c) => sameAuthor(c, q.author!)) : !(creators.length > 0 && published)) continue;
    const y = Number(first(d.date)?.slice(0, 4));
    const isbn13 = list(d.isbn).map((i) => toIsbn13(i)).find((i): i is string => Boolean(i)) ?? null;
    const author = creators.find((c) => (q.author ? sameAuthor(c, q.author) : true)) ?? "";
    return { title, author: author.replace(/,?\s*\d{4}\s*-\s*(\d{4})?\.?$/, ""), year: Number.isFinite(y) && y > 0 ? y : null, isbn13, publisher: first(d.publisher) };
  }
  return null;
}

export async function queryInternetArchive(q: CheckQuery, signal: AbortSignal): Promise<{ found: FoundRecord | null; detail: string }> {
  const res = await fetch(internetArchiveUrl(q), { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Internet Archive answered ${res.status}`);
  const json = (await res.json()) as { response?: { numFound?: number; docs?: ArchiveDoc[] } };
  const docs = json.response?.docs ?? [];
  const found = matchInternetArchive(docs, q);
  const n = json.response?.numFound ?? docs.length;
  return { found, detail: found ? `found, published ${found.year ?? "unknown"}` : n ? `${n} near matches, none by this author` : "no matches" };
}
