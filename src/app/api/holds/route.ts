// Reserve the recovered books for a run. Idempotent per run id: pressing twice never doubles the hold.
import { getRepo } from "@/db";
import { clientKey, limiterFor } from "@/lib/ratelimit";

const ISBN13 = /^97[89]\d{10}$/;

export async function POST(request: Request) {
  if (!limiterFor("holds").allow(clientKey(request))) return Response.json({ error: "Too many requests; try again in a minute" }, { status: 429 });
  let body: { runId?: unknown; isbns?: unknown; title?: unknown; author?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }
  const runId = typeof body.runId === "string" ? body.runId.trim().slice(0, 64) : "";
  const isbns = Array.isArray(body.isbns) ? body.isbns.filter((x): x is string => typeof x === "string" && ISBN13.test(x)).slice(0, 10) : [];
  if (!runId) return Response.json({ error: "A run id is required" }, { status: 400 });
  if (isbns.length === 0) return Response.json({ error: "Nothing to reserve" }, { status: 400 });
  const title = typeof body.title === "string" ? body.title.slice(0, 200) : "";
  const author = typeof body.author === "string" ? body.author.slice(0, 200) : "";
  const { created, hold } = await getRepo().placeHold({ runId, isbn13s: isbns, title, author });
  return Response.json({ written: hold.isbn13s.length, created, runId: hold.runId, isbns: hold.isbn13s, storage: getRepo().mode });
}
