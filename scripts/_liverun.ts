import { makeQlooClient } from "../src/lib/qloo";
import { recover } from "../src/lib/recover";
import { presets } from "../src/lib/presets";
import { getRepo } from "../src/db";
async function main() {
  const map = await getRepo().entityMap();
  for (const p of presets.filter((x) => x.seeds.length).slice(0, 3)) {
    const t0 = Date.now();
    const r = await recover({ runId: "live-probe-" + p.id, seeds: p.seeds }, makeQlooClient(), map.size ? { entityMap: map } : {});
    console.log(`\n${p.title} <- ${p.seeds.map((s) => s.name).join(" + ")}  [${r.mode}] ${Date.now() - t0} ms, map ${map.size}, calls ${r.request?.calls.length}, chunks ${r.request?.holdingsChunks}`);
    console.log("  seeds:", r.seeds.map((s) => `${s.name}${s.canonical ? ` (${s.canonical})` : ""}`).join(", "), r.unresolved.length ? `unresolved: ${r.unresolved}` : "");
    for (const b of r.books) console.log(`  - ${b.title} / ${b.author} · affinity ${b.affinity?.toFixed(2)} · ${b.reason}`);
    if (!r.books.length) console.log("  (no held book among the top results)", r.modeNote);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
