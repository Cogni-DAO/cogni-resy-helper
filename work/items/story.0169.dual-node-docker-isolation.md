---
id: story.0169
type: story
title: "Docker stack isolation: run multiple node repos on one machine"
status: done
priority: 2
rank: 1
estimate: 2
summary: "Running two Cogni node repos on the same machine causes Docker container-name and volume collisions because docker-compose.dev.yml hardcodes global names."
outcome: "Both repos can run dev stacks simultaneously without conflicts. Each gets its own compose project name, network namespace, and port range."
assignees: claude
branch: fix/runtime-compose-dual-stack
pr:
reviewer:
created: 2026-03-18
updated: 2026-03-18
labels: [infra, dx]
---

# Docker Stack Isolation

## Problem

Every Cogni node fork shares the same `docker-compose.dev.yml` with hardcoded `container_name:`, volume `name:`, and network `name:` directives. Running two repos' stacks produces:

```
Error: The container name "/loki" is already in use
```

## Solution

1. Remove all `container_name:` — let Docker scope names by compose project
2. Remove all `name:` on volumes/networks — same scoping
3. Parameterize host ports via env vars with defaults
4. `runtime-compose.sh` — wrapper that sets separate project names for dev vs test
5. `with-runtime-test-env.sh` — rewrites DATABASE_URL etc. to use test port offsets
6. Route all `package.json` compose scripts through `runtime-compose.sh`

## Validation

```bash
pnpm check
```

Verify `pnpm dev:stack` starts without container-name conflicts when another Cogni node's stack is running.
