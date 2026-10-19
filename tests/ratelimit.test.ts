import test from "node:test";
import assert from "node:assert/strict";
import { createLimiter, clientKey } from "../src/lib/ratelimit";

test("20 requests a minute pass, the 21st is refused, and the window slides", () => {
  let t = 0;
  const l = createLimiter(20, 60_000, () => t);
  for (let i = 0; i < 20; i++) assert.ok(l.allow("ip1"));
  assert.ok(!l.allow("ip1"));
  assert.ok(l.allow("ip2"), "another key is independent");
  t = 61_000;
  assert.ok(l.allow("ip1"), "after the window the key is allowed again");
});

test("clientKey reads the first forwarded address", () => {
  const req = new Request("http://x/", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } });
  assert.equal(clientKey(req), "203.0.113.9");
  assert.equal(clientKey(new Request("http://x/")), "local");
});
