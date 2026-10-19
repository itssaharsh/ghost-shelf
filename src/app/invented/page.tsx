import { connection } from "next/server";
import { Suspense } from "react";
import { getRepo, storageMode } from "@/db";
import type { RegistryRow } from "@/db";

export default function InventedPage() {
  return (
    <main className="flex-1 px-4 sm:px-8 lg:px-20 py-8 flex flex-col gap-5">
      <header className="flex flex-col gap-2 max-w-[70ch]">
        <h1 className="m-0 font-display font-bold text-[28px] tracking-[-0.01em]">Invented titles</h1>
        <p className="m-0 text-[17px] text-ink-muted">
          Titles patrons asked for that no source could find. Logged from the desk, counted once per title and author. Example entries: the ten invented titles printed in the Chicago Sun-Times insert of 18 May 2025 (as reported by CBS News). Counts are this demo&rsquo;s own.
          {storageMode() === "memory" ? " Records live in memory until the database is connected, so they reset on deploy." : ""}
        </p>
      </header>
      <Suspense fallback={<RowsSkeleton />}>
        <Rows />
      </Suspense>
    </main>
  );
}

async function Rows() {
  await connection();
  const rows = await getRepo().registry();
  if (rows.length === 0) return <p className="m-0 text-[17px]">Nothing logged yet.</p>;
  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label="Table, scrolls sideways on narrow screens">
      <table className="w-full border-collapse text-[15px] min-w-[640px]">
        <thead>
          <tr className="text-left font-display text-[13px] uppercase tracking-[0.08em] text-ink-muted border-b border-line">
            <th className="py-2 pr-4 font-bold">Title</th>
            <th className="py-2 pr-4 font-bold">Author given</th>
            <th className="py-2 pr-4 font-bold tnum">Asked</th>
            <th className="py-2 pr-4 font-bold">What they liked</th>
            <th className="py-2 pr-4 font-bold">Shown instead</th>
            <th className="py-2 pr-4 font-bold">Last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row }: { row: RegistryRow }) {
  return (
    <tr className="border-b border-line align-top">
      <td className="py-3 pr-4">
        <span className="font-display font-bold">{row.title}</span>
        {row.example && <span className="ml-2 text-[12px] font-display uppercase tracking-[0.08em] text-ink-muted border border-line rounded px-1.5 py-0.5">example</span>}
      </td>
      <td className="py-3 pr-4">{row.author || "—"}</td>
      <td className="py-3 pr-4 tnum">{row.count}×</td>
      <td className="py-3 pr-4 text-ink-muted">{row.seeds.length ? row.seeds.map((s) => `${s.name} (${s.kind})`).join(", ") : "—"}</td>
      <td className="py-3 pr-4 text-ink-muted">{row.recovered.length ? row.recovered.map((b) => b.title).join(", ") : "—"}</td>
      <td className="py-3 pr-4 text-ink-muted tnum whitespace-nowrap">{row.lastSeen.slice(0, 10)}</td>
    </tr>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading the registry">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="sk h-10 border border-line rounded-sm" />
      ))}
    </div>
  );
}
