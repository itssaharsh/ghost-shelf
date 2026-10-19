// A sliding-window limiter per key, in memory. Per server instance (Fluid Compute reuses instances); enough for a demo.
export type Limiter = { allow(key: string): boolean; reset(): void };

export function createLimiter(limit = 20, windowMs = 60_000, now: () => number = () => Date.now()): Limiter {
  const hits = new Map<string, number[]>();
  return {
    allow(key) {
      const t = now();
      const arr = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (arr.length >= limit) {
        hits.set(key, arr);
        return false;
      }
      arr.push(t);
      hits.set(key, arr);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}

const limiters = new Map<string, Limiter>();
/** Per process: on Fluid compute a warm instance serves many requests, so this bounds a burst, not a distributed flood. A shared store would be the next step. */
export function limiterFor(name: string, limit = 20, windowMs = 60_000): Limiter {
  let l = limiters.get(name);
  if (!l) {
    l = createLimiter(limit, windowMs);
    limiters.set(name, l);
  }
  return l;
}

export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}
