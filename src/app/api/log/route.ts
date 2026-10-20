// Log an invented title: insert, or count the same title and author once more.
import { getRepo } from "@/db";
import { findHeld } from "@/lib/collection";
import { clientKey, limiterFor } from "@/lib/ratelimit";
import type { Seed } from "@/lib/schemas";

const KINDS = new Set(["film", "band", "artist", "author", "book", "tv", "other"]);

export async function POST(request: Request) {
  if (!limiterFor("log").allow(clientKey(request))) return Response.json({ error: "Too many requests; try again in a minute" }, { status: 429 });
  let body: { runId?: unknown; title?: unknown; author?: unknown; seeds?: unknown; recovered?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return Response.json({ error: "A title is required" }, { status: 400 });
  const author = typeof body.author === "string" ? body.author.trim().slice(0, 200) : "";
  const runId = typeof body.runId === "string" && body.runId.length <= 64 ? body.runId : undefined;
  const seeds: Seed[] = [];
  for (const s of Array.isArray(body.seeds) ? body.seeds.slice(0, 5) : []) {
    if (!s || typeof s !== "object") continue;
    const name = String((s as { name?: unknown }).name ?? "").trim().slice(0, 100);
    const kind = String((s as { kind?: unknown }).kind ?? "other");
    if (name) seeds.push({ name, kind: (KINDS.has(kind) ? kind : "other") as Seed["kind"] });
  }
  const recovered: { isbn13: string; title: string }[] = [];
  for (const r of Array.isArray(body.recovered) ? body.recovered.slice(0, 5) : []) {
    if (!r || typeof r !== "object") continue;
    const isbn13 = String((r as { isbn13?: unknown }).isbn13 ?? "").slice(0, 13);
    const t = String((r as { title?: unknown }).title ?? "").slice(0, 200);
    if (isbn13 && t) recovered.push({ isbn13, title: t });
  }
  const repo = getRepo();
  // only a title no source had a record for belongs in the registry
  const run = runId ? await repo.getRun(runId) : null;
  if (run && run.verdictKind !== "no_record") return Response.json({ error: "Only a title with no record in any source can be logged" }, { status: 409 });
  if (!run) {
    // no stored run: with a database that means no check happened; in memory mode (per instance) at least refuse a held title
    if (repo.mode === "postgres") return Response.json({ error: "Check the title first; only a run that found no record can be logged" }, { status: 409 });
    if (findHeld({ title, author })) return Response.json({ error: "That title is held here; it cannot be logged as invented" }, { status: 409 });
  }
  const { row, created, total } = await repo.logInvented({ runId, title, author, seeds, recovered });
  return Response.json({ count: total, timesLogged: row.count, created, id: row.id, storage: repo.mode });
}
