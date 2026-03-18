---
id: story.0169
type: story
title: "Docker stack isolation: run multiple node repos on one machine"
status: done
priority: 2
rank: 1
estimate: 2
summary: "Running two Cogni node repos (e.g. node-template + cogni-resy-helper) on the same machine causes Docker container-name and volume collisions because docker-compose.dev.yml hardcodes global names like `container_name: loki`, `container_name: postgres`, etc."
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

Every Cogni node fork shares the same `docker-compose.dev.yml` with hardcoded:
- `container_name: loki`, `container_name: postgres`, `container_name: litellm`, etc.
- `name: postgres_data`, `name: loki_data`, etc. on volumes
- `name: cogni-edge`, `name: internal` on networks
- Hardcoded host ports: `55432`, `4000`, `3100`, etc.

Running `pnpm dev:stack` on repo B while repo A's stack is up produces:

```
Error: The container name "/loki" is already in use
```

This blocks any developer working on multiple Cogni nodes.

## Solution

1. **Remove all `container_name:`** — let Docker scope names by compose project
2. **Remove all `name:` on volumes/networks** — same scoping
3. **Parameterize host ports** via env vars with defaults (`${POSTGRES_HOST_PORT:-55432}`)
4. **`runtime-compose.sh`** — wrapper that sets separate project names (`cogni-runtime-dev` vs `cogni-runtime-test`), separate networks, and offset port ranges for test stacks
5. **`with-runtime-test-env.sh`** — rewrites DATABASE_URL etc. to use test port offsets
6. **Route all `package.json` compose scripts** through `runtime-compose.sh`
