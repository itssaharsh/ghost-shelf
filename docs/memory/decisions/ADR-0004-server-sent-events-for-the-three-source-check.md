---
id: ADR-0004
type: decision
title: Server-sent events for the three-source check
status: active
scope: project
components: api, web
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

Context: the drawers must answer one by one as each source replies, with its elapsed time.
Decision: GET /api/check streams server-sent events (start, one per source, verdict); sources run concurrently with a 6 s timeout each.
Alternatives rejected: one JSON response (no per-source timing on screen); websockets (more than needed).
Consequences: the client reads an event stream; a failed source is an event, not an error.
Revisit when: a source needs retries beyond one request.
