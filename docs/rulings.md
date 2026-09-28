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

*None yet. The first entries will arrive with milestone 2 (rules data) and
milestone 3 (character sheet), when the math starts being computed rather than
stored.*
