// Reading list: the form -> seeds, excludes and avoid words -> five to ten held titles with reasons. Nothing is sent anywhere.
import { getRepo } from "@/db";
import { makeQlooClient } from "@/lib/qloo";
import { dislikedToExcludes, parseLiked, parseList, type ListRequest } from "@/lib/lists";
import { clientKey, limiterFor } from "@/lib/ratelimit";
import { recover } from "@/lib/recover";

export async function POST(request: Request) {
  if (!limiterFor("lists").allow(clientKey(request))) return Response.json({ error: "Too many requests; try again in a minute" }, { status: 429 });
  let body: Partial<ListRequest>;
  try {
    body = (await request.json()) as Partial<ListRequest>;
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }
  const liked = String(body.liked ?? "").slice(0, 600);
  const seeds = parseLiked(liked);
  if (seeds.length === 0) return Response.json({ error: "Name at least one book or author they liked" }, { status: 400 });
  const disliked = parseList(String(body.disliked ?? "").slice(0, 600));
  const avoid = parseList(String(body.avoid ?? "").slice(0, 300));
  const count = Math.max(5, Math.min(10, Number(body.count) || 8));
  const runId = `list-${crypto.randomUUID()}`;
  const repo = getRepo();
  const entityMap = await repo.entityMap();
  const result = await recover({ runId, seeds, excludeIsbns: dislikedToExcludes(disliked), avoid, count }, makeQlooClient(), { ...(entityMap.size ? { entityMap } : {}), cache: repo });
  return Response.json({ ...result, requested: { liked, disliked, avoid, format: String(body.format ?? "print").slice(0, 40), count } });
}
