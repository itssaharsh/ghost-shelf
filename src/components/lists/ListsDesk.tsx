"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Book } from "@/components/desk/Shelf";
import { draftEmail } from "@/lib/lists-draft";
import type { ListRequest } from "@/lib/lists";
import type { RecoverResult } from "@/lib/schemas";

const SAMPLE: ListRequest = {
  liked: "Project Hail Mary (Andy Weir), The Martian (Andy Weir), Station Eleven (Emily St. John Mandel)",
  disliked: "Ready Player One (Ernest Cline)",
  avoid: "horror, graphic novel",
  format: "print",
  count: 8,
};

type Status = "idle" | "running" | "ready" | "approved" | "error";

export function ListsDesk({ qlooConfigured }: { qlooConfigured: boolean }) {
  const [form, setForm] = useState<ListRequest>(SAMPLE);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<RecoverResult | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isSample = JSON.stringify(form) === JSON.stringify(SAMPLE);
  const books = (result?.books ?? []).filter((b) => !removed.has(b.isbn13));

  const build = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.liked.trim()) {
      setError("Name at least one book or author they liked");
      return;
    }
    setError(null);
    setStatus("running");
    setRemoved(new Set());
    setCopied(false);
    try {
      const res = await fetch("/api/lists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't build the list");
      const json = (await res.json()) as RecoverResult;
      setResult(json);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach the taste graph. The form is unchanged.");
      setStatus("error");
    }
  };

  const draft = result ? draftEmail(form, books, result.mode) : "";
  const field = "w-full px-3 py-2 border border-line-input rounded-md text-[16px] sm:text-[15px] bg-canvas";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <form onSubmit={build} className="lg:col-span-5 flex flex-col gap-4" aria-label="Reading-list request">
        <p className="m-0 text-[13px] text-ink-muted">{isSample ? "Sample form (fictional patron)" : "Edited form"}</p>
        <label className="flex flex-col gap-1 text-[13px] text-ink-muted">
          Recent books they liked
          <textarea value={form.liked} onChange={(e) => setForm({ ...form, liked: e.target.value })} rows={3} className={field} placeholder="Title (Author), Title (Author)" maxLength={600} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-muted">
          Didn&rsquo;t like
          <input value={form.disliked} onChange={(e) => setForm({ ...form, disliked: e.target.value })} className={field} maxLength={600} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-muted">
          Avoid
          <input value={form.avoid} onChange={(e) => setForm({ ...form, avoid: e.target.value })} className={field} placeholder="horror, graphic novel" maxLength={300} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[13px] text-ink-muted">
            Format
            <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} className={field}>
              <option value="print">Print (the demo collection is print only)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-muted">
            How many
            <select value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} className={field}>
              {[5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!form.liked.trim() && <p className="m-0 text-[13px] text-ink-muted">a book or an author they liked is enough to start</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <button type="submit" aria-disabled={status === "running" || undefined} className={`h-11 px-4 rounded-md font-display font-bold text-[15px] ${status === "running" ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink hover:bg-line"}`}>
            {status === "running" ? "Building…" : "Build the list"}
          </button>
          {error && <span className="text-[14px] text-danger">{error}</span>}
        </div>
      </form>

      <section className="lg:col-span-7 flex flex-col gap-3" aria-label="The list">
        <h2 className="m-0 font-sans font-semibold text-[17px]">{status === "approved" ? "Approved list" : "Held titles for the list"}</h2>
        <div className="bg-surface-sunken px-4 sm:px-5 pt-7 pb-5 border-b-[6px] border-shelf-edge min-h-[300px]" aria-live="polite" aria-busy={status === "running" || undefined}>
          {status === "idle" && <p className="m-0 text-[15px] text-ink-muted max-w-[40ch]">Build the list to see five to ten held books, each with the reason it fits.</p>}
          {status === "running" && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="sk w-[80px] min-[400px]:w-[96px] aspect-[2/3] border border-line rounded-sm" aria-hidden="true" />
              ))}
            </div>
          )}
          {status === "error" && <p className="m-0 text-[15px]">{error ?? "Couldn't reach the taste graph."} The form is unchanged.</p>}
          {(status === "ready" || status === "approved") && result && (
            <>
              {books.length === 0 ? (
                <p className="m-0 text-[15px]">Nothing left on the list. Build it again or loosen what to avoid.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5" key={result.runId}>
                  {books.map((b, i) => (
                    <Book key={b.isbn13} book={b} index={i} held={false} onRemove={status === "ready" ? () => setRemoved(new Set([...removed, b.isbn13])) : undefined} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {result && <p className="m-0 text-[13px] text-ink-muted">{result.mode === "qloo" ? "Books ranked by Qloo, a taste database, limited to what the demo library holds." : result.modeNote}</p>}
        {status === "ready" && books.length > 0 && (
          <button type="button" onClick={() => setStatus("approved")} className="self-start h-11 px-4 rounded-md font-display font-bold text-[15px] bg-accent text-accent-ink hover:bg-[var(--accent-hover)]">
            Approve list
          </button>
        )}
        {status === "approved" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-display font-bold text-[13px] uppercase tracking-[0.08em]">Draft only: not sent</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(draft).then(() => {
                    setCopied(true);
                    toast("Draft copied");
                  }).catch(() => {});
                }}
                className="h-8 px-3 rounded-md bg-surface-2 font-display font-bold text-[13px]"
              >
                {copied ? "Copied" : "Copy draft"}
              </button>
              <button type="button" onClick={() => setStatus("ready")} className="text-[13px] text-ink-muted underline underline-offset-2">
                Edit the list
              </button>
            </div>
            <pre className="m-0 whitespace-pre-wrap font-sans text-[15px] leading-[1.5] bg-card-stock border border-line rounded-md p-4">{draft}</pre>
            {!qlooConfigured && result?.mode !== "qloo" && <p className="m-0 text-[13px] text-ink-muted">Reasons join the draft once the list is ranked by Qloo; in sample mode the titles stand alone.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
