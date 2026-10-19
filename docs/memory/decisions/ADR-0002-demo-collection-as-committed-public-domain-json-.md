---
id: ADR-0002
type: decision
title: Demo collection as committed public-domain JSON plus a Postgres map for Qloo ids
status: active
scope: project
components: data, db
triggers: 
evidence: ARCHITECTURE.md#Components
verified_at: 2026-10-19@7172647
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 9fb05ce3dabb0c4c
created: 2026-10-19
source: unknown
---

## Context

## Decision

## Alternatives rejected (and why)

## Consequences

## Revisit when

Context: the catalog check and the holdings gate need a library collection; no public library exposes one with holds.
Decision: a public-domain slice of Seattle Public Library's 2025 checkouts (3,000 most-borrowed BOOK titles with ISBNs) committed as data/collection.json; the Qloo entity map for those ISBNs lives only in Postgres.
Alternatives rejected: Open Library as the 'catalog' (no notion of holdings); a hand-written fixture (not real material).
Consequences: the catalog check works with no database; the map is Qloo-derived and stays out of the repository per the developer guide.
Revisit when: a real library partner supplies a catalog export.
