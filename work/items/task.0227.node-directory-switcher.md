---
id: task.0227
type: task
title: "Node directory + context switcher — browse nodes, switch active context"
status: needs_design
priority: 1
rank: 5
estimate: 3
summary: Build a node directory page and a context switcher so a user with one wallet can discover Cogni nodes and switch between the ones they are active in.
outcome: User lands on /nodes, sees a searchable list of live Cogni nodes (name, description, member count). If they are a member/contributor in multiple nodes, a persistent switcher in the sidebar lets them change context. The active node determines which features, dashboard, and credits are visible.
spec_refs: node-formation
assignees: derekg1729
credit:
project: proj.node-formation-ui
branch:
pr:
reviewer:
revision: 0
blocked_by:
deploy_verified: false
created: 2026-03-30
updated: 2026-03-30
labels: [nodes, ui, multi-tenant]
external_refs:
---

# Node Directory + Context Switcher

## Context

Today a user connects a wallet and sees one node — the one this repo deploys. But a wallet address can be a contributor or token holder in multiple Cogni nodes. There is no way to:
1. **Discover** what nodes exist in the Cogni network
2. **Switch** between nodes the user is active in
3. **See** node-specific features scoped to the active context

This task builds the minimal frontend for both.

## Requirements

### Node Directory (`/nodes`)

- R1: A public page at `/nodes` (or `/(app)/nodes`) lists known Cogni nodes.
- R2: Each node card shows: name, description/tagline, member count (or "N contributors"), chain badge (e.g. Base), and a link to the node's app.
- R3: Search/filter by name. No pagination needed for MVP (expect <50 nodes).
- R4: Data source: the `node_registry_nodes` operator table (task.0202) or a static seed file until that table exists. If neither exists yet, hardcode the 2-3 known nodes as a stub and document the TODO.

### Context Switcher (sidebar)

- R5: If the connected wallet is active in >1 node, the sidebar header shows the current node name/icon and a dropdown to switch.
- R6: "Active in" is determined by: wallet holds the node's governance token OR wallet appears in the node's contributor set (ledger). For MVP, a simpler check is acceptable (e.g., hardcoded list or a single API call).
- R7: Switching context navigates to the target node's app URL (different deployment). This is a full navigation, not an in-app state change — each node is a separate deployment.
- R8: If the wallet is active in only 1 node, no switcher is shown (current behavior).

### Non-Goals

- Node creation/formation flow (already exists at `/setup/dao`)
- In-repo multi-scope routing (each node is a separate deployment today)
- Federation enrollment UI (P2+)
- On-chain node registry contract

## Allowed Changes

### New Files

- `apps/web/src/app/(app)/nodes/page.tsx` — Node directory page
- `apps/web/src/features/nodes/` — Feature slice: components, hooks
- `apps/web/src/features/nodes/components/NodeCard.tsx` — Card component
- `apps/web/src/features/nodes/components/NodeDirectory.tsx` — Search + grid
- `apps/web/src/features/nodes/components/NodeSwitcher.tsx` — Sidebar dropdown
- `apps/web/src/contracts/nodes.directory.v1.contract.ts` — Zod contract for node list (if API-backed)

### Modified Files

- `apps/web/src/features/layout/components/AppSidebar.tsx` — Add NodeSwitcher + /nodes nav link
- `apps/web/src/bootstrap/container.ts` — Wire node registry port (if needed)

### Stub / Deferred

- `node_registry_nodes` table — if task.0202 (provisionNode workflow) hasn't landed, use a static seed or `.cogni/known-nodes.yaml` file as a temporary data source
- On-chain token balance check — can be deferred; use a static member list per node for MVP

## Plan

- [ ] **1. Data source**: Determine if `node_registry_nodes` table exists. If not, create `apps/web/src/features/nodes/data/known-nodes.ts` with hardcoded entries for resy-helper + poly + cogni-template (name, url, description, chain).
- [ ] **2. Node directory page**: Build `/nodes` with `NodeDirectory` (search input + grid of `NodeCard` components). Server component fetching from data source.
- [ ] **3. NodeCard component**: Name, description, chain badge, member count, "Visit" link.
- [ ] **4. NodeSwitcher component**: Dropdown in sidebar header. Shows current node, lists other nodes the user is active in. Clicking navigates to the other node's URL.
- [ ] **5. Wire sidebar**: Add `NodeSwitcher` to `AppSidebar` header area. Add `/nodes` to nav items.
- [ ] **6. Tests**: Render tests for NodeCard, NodeDirectory. `pnpm check:fast` passes.

## Validation

```bash
pnpm check:fast
```

**Expected:** All pass.

**Manual:**

1. Navigate to `/nodes` → see list of known nodes
2. Search by name → list filters
3. Sidebar shows current node name → if multi-node user, dropdown shows other nodes

## Review Checklist

- [ ] **Work Item:** `task.0227` linked in PR body
- [ ] **Spec:** node-formation spec invariants upheld
- [ ] **Tests:** render tests for directory + card components
- [ ] **Reviewer:** assigned and approved

## Design Decisions

**Why full navigation for switching?** Each node is a separate deployment (different domain, different DB, different node_id). In-app state switching would require a single app to serve multiple databases — that's a much larger architectural change. For now, the switcher is just a smart link list.

**Why stub data?** The node registry table (task.0202) and the provisionNode workflow don't exist yet. A hardcoded list of known nodes unblocks the UI work. The data source is behind a feature service, so swapping to a real API later is a one-line change.

**Why not on-chain lookup?** Reading governance token balances on-chain for each node would require knowing every node's token address and making N RPC calls. The operator registry (when it exists) is the right source. For MVP, a static list is honest.

## PR / Links

-

## Attribution

-
