# Dice: `packages/dice`

The parser and evaluator for every roll in the app. This is the first real PR in
the project and everything downstream calls it, so the surface is specified here
before any code exists.

Rules references in this document are from Player Core. Where a detail is marked
**(confirm)**, check the book during implementation rather than trusting this
page — these are the places it is easy to be subtly wrong.

## Scope
`packages/dice` is **system-agnostic**. It knows about dice, arithmetic, keep/drop,
and rerolls. It does not know what a Strike is, what Athletics is, or how PF2e
computes a DC. Anything PF2e-specific belongs in `systems/pf2e`, which calls into
this package.

The one exception is the degrees-of-success table below. It lives here because it
is pure arithmetic over a roll result, but it is exported separately so a future
system plugin can ignore it.

## The server rolls
**Dice are rolled on the server, never on the client.** A client sends a roll
*request* as an operation; the server evaluates it, persists the result, and
broadcasts it. This follows from the authoritative-server rule in ADR 0005, and
it has two practical consequences:

- A client cannot reroll until it likes the number.
- The evaluator takes an injectable RNG. Production uses `crypto.randomInt`;
  tests use a seeded generator so every golden case is deterministic.

## Expression grammar
```
expression   := term (("+" | "-") term)*
term         := dice | integer | reference
dice         := count? "d" faces modifiers*
modifiers    := keep | drop | reroll | explode?
keep         := ("kh" | "kl") count?
drop         := ("dh" | "dl") count?
reroll       := "rr" comparison
reference    := "@" identifier
comparison   := ("<" | "<=" | "=" | ">=" | ">") integer
```

Examples: `1d20+7`, `2d6+4`, `1d20+@perception`, `2d20kh1` (fortune),
`2d20kl1` (misfortune), `1d6rr<2`.

`explode` is in the grammar for completeness but **is not implemented in v1** —
PF2e has no exploding dice. It is listed so nobody adds it ad hoc later.

`@references` resolve against a context object supplied by the caller. The dice
package does not know where `@perception` comes from; it asks.

## Fortune and misfortune
These are rules effects, not just keep-highest, and the interaction is the part
implementations get wrong:

- **Fortune:** roll twice, use the higher result.
- **Misfortune:** roll twice, use the lower result.
- **You cannot benefit from more than one fortune effect on a single roll**, and
  likewise for misfortune. A second one of the same kind is ignored, not stacked.
- **A fortune effect and a misfortune effect on the same roll cancel**: you roll
  once, normally. Not twice-keep-higher-then-twice-keep-lower.

Because of that cancellation rule, the caller cannot simply append `kh1` when it
sees a fortune effect. The evaluator takes fortune and misfortune as **flags on
the roll request**, resolves them against each other first, and only then decides
how many dice to roll. Encode this as a unit test with all four combinations.

## Degrees of success
For a check against a DC:

| Result | Degree |
| --- | --- |
| total ≥ DC + 10 | critical success |
| total ≥ DC | success |
| total ≤ DC − 10 | critical failure |
| otherwise | failure |

Then, **after** the degree is determined from the total:

- a natural 20 on the d20 improves the degree by one step;
- a natural 1 worsens it by one step.

Order matters. A natural 20 that still falls short of the DC is a *success*, not
a critical success, and a natural 1 on a total that beat DC+10 is a *success*.
Implementing the nat-20/nat-1 shift before comparing to the DC is the classic
bug; a golden test should pin both cases.

Degrees are a four-value enum, and shifting past either end clamps.

## Damage
Damage rolls are their own evaluation path because critical hits change the
expression rather than multiplying the result blindly.

- **A critical hit doubles the entire damage total**, including ability modifiers,
  item bonuses, and precision damage — not just the dice. Double the total once;
  do not double each component separately and re-sum (same answer for addition,
  but it makes the breakdown unreadable).
- **`deadly`** adds an extra damage die of the listed size on a critical hit, and
  **that extra die is not doubled**. With striking runes the number of extra dice
  scales with the weapon's damage dice **(confirm the exact scaling)**.
- **`fatal`** changes the weapon damage die to the listed size on a critical hit
  and adds one additional die of that size; the doubling then applies to the
  result **(confirm)**.
- **Splash damage is not doubled** on a critical hit.
- **Precision damage is doubled**, because it is part of the damage roll.
- **Persistent damage** is a condition with its own recurring roll, not part of
  the initial damage expression. It belongs in `docs/conditions.md`.
- Damage reduced below 0 deals 0. There is no minimum of 1.

The evaluator returns damage **by type** (`piercing`, `fire`, `persistent:bleed`,
`splash`, …), never as a single number, because resistances, weaknesses, and
immunities are applied downstream and cannot be recovered from a total.

## Return shape
Every evaluation returns a structured result, never a string:

```ts
{
  expression: string;        // as written
  total: number;
  terms: RollTerm[];         // each die, its faces, its result, kept or dropped
  degree?: DegreeOfSuccess;  // when a DC was supplied
  natural?: number;          // the d20 face, for the nat-20/nat-1 rule
  damage?: DamageByType;     // damage rolls only
  seed?: string;             // test builds only
}
```

This is what `ChatMessage` stores. **Never store a rendered string as the source
of truth** — the hoverable combat-log breakdowns in the north star are a view
over `terms`, and a message persisted as `"Riley rolled 17"` can never be
un-flattened. See the ChatMessage rule in CLAUDE.md.

Dropped dice are retained in `terms` and marked dropped, not removed. Seeing the
die that fortune discarded is most of the appeal of showing the math.

## Testing
- Grammar: every production above, plus malformed input producing a typed parse
  error rather than throwing.
- Fortune/misfortune: all four combinations of present/absent.
- Degrees of success: the boundary values DC−10, DC−1, DC, DC+9, DC+10, each
  crossed with natural 1, natural 20, and an ordinary face.
- Damage: crit doubling with and without `deadly`, `fatal`, splash, and precision.
- Determinism: the same seed produces the same result across runs.
