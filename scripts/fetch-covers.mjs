// Resolve Open Library cover ids for the demo collection once (build time), so the app never fetches covers by ISBN at request time.
// Usage: node scripts/fetch-covers.mjs   -> data/covers.json {isbn13: cover_i}
import { readFileSync, writeFileSync } from "node:fs";

const col = JSON.parse(readFileSync("data/collection.json", "utf8"));
const isbns = col.items.map((i) => i.isbn13);
const covers = {};
const UA = "GhostShelf/0.1 (hackathon demo; cover ids resolved once at build time)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BATCH = 40;

for (let i = 0; i < isbns.length; i += BATCH) {
  const batch = isbns.slice(i, i + BATCH);
  const set = new Set(batch);
  const url = `https://openlibrary.org/search.json?${new URLSearchParams({ q: `isbn:(${batch.join(" OR ")})`, fields: "isbn,cover_i", limit: "100" })}`;
  let docs = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
      if (res.status === 429) { await sleep(6000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      docs = (await res.json()).docs ?? [];
      break;
    } catch (err) {
      process.stderr.write(`batch ${i}: ${err.message}; retrying\n`);
      await sleep(3000);
    }
  }
  for (const d of docs) {
    if (!d.cover_i) continue;
    for (const x of d.isbn ?? []) if (set.has(x) && !covers[x]) covers[x] = d.cover_i;
  }
  process.stdout.write(`${Math.min(i + BATCH, isbns.length)}/${isbns.length} covers=${Object.keys(covers).length}\n`);
  await sleep(1200);
}
writeFileSync("data/covers.json", JSON.stringify({ source: "https://openlibrary.org/search.json (isbn query, cover_i)", fetched: new Date().toISOString(), count: Object.keys(covers).length, of: isbns.length, covers }));
console.log(`wrote data/covers.json: ${Object.keys(covers).length} of ${isbns.length}`);
