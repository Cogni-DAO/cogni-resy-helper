---
id: multi-node-formation
type: guide
title: "Multi-Node Formation: Adding a New Node to an Operator Repo"
status: draft
trust: draft
summary: How a new node (project/DAO) organizes its files when sharing an operator repository with existing nodes.
read_when: A new team wants to launch a project inside this repo, or you need to understand node file boundaries.
owner: derekg1729
created: 2026-03-30
verified: 2026-03-30
tags: [nodes, formation, multi-tenant, operator]
---

# Multi-Node Formation

> How a 3rd (or Nth) node organizes its files when launching inside an existing operator repo that already runs other nodes.

## Model

One operator repo, N independent nodes. Each node is a DAO with its own:
- Governance (on-chain contracts, approver set)
- Feature code (vertical slice under `features/`, routes under `app/`)
- Work tracking (charters, projects, items)
- Deployment identity (separate database, namespace, domain)

Nodes **share**: the Next.js app shell, packages, infra tooling, CI pipeline, and sidebar layout.

## File Boundaries

### Files a new node MUST create

| Path | Purpose |
|------|---------|
| `apps/web/src/features/<node-slug>/` | Feature vertical slice (services, components, hooks) |
| `apps/web/src/app/(app)/<node-slug>/` | UI routes (pages) |
| `apps/web/src/app/api/v1/<node-slug>/` | API routes |
| `apps/web/src/contracts/<node-slug>.*.v1.contract.ts` | Zod API contracts |
| `apps/web/src/core/<node-slug>/` | Domain model + pure rules |
| `docs/spec/<node-slug>-*.md` | Feature spec(s) |
| `work/items/task.<num>.<node-slug>-*.md` | Work items |

### Files a new node MUST modify

| Path | What to change |
|------|----------------|
| `.cogni/repo-spec.yaml` | Add node's scope under a new `scopes` section (see below) |
| `apps/web/src/features/layout/components/AppSidebar.tsx` | Add nav item for new route |
| `apps/web/src/ports/index.ts` | Re-export new port (if creating one) |
| `apps/web/src/adapters/server/index.ts` | Re-export new adapter (if creating one) |
| `apps/web/src/bootstrap/container.ts` | Wire new ports/adapters |

### Files a new node MAY create

| Path | When |
|------|------|
| `packages/<node-slug>-*/` | If the node needs a shared capability package (used by both app and workers) |
| `apps/web/src/ports/<node-slug>.port.ts` | If the node defines new infrastructure ports |
| `apps/web/src/adapters/server/<node-slug>/` | If the node needs new infrastructure adapters |
| `packages/db-schema/src/<node-slug>.ts` | If the node needs new database tables |
| `apps/web/src/adapters/server/db/migrations/` | Schema migrations |
| `infra/compose/runtime/docker-compose.dev.yml` | If the node needs new Docker services (use `profiles:` for opt-in) |
| `apps/web/src/shared/env/server-env.ts` | If the node needs new env vars (always optional) |
| `work/charters/chr.<node-slug>.md` | Strategic charter |
| `work/projects/proj.<node-slug>-*.md` | Project roadmaps |

### Files a new node MUST NOT touch

| Path | Why |
|------|-----|
| Other nodes' `features/<other>/` | Node isolation — never cross-import features |
| Other nodes' `core/<other>/` | Domain boundaries |
| Other nodes' `contracts/<other>.*.contract.ts` | Contract ownership |
| Other nodes' work items | Owned by that node |
| `.cogni/repo-spec.yaml` node_id/scope_id | Immutable — only the operator changes these |
| `packages/` core infra (db-client, ids, scheduler-core) | Shared infra — coordinate with operator |

## Node Identity: 1 Node = 1 DAO = 1 Repo Fork

Today each node is a **separate fork** of `cogni-template`. The operator repo (this repo) runs one node. When a new project wants to form, it forks the template and gets:

- A fresh `node_id` (UUID, generated at formation)
- A derived `scope_id` (uuidv5 of node_id + "default")
- Its own DAO contracts on-chain
- Its own deployment (namespace, DB, domain)

**The operator repo model is different**: multiple feature teams build inside one shared repo, sharing infra but maintaining separate feature slices. Each "node" in the operator context is a feature vertical, not a separate deployment. They all share one `node_id` and one database.

### What "multi-node operator repo" means in practice

```
cogni-resy-helper (operator repo, node_id: 304d5f22...)
├── features/reservations/    ← resy-helper team
├── features/poly/            ← poly team
├── features/<next>/          ← 3rd project team
└── shared: sidebar, container, packages, infra
```

All teams share the same DAO governance, the same `node_id`, the same deployment. Feature isolation is at the code level (separate slices), not the infrastructure level.

### When to fork vs build in-repo

| Scenario | Approach |
|----------|----------|
| New independent DAO with its own treasury | **Fork** cogni-template → new node |
| New feature/product under the same operator DAO | **In-repo** feature slice |
| External team wants sovereignty | **Fork** — they get their own node_id, governance, deploy |
| Internal team building a second product | **In-repo** — shares operator's infra, governance, credits |

### Open questions

- [ ] Node directory / registry: how does a user discover which nodes exist and which they belong to?
- [ ] Cross-node user identity: a wallet address can be active in multiple nodes — how to switch context?
- [ ] Formation wizard for in-repo features: is it just a PR, or does `/setup` get a "new feature" flow?

## Branch Convention

Each node works on its own feature branch:

```
feat/<node-slug>-v0          # Main feature branch for the node
feat/<node-slug>-<feature>   # Sub-feature branches (PR into the main)
```

Nodes merge into `staging` independently. Cross-node conflicts should only occur in shared files (sidebar, container, repo-spec).

## Formation Checklist (New Node)

A new node's first PR should include:

- [ ] Feature slice: `features/<slug>/`, `core/<slug>/`, `contracts/<slug>.*.contract.ts`
- [ ] Routes: `app/(app)/<slug>/`, `app/api/v1/<slug>/`
- [ ] Sidebar entry in `AppSidebar.tsx`
- [ ] At least one Zod contract + route
- [ ] Spec: `docs/spec/<slug>-v1.md`
- [ ] Work item: `task.<num>.<slug>-mvp.md`
- [ ] Container wiring (if new ports)
- [ ] DB schema + migration (if new tables)
- [ ] Repo-spec scope entry (once multi-scope is supported)
- [ ] `pnpm check:fast` passes

## Examples

| Node | Feature Slice | Routes | Contracts | Package |
|------|--------------|--------|-----------|---------|
| resy-helper | `features/reservations/` | `(app)/reservations/` | `reservations.*.v1.contract.ts` | `packages/steel-browser/` |
| poly | `features/poly/` (TBD) | `(app)/poly/` (TBD) | `poly.*.v1.contract.ts` (TBD) | — |

## Related

- [Architecture](../spec/architecture.md) — hexagonal layering, feature slicing
- [Feature Development Guide](feature-development.md) — how to add features
- [Node Formation Spec](../spec/node-formation.md) — DAO creation flow
- [Node Launch Spec](../spec/node-launch.md) — provisioning pipeline
