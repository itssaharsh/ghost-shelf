// Resolve Open Library cover ids for the demo collection once (build time), so the app never fetches covers by ISBN at request time.
// Usage: node scripts/fetch-covers.mjs [--editions]   -> data/covers.json {isbn13: cover_i}
// Pass 1 (search API, 40 ISBNs a call): the work's cover, any edition. Pass 2 (--editions, /isbn/<isbn>.json, one call each,
// about 2 a second): the exact edition's cover where one exists, so an English title does not get a translated jacket.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const col = JSON.parse(readFileSync("data/collection.json", "utf8"));
const isbns = col.items.map((i) => i.isbn13);
const editions = process.argv.includes("--editions");
const prev = existsSync("data/covers.json") ? JSON.parse(readFileSync("data/covers.json", "utf8")) : { covers: {} };
const covers = editions ? { ...(prev.covers ?? {}) } : {};
const UA = "GhostShelf/0.1 (hackathon demo; cover ids resolved once at build time)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BATCH = 40;

for (let i = 0; i < isbns.length && !editions; i += BATCH) {
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
let editionHits = prev.editionCovers ?? 0;
if (editions) {
  const queue = [...isbns];
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const isbn = queue.shift();
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { headers: { "user-agent": UA, accept: "application/json" }, redirect: "follow" });
          if (res.status === 429 || res.status === 403) { await sleep(15000 * (attempt + 1)); continue; }
          if (res.status === 404) break;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ed = await res.json();
          const id = (ed.covers ?? []).find((c) => typeof c === "number" && c > 0);
          if (id) { if (covers[isbn] !== id) editionHits++; covers[isbn] = id; }
          break;
        } catch (err) {
          await sleep(3000);
        }
      }
      done++;
      if (done % 100 === 0) { process.stdout.write(`editions ${done}/${isbns.length} edition covers=${editionHits} total=${Object.keys(covers).length}\n`); writeFileSync("data/covers.json", JSON.stringify({ ...prev, fetched: new Date().toISOString(), count: Object.keys(covers).length, of: isbns.length, editionCovers: editionHits, covers })); }
      await sleep(450);
    }
  };
  await Promise.all([worker(), worker()]);
}
writeFileSync("data/covers.json", JSON.stringify({ source: "https://openlibrary.org/search.json (isbn query, cover_i); /isbn/<isbn>.json for edition covers", fetched: new Date().toISOString(), count: Object.keys(covers).length, of: isbns.length, editionCovers: editionHits, covers }));
console.log(`wrote data/covers.json: ${Object.keys(covers).length} of ${isbns.length} (${editionHits} edition-level)`);
