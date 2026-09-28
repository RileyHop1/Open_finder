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
