---
id: ADR-0003
type: decision
title: Qloo behind a QlooClient interface with LiveQloo and a labelled SampleQloo
status: active
scope: project
components: qloo, api
triggers: 
evidence: ARCHITECTURE.md#External-services
verified_at: 2026-10-19@7172647
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: d6b5b15c3e47d416
created: 2026-10-19
source: unknown
---

## Context

## Decision

## Alternatives rejected (and why)

## Consequences

## Revisit when

Context: Qloo hackathon keys are issued manually within a few business days; the product must be complete and honest before one arrives.
Decision: a QlooClient interface with LiveQloo (search, insights, chunked holdings gate, explainability) and SampleQloo (a deterministic, labelled stand-in); recover() falls back to sample mode on 401/429/5xx and says so on screen.
Alternatives rejected: blocking the build on the key; silently returning cached Qloo data (forbidden in a public repository).
Consequences: every screen carries the mode; the first real call is a scheduled task (T11).
Revisit when: the key is active and the entity map is built.
