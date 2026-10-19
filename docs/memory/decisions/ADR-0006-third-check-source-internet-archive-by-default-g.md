---
id: ADR-0006
type: decision
title: Third check source: Internet Archive by default, Google Books only with a key
status: active
scope: project
components: src/lib/check.ts, src/lib/sources/internetarchive.ts, src/lib/sources/googlebooks.ts
triggers: googlebooks 429, did not answer, third source, internet archive
evidence: src/lib/check.ts#L32-L41, test:npm test
verified_at: 2026-10-19@ea6d7ea
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 1daa016f9030b394
created: 2026-10-19
source: unknown
---

Google Books keyless answered 429 from the build host on 2026-10-19, so the third drawer showed 'did not answer' on every check. activeSources() now picks googlebooks only when GOOGLE_BOOKS_API_KEY is set, else internetarchive. The archive's advancedsearch is keyless and answers in under 1 s; its creator field is inverted with life dates, so the query is title-only and the author check runs in matchInternetArchive. A match needs a named creator because the archive holds essays and notes titled after famous books. The desk and patron card take the source list as a prop, so the labels follow.