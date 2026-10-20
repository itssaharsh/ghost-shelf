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
    assert.ok(b.coverUrl === null || /^\/api\/cover\/\d+$/.test(b.coverUrl), "covers come by cover id through the proxy, or not at all");
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

test("recover: the holdings map (ISBN -> entity id) sends entity ids to Qloo and gates results back to ISBNs", async () => {
  const { recover } = await import("../src/lib/recover");
  const { collection } = await import("../src/lib/collection");
  const item = collection.all()[0];
  const map = new Map([[item.isbn13, "ENT-1"]]);
  let sent: string[] | undefined;
  const client = {
    mode: "qloo" as const,
    async resolveSeeds(seeds: { name: string; kind: "film" }[]) {
      return { resolved: seeds.map((s) => ({ ...s, entityId: "SEED-1" })), unresolved: [], calls: [] };
    },
    async recommendBooks(_ids: string[], opts: { heldEntityIds?: string[]; excludeEntityIds?: string[] }) {
      sent = opts.heldEntityIds;
      return { books: [{ entityId: "ENT-1", name: "Some other name", author: "Nobody", isbn13: null, year: null, affinity: 0.9, explain: { "SEED-1": 1 } }], calls: [], holdingsChunks: 1, explainAvailable: true };
    },
  };
  const r = await recover({ runId: "t", seeds: [{ name: "Dune", kind: "film" }] }, client, { entityMap: map });
  assert.deepEqual(sent, ["ENT-1"]);
  assert.equal(r.books.length, 1);
  assert.equal(r.books[0].isbn13, item.isbn13);
  assert.match(r.books[0].reason, /because you named Dune/);
});
