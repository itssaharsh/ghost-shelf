import { getRepo } from "@/db";
import { runCheck } from "@/lib/check";
import { clientKey, limiterFor } from "@/lib/ratelimit";
import type { CheckEvent } from "@/lib/schemas";

// Reading request.url makes this handler run at request time under Cache Components; no segment config needed.
const MAX_TITLE = 200;

export async function GET(request: Request) {
  // each check fans out to two public APIs; 30 a minute per IP is a busy desk, not a crawler
  if (!limiterFor("check", 30).allow(clientKey(request))) return Response.json({ error: "Too many requests; try again in a minute" }, { status: 429 });
  const url = new URL(request.url);
  const title = (url.searchParams.get("title") ?? "").slice(0, MAX_TITLE).trim();
  const author = (url.searchParams.get("author") ?? "").slice(0, MAX_TITLE).trim();
  if (!title) return Response.json({ error: "Type the title they asked for" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: CheckEvent) => controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      try {
        const runId = crypto.randomUUID();
        const verdict = await runCheck({ title, author }, send, undefined, runId);
        await getRepo().upsertRun({ id: runId, title, author, verdictKind: verdict.kind, checked: verdict.checked, failed: verdict.failed });
      } catch (err) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : "check failed" })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
