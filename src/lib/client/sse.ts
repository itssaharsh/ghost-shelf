"use client";
import type { CheckEvent } from "../schemas";

/** Opens the check stream and calls onEvent for each server-sent event; returns a stop function. */
export function openCheckStream(q: { title: string; author: string }, onEvent: (e: CheckEvent) => void, onError: (message: string) => void): () => void {
  const p = new URLSearchParams({ title: q.title, author: q.author });
  const es = new EventSource(`/api/check?${p}`);
  const handle = (ev: MessageEvent) => {
    try {
      onEvent(JSON.parse(ev.data) as CheckEvent);
    } catch {
      /* ignore a malformed frame */
    }
  };
  es.addEventListener("start", handle);
  es.addEventListener("source", handle);
  es.addEventListener("verdict", (ev) => {
    handle(ev as MessageEvent);
    es.close();
  });
  es.addEventListener("error", (ev) => {
    const data = (ev as MessageEvent).data;
    if (data) {
      try {
        onError(JSON.parse(data).message ?? "check failed");
      } catch {
        onError("check failed");
      }
    } else if (es.readyState === EventSource.CLOSED) {
      onError("The check stream closed early");
    }
    es.close();
  });
  return () => es.close();
}
