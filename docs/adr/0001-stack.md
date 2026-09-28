# 0001. Stack: TypeScript end to end, Fastify, Vue 3, PixiJS

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
This is a solo-maintained, hand-reviewed project (see the ~300-line PR rule in
CLAUDE.md). The dominant constraint is not performance or scale — it is how much
a single person can hold in their head and review in one sitting. That argues for
one language, one build tool, and boring, well-documented libraries over
best-in-class-but-unfamiliar ones.

The product also has one genuinely demanding piece: a map canvas with hundreds of
tokens, a grid, fog of war, and drag interactions at 60fps. That is the only place
where the choice is driven by capability rather than familiarity.

## Decision
- **TypeScript on both ends**, in a **pnpm workspaces** monorepo. Zod schemas in
  packages/core are imported by client and server alike, so a document shape is
  defined once and validated in both places.
- **Server: Node + Fastify**, with **Socket.IO** for realtime sync. Fastify's
  schema-first request handling composes well with Zod; Socket.IO is chosen over
  raw WebSockets for reconnection, rooms (a natural fit for per-world broadcast),
  and acknowledgements (which the operation model in ADR 0005 relies on).
- **Client: Vue 3** (Composition API, script setup) + **Vite**, with **Pinia**
  for state.
- **Canvas: PixiJS**, major version pinned.
- **Tests: Vitest** for unit, **Playwright** for e2e.

## Consequences
- One language means one toolchain, one lint config, and shared types for free.
  A schema change surfaces as a type error in the UI rather than a runtime bug.
- **PixiJS is the hardest dependency to move.** v7 to v8 changed renderer
  initialization, the asset loader, and the graphics API. The major version is
  pinned, and upgrading it is its own reviewed PR with its own risk assessment,
  never a routine dependency bump.
- **Vue's ecosystem is smaller than React's** for the widget shapes this project
  needs: draggable trees, virtualized tables, rich text. Expect to build some of
  these rather than install them. Accepted because the maintainer's velocity
  matters more than library availability on a project this long.
- Socket.IO adds a protocol layer and a client bundle we do not control. In
  exchange we do not write reconnection or heartbeat logic, which is exactly the
  kind of code that fails silently at a real table.
- exactOptionalPropertyTypes will conflict with Socket.IO's and PixiJS's
  published types in places. That is what the @ts-expect-error-with-comment
  escape hatch is for.

## Alternatives considered
### React instead of Vue
Larger ecosystem and a deeper pool of VTT-shaped components. Rejected on
maintainer familiarity: on a multi-year solo project, the speed at which one
person can build and review is the binding constraint, not component
availability.

### Raw WebSockets instead of Socket.IO
Smaller, no protocol overhead, no client bundle. Rejected because we would
immediately reimplement reconnection, backoff, heartbeats, room fan-out, and
message acknowledgement — and reconnection bugs are the ones that ruin a
session rather than just annoying a developer.

### Canvas 2D or hand-written WebGL instead of PixiJS
Fewer dependencies and no upgrade risk. Rejected: sprite batching, culling, and
an interaction model for thousands of objects is months of work that PixiJS
already does well.

### A single package instead of a monorepo
Simpler tooling. Rejected because the core commitment in CLAUDE.md is a
system-agnostic engine with PF2e as a plugin, and that boundary is only real if
the build enforces it. packages/core must not be able to import systems/pf2e.
