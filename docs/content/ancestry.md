# `ancestry`, `heritage`, `background`

The three content kinds a character-creation flow picks from first. See
[../content-model.md](../content-model.md) for the shared vocabulary and
[../compendium.md](../compendium.md) for the envelope. These schemas carry
the *data*; the actual step-by-step creation flow is milestone 8's wizard.

## `ancestry`

| Field | Type | Notes |
| --- | --- | --- |
| `hp` | positive integer | Ancestry hit points |
| `size` | one of `SIZES` | |
| `speed` | positive integer | Feet |
| `boosts` | `readonly Attribute[]`, default `[]` | Fixed boosts every member gets |
| `freeBoosts` | non-negative integer, default `0` | Additional player-chosen boosts (any attribute) |
| `flaws` | `readonly Attribute[]`, default `[]` | **(confirm)**: the Remaster is understood to have removed mandatory ancestry flaws entirely; kept rather than dropped, in case a core-book ancestry still has one |
| `languages` | `readonly string[]`, default `[]` | |

Attribute boosts are their own fields, not `ruleElements`: a boost is a
character-creation-time score adjustment with its own diminishing-returns
rule (a fourth boost past 18 is only +1), a different mechanic from a rule
element's always-on `Modifier`.

## `heritage`

| Field | Type | Notes |
| --- | --- | --- |
| `ancestrySlug` | string, optional | Which ancestry this heritage belongs to, by slug in the `ancestries` pack. Absent means a **versatile heritage**, usable with any ancestry |

## `background`

| Field | Type | Notes |
| --- | --- | --- |
| `boostOptions` | `readonly Attribute[]`, min 1 | The attributes this background offers a boost choice between (every background also grants one free boost, identical across all of them, so it isn't listed per entry) |
| `trainedSkills` | `readonly string[]`, min 1 | Free strings, not a closed skill vocabulary -- Lore skills ("Academia Lore") are themselves free text |

A background's granted skill feat is expressed via the existing `grantItem`
rule element (already on the envelope), not a bespoke field -- that would be
two ways to say the same thing.

## Testing

See `ancestry.test.ts`, `heritage.test.ts`, and `background.test.ts`: a
human-shaped ancestry (no fixed boosts, two free) and an elf-shaped one
(fixed boosts plus one free), a heritage tied to an ancestry and a versatile
one with no `ancestrySlug`, and a background with its skill feat expressed
as a `grantItem` rule element.
