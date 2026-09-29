# @hearthtable/dice

The dice expression parser and evaluator. Every roll in the app goes through
this package.

Full specification: **[docs/dice.md](../../docs/dice.md)** — read that before
changing anything here. It defines the grammar, the fortune/misfortune
interaction, degrees of success, and how critical damage is computed.

## What lives here
- The expression parser (`2d6+4`, `1d20+@perception`, `2d20kh1`)
- The evaluator, which takes an **injectable RNG** so tests are deterministic
- Degrees of success, exported separately so a future system plugin can ignore
  them
- Damage evaluation, which returns damage **by type**, never as a single number

## How it fits
**System-agnostic.** This package knows about dice, arithmetic, keep/drop, and
rerolls. It does not know what Athletics is or how a DC is computed.

**The server rolls, never the client** (`docs/adr/0005-concurrency.md`). A
client sends a roll request as an operation; the server evaluates it here,
persists the structured result, and broadcasts it.

Imported by: `@hearthtable/pf2e`, `@hearthtable/server`, `@hearthtable/client`.

## Two entry points
- **`@hearthtable/dice`** — the full public API, including `cryptoRandomSource`.
  That one function imports `node:crypto`, so this entry point is server-only.
- **`@hearthtable/dice/pure`** — everything else: the parser, the evaluator,
  degrees of success, damage evaluation, and every exported type. No Node
  dependency anywhere in this entry point's module graph, so an isomorphic
  package can import it without pulling Node's types into a project that
  doesn't configure them. `@hearthtable/core` imports from here to mirror
  `RollResult` for its `ChatMessage` schema — see `packages/core/src/chatMessage.ts`.
  `evaluate()`/`evaluateDamage()` still work fine from this entry point: they
  take a `RandomSource` as a parameter rather than importing one, so a caller
  supplies its own (the server passes `cryptoRandomSource` from the main entry
  point).
