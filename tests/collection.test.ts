import test from "node:test";
import assert from "node:assert/strict";
import { collection, findHeld, sameTitleOtherAuthor } from "../src/lib/collection";
import { normalizeTitle, normalizeAuthor, sameAuthor, toIsbn13 } from "../src/lib/normalize";

test("normalizeTitle drops articles, punctuation and case", () => {
  assert.equal(normalizeTitle("The Last Algorithm"), "last algorithm");
  assert.equal(normalizeTitle("Atmosphere: a love story"), "atmosphere a love story");
  assert.equal(normalizeTitle("Café Society!"), "cafe society");
});

test("normalizeAuthor handles 'Last, First, dates' and plain names", () => {
  assert.equal(normalizeAuthor("Bechdel, Alison, 1960-"), "alison bechdel");
  assert.equal(normalizeAuthor("Jess Walter"), "jess walter");
  assert.ok(sameAuthor("Reid, Taylor Jenkins", "Taylor Jenkins Reid"));
  assert.ok(!sameAuthor("Andy Weir", "Isabel Allende"));
});

test("toIsbn13 converts ISBN-10 and keeps ISBN-13", () => {
  assert.equal(toIsbn13("0553418025"), "9780553418026");
  assert.equal(toIsbn13("978-0-593-15871-5"), "9780593158715");
  assert.equal(toIsbn13("not an isbn"), null);
});

test("the collection holds at least 2,000 distinct ISBN-13s with title, author and subjects", () => {
  const all = collection.all();
  assert.ok(all.length >= 2000, `only ${all.length} items`);
  const isbns = new Set(all.map((i) => i.isbn13));
  assert.equal(isbns.size, all.length);
  for (const it of all.slice(0, 50)) {
    assert.ok(it.title.length > 0 && it.author.length > 0 && Array.isArray(it.subjects));
    assert.match(it.isbn13, /^97[89]\d{10}$/);
  }
});

test("findHeld returns a held item for a real title and author, and nothing for an invented one", () => {
  const first = collection.all()[0];
  const hit = findHeld({ title: first.title, author: first.author });
  assert.ok(hit, `expected to find ${first.title}`);
  assert.equal(hit!.item.isbn13, first.isbn13);
  assert.equal(findHeld({ title: "The Last Algorithm", author: "Andy Weir" }), null);
  assert.equal(findHeld({ title: "Tidewater Dreams", author: "Isabel Allende" }), null);
});

test("findHeld by title alone only when the title is unique; wrong author is not a hit", () => {
  const first = collection.all()[0];
  const wrong = findHeld({ title: first.title, author: "Nobody Atall" });
  assert.equal(wrong, null);
  const others = sameTitleOtherAuthor({ title: first.title, author: "Nobody Atall" });
  assert.ok(others.some((o) => o.isbn13 === first.isbn13));
});
