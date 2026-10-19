"use client";
import { useState } from "react";
import type { Seed } from "@/lib/schemas";

const KIND_LABEL: Record<Seed["kind"], string> = { film: "film", band: "band", artist: "artist", author: "author", book: "book", tv: "TV show", other: "" };

export function SeedsRow({ seeds, onChange, unresolved }: { seeds: Seed[]; onChange: (s: Seed[]) => void; unresolved: string[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Seed["kind"]>("film");
  const add = () => {
    const n = name.trim();
    if (!n) return;
    onChange([...seeds, { name: n, kind }].slice(0, 5));
    setName("");
    setAdding(false);
  };
  return (
    <div className="flex items-center gap-2.5 flex-wrap text-[15px]" role="group" aria-label="What did they like">
      <span>What did they like?</span>
      {seeds.map((s, i) => {
        const unres = unresolved.includes(s.name);
        return (
          <span key={`${s.name}-${i}`} className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-md border ${unres ? "border-dashed border-line-input text-ink-muted" : "border-ink"}`} title={unres ? "not found in the taste graph" : undefined}>
            {s.name}
            {KIND_LABEL[s.kind] ? <span className="text-ink-muted">({KIND_LABEL[s.kind]})</span> : null}
            <button type="button" onClick={() => onChange(seeds.filter((_, j) => j !== i))} aria-label={`Remove ${s.name}`} className="ml-1 text-ink-muted hover:text-ink leading-none">
              ×
            </button>
          </span>
        );
      })}
      {adding ? (
        <form
          className="inline-flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="a film, a band, an author, a book" className="h-8 px-2 border border-line-input rounded-md text-[16px] sm:text-[15px] w-[220px]" maxLength={100} aria-label="Something they liked" />
          <select value={kind} onChange={(e) => setKind(e.target.value as Seed["kind"])} className="h-8 px-1 border border-line-input rounded-md text-[15px] bg-canvas" aria-label="Kind">
            <option value="film">film</option>
            <option value="band">band</option>
            <option value="artist">artist</option>
            <option value="author">author</option>
            <option value="book">book</option>
            <option value="tv">TV show</option>
          </select>
          <button type="submit" className="h-8 px-3 rounded-md bg-surface-2 text-ink font-display font-bold text-[13px]">
            Add
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-[13px] text-ink-muted underline underline-offset-2">
            cancel
          </button>
        </form>
      ) : (
        <>
          {seeds.length < 5 && (
            <button type="button" onClick={() => setAdding(true)} className="text-accent hover:underline underline-offset-2">
              + add
            </button>
          )}
          {seeds.length === 0 && <span className="text-[13px] text-ink-muted">a film, a band, an author, a book</span>}
        </>
      )}
    </div>
  );
}
