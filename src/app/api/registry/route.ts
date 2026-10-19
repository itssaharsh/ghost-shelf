// The invented-title registry. ?count=1 answers with the size only (the top bar badge).
import { getRepo } from "@/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repo = getRepo();
  if (url.searchParams.get("count") === "1") return Response.json({ count: await repo.registryCount(), storage: repo.mode });
  const rows = await repo.registry();
  return Response.json({ count: rows.length, storage: repo.mode, rows });
}
