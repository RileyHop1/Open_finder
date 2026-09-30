# Golden tests

CLAUDE.md's Testing section requires a golden set: reference characters and
creatures with known-correct stats, so a rules-math change that shifts a value
fails CI until reviewed. This page is the implementation spec for that set,
starting with the harness Stack E's first PR (`test/golden-harness`) adds.

## Why not just assert totals

A `Statistic`'s `total` can stay the same while its explanation breaks --
ADR 0008's consequences section calls this out directly: change a modifier's
`type` from `status` to `circumstance`, and if nothing else of that type is
present, the total is identical. The stacking behavior is still wrong, and a
golden test that only checks totals would never notice. So a golden fixture
pins **which modifiers applied and which were suppressed**, not just the
number they added up to -- see `docs/modifiers.md` for what "applied" and
"suppressed" mean.

## The fixture format

`systems/pf2e/src/golden/describeGolden.ts` exports:

- **`GoldenFixture`** -- a name, and a map of statistic name (`'ac'`,
  `'fortitude'`, `'skill:stealth'`, a strike's slug, ...) to a
  **`GoldenStatisticExpectation`**: an expected `total`, plus an optional list
  of named modifiers to check by `slug` -- each pinning whether it should be
  `applied`, and optionally which other modifier's slug should show up as
  `suppressedBy`. Not every modifier on a statistic needs an entry; pin the
  ones the fixture is actually testing for.
- **`compareGolden(fixture, actual)`** -- the pure comparison. Returns a list
  of `GoldenDiscrepancy` (empty means everything matched). Kept separate from
  the Vitest wiring below so the comparison logic itself has ordinary,
  synchronous unit tests, including its failure paths -- see
  `describeGolden.test.ts`.
- **`describeGolden(fixture, buildActual)`** -- registers one `it` per named
  statistic, so a broken save doesn't hide a broken skill in the same run.
  `buildActual` runs once, synchronously, when the block is collected: every
  Stack D builder (`buildArmorClass`, `buildSave`, `buildSkill`, ...) is a
  pure function, so there is nothing here that needs a `beforeAll`.

A golden character file (starting with E.2's Fighter) calls `describeGolden`
once, passing a fixture built by hand from the Remaster rules and a
`buildActual` that assembles the character's attributes, then calls Stack D's
builders exactly the way a real sheet eventually will.

## Determinism

A strike's attack and damage rolls need dice, and a golden fixture has to
produce the exact same numbers on every run, on every machine, forever.
`@hearthtable/dice/testing` (a package subpath, separate from the root and
`./pure`, so a stray import from production code can't pull in test
infrastructure) exports:

- **`seededRandomSource(seed)`** -- a small deterministic PRNG (mulberry32).
  Same seed, same sequence, always. This is the one golden fixtures use.
- **`sequenceRandomSource(values)`** -- a fixed, hand-picked sequence, one
  value per call. Better than a seed when a test needs to pin an exact die
  result (a specific crit, a specific miss) rather than "some reproducible
  sequence."
- **`neverRoll()`** -- fails loudly if called, for asserting no dice were
  rolled at all.

`packages/dice/src/evaluator.test.ts` used to define its own copy of
`seededRandomSource`; it now imports the promoted one from `testHelpers.ts`,
so there is exactly one implementation.

## Content rules (from CLAUDE.md)

- **Golden characters are built by us**, applying the rules by hand from a
  chosen ancestry/background/class -- never copied from a published example.
- **Golden creatures are our own invented monsters** with hand-computed
  stats. Never paste a stat block from the compendium into a fixture: a
  published creature's numbers are Paizo content, and committing them here
  would break the "never commit Paizo content" rule (ADR 0003).
- Every fixture uses invented names, matching the rest of Stack D's test
  fixtures (ADR 0013).

## What's not decided yet

- **Level coverage** -- whether every class needs a fixture at every level,
  or a smaller sweep (1 / 5 / 11 / 17) is enough. This is CLAUDE.md's open
  question; E.9 answers it once there is a real scaling fixture to point to,
  and that PR is what strikes the question from CLAUDE.md.
- **The strike-roll fixture shape** -- today's `GoldenStatisticExpectation`
  covers a pre-roll `Statistic` (an attack bonus, a DC). Whether a rolled
  result (total plus degree of success) needs its own expectation shape, or
  reuses this one with the rolled total substituted in, is E.2's call to
  make once a real Fighter fixture needs one.
