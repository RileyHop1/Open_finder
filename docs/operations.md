# Operations

The client-to-server vocabulary and the server's broadcast envelope, from
`@hearthtable/core`'s `operation.ts`. Architectural background is ADR 0005;
this page documents the concrete shapes that actually exist right now.

**The vocabulary grows per slice.** Only the four operations milestone 1's
lobby and chat need are defined. A later milestone adds more when it needs
them — this page grows with the code, not ahead of it.

## Two envelopes, not one

**What a client sends** (`ClientOperation`): `{ id, type, payload }`. Nothing
else. In particular, no `worldId` and no `seatId`.

**What the server broadcasts** (`AppliedOperation`, inside a `Broadcast`):
adds `worldId`, `seatId` (if the connection has claimed a seat), `sequence`,
and `appliedAt`.

The missing `worldId`/`seatId` on the client side is deliberate, not an
oversight: both are facts the server already knows from the connection itself
— which world's room this socket joined, and which seat (if any) it has
claimed — and it must derive them itself rather than trust a client-supplied
value. ADR 0005's server-authoritative model means identity comes from the
connection, never from the payload; a client that could self-report its own
`seatId` could claim to be someone it isn't.

## The four operations

| Type | Payload | Notes |
| --- | --- | --- |
| `seat.claim` | `{ seatId }` | The seat to claim. A connection already holding a different seat may send this directly to switch — the handler auto-releases the old one rather than requiring a separate release first |
| `seat.release` | `{}` | No target — releasing is self-referential, the server already knows which seat this connection holds |
| `chat.sendMessage` | `{ text }` | Plain chat |
| `chat.sendRoll` | `{ expression }` | The **raw text** the player typed (`"1d20+7"`), never a computed result — see below |

### Why `chat.sendRoll` carries text, not a number

`@hearthtable/dice`'s own rule is that the server rolls, never the client. The
payload reflects that literally: it has no field for a total, a degree of
success, or anything else a client could have computed. The server parses and
evaluates the expression with `@hearthtable/dice` and the resulting
`ChatMessage` stores the structured `RollResult` — never a rendered string,
per CLAUDE.md's ChatMessage rule.

## The broadcast envelope

```ts
{ sequence, operation, documents }
```

`documents` is the documents that changed — never a diff format. This is the
simplest shape that satisfies ADR 0005; a diff format is exactly the kind of
complexity CLAUDE.md's Development order section says not to build ahead of a
real need.

### Why `documents` validates in loose mode

Each entry validates against the shared document envelope in **loose** mode
(`baseDocumentSchema.loose()`), not the default. This matters, and was
verified directly rather than assumed: Zod's default `z.object()` silently
**strips unknown keys** on parse.

```
z.object({ a: z.string() }).safeParse({ a: 'x', extra: 'y' })
// → { a: 'x' } -- `extra` is gone
```

If a future concrete document (say, `Party` with its own `memberIds` field)
were validated through the plain base schema on its way through this
envelope, its own fields would vanish silently. `.loose()` checks the shared
fields and passes everything else through unchanged. This is correct, not
just convenient: full type-specific validation already happened when the
document was created or updated against its *own* concrete schema (which
doesn't exist yet, but will validate the whole shape when it does) — this
envelope only needs to confirm "at least a document," not re-validate
everything a second time.

## Permission resolution

`resolvePermission(seat, document)` — not part of `operation.ts`, but the
mechanism every operation handler will use to decide what a seat may do.

- The GM always resolves to `owner`, regardless of what the document stores
  ("GM sees all," CLAUDE.md's Architecture section).
- Otherwise: an explicit per-seat override on the document wins; no override
  falls back to the document's own `default`.
- A seat and a document from **different worlds** always resolve to `none`,
  even for a GM seat. No real caller should ever call this with a mismatched
  pair — every caller resolves within one connection's single active world —
  but the function does not trust that it won't happen.

## Testing

See `packages/core/src/operation.test.ts` and `permission.test.ts`. Notably:
the union genuinely discriminates (a `seat.claim`-shaped payload sent as
`chat.sendMessage` is rejected, not silently accepted); a `chat.sendRoll`
payload carrying an extra `total` field parses successfully but that field is
gone from the output, proving a client cannot smuggle a result through; and
`broadcastSchema` round-trips a document with unknown extra fields intact,
proving `.loose()` actually behaves as documented above and not just in
theory.
