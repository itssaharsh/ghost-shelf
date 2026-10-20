// The draft reply, client-side: no catalog import here, so the reading-lists page ships without the 1.2 MB collection.
import type { RecoveredBook } from "./schemas";
import type { ListRequest } from "./lists";

const names = (text: string) =>
  text
    .split(/[\n;,]+/)
    .map((s) => s.replace(/\s*\([^)]*\)\s*$/, "").trim())
    .filter(Boolean)
    .slice(0, 5);

export function draftEmail(req: ListRequest, books: RecoveredBook[], mode: "qloo" | "sample"): string {
  const liked = names(req.liked);
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
    req.avoid.trim() ? `We kept out anything with: ${names(req.avoid).join(", ")}.` : "",
    "All of these are on our shelves now. Reply to this message and we will place holds on any you would like.",
    "",
    "With best wishes,",
    "The readers' advisory desk",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}
