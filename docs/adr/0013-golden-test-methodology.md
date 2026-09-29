# 0013. Golden tests are hermetic; the real import runs in its own CI job

- **Status:** Accepted
- **Date:** 2026-09-29
- **Relates to:** ADR 0003 (licensing constraints on fixtures), ADR 0011 (what
  the real import needs to run)

## Context
CLAUDE.md's Testing section says: "CI runs the importer (cached by upstream
commit) before golden tests." Read literally, that makes the main `check` job —
the one every PR waits on — depend on network access to a third-party GitHub
repository and a real run of the importer against ~30,000 upstream entries,
before a single rules-math assertion executes.

That dependency is a bigger cost than the sentence suggests, for reasons that
were not fully visible when the charter was written and milestone 2 had no code
yet:

1. **Golden characters are hand-built**, per CLAUDE.md's Testing section — "golden
   characters are built by us by applying the rules" — precisely so they never
   need a published stat block. A golden test asserting a Fighter's AC does not
   need the *real* Fighter class entry from `foundryvtt/pf2e`; it needs a Fighter
   class entry, and a hand-authored one pinned in the test file is exactly as
   good for that purpose, with none of the network dependency.
2. **A flaky or slow upstream fetch would block every PR**, including ones that
   touch neither the importer nor rules math, for a repository this project does
   not control.
3. **The importer's own correctness — the license filter, the scope filter, the
   dependency-drop pass — is much easier to prove against small, invented
   fixtures we control** than against real data where the "correct" filtered
   output is itself a 30,000-entry question nobody can eyeball.

The goal the charter's sentence was actually protecting — "a change to the
importer or the rules math that would move real numbers gets caught" — is still
worth having. It just does not require the *main* CI path to touch the network.

## Decision
**Split hermetic correctness from real-data drift detection into two different
tests, running in two different places.**

1. **Golden tests are hermetic.** They run against hand-authored fixtures — an
   invented Fighter class entry, an invented longsword, an invented spell — built
   the same way the golden *creatures* in CLAUDE.md already are: by us, by hand,
   with known-correct computed stats. They exercise the rules engine (Stack D)
   end to end, not the importer.
2. **Importer *logic* tests are hermetic too.** The license filter, the scope
   filter, the rule-element mapper, and the dependency-drop pass are tested
   against synthetic Foundry-shaped JSON authored in the test files, containing
   zero real entries and zero Paizo content. This is what proves the filters are
   correct on cases we control, including edge cases (missing publication,
   `remaster: false`, a cross-reference into excluded content) that may be rare
   or absent in the real data on any given day.
3. **A separate `import-smoke` CI job runs the real importer** against the
   pinned upstream commit, cached by that commit's checksum (ADR 0011). It
   asserts only **aggregate invariants** — the checksum matches, every pack has a
   non-zero kept count, zero entries fail schema validation, the drop rate stays
   under a threshold — and prints only the aggregate coverage projection from the
   coverage report. It never prints, asserts on, or snapshots individual entry
   names or content, because those are Paizo content and this job's log is
   public CI output.
4. **The main `check` job stays network-free.** `pnpm test` — golden tests
   included — runs with no network access required, and its runtime does not
   depend on GitHub's availability.

## Consequences
- **Every PR's core feedback loop is fast and reliable**, independent of a
  third party. A contributor fixing a typo in the client never waits on a
  30,000-entry download.
- **The importer's filters are provably correct on the cases that matter most** —
  the ones designed to be edge cases — rather than only "correct on whatever
  today's real data happens to contain."
- **Real-data drift is still caught**, just in a different job with a different
  failure mode: `import-smoke` fails loudly (wrong checksum, a pack that
  suddenly imports zero entries, a spike in dropped content) without blocking
  unrelated PRs, since it can be configured to run on a schedule or on
  `systems/pf2e` changes rather than on every push.
- **A hermetic golden fixture can, in principle, drift from what upstream's real
  data actually looks like.** The mitigation is `import-smoke`'s aggregate
  invariants plus the coverage report, not the golden set itself — the golden
  set's job is pinning our own rules math, not upstream fidelity.
- **This is a deliberate refinement of CLAUDE.md's Testing section**, not a
  reversal of its intent. The charter's sentence is updated in the same PR that
  adds the `import-smoke` job (milestone 2's CI stack), so the document and the
  behavior change together rather than the document quietly going stale.

## Alternatives considered
### Follow the charter's sentence literally
Highest fidelity: a real upstream change breaks CI on the very next PR, not on
a delayed schedule. Rejected as the default path for every PR: it makes an
unrelated client-only change wait on a third-party network fetch and a full
import run, and CLAUDE.md's own golden-fixture rules already made the "test
against real data" assumption looser than the sentence implied, since golden
characters were never going to be built from real published stat blocks anyway.

### Golden tests hermetic, but no separate real-import job at all
Simplest: drop the literal sentence and never run the real importer in CI.
Rejected: it would mean nothing in CI ever exercises the actual fetch-and-import
pipeline end to end, so a break in the real thing (a checksum mismatch, an
upstream layout change, a publication title that stopped matching the allow
list) would only be discovered by a contributor running the importer locally by
hand — exactly the kind of silent drift ADR 0003's checksum requirement exists
to prevent.

### A nightly-only real-import job, never on-demand
Keeps every PR fast and still catches drift, just later. Considered seriously,
and not rejected outright — it is a reasonable variant of the same idea. Not
adopted as the primary mechanism for milestone 2 because a PR that changes the
importer itself should see the real-import result before merging, not the next
morning; `import-smoke` running on `systems/pf2e` changes (with a schedule as a
backstop for drift on days nothing changes) covers both cases without picking
one exclusively.
