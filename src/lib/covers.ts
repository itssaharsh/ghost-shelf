// Covers by Open Library cover id, resolved once at build time (scripts/fetch-covers.mjs). Never by ISBN at request time: that lookup is rate-limited per IP.
import file from "../../data/covers.json";

const COVERS: Record<string, number> = (file as { covers?: Record<string, number> }).covers ?? {};

/** Same-origin proxy path (src/app/api/cover/[id]/route.ts); the page never calls Open Library for covers directly. */
export function coverUrl(isbn13: string): string | null {
  const id = COVERS[isbn13];
  return id ? `/api/cover/${id}` : null;
}

export const coverCount = Object.keys(COVERS).length;
