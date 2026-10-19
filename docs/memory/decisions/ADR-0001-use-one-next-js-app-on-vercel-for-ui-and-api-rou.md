---
id: ADR-0001
type: decision
title: Use one Next.js app on Vercel for UI and API routes
status: active
scope: project
components: web, api
triggers: 
evidence: ARCHITECTURE.md#Key-decisions
verified_at: 2026-10-19@7172647
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: 8f432c4f8d2928a8
created: 2026-10-19
source: unknown
---

## Context

## Decision

## Alternatives rejected (and why)

## Consequences

## Revisit when

Context: a hackathon entry judged on a live URL with three routes and one UI.
Decision: one Next.js 16 App Router app on Vercel serves the UI and the API routes.
Alternatives rejected: a separate API service (two deploys, two sets of env, nothing gained); plain static HTML (no server to hold the Qloo key).
Consequences: all Qloo calls are server-side; types are shared between routes and UI.
Revisit when: a second client (a browser extension, an ILS plugin) needs the API without the UI.
