import test from "node:test";
import assert from "node:assert/strict";
import { internetArchiveUrl, matchInternetArchive, type ArchiveDoc } from "../src/lib/sources/internetarchive";

const walter: ArchiveDoc = { identifier: "beautifulruins0000walt", title: "Beautiful ruins", creator: "Walter, Jess, 1965-", date: "2012-01-01T00:00:00Z", isbn: ["0061928127", "9780061928123"], publisher: "Harper" };
const noise: ArchiveDoc[] = [
  { title: "Structure and Diversity of the Vascular Epiphyte Community in the Overstory of a Tropical Rain Forest", creator: "Carlsen, Monica" },
  { title: "the overstory quotes with page numbers", creator: "someone@example.com" },
  { title: "The Overstory", creator: [] },
];

test("archive: inverted creator with life dates matches the patron's author, isbn-10 becomes 13", () => {
  const r = matchInternetArchive([noise[0], walter], { title: "Beautiful Ruins", author: "Jess Walter" });
  assert.ok(r);
  assert.equal(r.isbn13, "9780061928123");
  assert.equal(r.year, 2012);
  assert.equal(r.author, "Walter, Jess");
});

test("archive: same title by another author is not a match", () => {
  assert.equal(matchInternetArchive([walter], { title: "Beautiful Ruins", author: "Andy Weir" }), null);
});

test("archive: essays and notes titled after a book never count, and a creator-less record is skipped", () => {
  assert.equal(matchInternetArchive(noise, { title: "The Overstory" }), null);
  assert.equal(matchInternetArchive(noise, { title: "The Overstory", author: "Richard Powers" }), null);
});

test("archive: creator arrays are searched", () => {
  const r = matchInternetArchive([{ title: "Good Omens", creator: ["Pratchett, Terry", "Gaiman, Neil"], date: "1990" }], { title: "Good Omens", author: "Neil Gaiman" });
  assert.ok(r);
  assert.equal(r.year, 1990);
});

test("archive: the query is title and texts only, quotes stripped, no creator clause", () => {
  const u = new URL(internetArchiveUrl({ title: 'The "Last" Algorithm', author: "Andy Weir" }));
  assert.equal(u.searchParams.get("q"), 'title:("The Last Algorithm") AND mediatype:(texts)');
  assert.equal(u.searchParams.get("output"), "json");
});
