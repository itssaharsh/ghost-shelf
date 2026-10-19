// The last provider request as stored: redacted at write time, so it never carries the key. ?runId= picks one run.
import { getRepo } from "@/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId")?.slice(0, 64) || undefined;
  const last = await getRepo().lastRequest(runId);
  if (!last) return Response.json({ error: "No request stored yet" }, { status: 404 });
  return Response.json(last);
}
