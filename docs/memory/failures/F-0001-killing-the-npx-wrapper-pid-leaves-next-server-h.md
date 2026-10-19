---
id: F-0001
type: failure
title: Killing the npx wrapper pid leaves next-server holding the port
status: active
scope: project
components: .prod-build/logs/server.pid, scripts/verify-states.mjs
triggers: EADDRINUSE, address already in use, stale build served, 404 on a route that was just built
evidence: .prod-build/logs/server.log
verified_at: 2026-10-19@718f6f9
relates: 
supersedes: 
helpful: 0
harmful: 0
cite_hash: e3b0c44298fc1c14
created: 2026-10-19
source: unknown
---

Symptom: after a rebuild and 'restart', routes added in the build answered 404 and server.log said EADDRINUSE on the dev port. Cause: the pid file held $! of 'nohup npx next start', the wrapper; killing it left the child next-server (v16) listening, so the old build kept serving. Fix: find the listener with ss -ltnp and kill that pid, confirm the port is free, start, then write the listener's pid (not the wrapper's) to .prod-build/logs/server.pid. Never pkill -f by pattern here (it has killed the shell before).