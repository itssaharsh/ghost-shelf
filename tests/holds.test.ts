import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRepo } from "../src/db/memory";
import { POST as holds } from "../src/app/api/holds/route";

const post = (body: unknown, ip = "203.0.113.7") => holds(new Request("http://x/api/holds", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }));

test("holds: a second reserve for the same run returns the first hold, nothing doubles", async () => {
  const repo = new MemoryRepo();
  const a = await repo.placeHold({ runId: "r1", isbn13s: ["9780000000001", "9780000000002", "9780000000002"], title: "X", author: "Y" });
  const b = await repo.placeHold({ runId: "r1", isbn13s: ["9780000000003"], title: "X", author: "Y" });
  assert.equal(a.created, true);
  assert.deepEqual(a.hold.isbn13s, ["9780000000001", "9780000000002"]);
  assert.equal(b.created, false);
  assert.deepEqual(b.hold.isbn13s, a.hold.isbn13s);
});

test("holds route: validates, writes once per run, answers with the count the desk shows", async () => {
  const bad = await post({ runId: "", isbns: ["9780000000001"] });
  assert.equal(bad.status, 400);
  const none = await post({ runId: "r2", isbns: ["not-an-isbn"] });
  assert.equal(none.status, 400);
  const first = await post({ runId: "run-" + Math.random(), isbns: ["9780000000001", "9780000000002", "9780000000003"], title: "The Last Algorithm", author: "Andy Weir" });
  assert.equal(first.status, 200);
  const j1 = (await first.json()) as { written: number; created: boolean; runId: string };
  assert.equal(j1.written, 3);
  assert.equal(j1.created, true);
  const again = await post({ runId: j1.runId, isbns: ["9780000000009"], title: "The Last Algorithm", author: "Andy Weir" });
  const j2 = (await again.json()) as { written: number; created: boolean };
  assert.equal(j2.written, 3);
  assert.equal(j2.created, false);
});
