// Reading-list requests: the form's free text becomes seeds, exclusions and avoid words for the same recovery step the desk uses.
import { findHeld } from "./collection";
import type { RecoveredBook, Seed } from "./schemas";

export type ListRequest = { liked: string; disliked: string; avoid: string; format: string; count?: number };

/** "Project Hail Mary (Andy Weir), The Martian" -> seeds; a bare name with no title becomes an author seed when it looks like one. */
export function parseLiked(text: string): Seed[] {
  return text
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((raw) => {
      const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      const name = (m ? m[1] : raw).trim();
      const words = name.split(/\s+/);
      // a bare two-word name is an author only when it is not a title we hold ("Station Eleven" is a book, "Ann Patchett" is not)
      const looksLikeAuthor = !m && words.length === 2 && words.every((w) => /^[A-Z][a-z'.-]+$/.test(w)) && !findHeld({ title: name });
      return { name, kind: looksLikeAuthor ? "author" : "book" } as Seed;
    });
}

export function parseList(text: string): string[] {
  return text
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/** Titles the patron disliked that we hold become excluded ISBNs; the rest are matched by title words in `avoid`. */
export function dislikedToExcludes(items: string[]): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    const hit = findHeld({ title: (m ? m[1] : raw).trim(), author: m ? m[2].trim() : undefined });
    if (hit) out.push(hit.item.isbn13);
  }
  return out;
}

export function draftEmail(req: ListRequest, books: RecoveredBook[], mode: "qloo" | "sample"): string {
  const liked = parseLiked(req.liked).map((s) => s.name);
  const lines = books.map((b, i) => `${i + 1}. ${b.title} by ${b.author}${b.year ? ` (${b.year})` : ""}${b.reason && mode === "qloo" ? ` — ${b.reason}` : ""}`);
  return [
    "Subject: Your reading list from the library",
    "",
    "Hello,",
    "",
    `Thank you for your reading-list request. Going by what you enjoyed (${liked.join(", ") || "what you told us"}), here are ${books.length} books we hold:`,
    "",
    ...lines,
    "",
    req.avoid.trim() ? `We kept out anything with: ${parseList(req.avoid).join(", ")}.` : "",
    "All of these are on our shelves now. Reply to this message and we will place holds on any you would like.",
    "",
    "With best wishes,",
    "The readers' advisory desk",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}
