// After a deploy: run preset 1 once on the live URL and fetch its covers, so the first judge sees warm covers from the CDN.
const base = (process.argv[2] ?? "https://ghost-shelf.vercel.app").replace(/\/$/, "");
const presets = (await import("../data/presets.json", { with: { type: "json" } })).default.presets;
const p = presets[0];
const res = await fetch(`${base}/api/recover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: "warm", seeds: p.seeds }) });
const json = await res.json();
for (const b of json.books ?? []) {
  const t0 = Date.now();
  const r = await fetch(`${base}${b.coverUrl}`);
  console.log(`${r.status} ${Date.now() - t0} ms ${b.coverUrl} (${b.title})`);
}
