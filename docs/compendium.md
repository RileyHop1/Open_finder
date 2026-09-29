# Compendium entries and packs

The shape every imported entry shares, and the manifest for one pack of them.
See [adr/0012-pack-format.md](adr/0012-pack-format.md) for why a pack is a
directory of files rather than a database, and
[adr/0003-rules-data-licensing.md](adr/0003-rules-data-licensing.md) /
[adr/0006-content-scope-core-books.md](adr/0006-content-scope-core-books.md)
for the licensing and scope rules a `CompendiumEntry` is the receipt of having
passed.

## Not a document

A `CompendiumEntry` extends `baseRecordSchema`
([documents.md](documents.md)'s trio: `id`, `schemaVersion`, `createdAt`,
`updatedAt`), **not** `baseDocumentSchema`. It has no `worldId` and no
`permissions`, for the same reason `World` and `Seat` don't
([world-and-seats.md](world-and-seats.md)): a compendium entry does not belong
to any one world. It is a read-only source a world imports *from*
(CLAUDE.md's Architecture section). Loading a copy of one into a world as an
actual `Item` or `Actor` document is a later milestone's concern.

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `schemaVersion`, `createdAt`, `updatedAt` | -- | The shared `baseRecordSchema` trio |
| `packId` | string | Which pack this entry belongs to, e.g. `'feats'` |
| `slug` | string | Stable identifier within the pack, used by `grantItem` rule elements to reference it |
| `name` | string | Display name |
| `kind` | string | Narrowed to a literal by `systems/pf2e`'s content schemas (`'feat'`, `'spell'`, `'weapon'`, ...) -- open here for the same reason `baseDocumentSchema.type` is open |
| `provenance` | [Provenance](#provenance) | Required; see below |
| `traits` | `readonly string[]` | Defaults to `[]` |
| `ruleElements` | `readonly RuleElement[]` | Defaults to `[]`; see [rule-elements.md](rule-elements.md) |
| `description` | string | Rules text, defaults to `''` |

## Provenance

```ts
{ publication: 'Pathfinder Player Core', license: 'ORC', remaster: true }
```

A `Provenance` is the receipt of having passed ADR 0003's license filter, not
a general license-tracking shape -- `license` is a one-value enum and
`remaster` is `z.literal(true)`, so there is no way to construct one
describing content this project has no license to ship. `publication` stays a
free string; the four-book allow-list (ADR 0006) is enforced by the importer,
not by this schema, because `packages/core` does not know PF2e's book titles.

## Pack manifest

Written once per pack as `pack.json` (ADR 0012):

```ts
{
  packId: 'feats',
  name: 'Feats',
  upstream: {
    repo: 'foundryvtt/pf2e',
    commit: 'afcd141f81e0a1d482d3b85152eb584547560416',
    packsChecksum: 'sha256:...',
  },
  entryCount: 1191,
  generatedAt: '2026-09-29T00:00:00.000Z',
}
```

`upstream` is what ADR 0011's fetch-and-verify pipeline produces, and what
`import-smoke` (milestone 2's CI stack) reads first, before touching any
entry.

## Example

```ts
import { compendiumEntrySchema } from '@hearthtable/core';

compendiumEntrySchema.parse({
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  packId: 'feats',
  slug: 'toughness',
  name: 'Toughness',
  kind: 'feat',
  provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
  traits: ['general', 'skill'],
  ruleElements: [
    { kind: 'flatModifier', selector: 'hp', label: 'Toughness', type: 'untyped', value: 1 },
  ],
  description: '<p>You have significantly more hit points...</p>',
});
```

## Testing

See `packages/core/src/compendium.test.ts`: a minimal entry (proving the
three array/string fields default correctly), an entry with traits and rule
elements, confirmation that a compendium entry carries no `worldId` or
`permissions`, rejection of missing or non-Remaster provenance, and the
manifest's own boundary cases (a zero-entry pack is valid; a negative one
isn't).
