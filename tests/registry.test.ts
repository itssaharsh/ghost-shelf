import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRepo } from "../src/db/memory";
import { exampleRows, registryKey } from "../src/db/repo";
import { POST as log } from "../src/app/api/log/route";
import { GET as registry } from "../src/app/api/registry/route";
import { GET as lastRequest } from "../src/app/api/request/last/route";

test("registry key: casing, punctuation and inverted author names collapse to one title", () => {
  assert.equal(registryKey("The Last Algorithm", "Andy Weir"), registryKey("the last algorithm!", "Weir, Andy"));
  assert.notEqual(registryKey("The Last Algorithm", "Andy Weir"), registryKey("The Last Algorithm", "Isabel Allende"));
});

test("memory repo: the ten documented examples are seeded once and marked example", async () => {
  const repo = new MemoryRepo(exampleRows());
  assert.equal(await repo.registryCount(), 10);
  assert.equal(await repo.seedExamples(exampleRows()), 0);
  const rows = await repo.registry();
  assert.ok(rows.every((r) => r.example && r.count === 1));
});

test("memory repo: logging inserts, then increments the same title; a new title adds a row", async () => {
  const repo = new MemoryRepo();
  const a = await repo.logInvented({ runId: "r1", title: "Tidewater Dreams", author: "Isabel Allende", seeds: [{ name: "Pedro Páramo", kind: "book" }], recovered: [] });
  const b = await repo.logInvented({ runId: "r2", title: "tidewater dreams", author: "Allende, Isabel", seeds: [], recovered: [{ isbn13: "9780000000001", title: "A held book" }] });
  const c = await repo.logInvented({ title: "Salt and Honey", author: "", seeds: [], recovered: [] });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(b.row.count, 2);
  assert.equal(b.row.seeds[0].name, "Pedro Páramo", "older seeds survive an empty log");
  assert.equal(b.row.lastRunId, "r2");
  assert.equal(c.total, 2);
});

test("runs: the stored request is the redacted one and the last-request lookup finds it", async () => {
  const repo = new MemoryRepo();
  await repo.upsertRun({ id: "r1", title: "X", author: "Y", verdictKind: "no_record", checked: 3, failed: [] });
  await repo.upsertRun({ id: "r1", mode: "sample", request: { provider: "sample", calls: [{ name: "sample-pick", url: "sample://recommend", params: {} }] } });
  const run = await repo.getRun("r1");
  assert.equal(run?.title, "X");
  assert.equal(run?.mode, "sample");
  const last = await repo.lastRequest();
  assert.equal(last?.runId, "r1");
  assert.ok(!JSON.stringify(last).includes("X-Api-Key"));
});

test("routes: log then registry count and last request through the process-wide repo", async () => {
  const headers = { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" };
  const before = (await (await registry(new Request("http://x/api/registry?count=1"))).json()) as { count: number };
  const title = "Route Test " + Math.random().toString(36).slice(2, 8);
  const r1 = await log(new Request("http://x/api/log", { method: "POST", headers, body: JSON.stringify({ runId: "run-a", title, author: "Nobody", seeds: [{ name: "Dune", kind: "film" }], recovered: [] }) }));
  const j1 = (await r1.json()) as { count: number; timesLogged: number; created: boolean };
  assert.equal(j1.created, true);
  assert.equal(j1.timesLogged, 1);
  assert.equal(j1.count, before.count + 1);
  const r2 = await log(new Request("http://x/api/log", { method: "POST", headers, body: JSON.stringify({ title, author: "nobody" }) }));
  const j2 = (await r2.json()) as { count: number; timesLogged: number };
  assert.equal(j2.timesLogged, 2);
  assert.equal(j2.count, before.count + 1);
  const empty = await log(new Request("http://x/api/log", { method: "POST", headers, body: JSON.stringify({ title: "  " }) }));
  assert.equal(empty.status, 400);
  const none = await lastRequest(new Request("http://x/api/request/last?runId=never"));
  assert.equal(none.status, 404);
});
