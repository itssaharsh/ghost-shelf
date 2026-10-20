# Build state - ghost-shelf
Updated: 2026-10-19 | mode: hackathon | channel: direct | phase: 4-gates-and-takes

## Now
- Phase / current task: T14 final take recording (demo/storyboard.json against the live URL in Qloo mode); T15 submit check ready; T08 merged into T14
- Last good commit: see `git log -1`            Last good deploy: https://ghost-shelf.vercel.app (2026-10-20, Neon Postgres, live Qloo mode with the holdings map)

## What worked (with evidence IDs)
- Golden path and every ?state= at 1440/390/320 on the live URL (E0078); QA script: demo x3 with reset, offline injection, axe 0 violations (E0079)
- Foldcheck PASS at 1440x900 and 390x844 (E0074); smoke on /, /invented, /about, /lists, /api/registry (E0070); signed-out browser pass (E0056)
- Fresh-context review: 14 findings, 12 fixed with tests (reports/T12-review.md, T12-fixes.md); cold read of three stills (disposition in T12-fixes.md)
- Covers: 2,413 of 3,000 titles have an Open Library cover id, 865 edition-level (data/covers.json), served through /api/cover/<id>

## What failed (memory IDs) - do not retry without a new root cause
- F-0001 killing the npx wrapper pid leaves next-server holding the port (kill the listener from ss -ltnp)
- Google Books keyless answers 429 from shared hosts (ADR-0006: Internet Archive is the keyless third source)
- Open Library search's `editions` subfield returned empty for isbn queries; /isbn/<isbn>.json gives edition covers (slow, run once)

## Not tried yet / open questions
- Map coverage: 1,165 of 3,000 titles (849 fiction); unmatched titles cannot be recommended; a second pass with looser title matching could raise it

## Changes that need care (migrations applied, deploys, destructive ops)
- Neon connected 2026-10-19: schema pushed with drizzle-kit, ten example rows seeded; smoke rows removed
- GitHub repo itssaharsh/ghost-shelf is PUBLIC (2026-10-19)

## Final take
- demo/final.mp4 (after compose) with demo/script.md and demo/thumbnail; storyboard demo/storyboard.json; recorded in live Qloo mode on 2026-10-20

## Exact next step
- compose + qa the take (demo/), deploy the edition covers, then T15: `pb.py submit check --live https://ghost-shelf.vercel.app --readme README.md --description .prod-build/submission/devpost-description.md`, flip the repo public, confirm rules, hand the user the checklist
