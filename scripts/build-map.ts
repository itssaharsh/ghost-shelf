// Builds the holdings map (ISBN-13 -> Qloo entity id) for the demo collection, once, with the hackathon key.
// Run: npm run map:build [limit]   (QLOO_API_KEY required; DATABASE_URL for a persistent map, else a dry run in memory)
// The map lives in the database only: no Qloo response data is written to the repository.
import { getRepo } from "../src/db";
import { collection } from "../src/lib/collection";
import { mainTitle, normalizeTitle, sameAuthor } from "../src/lib/normalize";
import { QLOO_BASE } from "../src/lib/qloo/types";

const key: string = process.env.QLOO_API_KEY?.trim() ?? "";
if (!key) {
  console.error("QLOO_API_KEY is not set");
  process.exit(2);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const repo = getRepo();
  const existing = await repo.entityMap();
  const items = collection.all().filter((i) => !existing.has(i.isbn13));
  const limit = Number(process.argv[2]) || items.length;
  let found = 0;
  let unmatched = 0;
  let batch: { isbn13: string; entityId: string; name?: string }[] = [];
  type Result = { entity_id?: string; id?: string; name?: string; properties?: Record<string, unknown> };
  
  const queue = items.slice(0, limit);
  const worker = async () => {
  for (;;) {
    const it = queue.shift();
    if (!it) return;
    const p = new URLSearchParams({ query: it.title, types: "urn:entity:book", take: "5" });
    let results: Result[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${QLOO_BASE}/search?${p}`, { headers: { "X-Api-Key": key, accept: "application/json" } });
      if (res.status === 429) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (!res.ok) break;
      results = ((await res.json()) as { results?: Result[] }).results ?? [];
      break;
    }
    const authorOf = (r: Result) => {
    const a = r.properties?.author ?? (r.properties?.authors as unknown[] | undefined)?.[0];
    return typeof a === "string" ? a : "";
  };
  const yearOf = (r: Result) => {
    const y = r.properties?.publication_year ?? String(r.properties?.publication_date ?? "").slice(0, 4);
    const n = Number(y);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  // the exact edition first; else the same title (subtitle dropped) whose year is within two of ours, when Qloo gives one
  const sameTitle = (r: Result) => normalizeTitle(r.name ?? "") === normalizeTitle(it.title) || mainTitle(r.name ?? "") === mainTitle(it.title);
  const pick =
    results.find((r) => JSON.stringify(r.properties ?? {}).includes(it.isbn13)) ??
    results.find((r) => sameTitle(r) && (!authorOf(r) || sameAuthor(authorOf(r), it.author)) && (yearOf(r) === undefined || it.year == null || Math.abs(yearOf(r)! - it.year) <= 2));
  const id = pick?.entity_id ?? pick?.id;
    if (id) {
      batch.push({ isbn13: it.isbn13, entityId: id, name: pick?.name });
      found++;
    } else unmatched++;
    if (batch.length >= 25) {
      const flush = batch; // swap before awaiting so another worker never pushes into a batch being written
      batch = [];
      await repo.setEntityMap(flush);
      process.stdout.write(`${found + unmatched}/${Math.min(limit, items.length)} matched=${found} unmatched=${unmatched}\n`);
    }
    if ((found + unmatched) % 100 === 0) process.stdout.write(`${found + unmatched}/${Math.min(limit, items.length)} matched=${found} unmatched=${unmatched}\n`);
    await sleep(60);
  }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (batch.length) await repo.setEntityMap(batch);
  console.log(`${repo.mode}: ${found} matched, ${unmatched} unmatched, ${existing.size + found} in the map`);
  
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
