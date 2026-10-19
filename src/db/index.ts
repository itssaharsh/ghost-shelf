// One repository per process. Postgres when DATABASE_URL is set, else memory (labelled in the UI; resets on deploy).
import { MemoryRepo } from "./memory";
import { PostgresRepo } from "./postgres";
import { exampleRows, type Repo } from "./repo";

declare global {
  var __ghostShelfRepo: Repo | undefined;
}

export type StorageMode = "memory" | "postgres";

export function storageMode(env: NodeJS.ProcessEnv = process.env): StorageMode {
  return env.DATABASE_URL ? "postgres" : "memory";
}

export function getRepo(): Repo {
  if (!globalThis.__ghostShelfRepo) {
    const url = process.env.DATABASE_URL;
    globalThis.__ghostShelfRepo = url ? new PostgresRepo(url, exampleRows()) : new MemoryRepo(exampleRows());
  }
  return globalThis.__ghostShelfRepo;
}

export type { Repo, RegistryRow, Hold, StoredRun } from "./repo";
