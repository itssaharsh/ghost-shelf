import test from "node:test";
import assert from "node:assert/strict";
import { recover, gateToHoldings, reasonLine } from "../src/lib/recover";
import { SampleQloo } from "../src/lib/qloo/sample";
import { LiveQloo } from "../src/lib/qloo/live";
import { collection } from "../src/lib/collection";
import type { Seed } from "../src/lib/schemas";

const items = collection.all();
const seeds: Seed[] = [{ name: "The Martian (film)", kind: "film" }, { name: "Radiohead", kind: "band" }];

test("sample mode returns three distinct held titles, labelled, with covers by ISBN", async () => {
  const r = await recover({ runId: "r1", seeds }, new SampleQloo(items));
  assert.equal(r.mode, "sample");
  assert.match(r.modeNote, /Sample mode/);
  assert.equal(r.books.length, 3);
  assert.equal(new Set(r.books.map((b) => b.isbn13)).size, 3);
  for (const b of r.books) {
    assert.ok(items.some((i) => i.isbn13 === b.isbn13), "every book is held");
    assert.match(b.coverUrl, /covers\.openlibrary\.org\/b\/isbn\/97[89]\d{10}-M\.jpg/);
    assert.match(b.reason, /sample mode/);
  }
  const again = await recover({ runId: "r2", seeds }, new SampleQloo(items));
  assert.deepEqual(again.books.map((b) => b.isbn13), r.books.map((b) => b.isbn13), "deterministic for the same seeds");
});

test("no seeds -> nothing recommended and a note", async () => {
  const r = await recover({ runId: "r3", seeds: [] }, new SampleQloo(items));
  assert.equal(r.books.length, 0);
  assert.equal(r.seeds.length, 0);
  assert.match(r.request?.note ?? "", /no seeds/);
});

test("a 401 from the live client falls back to sample mode with the key-pending label", async () => {
  const live = new LiveQloo({ apiKey: "k", fetchImpl: async () => new Response("{}", { status: 401 }) });
  const r = await recover({ runId: "r4", seeds }, live);
  assert.equal(r.mode, "sample");
  assert.match(r.modeNote, /key pending/);
  assert.equal(r.books.length, 3);
  assert.ok(r.request?.calls.some((c) => c.name === "qloo-error" && c.status === 401));
});

test("live results are gated to holdings by title and author, and reasons carry per-seed shares", async () => {
  const held = items[0];
  const fetchImpl = async (url: string) => {
    if (url.includes("/search")) return new Response(JSON.stringify({ results: [{ entity_id: url.includes("Martian") ? "e1" : "e2", name: "x" }] }), { status: 200 });
    return new Response(
      JSON.stringify({ results: { entities: [
        { entity_id: "b-held", name: held.title, properties: { author: held.author }, query: { affinity: 0.81, explainability: { "signal.interests.entities": { e1: 0.6, e2: 0.4 } } } },
        { entity_id: "b-not-held", name: "A Book Nobody Here Holds", properties: { author: "Nobody" }, query: { affinity: 0.9 } },
      ] } }),
      { status: 200 },
    );
  };
  const r = await recover({ runId: "r5", seeds }, new LiveQloo({ apiKey: "k", fetchImpl }));
  assert.equal(r.mode, "qloo");
  assert.equal(r.books.length, 1);
  assert.equal(r.books[0].isbn13, held.isbn13);
  assert.match(r.books[0].reason, /because you named The Martian \(film\) 60%, Radiohead 40%/);
  assert.match(r.request?.note ?? "", /title and author/);
});

test("reasonLine without explainability names the seeds without shares; gate dedupes", () => {
  const r = reasonLine([{ name: "A", kind: "film", entityId: "e1" }, { name: "B", kind: "band", entityId: "e2" }], { entityId: "x", name: "y" }, false);
  assert.equal(r.reason, "because you named A and B");
  const held = items[0];
  const gated = gateToHoldings([{ entityId: "a", name: held.title, author: held.author }, { entityId: "b", name: held.title, author: held.author }], items);
  assert.equal(gated.length, 1);
});
