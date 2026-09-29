# Rulings

Every rules judgment call this project makes, and why.

## Why this file exists
"The rules are handled for you" is the product's central promise, and PF2e has
interactions the community genuinely argues about. When we automate one of those,
we are picking a side. This file records which side and why, so that:

- the same argument is not re-litigated across three separate issues;
- a contributor changing rules math can see whether they are fixing a bug or
  reversing a deliberate decision;
- a GM who disagrees can find our reasoning and override it (see the GM override
  requirement in CLAUDE.md).

Scope is judgment calls only. Ordinary bugs — we implemented the rule wrong —
belong in the issue tracker, not here.

## Policy
See "Rulings and ambiguity" in CLAUDE.md. In short: automate the unambiguous
reading; where the rules are genuinely ambiguous, implement the most common
reading, make sure the GM can override it, record it here, and pin it with a
golden test.

## How to add an entry
One entry per judgment call, newest at the bottom. Keep the format:

```
### <Short name for the interaction>
- **Rules text:** what the books actually say, and where (book + section, no
  page-length quotations).
- **The ambiguity:** what is unclear, stated neutrally.
- **Our reading:** what we implemented.
- **Alternative reading:** the other credible interpretation, and who reads it
  that way.
- **Why:** the reason we chose ours. "Most common at tables" is a valid reason;
  say so if that is the reason.
- **Golden test:** the fixture that pins this behavior.
- **Override:** how a GM who disagrees gets the other result.
```

If an entry has no golden test, it is not settled — the test is what stops the
ruling from silently drifting.

## Entries

### Proficiency without level is not supported
- **Rules text:** Player Core's proficiency rules; the Remaster's default math
  adds a character's level to every proficiency rank at trained or above.
  Separately, the GM Core (and the pre-Remaster core rulebook before it)
  publishes an optional variant, Proficiency Without Level, which drops the
  level term entirely and rebalances DCs around flat rank bonuses instead.
- **The ambiguity:** not a rules ambiguity so much as a scope question --
  whether to support the variant rule at all, since some tables prefer its
  flatter math.
- **Our reading:** level-based proficiency only. `proficiencyModifier(rank,
  level)` (`systems/pf2e/src/rules/proficiency.ts`) adds level to the rank's
  own bonus for trained and above, and untrained is a flat `+0` -- never
  level, at any rank.
- **Alternative reading:** implement Proficiency Without Level as a togglable
  variant, the way some other VTTs do.
- **Why:** CLAUDE.md's Content scope section excludes variant rules by name
  (alongside Free Archetype and Dual-Class) precisely because supporting more
  than one build/math skeleton multiplies the surface area a solo maintainer
  has to test. This is that exclusion applied to the resolver.
- **Golden test:** no golden fixture yet -- Stack E (the golden harness) has
  not landed. `proficiency.test.ts` pins the exact values for every rank at
  levels 1 and 20 in the meantime; the golden Fighter (E.2) will exercise
  this function for real once it exists, and this entry should gain a golden
  fixture reference at that point.
- **Override:** none needed at the table -- this is a build-time content
  scope decision, not a per-character automation result a GM would want to
  flip live. A table that wants Proficiency Without Level is not using the
  rule this project implements at all, the same way a table using Free
  Archetype is outside the wizard's one supported build skeleton.
