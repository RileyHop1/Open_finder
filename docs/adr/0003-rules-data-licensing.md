# 0003. Rules data: import only ORC/Remaster content, never commit it

- **Status:** Accepted
- **Date:** 2026-09-28
- **Note:** This is not legal advice. It records the reasoning behind a
  conservative position taken by a hobby project. It must be reviewed properly
  before the project is published or distributed.

## Context
A PF2e VTT is useless without rules data: thousands of spells, feats, items, and
creatures, each with structured mechanics. Authoring that by hand is not viable.

The obvious source is the community foundryvtt/pf2e repository, which has already
done the structuring work. Its licensing is layered, and the layers matter:

- **Its code is Apache-2.0**, which is compatible with our MIT license as long as
  attribution and the NOTICE file are preserved.
- **Its game content is a different matter.** That content sits under Paizo's
  agreement *with Foundry Gaming LLC*. Being able to read a file in a public
  repository is not the same as holding a license to redistribute what it
  contains. That agreement does not extend to downstream projects, including us.
- **Separately, some PF2e material is ORC-licensed.** The Remaster line (Player
  Core, GM Core, Monster Core, and so on) is released under the Open RPG
  Creative license, which does permit reuse under its own terms.
- **Art is licensed separately again** from text, and generally not reusably.

So the safe intersection is: Remaster rules text and mechanics, sourced under
ORC, with no art, and with nothing checked into this repository.

## Decision
1. **Remaster only.** Import an entry only when its publication is an
   ORC-licensed Remaster book. Legacy and pre-Remaster content is excluded, and
   this is the reason the charter's "Remaster only" rule exists at all — it is a
   licensing boundary first and a design preference second.
2. **Never commit Paizo content to this repository.** The importer downloads the
   pinned upstream packs at setup time and writes converted output to a
   git-ignored folder. This repository contains our MIT code, our Zod schemas,
   and fixtures we wrote ourselves.
3. **Never import art.** No icons, tokens, portraits, or maps from upstream.
4. **Record provenance on every entry.** Each imported document carries its
   source book and license, so the UI can attribute it and so a later audit can
   answer "where did this come from" per record.
5. **Exclude dependent content whole.** If a Remaster entry's mechanics depend on
   something we did not import, drop the entry rather than strip the reference.
   Silently removing a link can change what a feat does, which produces wrong
   rules rather than missing ones.
6. **Pin the upstream commit and checksum the download.** A pinned commit is not
   enough on its own: upstream can force-push or delete a ref, and a silent
   content change would move golden test values with no diff in this repo.
   Re-importing is a deliberate, reviewed PR that updates both pin and checksum.
7. **Ship the ORC notice** and follow Paizo's Community Use Policy. No Paizo
   trademarks in the project name, logo, or marketing.

## Consequences
- **Coverage will have holes**, and users will notice. Legacy content, non-ORC
  adventure material, and anything whose dependencies we excluded will be
  missing. The honest answer to "where is X" is that we cannot ship it, and the
  UI should make missing content visible rather than silently absent.
- **The importer becomes a licensing-critical component**, not a convenience
  script. Its publication filter is the mechanism enforcing this ADR, so it needs
  tests of its own and a reviewed diff whenever the filter changes.
- **Golden test fixtures are constrained** in a way that is easy to forget: a
  published creature's stat block is content. Golden characters are ours, built
  by applying rules; golden creatures are invented monsters with hand-computed
  stats. See the Testing section of CLAUDE.md.
- **Setup requires network access**, and so does CI. CI caches by upstream
  commit, and the checksum makes a cache hit trustworthy.
- **Upstream could change or disappear.** Because converted output is
  git-ignored, a contributor cannot build the data without upstream being
  reachable. Accepted, with the checksum as the guard against silent drift.

## Alternatives considered
### Import everything from upstream, legacy included
Far better coverage, and what most hobby projects do in practice. Rejected: it
would mean redistributing content we have no license to redistribute, relying on
Foundry's agreement as though it covered us. "Everyone does it" is not a license.

### Commit the converted data to this repository for convenience
Would make setup trivial and CI offline. Rejected: this is exactly the act of
redistribution the whole ADR exists to avoid, and a public git history is
permanent.

### Author all rules data ourselves from the ORC books
Maximally safe, and would remove the upstream dependency entirely. Rejected as
infeasible for a solo maintainer — it is years of data entry before the app does
anything — but note that this is what the golden fixtures do on a small scale.

### Depend on upstream at runtime instead of import time
Rejected. It does not change the licensing position at all (we would still be
delivering the content to users), and it adds a hard runtime dependency on a
third party for a self-hosted app that should work offline.
