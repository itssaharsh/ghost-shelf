import test from "node:test";
import assert from "node:assert/strict";
import { findHeld } from "../src/lib/collection";
import { isbn10to13, toIsbn13 } from "../src/lib/normalize";
import { matchInternetArchive } from "../src/lib/sources/internetarchive";
import { avoided } from "../src/lib/recover";
import { getRepo } from "../src/db";
import { POST as log } from "../src/app/api/log/route";

test("catalog: a title held in two editions by one author is found without an author", () => {
  const hit = findHeld({ title: "Intermezzo" });
  assert.ok(hit, "Intermezzo has two editions in the collection and must still be found");
  assert.equal(hit.match, "title");
});

test("isbn: an ISBN-10 ending in X converts", () => {
  assert.equal(toIsbn13("080442957X"), isbn10to13("080442957X"));
  assert.match(toIsbn13("0-8044-2957-X") ?? "", /^978\d{10}$/);
});

test("archive: without an author, a same-titled upload by anyone is not the book; a published record is", () => {
  const upload = { title: "The Last Algorithm", creator: "Random Student", date: "2019" };
  assert.equal(matchInternetArchive([upload], { title: "The Last Algorithm" }), null);
  const published = { ...upload, creator: "Walter, Jess", publisher: "Harper", isbn: "9780061928123" };
  assert.ok(matchInternetArchive([published], { title: "The Last Algorithm" }));
});

test("avoid words match whole words only", () => {
  assert.equal(avoided({ title: "The husbands: a novel", subjects: ["Fiction"] }, ["us"]), false);
  assert.equal(avoided({ title: "Us", subjects: [] }, ["us"]), true);
  assert.equal(avoided({ title: "A quiet place", subjects: ["Horror fiction"] }, ["horror"]), true);
});

test("log route: a run that found the book cannot be logged as invented; an unknown run is accepted", async () => {
  const repo = getRepo();
  await repo.upsertRun({ id: "run-held-1", title: "The Overstory", author: "Richard Powers", verdictKind: "held", checked: 3, failed: [] });
  const headers = { "content-type": "application/json", "x-forwarded-for": "203.0.113.31" };
  const refused = await log(new Request("http://x/api/log", { method: "POST", headers, body: JSON.stringify({ runId: "run-held-1", title: "The Overstory", author: "Richard Powers" }) }));
  assert.equal(refused.status, 409);
  const accepted = await log(new Request("http://x/api/log", { method: "POST", headers, body: JSON.stringify({ runId: "run-elsewhere", title: "Review Fixture Title", author: "Nobody" }) }));
  assert.equal(accepted.status, 200);
});
