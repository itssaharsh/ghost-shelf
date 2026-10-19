import { makeQlooClient } from "@/lib/qloo";
import { recover } from "@/lib/recover";
import { clientKey, limiterFor } from "@/lib/ratelimit";
import { rememberRequest } from "@/lib/runs";
import type { Seed } from "@/lib/schemas";

const KINDS = new Set(["film", "band", "artist", "author", "book", "tv", "other"]);

export async function POST(request: Request) {
  if (!limiterFor("recover").allow(clientKey(request))) {
    return Response.json({ error: "Too many requests; try again in a minute" }, { status: 429 });
  }
  let body: { runId?: unknown; seeds?: unknown; excludeIsbns?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }
  const runId = typeof body.runId === "string" && body.runId.length <= 64 ? body.runId : crypto.randomUUID();
  const rawSeeds = Array.isArray(body.seeds) ? body.seeds.slice(0, 5) : [];
  const seeds: Seed[] = [];
  for (const s of rawSeeds) {
    if (!s || typeof s !== "object") continue;
    const name = String((s as { name?: unknown }).name ?? "").trim().slice(0, 100);
    const kindRaw = String((s as { kind?: unknown }).kind ?? "other");
    if (!name) continue;
    seeds.push({ name, kind: (KINDS.has(kindRaw) ? kindRaw : "other") as Seed["kind"] });
  }
  const excludeIsbns = Array.isArray(body.excludeIsbns) ? body.excludeIsbns.filter((x) => typeof x === "string").slice(0, 20) : [];
  const result = await recover({ runId, seeds, excludeIsbns }, makeQlooClient());
  if (result.request) rememberRequest(runId, result.request);
  return Response.json(result);
}
