import test from "node:test";
import assert from "node:assert/strict";
import { parseLiked, parseList } from "../src/lib/lists";
import { draftEmail } from "../src/lib/lists-draft";
import { POST as lists } from "../src/app/api/lists/route";

const post = (body: unknown) => lists(new Request("http://x/api/lists", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.21" }, body: JSON.stringify(body) }));

test("lists: liked text becomes book and author seeds", () => {
  const seeds = parseLiked("Project Hail Mary (Andy Weir), The Overstory, Ann Patchett");
  assert.deepEqual(seeds.map((s) => [s.name, s.kind]), [["Project Hail Mary", "book"], ["The Overstory", "book"], ["Ann Patchett", "author"]]);
  assert.deepEqual(parseList(" horror ; graphic novel,,"), ["horror", "graphic novel"]);
});

test("lists route: five to ten held titles, avoid words kept out, an empty form is refused", async () => {
  const bad = await post({ liked: "  " });
  assert.equal(bad.status, 400);
  const res = await post({ liked: "Project Hail Mary (Andy Weir), The Martian (Andy Weir)", disliked: "Ready Player One", avoid: "horror, graphic novel", count: 8 });
  assert.equal(res.status, 200);
  const j = (await res.json()) as { books: { title: string; isbn13: string }[]; mode: string };
  assert.ok(j.books.length >= 5 && j.books.length <= 10, `got ${j.books.length}`);
  assert.ok(j.books.every((b) => !/horror|graphic novel/i.test(b.title)));
  assert.equal(new Set(j.books.map((b) => b.isbn13)).size, j.books.length);
});

test("lists: the draft is labelled as a draft by the caller and lists every approved title once", () => {
  const draft = draftEmail({ liked: "Project Hail Mary (Andy Weir)", disliked: "", avoid: "horror", format: "print" }, [{ isbn13: "9780000000001", title: "A", author: "B", year: 2020, reason: "because you named Project Hail Mary", coverUrl: null }], "qloo");
  assert.match(draft, /^Subject: Your reading list/);
  assert.match(draft, /1\. A by B \(2020\) — because you named Project Hail Mary/);
  assert.match(draft, /kept out anything with: horror/);
  assert.doesNotMatch(draft, /\n\n\n/);
});
