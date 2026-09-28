# 0005. Concurrency: an operation log against an authoritative server

- **Status:** Accepted
- **Date:** 2026-09-28
- **Depends on:** ADR 0002 (transactions)

## Context
CLAUDE.md states that the server is authoritative in a single line. That line is
load-bearing and underspecified, and the cases it has to cover are the ones that
actually happen at a table:

- Two players drag the same token at once.
- The GM applies damage while a player rolls a save against the same effect.
- A player's laptop sleeps mid-combat and reconnects three minutes later.
- A client applies a change locally that the server then rejects.

Left unspecified, each of these gets solved ad hoc in a different part of the
codebase, and divergence between clients becomes unreproducible. A table noticing
that two people see different HP is the kind of bug that ends a session.

Two further requirements constrain the design. Token movement must feel
immediate, so the client cannot wait for a round trip before rendering a drag.
And prep-mode undo (CLAUDE.md, GM experience) needs a durable, ordered record of
what happened.

## Decision
1. **Clients send operations, not documents.** An operation names a target
   document, an intent, and a payload. A client never writes a whole document,
   which removes the entire class of last-writer-clobbers-unrelated-fields bugs.
2. **The server validates, applies, sequences, broadcasts.** In order: validate
   the operation against its Zod schema, check the sender's permission on the
   target, apply it inside a SQLite transaction, assign a monotonically increasing
   per-world sequence number, then broadcast the applied result. A rejection
   returns a reason to the originating client and nothing to anyone else.
3. **Clients may apply optimistically and must reconcile.** A client may render
   the expected outcome immediately, but holds it as pending until the server
   confirms. On rejection, or on a confirmation that differs, the client rolls back
   to the last server-confirmed state. A client never silently diverges, and there
   is no code path where a client's local guess wins.
4. **Reconnection replays by sequence number.** A client reports the last sequence
   it saw; the server sends everything after it, or tells the client to
   resynchronize from scratch if the gap is too large. This is the reason sequence
   numbers are per-world and monotonic rather than timestamps.
5. **Last-write-wins per field is sufficient for v1.** Written down explicitly so
   nobody builds CRDTs or operational transforms for a table of five friends. When
   two operations touch the same field, the later sequence number wins, and that is
   a correct answer for this product.
6. **Token movement gets its own throttled operation type**, rather than going
   through generic document updates. It is the hot path: it fires continuously
   during a drag, it does not need per-frame durability, and it should be coalesced
   on the client and rate-limited on the server. Only the settled position needs to
   be a durable operation.
7. **The operation log is the undo substrate.** Prep-mode undo replays or inverts
   logged operations. This is why undo is scoped to prep mode and to the GM:
   inverting an operation other clients have already acted on is a fundamentally
   harder problem, and CLAUDE.md declines it in play mode for that reason.

## Consequences
- **One place to reason about consistency.** Every state change goes through one
  validated, ordered, transactional path, so "why do these two clients disagree"
  has a small number of possible answers.
- **The operation vocabulary becomes an API surface** that must be designed and
  versioned per document type. That is more upfront work than a generic document
  update endpoint, and it is the main cost here.
- **Optimistic updates need real rollback handling in the client**, which is easy
  to skip and hard to retrofit. Any Pinia store that applies an operation
  optimistically must be able to unapply it, so this shapes store design from
  milestone 1.
- **The log grows** and needs pruning — probably retaining operations back to the
  last snapshot, since a snapshot plus the log is a complete recovery story.
  Snapshots and the operation log are the same mechanism at two time scales.
- **Single-writer-per-world is assumed throughout**, which is exactly what ADR
  0002's single-process SQLite provides. These two decisions stand or fall
  together: a multi-process deployment would break this model, not merely this
  store.
- **e2e tests must cover the rejection and reconnection paths**, not just the happy
  path. A Playwright test that drops the socket mid-combat and reconnects is worth
  more than several unit tests here.

## Alternatives considered
### CRDTs (Yjs or Automerge)
Genuinely elegant, and would give offline editing and conflict-free merge for
free. Rejected: the conflicts CRDTs solve well are concurrent text editing by many
people, while our actual conflicts are two people moving one token, where
last-write-wins is not merely acceptable but correct. The cost — a second data
model, opaque merge semantics, and much harder debugging when a table reports a
wrong number — is out of proportion to the problem.

### Server as a dumb relay, clients resolve conflicts
Simplest to build, and tempting for a trusted table of friends. Rejected: it makes
every client a source of truth, so a buggy or stale client can corrupt the world
and rules automation becomes unverifiable. It also hands the client authority over
things the GM should control.

### Whole-document writes with optimistic-concurrency version numbers
A conventional and much smaller design: read version N, write version N+1, retry on
conflict. Rejected because a token drag would conflict with an unrelated HP change
on the same actor, producing retries and lost work for edits that never actually
overlapped. Field-level operations avoid this by construction.

### Pessimistic locking (a client checks out a document)
Rejected as a UX failure before a technical one. "Someone else is editing this
token" is not an acceptable message at a live table.
