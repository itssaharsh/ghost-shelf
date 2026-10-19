# T12: what the gates found and what changed

## Security checklist (self-run, 2026-10-19)
- No env, key or storage-state files tracked; no key-shaped strings in tracked files.
- Client bundle grep for `X-Api-Key` / `QLOO_API_KEY`: one hit, the literal `$QLOO_API_KEY` placeholder in the request panel's curl text. No key value anywhere; the live key is not set yet.
- `process.env` read only in server modules (qloo/index.ts, check.ts, db/index.ts, googlebooks.ts); the page passes booleans.
- Every route limited per IP (20/min writes, 30 checks, 120 reads, 240 covers), JSON parse guarded, sizes bounded. Limits are per instance (stated in code, README, ARCHITECTURE).
- Security headers added: nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy; verified on the live URL.
- Cover proxy fetches one fixed host with `^\d{1,12}$` ids; source URLs built with URLSearchParams on fixed hosts; Drizzle only, no string SQL from input.
- Anti-slop grep over UI copy and README: no hits.

## Fresh-context review (subagent, report in T12-review.md): disposition
1. two-edition title-only lookup -> fixed (collection.ts groups by author; test).
2. log/holds posted current fields, server never checked the run -> fixed (checkedRun sent; /api/log answers 409 when the run found the book; unknown run accepted because memory mode is per instance; test).
3. late recover answer overwrites a newer run -> fixed (runSeq guard).
4. archive any-creator counts as found -> fixed (needs ISBN or publisher without an author; test).
5. production has no DATABASE_URL -> open: needs the account owner to accept Neon's terms; UI labels memory mode; README says the live demo runs memory-backed until then.
6. holdings map never passed; build-map.ts missing; sequential chunks -> fixed (route passes the map when non-empty; scripts/build-map.ts written for T11; seeds and chunks run with bounded concurrency); README softened.
7. unchecked card hard-coded Google Books -> fixed (built from the sources prop).
8. disliked titles in avoid, substring matching -> fixed (whole-word regex; disliked excluded by ISBN only; test).
9. ensureSeeded caches a rejection -> fixed.
10. error frame forwards err.message -> fixed (fixed line; server-side log).
11. ISBN-10 ending in X -> fixed (test).
12. docs claims (in sequence, 20/min, retry on 5xx, error boundary) -> fixed in ARCHITECTURE.md and README; src/app/error.tsx added.
13. mid-stream drop leaves "checking" -> fixed (sse.ts reports every drop; Desk 12 s watchdog; offline injection passes in qa-demo.mjs).
14. test gaps -> partly covered (tests/review-fixes.test.ts: 1, 2, 4, 8, 11); PostgresRepo still untested against a database (no DATABASE_URL yet).

## Cold read of three stills (subagent): disposition
- Fabricated-looking latencies in the panel fixture -> removed (fixture calls carry no ms/status).
- Judge card overlapping the shelf heading -> fixed (in flow).
- Blank first cover -> fixed (spine shows until the cover loads; covers warmed after deploy; edition-level cover pass running).
- German jacket under an English title -> edition-level cover pass (scripts/fetch-covers.mjs --editions) in progress; falls back to the work cover.
- Dev-note caption -> reworded ("Holds and the log are kept for this demo session only.").
- No premise line -> added above the title row (sm and up).
- "Qloo key pending" everywhere -> true state until the key arrives (A-1); T11.

## prod-ui A8 gates
1. Cut pass: the preset dots' legend stays replaced by hidden prefixes; nothing on S1 outside §2.
2. Anti-slop: grep clean; cold read by a fresh subagent recorded above (named the product, the user and the differentiator; flagged the sample-mode wording as the main risk).
3. Accessibility: axe 0 violations at 1440 on /, /invented, /lists, /about; keyboard path exercised by qa-demo (Escape closes the panel, shortcuts work); 320 px with no sideways scroll on all 20 states.
4. Judge and demo: foldcheck PASS at 1440x900 and 390x844 on the live URL; golden path 3 clicks; reset three times; replay; ?record=1 checked.
