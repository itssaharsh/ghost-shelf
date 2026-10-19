---
id: ADR-0005
type: decision
title: Neon Postgres via the Vercel Marketplace with Drizzle, lazy init, in-memory adapter for tests
status: active
scope: project
components: db
triggers: 
evidence: ARCHITECTURE.md#Deployment
verified_at: 2026-10-19@7172647
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: ad35ab5bdc4409e6
created: 2026-10-19
source: unknown
---

## Context

## Decision

## Alternatives rejected (and why)

## Consequences

## Revisit when

Context: holds, the registry, runs and the Qloo cache need a datastore; Vercel functions have no persistent disk.
Decision: Neon Postgres via the Vercel Marketplace with Drizzle (neon-http), lazy initialisation so builds never connect, and an in-memory adapter for tests and for local work before the database exists.
Alternatives rejected: Vercel Blob as a JSON store (no transactions, no counts); SQLite (no persistence on Vercel).
Consequences: DATABASE_URL arrives from the Marketplace once the account owner accepts Neon's terms; until then the deploy runs the in-memory adapter and says so.
Revisit when: the registry needs multi-library accounts.
