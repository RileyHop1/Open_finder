# Rule elements

Data-driven automation attached to a compendium entry. See
[adr/0004-rule-elements.md](adr/0004-rule-elements.md) for why this is our own
schema and why the subset below is deliberately small; this page is the
implementation spec.

## The rule

**Nothing outside the importer knows Foundry's rule-element format exists.**
This schema is informed by upstream's design but is not a copy of it, and the
importer (`systems/pf2e`, milestone 2) is the only module that maps one onto
the other.

## The v1 subset

| Kind | What it does | Key fields |
| --- | --- | --- |
| `flatModifier` | A typed bonus or penalty to a statistic | `selector`, `type`, `value` (integer only), `predicate?` |
| `damageDice` | Extra damage dice on a strike or spell | `selector`, `diceNumber`, `dieFaces` (4/6/8/10/12), `damageType?` |
| `rollOption` | Adds a tag to the active roll-options set | `option`, `predicate?` |
| `grantItem` | This item also grants another compendium entry | `packId`, `slug` (our own identity, not an upstream UUID) |
| `choiceSet` | The player picks one of several options | `prompt`, `choices`, `rollOptionPrefix` |

A choice's value becomes the roll option `${rollOptionPrefix}:${value}`, so a
`choiceSet` composes with `flatModifier`/`rollOption` predicates exactly like
any other roll option.

## `inert`: the fallback

Anything outside the subset above -- an unmapped upstream element type, or a
supported kind used in a way the subset can't represent (a formula-valued
`FlatModifier`, a predicate needing a comparison operator) -- becomes:

```ts
{ kind: 'inert', upstreamKind: 'ItemAlteration', reason: 'unmapped-element-kind' }
```

**Never dropped.** The item still imports with its rules text intact; the
sheet marks it "automation not applied" so the GM can apply it by hand (ADR
0004 decision 4). `InertRuleElement` deliberately carries no upstream
payload -- only `upstreamKind` and `reason` -- so retaining an inert element
never leaks Foundry's format past the importer. The importer's coverage
report (milestone 2) counts every inert element by `upstreamKind` and
`reason`, which is what decides whether a future kind is worth adding to the
subset -- evidence, not guesswork (ADR 0004 decision 5).

## Applying rule elements

A rule element on a compendium entry is a *definition*. Turning an actor's
items' rule elements into an actual `Modifier[]` for `resolveStatistic`
(`docs/modifiers.md`) is separate logic, in `systems/pf2e`'s rules layer
(`systems/pf2e/src/rules/applyRuleElements.ts`) -- this package only defines
what a rule element can say, not how it gets applied.

`applyRuleElements` resolves the active roll option set (`choiceSet`
selections, then `rollOption` elements swept to a fixed point, since one can
depend on another) and groups `flatModifier`/`damageDice` elements by
`selector`. The two element kinds treat their own `predicate` differently on
purpose: a `flatModifier`'s predicate rides along on the resulting
`Modifier` for `resolveStatistic` to evaluate at resolution time (ADR 0008
decision 6); a `damageDice`'s predicate is evaluated immediately, because
`@hearthtable/dice`'s `DamageComponent` has no predicate field to defer it
to. `grantItem` is out of scope here -- granting an item onto a character is
build-time state (milestone 7), not something resolved on every statistic.

## Testing

See `packages/core/src/ruleElement.test.ts`: one acceptance case per variant,
boundary cases per field (an out-of-range die size, a formula-valued
`value`, an empty `choices` list), and a discriminated-union dispatch test
proving `kind` routes to the right shape.
