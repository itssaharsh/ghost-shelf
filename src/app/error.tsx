"use client";

/** The root error boundary: a thrown render keeps the top bar and offers a way back instead of a blank page. */
export default function DeskError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex-1 px-4 sm:px-8 lg:px-20 py-12 flex flex-col gap-3 max-w-[60ch]">
      <h1 className="m-0 font-display font-bold text-[24px]">Something broke on the desk.</h1>
      <p className="m-0 text-[17px] text-ink-muted">Nothing was reserved or logged by this. The checks and the card can run again.</p>
      <button type="button" onClick={reset} className="self-start h-11 px-4 rounded-md font-display font-bold text-[15px] bg-surface-2 text-ink hover:bg-line">
        Try again
      </button>
    </main>
  );
}
