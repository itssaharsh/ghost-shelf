"use client";
import { motion } from "motion/react";
import { useState } from "react";
import type { CollectionItem } from "@/lib/collection";
import type { RecoveredBook, Seed, Verdict } from "@/lib/schemas";
import type { ShelfState } from "./fixtures";

const SPINE = ["bg-data-1", "bg-data-2", "bg-data-3"];
const COVER_W = "w-[80px] min-[400px]:w-[96px] lg:w-[120px]";

export function Shelf({ phase, verdict, shelf, heldItem, heldCoverUrl, seeds, held, onRetry }: { phase: "idle" | "checking" | "checked"; verdict: Verdict | null; shelf: ShelfState; heldItem?: CollectionItem; heldCoverUrl?: string | null; seeds: Seed[]; held: boolean; onRetry: () => void }) {
  const heading = heldItem ? "The book they asked for" : verdict?.kind === "not_held" ? "Nothing to recover: the book is real" : "Three held books they'd take instead";
  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 font-sans font-semibold text-[17px]">{heading}</h2>
      <div className="bg-surface-sunken px-4 sm:px-5 pt-7 pb-5 border-b-[6px] border-shelf-edge min-h-[300px] overflow-hidden" aria-live="polite" aria-busy={shelf.status === "loading" || undefined}>
        {heldItem ? (
          <div className="grid grid-cols-3 gap-3 sm:gap-5">
            <Book book={{ isbn13: heldItem.isbn13, title: heldItem.title, author: heldItem.author, year: heldItem.year, publisher: heldItem.publisher, checkouts2025: heldItem.checkouts2025, reason: "the title they asked for", coverUrl: heldCoverUrl ?? null }} index={0} held={held} />
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
          <div className="grid grid-cols-3 gap-3 sm:gap-5" key={shelf.result?.runId}>
            {shelf.result!.books.map((b, i) => (
              <Book key={b.isbn13} book={b} index={i} held={held} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Placeholders({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className={`sk ${COVER_W} aspect-[2/3] border border-line rounded-sm`} aria-hidden="true" />
          {i === 0 && <span className="text-[13px] text-ink-muted">{label}</span>}
        </div>
      ))}
    </div>
  );
}

/** One held book: cover (or its spine), the hold tab once placed, and the reason it was chosen. T-03 on arrival, T-04 on hold. */
export function Book({ book, index, held }: { book: RecoveredBook; index: number; held: boolean }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showSpine = !book.coverUrl || coverFailed;
  return (
    <motion.figure initial={{ x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: "spring", visualDuration: 0.35, bounce: 0.1, delay: index * 0.06 }} className="m-0 flex flex-col gap-2 min-w-0">
      <div className={`relative ${COVER_W}`}>
        {held && (
          <span className="hold-tab absolute -top-5 left-1.5 h-7 w-[72px] max-w-[90%] bg-card-stock border border-line rounded-t-sm text-[11px] font-display font-bold px-1.5 leading-[26px] whitespace-nowrap overflow-hidden" style={{ animationDelay: `${index * 80}ms` }} aria-label="Hold placed in the demo holds list">
            On hold
          </span>
        )}
        {showSpine ? (
          <div className={`${SPINE[index % 3]} relative z-10 w-full aspect-[2/3] border border-line shadow-[var(--shadow-raised)] flex items-end p-2`} role="img" aria-label={`Cover not available: ${book.title}`}>
            <span className="font-display font-bold text-[12px] lg:text-[13px] text-canvas [writing-mode:vertical-rl] rotate-180 overflow-hidden text-ellipsis max-h-full">{book.title}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.coverUrl!} alt={`Cover of ${book.title}`} width={120} height={180} onError={() => setCoverFailed(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth < 10) setCoverFailed(true); }} className="relative z-10 w-full aspect-[2/3] object-cover border border-line shadow-[var(--shadow-raised)] bg-card-stock" loading="eager" fetchPriority={index === 0 ? "high" : "auto"} decoding="async" />
        )}
      </div>
      <motion.figcaption initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, delay: index * 0.06 + 0.15 }} className="text-[13px] sm:text-[14px] leading-[1.4] min-w-0">
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
      </motion.figcaption>
    </motion.figure>
  );
}
