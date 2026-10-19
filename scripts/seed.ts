// Seeds the registry with the ten documented invented titles (marked example). Safe to re-run.
import { getRepo } from "../src/db";
import { exampleRows } from "../src/db/repo";

async function main() {
  const repo = getRepo();
  const n = await repo.seedExamples(exampleRows());
  console.log(`${repo.mode}: ${n} example rows inserted, ${await repo.registryCount()} in the registry`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
