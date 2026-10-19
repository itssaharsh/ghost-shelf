// Cover proxy: covers by Open Library cover id, served same-origin with a long CDN cache.
// Older covers upstream redirect twice into archive.org zip files and take seconds; the CDN cache pays that once per cover.
const UPSTREAM = "https://covers.openlibrary.org/b/id/";
const MISS = { status: 404, headers: { "cache-control": "public, max-age=3600" } };
// A small in-process cache for warm instances and local runs; the CDN cache does the real work in production.
const MEM = new Map<string, { type: string; bytes: ArrayBuffer }>();
const MEM_MAX = 300;

export async function GET(_request: Request, ctx: RouteContext<"/api/cover/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id)) return new Response("bad id", { status: 400 });
  const hit = MEM.get(id);
  if (hit) return new Response(hit.bytes.slice(0), { headers: { "content-type": hit.type, "cache-control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400", "x-cover-source": "memory" } });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const up = await fetch(`${UPSTREAM}${id}-M.jpg`, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "GhostShelf/0.1 (cover proxy)", accept: "image/*" } });
    if (!up.ok) return new Response("no cover", MISS);
    const buf = await up.arrayBuffer();
    if (buf.byteLength < 1000) return new Response("no cover", MISS); // Open Library answers a blank 1x1 for a missing cover
    const type = up.headers.get("content-type") ?? "image/jpeg";
    if (MEM.size >= MEM_MAX) MEM.delete(MEM.keys().next().value as string);
    MEM.set(id, { type, bytes: buf });
    return new Response(buf, { headers: { "content-type": type, "cache-control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400", "x-cover-source": "openlibrary" } });
  } catch {
    return new Response("no cover", { status: 504, headers: { "cache-control": "no-store" } });
  } finally {
    clearTimeout(timer);
  }
}
