"use client";
import { useState } from "react";
import type { CollectionItem } from "@/lib/collection";
import type { RecoverResult, RecoveredBook, Seed, Verdict } from "@/lib/schemas";

type ShelfState = { status: "idle" | "loading" | "ready" | "error"; result?: RecoverResult; error?: string };
const SPINE = ["bg-data-1", "bg-data-2", "bg-data-3"];

export function Shelf({ phase, verdict, shelf, heldItem, seeds, onRetry }: { phase: "idle" | "checking" | "checked"; verdict: Verdict | null; shelf: ShelfState; heldItem?: CollectionItem; seeds: Seed[]; onRetry: () => void }) {
  const heading = heldItem ? "The book they asked for" : verdict?.kind === "not_held" ? "Nothing to recover: the book is real" : "Three held books they'd take instead";
  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 font-sans font-semibold text-[17px]">{heading}</h2>
      <div className="bg-surface-sunken px-5 pt-6 pb-5 border-b-[6px] border-shelf-edge min-h-[300px]" aria-live="polite" aria-busy={shelf.status === "loading" || undefined}>
        {heldItem ? (
          <div className="grid grid-cols-3 gap-5">
            <Book book={{ isbn13: heldItem.isbn13, title: heldItem.title, author: heldItem.author, year: heldItem.year, publisher: heldItem.publisher, checkouts2025: heldItem.checkouts2025, reason: "the title they asked for", coverUrl: `https://covers.openlibrary.org/b/isbn/${heldItem.isbn13}-M.jpg` }} index={0} />
          </div>
        ) : verdict?.kind === "not_held" ? (
          <p className="m-0 text-[15px] text-ink-muted max-w-[32ch]">It exists, so the patron needs the book, not a substitute: request it by interlibrary loan from the card.</p>
        ) : phase !== "checked" || shelf.status === "idle" ? (
          <Placeholders label={phase === "checking" ? "waiting for the checks…" : ""} />
        ) : shelf.status === "loading" ? (
          <Placeholders label="finding held books…" />
        ) : shelf.status === "error" ? (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[15px]">{shelf.error ?? "Couldn't reach the taste graph."} The checks above still stand.</p>
            <button type="button" onClick={onRetry} className="self-start text-[15px] text-accent underline underline-offset-2">
              Retry
            </button>
          </div>
        ) : seeds.length === 0 ? (
          <p className="m-0 text-[17px] max-w-[34ch]">Nothing to recover from yet: ask what they liked about it.</p>
        ) : shelf.result && shelf.result.books.length === 0 ? (
          <p className="m-0 text-[15px] max-w-[36ch]">
            {shelf.result.seeds.length === 0 ? "None of what they named is in the taste graph yet. Try an author, a film or a band." : "None of the top matches is held here. Try another seed."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-5">
            {shelf.result!.books.map((b, i) => (
              <Book key={b.isbn13} book={b} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Placeholders({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-3 gap-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="sk w-[96px] lg:w-[120px] aspect-[2/3] border border-line rounded-sm" aria-hidden="true" />
          {i === 0 && <span className="text-[13px] text-ink-muted">{label}</span>}
        </div>
      ))}
    </div>
  );
}

export function Book({ book, index }: { book: RecoveredBook; index: number }) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <figure className="m-0 flex flex-col gap-2 min-w-0">
      {coverFailed ? (
        <div className={`${SPINE[index % 3]} w-[96px] lg:w-[120px] aspect-[2/3] border border-line shadow-[var(--shadow-raised)] flex items-end p-2.5`} role="img" aria-label={`Cover not available: ${book.title}`}>
          <span className="font-display font-bold text-[13px] text-canvas [writing-mode:vertical-rl] rotate-180 overflow-hidden text-ellipsis max-h-full">{book.title}</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.coverUrl} alt={`Cover of ${book.title}`} width={120} height={180} onError={() => setCoverFailed(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth < 10) setCoverFailed(true); }} className="w-[96px] lg:w-[120px] aspect-[2/3] object-cover border border-line shadow-[var(--shadow-raised)] bg-card-stock" loading="eager" />
      )}
      <figcaption className="text-[14px] leading-[1.4] min-w-0">
        <strong className="font-semibold">{book.title}</strong>
        <br />
        <span className="text-ink-muted">
          {book.author}
          {book.year ? ` · ${book.year}` : ""}
          {typeof book.checkouts2025 === "number" ? ` · borrowed ${book.checkouts2025.toLocaleString("en-US")}× in 2025` : ""}
        </span>
        <br />
        <span>{book.reason}</span>
        {typeof book.affinity === "number" && <span className="text-ink-muted tnum"> · match {book.affinity.toFixed(2)}, from Qloo</span>}
      </figcaption>
    </figure>
  );
}
