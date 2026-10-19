# Implementation contract - ghost-shelf
mode: hackathon | channel: direct | created: 2026-10-19
Upstream read: hackathon-idea/qloo-agentic-hackathon/ideas.json (Ghost Shelf entry), idea-package.md, reply.md; hackathon-idea/qloo-agentic-hackathon/UI-SPEC.md (prod-ui, Standard scope) with brand/; the Claude Design mockup (private link in UI-SPEC front matter).

## 1. Intent
- User and moment of use: a reference librarian at a public-library desk, on the desk computer, with a patron standing opposite who has asked for a book title a chatbot gave them. Second user, same tool: the readers'-advisory librarian clearing the form queue.
- What they can do: check the title against three sources with receipts; turn the screen to the patron with a plain card ("No record in 3 sources", with the caveat); take whatever the patron names (a film, a band, an author) and get three books the library holds that fit, with the reason each was chosen; reserve them; log the invented title to a shared list.
- What changes after they use it (before -> after): before, two to four hand searches and a verbal "I'm not seeing it" to a defensive patron; after, a printable record of the checks, three reserved real books with reasons, and the invented title logged so the next desk recognises it.

## 2. Scope
MUST (core product, main workflow, judged/required):
- M1 Title check against three sources in sequence with per-source result and elapsed time: the demo collection (a real public-domain slice of Seattle Public Library's 2025 checkouts), Open Library search, Google Books (title and author query).
- M2 The patron card with four states: no record in N sources (with the caveat "Recent and small-press titles may be missing"), exists and held, exists and not held, source failed (count drops, source named).
- M3 Recovery: seeds (a film, a band, a TV show, an author, a book) resolved with Qloo Search, then Qloo Insights for books with signal.interests.entities = the seeds, filter.results.entities = the demo collection (chunked), filter.exclude.entities, feature.explainability; three held titles with per-seed reasons and covers.
- M4 Reserve: writes three holds to the demo holds table; the button states the count and the outcome.
- M5 Log: writes the invented title to the registry; the top-bar count ticks; the registry page lists the ten documented Sun-Times phantoms as labelled example entries plus what judges log.
- M6 Presets: ten documented invented titles and two real ones (one held, one not held), one click each; free text for any title.
- M7 The Qloo request panel: the Search and Insights calls as sent (parameters, chunk count, explainability output), never the key.
- M8 Honest fallback when the Qloo key is absent or the call fails: the shelf shows "sample mode" results chosen by a deterministic non-Qloo rule from the demo collection, labelled on screen; the checks and the card still run live. (Required because the hackathon key is issued manually and may arrive days into the build.)
- M9 Live, externally hosted on Vercel, no sign-in, `?judge=1` card on by default on the demo deployment, `?record=1` recording mode, `?state=` for every designed state.
- M10 README first screen, LICENSE (MIT), `/about` landing layer with the copy block, live-vs-simulated table, sources, and the "How Qloo is used" and "What makes it Qloo-powered" sections the rules ledger points at.
SHOULD (materially improves the main workflow):
- S1 Reading lists (the readers'-advisory second mode): a form (likes, dislikes, avoid, format) to a held list of five to ten with reasons, approve, a draft email shown (not sent).
- S2 A printable slip for the patron (print stylesheet).
- S3 Replay of a recorded real run (`alt+shift+p`) once a real Qloo run has been recorded.
COULD (later; not in this build): a live catalog (ILS) integration; interlibrary-loan requests; multi-library registry accounts; a spoken-title normaliser via a model route.
WON'T now (hypothetical-future infrastructure, explicitly deferred): auth, tenants, billing, analytics, a vector store, queues, WorldCat (subscription-gated; a link out only).

## 3. Core journeys (smallest set that constitutes the product)
J1 Check and recover: librarian clicks a preset or types a title and author and presses Check -> three source drawers answer in sequence with result and time -> the patron card shows the branch (no record / held / not held / a source failed) -> if no record and seeds are present, Qloo returns three held books with reasons; covers load -> the librarian sees the shelf and the reasons.
J2 Reserve and log: librarian clicks "Reserve these 3 books" -> three holds are written -> the button reads "3 books reserved"; then "Log this invented title" -> the registry row is written -> the top-bar count ticks and the registry page shows it.
J3 Inspect (the technical judge): "Show the Qloo request" -> the panel shows the last Search and Insights requests with parameters and the chunk count, and the response excerpt with per-seed shares -> "Copy as curl" copies a redacted command.

## 4. Surfaces (only the necessary ones)
- S1 `/` the desk (J1, J2, J3); P1 the request panel; P2 the print slip (SHOULD).
- S2 `/invented` the registry.
- S3 `/lists` reading lists (SHOULD).
- S4 `/about` the landing layer.
- API: `GET /api/check?title=&author=` (SSE: one event per source), `POST /api/recover` (seeds, excludes) -> three books, `POST /api/holds`, `POST /api/log`, `GET /api/registry`, `GET /api/request/last` (the redacted last Qloo calls), `POST /api/lists` (SHOULD).

## 5. States per journey
| Journey | initial | loading | success | error | empty | partial | retry | disabled | permission-denied | offline/degraded |
|---|---|---|---|---|---|---|---|---|---|---|
| J1 | a finished run of preset 1 (never an empty panel) | drawers open as each source answers; "checking…"; shelf shimmer "finding held books…" | drawers answered, card shown, three covers with reasons | a source "did not answer" (card count drops, run continues); recovery "Couldn't reach the taste graph" + Retry, card stays | empty title: inline "Type the title they asked for" and focus; no seeds: "Nothing to recover from yet: ask what they liked about it." | one or two sources answered, third pending (drawer by drawer) | Retry on a failed drawer or on recovery | Check is aria-disabled while a run is in flight | n/a: no accounts | Qloo key absent or failing: sample mode, labelled; Open Library down: its drawer fails, others continue |
| J2 | buttons idle with the live count | "Reserving…" width locked; "Logging…" | "3 books reserved"; "Logged" and the count ticks | "Couldn't reserve them. Nothing was reserved." + Retry; "Couldn't log it" + Retry | shelf empty: Reserve stays focusable and says "Nothing to reserve yet" | one hold written then a failure: the message names how many were written | Retry re-sends the whole batch idempotently (run id) | during a request | n/a | database unreachable: the desk still checks and recovers; reserve and log report the failure |
| J3 | panel closed | — | the last run's calls | "Run a check first" when none | no run yet | — | — | — | n/a | key absent: the panel shows the sample-mode notice and the request that would have been sent |

## 6. Data
| Entity | Key fields | Relationships | Owner | Persistence | Source of truth | PII/retention |
|---|---|---|---|---|---|---|
| collection_item | isbn13 (pk), title, author, publisher, year, subjects, checkouts_2025, qloo_entity_id (nullable), cover_source | one per held title | demo library | Postgres (Neon) | derived once from the Seattle Public Library "Checkouts by Title" dataset (public domain), capped at the most-borrowed 2025 BOOK rows with ISBNs | none |
| run | id (pk), title, author, verdict (no_record/held/not_held), sources_json (name, result, ms), seeds_json, mode (qloo/sample), created_at | has holds, log | demo | Postgres | our DB | none (titles only) |
| hold | id, run_id, isbn13, created_at | belongs to run and collection_item | demo | Postgres | our DB | none |
| invented_title | id, title, claimed_author, first_logged, times_logged, produced_by (free text the patron said), recovered_into_json, example (bool) | — | demo (shared registry) | Postgres | our DB; the ten documented titles seeded from the CBS News report and marked example | none |
| qloo cache | request hash -> response, ttl | — | server only | in-process + Postgres table `qloo_cache` (private) | Qloo; never committed, never served raw to the browser | none |
| last request (per run) | redacted request params, response excerpt | belongs to run | server | on the run row | our DB | the key is never stored |

The collection map (isbn13 -> qloo_entity_id) is derived data from Qloo and lives only in the database and the server's cache, never in the repository (developer guide rule).

## 7. Interfaces
| Interface | Purpose | Contract file | Failure mode | Fallback |
|---|---|---|---|---|
| Browser -> `/api/check` (SSE) | the three checks | src/lib/schemas.ts#CheckEvent | a source times out (6 s) or errors | that drawer reads "did not answer"; the card count drops; the run continues |
| Server -> demo collection (Postgres) | catalog check and the holdings gate | src/db/schema.ts | DB unreachable | the catalog drawer fails and says so; recovery runs ungated and says "not checked against holdings" |
| Server -> Open Library search.json | existence check | src/lib/sources/openlibrary.ts | 5xx, timeout, rate limit | drawer "did not answer" + retry |
| Server -> Google Books volumes | existence check by title and author | src/lib/sources/googlebooks.ts | 429 without a key, timeout | drawer "did not answer" + retry; a key env var raises the quota |
| Server -> Qloo `/search` and `/v2/insights` (hackathon host, X-Api-Key) | seed resolution and recovery | src/lib/qloo/client.ts (QlooClient interface; LiveQloo and SampleQloo) | 401 (no key), 429, 5xx, empty results, no explainability field | SampleQloo: deterministic pick from the demo collection by subject overlap, labelled "sample mode"; explainability absent: the reason reads "because you named X" without shares |
| Browser -> Open Library covers | cover images | `<img src="https://covers.openlibrary.org/b/isbn/<isbn>-M.jpg?default=false">` | 404 or the 100-per-5-min IP limit | onerror -> spine block with the title |
| Server -> Postgres (holds, registry, runs) | persistence | src/db/schema.ts | unreachable | the desk still checks and recovers; reserve and log show the failure |
| Optional: title normaliser (keyless model route) | spoken or garbled titles | not in MUST | — | typed fields only |

## 8. Constraints
- Judging criteria (relayed from the Devpost listing by ainave.com, read 2026-10-19; the event page refused the fetch tool; no weights published, Devpost's platform weights criteria equally): "Technological Implementation: how thoroughly and skillfully the project uses Qloo; whether the code reflects genuine effort and a working, non-trivial implementation" · "Design: a complete, coherent product experience" · "Potential Impact: solves a real problem for a real audience" · "Quality of the Idea: a creative, non-obvious use of Qloo". The listing also says entries must be "not demonstrations that would work just as well without it".
- Sponsor rules (docs.qloo.com developer guide, read 2026-10-19): "Your key is valid only against the hackathon base URL: https://hackathon.api.qloo.com" · "Do not store Qloo response data in a public repository." · "Private server-side caching is fine" · keys "remain active through the end of the judging period".
- Submission (relayed): "a live, working demo that judges can try end to end" (local-only or private-access demos do not qualify) · a public repository that "must also display an open-source license" · "a written explanation of the project's features and what makes it Qloo-powered" · a video is not required.
- Platform: Vercel hobby; function timeout 300 s default, request body 4.5 MB; Node 22; Next.js 16.4 App Router (read node_modules/next/dist/docs before writing route handlers; `proxy.ts` not middleware).
- Security and abuse: no key in the browser (all Qloo calls server-side); `/api/recover`, `/api/holds`, `/api/log` rate-limited per IP (20/min) and size-limited (seeds ≤ 5, title ≤ 200 chars); the registry accepts only titles that a run found no record for; no PII anywhere; the Qloo cache table is private.
- Resources in hand: Vercel account (linked: team lack-toes), Neon via the Marketplace, Open Library and Google Books (free), a keyless text model route proved with one call (openai-fast via pollinations: a JSON title/author extraction in about 1 s, cost 0), AWS Bedrock models listed in us-east-1 (unused). Not in hand: the Qloo hackathon key (manual issue; requested by the builder; M8 covers the wait).
- Deadline: 2026-10-31T03:45:00Z (provisional hour); freeze from 2026-10-30T03:45:00Z.
- Performance: first paint under 2.5 s on the live URL (the LCP is the patron card headline or the first cover); the three checks complete in under 10 s on the live APIs; Qloo recovery under 3 s with the cache warm.

## 9. Acceptance criteria
AC-1: WHEN the desk opens with no input THE SYSTEM SHALL show a finished run of preset 1 (title, three answered drawers, the patron card, three books with reasons) and the primary action "Reserve these 3 books" within the first screen at 1440x900 and 390x844. Verify: foldcheck.py on the deployed URL (observe). Priority: must.
AC-2: WHEN Check runs for a title with no record in all three sources THE SYSTEM SHALL show each source's result and elapsed time as it arrives and then the card "No record in 3 sources." with the caveat. Verify: tests/check.test.ts (sequence and caveat) + observe. Priority: must.
AC-3: IF a source times out or errors THEN THE SYSTEM SHALL mark that drawer "did not answer", continue with the others, and the card SHALL read "No record in N sources" naming the failed source. Verify: tests/check.test.ts (injected failure). Priority: must.
AC-4: WHEN the catalog finds the title held THE SYSTEM SHALL show "Exists, and we hold it." with the copy count, offer a single reserve, and push no read-alikes; WHEN found but not held, "Exists; we don't hold it." with an interlibrary-loan link and no read-alikes. Verify: tests/verdict.test.ts. Priority: must.
AC-5: WHEN a no-record run has one or more resolvable seeds THE SYSTEM SHALL return exactly three distinct titles from the demo collection, each with the seed shares (or "because you named X" when shares are unavailable), and the shelf SHALL say which mode produced them (Qloo or sample). Verify: tests/recover.test.ts (holdings gate, distinctness, mode label) + observe. Priority: must.
AC-6: IF no seed resolves THEN THE SYSTEM SHALL recommend nothing and show "Nothing to recover from yet: ask what they liked about it." Verify: tests/recover.test.ts. Priority: must.
AC-7: WHEN "Reserve these 3 books" is clicked THE SYSTEM SHALL write one hold per book under the run id, idempotently on retry, and read "3 books reserved"; IF the write fails THEN it SHALL read "Couldn't reserve them. Nothing was reserved." and keep the shelf. Verify: tests/holds.test.ts + observe. Priority: must.
AC-8: WHEN "Log this invented title" is clicked after a no-record run THE SYSTEM SHALL insert or increment the registry row and the top-bar count SHALL tick; the registry page SHALL list it with the seeds and the recovered titles. Verify: tests/registry.test.ts + observe. Priority: must.
AC-9: WHEN "Show the Qloo request" is opened after a run THE SYSTEM SHALL show the Search and Insights parameters as sent, the number of holdings chunks, and the response excerpt, with no key anywhere in the page or the network log. Verify: grep the built client bundle and the panel's JSON for the key prefix (run script) + observe. Priority: must.
AC-10: WHEN the Qloo key is absent or a Qloo call fails THE SYSTEM SHALL still complete the checks and the card, and the shelf SHALL show sample-mode results labelled "Sample mode: Qloo key pending" (or "Qloo did not answer"). Verify: tests/recover.test.ts with the client stubbed to 401. Priority: must.
AC-11: WHEN any page is opened THE SYSTEM SHALL show no sign-in, no dead control and no placeholder text; `?state=<x>` SHALL render each designed state. Verify: scripts/verify-states.mjs (Playwright screenshots) + `pb.py submit check`. Priority: must.
AC-12: WHEN the repository is opened THE SYSTEM SHALL carry a LICENSE (MIT), a README whose first screen has one sentence, a screenshot and the live link, and the sections "How Qloo is used", "What makes it Qloo-powered" and "Configuration"; no Qloo response data SHALL be committed. Verify: `pb.py rules check`, `pb.py submit check`, `git grep -l hackathon.api.qloo.com -- ':!src' ':!README.md'` returns nothing under data/. Priority: must.
AC-13: WHEN the public write endpoints receive more than 20 requests a minute from one IP THE SYSTEM SHALL answer 429 and the UI SHALL say "Too many requests; try again in a minute". Verify: tests/ratelimit.test.ts. Priority: must.
AC-14 (SHOULD): WHEN the reading-list form is submitted THE SYSTEM SHALL return five to ten held titles with reasons for approval and show a draft email labelled "Draft only: not sent". Verify: observe. Priority: should.

## 10. Assumptions
A-1 [blocking, fenced]: the builder will receive a Qloo hackathon key before the freeze. Validate by requesting it today and watching the inbox; M8 keeps the product complete without it. If it never arrives, the live deployment runs in sample mode with the label, and the write-up says so.
A-2 [reversible]: Qloo returns feature.explainability for book results (the entity-type matrix does not list it for books). Validate on the first live call; the reason line degrades to "because you named X" without shares.
A-3 [reversible]: Qloo's /search resolves the ten real authors and common films and bands used as seeds; validate on day one with the key.
A-4 [safe]: a demo collection of about 3,000 most-borrowed 2025 BOOK titles from Seattle Public Library is enough for three held results per run; validate by the sample-mode and the first live run.
A-5 [safe]: Open Library search and covers and Google Books keyless search answer from Vercel's region within 2 s; validate with the first deploy's smoke.
A-6 [reversible]: judges open the live app on a laptop; the phone layout is built and measured anyway.
A-7 [safe]: no real patron data is ever entered; the product stores titles, seeds and holds only.

## 11. Demo script (hackathon/hybrid) or launch checklist (product)
0:00 The desk opens on preset 1 already checked ("The Last Algorithm · Andy Weir"): three drawers out, "No record in 3 sources.", three covers on the shelf with reasons. Identity line: "Ghost Shelf · For the reference desk". The judge card at the top right.
0:10 Click "Tidewater Dreams · Isabel Allende": drawers close and re-open in sequence with live times; the card rises; the seeds row shows "The Martian (film), Radiohead".
0:25 Three covers slide onto the shelf with reasons; "Reserve these 3 books" -> "3 books reserved"; "Log this invented title" -> the count ticks to 11.
0:50 "Show the Qloo request": the Search resolutions, the Insights call with the holdings chunk count, explainability on, and the per-seed shares.
1:05 "Beautiful Ruins · Jess Walter": the catalog drawer answers held; the card reads "Exists, and we hold it." Then "The Overstory · Richard Powers" (not held): "Exists; we don't hold it." with the interlibrary-loan link.
1:20 The staged failure: "Nightshade Market · Min Jin Lee" with the seeds cleared: "Nothing to recover from yet: ask what they liked about it." The shelf stays empty with that line.
Throughout: the shelf caption names the demo collection and the mode (Qloo or sample).

## 12. Event and judged path
(This file is committed with the repository, so a judge may read it. Quote the event's own public pages, with the date each was read. Nothing about individual judges and no guesses about what they like.)
- Window: start 2026-09-30T13:30:00Z (30 Sep 19:00 IST) / freeze 2026-10-30T03:45:00Z (30 Oct 09:15 IST) / end 2026-10-31T03:45:00Z (31 Oct 09:15 IST). Dates from Devpost's listing API ("Sep 30 - Oct 30, 2026", read 2026-10-19); hours from ainave.com's repost of the listing (read 2026-10-19), marked provisional because qloo.devpost.com refused the fetch tool. Rule on earlier work: not published in any page we could open; treated as forbidden before the start. This repository's first commit is 2026-10-19T13:36:24Z, inside the window; planning files written before that commit are in the idea package beside the repository, not in it.
- How an entry is judged: not published. The listing (relayed) asks for a live demo judges "can try end to end", a public repository and a written explanation; a video is not required. Devpost's help centre (read 2026-10-19): judges rate each criterion 1 to 5 stars, criteria are "usually weighted equally", and "There is no other mechanism for judges to provide feedback". Minutes per project and the queue card's cut: not published; the card is held to 180 characters.
- Criteria: as quoted in §8 (ainave.com repost, read 2026-10-19); the judges' own form is not public.
- Criteria coverage: Technological Implementation -> the request panel (Search, Insights with filter.results.entities, filter.exclude.entities, filter.publication_year, feature.explainability; cross-category seeds) and the holdings-map note in the README: met. Design -> one path from title to reserved books and a logged entry, no sign-in, every state reachable: met. Potential Impact -> the story card (the documented newspaper list and a named librarian's account) beside three held books handed over; the write-up labels the desk pain a hypothesis: met. Quality of the Idea -> a film and a band becoming three held books, which no catalog does, beside the documented negative: met (after the critic's fix; the earlier author-only script was partial).
- Capability coverage: "Qloo API used thoroughly and skillfully" -> the recovery step (Search to resolve seeds; Insights for books with signals, the holdings gate, exclusions, publication year, explainability) shown in the request panel; "agentic tool, agent framework, or Qloo wired into an existing agent" -> the desk runs as an agent: it verifies against three sources, decides the branch, recovers through Qloo, reserves and logs, with the librarian approving the reservation; a run log shows each step.
- Main result: three held, real titles with reasons recovered from a film and a band, reserved in the demo holds list, and the invented title logged (artifact). Material we did not author: the ten invented titles from the Chicago Sun-Times insert of 18 May 2025 (CBS News, read 2026-10-19) and Seattle Public Library's public-domain "Checkouts by Title" dataset. The one staged failure: no resolvable seed, so no recovery and the plain line "Nothing to recover from yet: ask what they liked about it."
- Promise coverage: "Ghost" -> the first screen shows an invented title with no record in three sources and its checks; "Shelf" -> three held books on the shelf, with the registry count in the top bar. AC-1.
- Before the clock: the idea research, the UI spec and the mockup were prepared on 2026-10-19 before the first commit; no project code existed before the repository. README sentence: "Planning (idea research, UI spec) came before the first commit on 19 October 2026; all code was written inside the hackathon window."
