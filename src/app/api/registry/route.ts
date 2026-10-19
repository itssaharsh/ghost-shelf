// The invented-title registry. ?count=1 answers with the size only (the top bar badge).
import { getRepo } from "@/db";
import { clientKey, limiterFor } from "@/lib/ratelimit";

export async function GET(request: Request) {
  if (!limiterFor("read", 120).allow(clientKey(request))) return Response.json({ error: "Too many requests; try again in a minute" }, { status: 429 });
  const url = new URL(request.url);
  const repo = getRepo();
  if (url.searchParams.get("count") === "1") return Response.json({ count: await repo.registryCount(), storage: repo.mode });
  const rows = await repo.registry();
  return Response.json({ count: rows.length, storage: repo.mode, rows });
}
