import test from "node:test";
import assert from "node:assert/strict";
import { LiveQloo, chunkIds, insightsUrl, parseBook, searchUrl } from "../src/lib/qloo/live";
import { QlooError } from "../src/lib/qloo/types";

const BASE = "https://hackathon.api.qloo.com";

test("search and insights URLs carry the parameters and never the key", () => {
  const s = searchUrl(BASE, { name: "The Martian", kind: "film" });
  assert.match(s, /\/search\?/);
  assert.match(s, /types=urn%3Aentity%3Amovie/);
  const i = insightsUrl(BASE, ["e1", "e2"], ["h1", "h2"], ["x1"], 50);
  assert.match(i, /filter\.type=urn%3Aentity%3Abook/);
  assert.match(i, /signal\.interests\.entities=e1%2Ce2/);
  assert.match(i, /filter\.results\.entities=h1%2Ch2/);
  assert.match(i, /filter\.exclude\.entities=x1/);
  assert.match(i, /feature\.explainability=true/);
  assert.doesNotMatch(i, /key/i);
});

test("held entity ids are chunked into groups of 150", () => {
  const ids = Array.from({ length: 320 }, (_, k) => `id${k}`);
  const chunks = chunkIds(ids);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 150);
  assert.equal(chunks[2].length, 20);
});

test("parseBook reads an entity with affinity and per-seed explainability in either shape", () => {
  const a = parseBook({ entity_id: "b1", name: "Book One", properties: { publication_year: 2015 }, query: { affinity: 0.74, explainability: { "signal.interests.entities": { e1: 0.6, e2: 0.4 } } } });
  assert.equal(a?.entityId, "b1");
  assert.equal(a?.affinity, 0.74);
  assert.deepEqual(a?.explain, { e1: 0.6, e2: 0.4 });
  const b = parseBook({ id: "b2", name: "Book Two", query: { affinity: 0.5, explainability: { "signal.interests.entities": [{ entity_id: "e1", score: 0.9 }] } } });
  assert.deepEqual(b?.explain, { e1: 0.9 });
  assert.equal(parseBook({ name: "no id" }), null);
});

test("the live client sends the key as a header, records redacted calls, and throws a QlooError on 401", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string> });
    if (url.includes("/search")) return new Response(JSON.stringify({ results: [{ entity_id: "e-martian", name: "The Martian", types: ["urn:entity:movie"] }] }), { status: 200 });
    return new Response(JSON.stringify({ results: { entities: [{ entity_id: "b1", name: "Book One", query: { affinity: 0.8 } }] } }), { status: 200 });
  };
  const client = new LiveQloo({ apiKey: "secret-key", fetchImpl });
  const r = await client.resolveSeeds([{ name: "The Martian", kind: "film" }]);
  assert.equal(r.resolved[0].entityId, "e-martian");
  assert.equal(seen[0].headers["X-Api-Key"], "secret-key");
  assert.ok(!r.calls[0].url.includes("secret"));
  assert.ok(!JSON.stringify(r.calls).includes("secret-key"));
  const rec = await client.recommendBooks(["e-martian"], { take: 50, heldEntityIds: Array.from({ length: 151 }, (_, k) => `h${k}`) });
  assert.equal(rec.holdingsChunks, 2);
  assert.equal(rec.books[0].name, "Book One");

  const denied = new LiveQloo({ apiKey: "k", fetchImpl: async () => new Response("{}", { status: 401 }) });
  await assert.rejects(() => denied.resolveSeeds([{ name: "X", kind: "other" }]), (e: unknown) => e instanceof QlooError && e.status === 401);
});
