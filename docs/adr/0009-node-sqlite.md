# 0009. Storage driver: `node:sqlite`, not `better-sqlite3`

- **Status:** Accepted
- **Date:** 2026-09-28
- **Supersedes:** the driver choice in ADR 0002 only

## Context
ADR 0002 chose SQLite and specified `better-sqlite3` as the driver. That ADR's
architectural decisions — one database file per world, JSON-column document
bodies, synchronous access, a single writer per world, WAL mode — are unaffected
by this one and are not reopened here. This ADR is narrower: **which library
talks to the file**.

`better-sqlite3` is a native module. ADR 0002 already named this as "the main
cost of the decision": installing it needs prebuilt binaries or a C++
toolchain, and it must be rebuilt per Node major version. Milestone 0's setup
plan flagged the same risk and deferred it, pending confirmation that prebuilds
existed for the pinned Node version.

Milestone 1 changes what's at stake. Two things this project cares about
depend directly on whether the storage driver is native or not:

1. **Contributor setup friction.** "Never touch a terminal" is now a binding
   requirement for the *GM* (ADR 0010) and the project already wants setup to be
   `pnpm install && pnpm dev` for a *contributor*. A native module that needs a
   working C++ toolchain on Windows, macOS, and Linux is friction on both ends.
2. **Future packaging.** A single-executable or bundled-installer distribution
   (ADR 0010's eventual mechanism) is dramatically harder with a native module
   in the dependency tree — native addons are exactly what Node's single
   executable application (SEA) tooling struggles with.

Node 24 ships an SQLite implementation in `node:sqlite`, no flag required. It
was verified working against this project's actual Node version:

```
$ node --version
v24.18.0
$ node -e "const s=require('node:sqlite'); const db=new s.DatabaseSync(':memory:');
  db.exec('create table t(a)'); db.prepare('insert into t values (?)').run(1);
  console.log(db.prepare('select a from t').get());"
works: [Object: null prototype] { a: 1 }
```

## Decision
**Use `node:sqlite`'s `DatabaseSync` instead of `better-sqlite3`.** Everything
else in ADR 0002 stands: one file per world, WAL on, synchronous access,
transactions around every write, single writer per world.

The storage module (`apps/server`'s world store) stays deliberately small and
is the only file that imports `node:sqlite` directly, mirroring the same
isolation pattern `packages/dice`'s `rng.ts` uses for `node:crypto` — if the
driver's API needs to change later, there is exactly one file to change.

## Consequences
- **Zero native dependencies in the whole project.** No prebuilt binaries to
  fetch, no toolchain to install, no per-Node-major rebuild step. This was
  verified directly (see Context), not assumed.
- **Packaging gets meaningfully easier.** A native-module-free dependency tree
  is a precondition for Node's SEA single-executable tooling to work cleanly,
  which keeps ADR 0010's options genuinely open rather than narrowing to "an
  installer that bundles a full Node runtime" by default.
- **`node:sqlite` is explicitly experimental** in Node's own documentation as of
  this writing. Its API could change between Node majors before it stabilizes.
  The mitigation is architectural, not aspirational: the module boundary
  described above means a breaking change is a one-file fix, not a project-wide
  one — the same bet already made and paid off for `packages/dice`'s RNG.
- **We lose `better-sqlite3`'s much longer track record.** It is a mature,
  widely-deployed library; `node:sqlite` is new. Given the driver sits behind a
  narrow, well-tested module boundary either way, this is an acceptable trade
  for removing a native dependency from a project whose GM-facing distribution
  story depends on a simple, portable runtime.
- **Pin `.nvmrc` deliberately going forward.** `node:sqlite`'s behavior is tied
  to the Node version in a way an npm package's isn't; bumping the pinned Node
  version is now a change worth testing the storage module against
  specifically, not a routine dependency bump.

## Alternatives considered
### Keep `better-sqlite3` (ADR 0002 as originally written)
The safer, more conservative choice on library maturity alone. Rejected because
the two costs ADR 0002 already flagged — contributor toolchain friction and
native-module packaging difficulty — are no longer hypothetical now that
"double-click, no terminal" is a binding requirement (ADR 0010) and the client
scaffold is imminent. Paying that cost when a viable zero-dependency
alternative exists and was verified to work is not justified.

### Wait for `node:sqlite` to stabilize before adopting it
Would avoid the experimental-API risk entirely. Rejected: milestone 1 is
exactly the point where the storage module gets written once; writing it twice
(once against `better-sqlite3`, later against `node:sqlite`) costs more than
absorbing the risk now behind a narrow module boundary, especially since the
verification above shows it already works correctly for this project's needs.

### An abstraction layer over both drivers
Write a storage port/interface with `node:sqlite` as the only real
implementation for now, explicitly to make a future swap painless. Rejected as
premature: there is only ever one implementation, and an interface with a
single implementor is exactly the kind of speculative structure the charter's
Development order section warns against ("a speculative operation nobody calls
is dead code"). The same isolation benefit is achieved more simply by just
keeping the driver import confined to one module.
