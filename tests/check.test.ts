import test from "node:test";
import assert from "node:assert/strict";
import { computeVerdict, runCheck, type CheckDeps, type SourceFn } from "../src/lib/check";
import { matchOpenLibrary } from "../src/lib/sources/openlibrary";
import { matchGoogleBooks } from "../src/lib/sources/googlebooks";
import type { CheckEvent, SourceResult } from "../src/lib/schemas";

const none: SourceFn = async () => ({ found: null, detail: "no matches" });
const foundBy = (author: string, held = false): SourceFn => async (q) => ({ found: { title: q.title, author, year: 2020, isbn13: "9780000000002", held }, detail: "found" });
const throwing: SourceFn = async () => { throw new Error("boom"); };
const hanging: SourceFn = (_q, signal) => new Promise((_r, rej) => signal.addEventListener("abort", () => rej(signal.reason)));

function deps(over: Partial<Record<"catalog" | "openlibrary" | "googlebooks", SourceFn>>, timeoutMs = 50): CheckDeps {
  return { sources: { catalog: none, openlibrary: none, googlebooks: none, ...over }, timeoutMs };
}

async function collect(q: { title: string; author?: string }, d: CheckDeps) {
  const events: CheckEvent[] = [];
  const verdict = await runCheck(q, (e) => events.push(e), d, "run-test");
  return { events, verdict };
}

test("all sources no record -> verdict no_record with 3 checked, events in arrival order with ms", async () => {
  const { events, verdict } = await collect({ title: "The Last Algorithm", author: "Andy Weir" }, deps({}));
  assert.equal(events[0].type, "start");
  const sources = events.filter((e) => e.type === "source") as (CheckEvent & SourceResult)[];
  assert.equal(sources.length, 3);
  for (const s of sources) {
    assert.equal(s.result, "no_record");
    assert.ok(Number.isInteger(s.ms));
  }
  assert.equal(events.at(-1)!.type, "verdict");
  assert.deepEqual({ kind: verdict.kind, checked: verdict.checked, failed: verdict.failed }, { kind: "no_record", checked: 3, failed: [] });
});

test("a throwing source is marked failed and the run continues: no record in 2 sources, source named", async () => {
  const { events, verdict } = await collect({ title: "Tidewater Dreams", author: "Isabel Allende" }, deps({ openlibrary: throwing }));
  const ol = events.find((e) => e.type === "source" && e.source === "openlibrary") as SourceResult;
  assert.equal(ol.result, "failed");
  assert.match(ol.detail ?? "", /did not answer/);
  assert.equal(verdict.kind, "no_record");
  assert.equal(verdict.checked, 2);
  assert.deepEqual(verdict.failed, ["openlibrary"]);
});

test("a hanging source times out, is marked failed, and does not block the others", async () => {
  const t0 = Date.now();
  const { verdict } = await collect({ title: "Nightshade Market", author: "Min Jin Lee" }, deps({ googlebooks: hanging }, 60));
  assert.ok(Date.now() - t0 < 2000);
  assert.deepEqual(verdict.failed, ["googlebooks"]);
  assert.equal(verdict.checked, 2);
});

test("catalog found -> held; external found only -> not_held with the source; all failed -> unchecked", async () => {
  const held = await collect({ title: "A Held Book", author: "Someone Real" }, deps({ catalog: foundBy("Someone Real", true) }));
  assert.equal(held.verdict.kind, "held");
  const notHeld = await collect({ title: "A Real Book", author: "Someone Real" }, deps({ openlibrary: foundBy("Someone Real") }));
  assert.equal(notHeld.verdict.kind, "not_held");
  assert.equal(notHeld.verdict.foundElsewhere?.source, "openlibrary");
  const unchecked = await collect({ title: "X", author: "Y" }, deps({ catalog: throwing, openlibrary: throwing, googlebooks: throwing }));
  assert.equal(unchecked.verdict.kind, "unchecked");
  assert.equal(unchecked.verdict.checked, 0);
});

test("computeVerdict reports a same-title-other-author note without counting it as found", () => {
  const results: SourceResult[] = [
    { source: "catalog", result: "no_record", ms: 1, titleOnlyBy: "Charlotte McConaghy" },
    { source: "openlibrary", result: "no_record", ms: 1 },
    { source: "googlebooks", result: "no_record", ms: 1 },
  ];
  const v = computeVerdict(results);
  assert.equal(v.kind, "no_record");
  assert.equal(v.titleOnlyBy, "Charlotte McConaghy");
});

test("Open Library matcher requires the author's surname when an author is given", () => {
  const docs = [
    { key: "/works/1", title: "Migrations", author_name: ["Charlotte McConaghy"], first_publish_year: 2020, isbn: ["9781250204028"] },
  ];
  assert.equal(matchOpenLibrary(docs, { title: "Migrations", author: "Maggie O'Farrell" }), null);
  const hit = matchOpenLibrary(docs, { title: "Migrations", author: "Charlotte McConaghy" });
  assert.equal(hit?.isbn13, "9781250204028");
  assert.equal(matchOpenLibrary(docs, { title: "Migrations" })?.year, 2020);
});

test("Google Books matcher matches the main title and the author", () => {
  const items = [
    { volumeInfo: { title: "Beautiful Ruins", subtitle: "A Novel", authors: ["Jess Walter"], publishedDate: "2012-06-12", industryIdentifiers: [{ type: "ISBN_13", identifier: "9780061928123" }] } },
  ];
  assert.equal(matchGoogleBooks(items, { title: "Beautiful Ruins", author: "Jess Walter" })?.year, 2012);
  assert.equal(matchGoogleBooks(items, { title: "Beautiful Ruins", author: "Andy Weir" }), null);
  assert.equal(matchGoogleBooks(items, { title: "The Last Algorithm", author: "Andy Weir" }), null);
});
