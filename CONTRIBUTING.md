# Contributing

Read [CLAUDE.md](CLAUDE.md) first. It is the charter: what we are building, what
we are deliberately not building, and the rules the project holds itself to.
This file is the practical version.

## Setup

```bash
corepack enable        # or: npm install -g pnpm
pnpm install
pnpm typecheck && pnpm test
```

## The one rule that matters most

**Never commit Paizo content.** Rules data is downloaded at setup time and
converted into git-ignored folders:

```
systems/pf2e/.data/upstream/   # downloaded upstream packs
systems/pf2e/.data/imported/   # our converted output
worlds/                        # user worlds: databases, assets, snapshots
```

CI fails if anything under those paths becomes tracked, and it fails if the
ignore patterns are weakened. Do not work around it — git history is permanent,
and this is a licensing boundary, not a tidiness preference. See
[docs/adr/0003-rules-data-licensing.md](docs/adr/0003-rules-data-licensing.md).

## Pull requests

PRs are reviewed by hand, one sitting each. That constrains their size.

- **One branch = one PR = one concern.** No drive-by refactors, no bundled fixes.
  If you notice something unrelated, open an issue.
- **Under ~300 changed lines**, excluding lockfiles and generated files. Bigger
  features become a stack of PRs: schema, then server, then UI.
- **Branch names:** `type/short-description` — `feat/dice-parser`,
  `fix/initiative-tie`, `docs/journal-model`, `chore/ci-cache`.
- **Commits follow [Conventional Commits](https://www.conventionalcommits.org):**
  `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`, `ci:`, `style:`.
- **CI green before review.** Tests ship in the same PR as the code.
- **Unsure how to split something?** Propose the breakdown first and wait.

## Development order

Vertical slices, backend-leading — not a backend phase then a frontend phase.
Within a feature, go schema then server then UI, so nothing is built against a
data shape that might still move. See the Development order section of
[CLAUDE.md](CLAUDE.md).

## Code

- `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  and `noImplicitOverride`.
- **No `any`. No `@ts-ignore`.** If genuinely unavoidable, use `@ts-expect-error`
  with a description of why. All three are enforced by ESLint, not by review.
- Types are **inferred from** Zod schemas, never written twice.
- Every exported function, type, and class gets a TSDoc comment.
- **`packages/core` must not import `systems/pf2e`.** The core engine is
  system-agnostic. This is enforced twice: the dependency is not declared, and
  ESLint reports it.

## Tests

- Unit tests for all rules math.
- **Golden tests** pin known-correct stats for reference characters and
  creatures. Any change that moves a golden value fails CI until reviewed.
  **Add a golden case with every rules fix.**
- Golden fixtures are written by us. Never paste a published stat block into a
  fixture — see the Testing section of CLAUDE.md for why that is a licensing
  issue and not just a style one.
- Playwright covers core end-to-end flows.

## Rules disagreements

PF2e has interactions people read differently. If you implement one, record the
judgment call in [docs/rulings.md](docs/rulings.md) — what the ambiguity is,
which reading we took, and why — and pin it with a golden test. Do not settle it
silently in code.
