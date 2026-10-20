"use client";
import type { SourceName, Verdict } from "@/lib/schemas";
import { SOURCE_LABEL } from "@/lib/schemas";

export function PatronCard({ phase, verdict, error, title, author, sources, prior }: { phase: "idle" | "checking" | "checked"; verdict: Verdict | null; error: string | null; title: string; author: string; sources: SourceName[]; prior?: { count: number; firstSeen: string; example: boolean } | null }) {
  const label = (s: SourceName) => (s === "catalog" ? "our catalog" : SOURCE_LABEL[s]);
  if (phase === "checking" && !verdict) {
    return (
      <article className="bg-card-stock border border-line rounded-md px-7 py-6 flex flex-col gap-2.5" aria-live="polite">
        <h2 className="m-0 font-display font-bold text-[24px] tracking-[-0.01em] text-ink-muted">Checking three sources…</h2>
        <p className="m-0 text-[20px] leading-[1.45] text-ink-muted">{sources.map((s) => (s === "catalog" ? "Our catalog" : SOURCE_LABEL[s])).join(", ")}.</p>
      </article>
    );
  }
  if (!verdict) {
    return (
      <article className="bg-card-stock border border-line rounded-md px-7 py-6" aria-live="polite">
        <h2 className="m-0 font-display font-bold text-[24px]">{error ?? "Type a title and press Check."}</h2>
      </article>
    );
  }
  const failedNames = verdict.failed.map((s) => SOURCE_LABEL[s]);
  const checkedNames = sources.filter((s) => !verdict.failed.includes(s)).map(label);
  const base = "bg-card-stock border border-line rounded-md px-7 py-6 flex flex-col gap-2.5";
  const slipHead = (
    <p className="print-slip-head hidden m-0 text-[13px] text-ink-muted">
      Ghost Shelf · reference desk slip · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · asked for: {title}
      {author ? ` by ${author}` : ""}
    </p>
  );
  if (verdict.kind === "held" && verdict.heldItem) {
    const it = verdict.heldItem;
    return (
      <article className={base} aria-live="polite">
        {slipHead}
        <h2 className="m-0 font-display font-bold text-[24px] tracking-[-0.01em]">Exists, and we hold it.</h2>
        <p className="m-0 text-[20px] leading-[1.45]">
          {it.title} by {it.author}
          {it.year ? ` (${it.year})` : ""}, borrowed {it.checkouts2025.toLocaleString("en-US")} times here in 2025.
        </p>
        <PrintSlip />
      </article>
    );
  }
  if (verdict.kind === "not_held" && verdict.foundElsewhere) {
    const f = verdict.foundElsewhere;
    const q = new URLSearchParams({ q: `${title} ${author}` });
    return (
      <article className={base} aria-live="polite">
        {slipHead}
        <h2 className="m-0 font-display font-bold text-[24px] tracking-[-0.01em]">Exists; we don&rsquo;t hold it.</h2>
        <p className="m-0 text-[20px] leading-[1.45]">
          {SOURCE_LABEL[f.source]} lists {f.record.title}
          {f.record.author ? ` by ${f.record.author}` : ""}
          {f.record.year ? ` (${f.record.year})` : ""}.
        </p>
        <p className="m-0 text-[20px] leading-[1.45]">
          <a href={`https://www.worldcat.org/search?${q}`} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
            Request it by interlibrary loan ↗
          </a>
        </p>
        <PrintSlip />
      </article>
    );
  }
  if (verdict.kind === "unchecked") {
    return (
      <article className={base} aria-live="polite">
        <h2 className="m-0 font-display font-bold text-[24px] tracking-[-0.01em]">Couldn&rsquo;t check any source.</h2>
        <p className="m-0 text-[20px] leading-[1.45]">{sources.map((s) => (s === "catalog" ? "Our catalog" : SOURCE_LABEL[s])).join(", ").replace(/, ([^,]*)$/, " and $1")} did not answer. Try again in a moment.</p>
      </article>
    );
  }
  return (
    <article className={base} aria-live="polite">
      {slipHead}
      <h2 className="m-0 font-display font-bold text-[24px] tracking-[-0.01em]">
        No record in {verdict.checked} {verdict.checked === 1 ? "source" : "sources"}.
      </h2>
      <p className="m-0 text-[20px] leading-[1.45]">We checked: {checkedNames.join(", ")}.</p>
      {failedNames.length > 0 && <p className="m-0 text-[20px] leading-[1.45] text-ink-muted">{failedNames.join(" and ")} did not answer.</p>}
      {verdict.titleOnlyBy && <p className="m-0 text-[20px] leading-[1.45]">A book with this title exists by {verdict.titleOnlyBy}, not by this author.</p>}
      {prior && (
        <p className="m-0 text-[17px] leading-[1.45]">
          {prior.example ? "One of the ten titles a newspaper insert printed in May 2025. " : ""}
          {prior.count === 1 ? "Asked for once at this desk before" : `Asked for ${prior.count} times at this desk`}
          {prior.example ? "." : `; first logged ${new Date(prior.firstSeen).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`}
        </p>
      )}
      <p className="m-0 text-[20px] leading-[1.45] text-ink-muted">Recent and small-press titles may be missing.</p>
      <PrintSlip />
    </article>
  );
}

function PrintSlip() {
  return (
    <div className="no-print">
      <button type="button" onClick={() => window.print()} className="text-[15px] text-accent underline underline-offset-2">
        Print slip
      </button>
    </div>
  );
}
