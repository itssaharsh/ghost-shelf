// Builds the holdings map (ISBN-13 -> Qloo entity id) for the demo collection, once, with the hackathon key.
// Run: npm run map:build [limit]   (QLOO_API_KEY required; DATABASE_URL for a persistent map, else a dry run in memory)
// The map lives in the database only: no Qloo response data is written to the repository.
import { getRepo } from "../src/db";
import { collection } from "../src/lib/collection";
import { normalizeTitle, sameAuthor } from "../src/lib/normalize";
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
  
  for (const it of items.slice(0, limit)) {
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
    const pick =
      results.find((r) => JSON.stringify(r.properties ?? {}).includes(it.isbn13)) ??
      results.find((r) => normalizeTitle(r.name ?? "") === normalizeTitle(it.title) && (!authorOf(r) || sameAuthor(authorOf(r), it.author)));
    const id = pick?.entity_id ?? pick?.id;
    if (id) {
      batch.push({ isbn13: it.isbn13, entityId: id, name: pick?.name });
      found++;
    } else unmatched++;
    if (batch.length >= 100) {
      await repo.setEntityMap(batch);
      batch = [];
      process.stdout.write(`${found + unmatched}/${Math.min(limit, items.length)} matched=${found} unmatched=${unmatched}\n`);
    }
    await sleep(120);
  }
  if (batch.length) await repo.setEntityMap(batch);
  console.log(`${repo.mode}: ${found} matched, ${unmatched} unmatched, ${existing.size + found} in the map`);
  
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
