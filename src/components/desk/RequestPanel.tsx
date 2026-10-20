"use client";
import { useEffect, useRef, useState } from "react";
import type { RedactedRequest } from "@/lib/schemas";

export function RequestPanel({ request, mode, onClose, onCopied }: { request?: RedactedRequest; mode?: "qloo" | "sample"; onClose: () => void; onCopied?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    ref.current?.focus(); // once, when the panel opens; never again while the desk re-renders behind it
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const curl = request
    ? request.calls
        .filter((c) => c.url.startsWith("http"))
        .map((c) => `curl -H 'X-Api-Key: $QLOO_API_KEY' '${c.url}?${new URLSearchParams(c.params)}'`)
        .join("\n")
    : "";

  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="The Qloo request" className="panel-enter fixed inset-x-0 bottom-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[380px] max-h-[70dvh] lg:max-h-none overflow-auto bg-surface-1 border-t lg:border-t-0 lg:border-l border-line rounded-t-lg lg:rounded-none shadow-[var(--shadow-overlay)] p-5 z-20 outline-none">
      <div className="flex items-start justify-between gap-3">
        <h2 className="m-0 font-display font-bold text-[13px] uppercase tracking-[0.08em]">The Qloo request</h2>
        <button type="button" onClick={onClose} className="text-[13px] text-ink-muted underline underline-offset-2">
          Close
        </button>
      </div>
      {!request ? (
        <p className="text-[15px] mt-3">Run a check first.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4 text-[13px]">
          {mode === "sample" && <p className="m-0 text-ink-muted">{request.note ?? "Sample mode: no request reached Qloo. The calls below are what the live client sends once the key is active."}</p>}
          {request.note && mode !== "sample" && <p className="m-0 text-ink-muted">{request.note}</p>}
          {typeof request.holdingsChunks === "number" && request.holdingsChunks > 0 && <p className="m-0">Holdings gate: {request.holdingsChunks} chunks of held titles sent as filter.results.entities.</p>}
          <ol className="m-0 pl-4 flex flex-col gap-3">
            {request.calls.map((c, i) => (
              <li key={i}>
                <div className="font-display">
                  {c.name}
                  {typeof c.status === "number" ? ` · ${c.status}` : ""}
                  {typeof c.ms === "number" && c.ms > 0 ? ` · ${c.ms} ms` : ""}
                </div>
                <div className="font-display text-ink-muted break-all">{c.url}</div>
                {c.error && <div className="font-display text-danger break-all">{c.error}</div>}
                <dl className="m-0 mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 font-display">
                  {Object.entries(c.params).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-ink-muted">{k}</dt>
                      <dd className="m-0 break-all">{v.length > 160 ? `${v.slice(0, 160)}… (${v.length} chars)` : v}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
          {request.responseExcerpt != null && (
            <details>
              <summary className="cursor-pointer">Response excerpt (first three entities)</summary>
              <pre className="font-display text-[12px] overflow-auto bg-canvas border border-line p-2 mt-2 max-h-[240px]">{JSON.stringify(request.responseExcerpt, null, 1)}</pre>
            </details>
          )}
          {curl && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(curl).then(() => { setCopied(true); onCopied?.(); }).catch(() => {});
              }}
              className="self-start h-8 px-3 rounded-md bg-surface-2 font-display font-bold text-[13px]"
            >
              {copied ? "Copied" : "Copy as curl"}
            </button>
          )}
          <p className="m-0 text-ink-muted">The key travels in a header on the server and never appears here.</p>
        </div>
      )}
    </div>
  );
}
