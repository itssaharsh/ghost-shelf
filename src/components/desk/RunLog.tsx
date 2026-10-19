"use client";

export type RunLogLine = { at: number; text: string };

/** The agent's steps for this run, in order, with the second each landed. Plain text so a judge can read what the desk did and when. */
export function RunLog({ lines }: { lines: RunLogLine[] }) {
  if (lines.length === 0) return null;
  const t0 = lines[0].at;
  return (
    <details className="no-print text-[13px] group">
      <summary className="cursor-pointer text-ink-muted font-display select-none">
        Run log · {lines.length} {lines.length === 1 ? "step" : "steps"}
      </summary>
      <ol className="m-0 mt-2 pl-0 list-none font-display text-ink-muted flex flex-col gap-0.5 border-l border-line ml-1 pl-3">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-3">
            <span className="tnum shrink-0 w-[64px]">+{((l.at - t0) / 1000).toFixed(2)} s</span>
            <span className="text-ink">{l.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
