// The last redacted provider request per run, kept in memory until T05 moves it to the run row in Postgres.
import type { RedactedRequest } from "./schemas";

const lastRequests = new Map<string, RedactedRequest>();
const ORDER: string[] = [];
const MAX = 200;

export function rememberRequest(runId: string, req: RedactedRequest): void {
  if (!lastRequests.has(runId)) ORDER.push(runId);
  lastRequests.set(runId, req);
  while (ORDER.length > MAX) lastRequests.delete(ORDER.shift()!);
}

export function lastRequest(runId: string): RedactedRequest | undefined {
  return lastRequests.get(runId);
}
