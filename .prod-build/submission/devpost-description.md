Ghost Shelf is a desk tool for book titles a chatbot made up: three checks with receipts, a card for the patron, and three held books recovered through Qloo.

Live: https://ghost-shelf.vercel.app · Repository: https://github.com/itssaharsh/ghost-shelf · License: MIT

## Inspiration
In May 2025 a newspaper insert recommended ten summer books that did not exist, each attributed to a real author. Patrons bring those titles to reference desks, and a librarian has a few minutes to show, kindly and with evidence, that there is no such book, and then to hand over something real.

## What it does
Ghost Shelf checks the title against the catalog, Open Library and a third public source, shows the patron what it found, then uses Qloo, a taste database, to turn what they named (a film, a band, an author) into three books the library holds.

- Three checks with receipts on every claimed title, each with its source link and time.
- A patron card that never says "does not exist": "No record in 3 sources", what was checked, and the caveat that recent and small-press titles may be missing. It prints as a slip.
- Recovery from a film or a band, not only from an author: Qloo's cross-category matching, limited to about 3,000 held titles, with the reason each book was chosen.
- Reserve the three books (a demo holds list) and log the invented title into a registry other desks can read; it ships with the ten printed in the newspaper.
- A request panel that shows every Qloo call as sent, key redacted, with "Copy as curl".
- A second desk for reading-list requests: a patron's form becomes five to ten held books with reasons and a draft reply, never sent.

## How Qloo is used
Search resolves each thing the patron named to an entity (`/search` with the entity type from the seed's kind). Insights (`/v2/insights`) asks for books with `filter.type=urn:entity:book`, `signal.interests.entities` = the seeds, `filter.results.entities` = the collection's own entity ids in chunks of 150 (so the answer can only be held books), `filter.exclude.entities`, `feature.explainability=true` and `take=50`. Explainability becomes the reason line ("because you named The Martian 61%, Radiohead 39%"). The holdings map is built once with the key and lives in the database; no Qloo response data is in the repository.

## What makes it Qloo-powered
A catalog can match an author. It cannot take "The Martian" and "Radiohead" and return three held novels with reasons the librarian can say across the desk. Take the key away and the shelf says so: the checks and the card still run live, the recovery step shows a labelled sample mode.

## The agentic loop
The desk checks three sources concurrently and streams each answer, decides the branch (held, not held, no record, unchecked), recovers through Qloo only when there is no record and the patron named something, and reserves and logs only when the librarian presses the button. A run log lists each step with its second.

## How we built it
Next.js 16 (App Router, Cache Components) on Vercel, Server-Sent Events for the checks, Drizzle with Neon Postgres (an in-memory adapter until the database is connected), Open Library and the Internet Archive as public sources, Qloo's hackathon API behind a server-side client. Data: about 3,000 of the most-borrowed 2025 titles from Seattle Public Library's public-domain checkout dataset; the ten invented titles from the CBS News report on the Chicago Sun-Times insert.

## Challenges and what is simulated
Keyless Google Books rate-limits shared hosts, so the Internet Archive takes the third drawer unless a key is set. Holds go to a demo list, not a library system. The hackathon key is issued by hand; until it is active the deployment runs in sample mode and says so on screen.

## What's next
The live Qloo switch-on with the holdings map, a real catalog behind the first drawer, and the registry shared between libraries.

## Honesty notes
Planning (idea research, UI spec) came before the first commit on 19 October 2026; all code was written inside the hackathon window. No real patron data; the reading-list sample is labelled fictional.
