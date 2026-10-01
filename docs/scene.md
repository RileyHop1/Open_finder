# Scene

A map, its grid, and the exits out of it. `@hearthtable/core`'s `sceneSchema`
extends the shared envelope ([documents.md](documents.md)). The tokens on a
scene are their own documents ([token.md](token.md)), and where the party is
lives on the party ([party.md](party.md)). Rationale in
[ADR 0017](adr/0017-scenes-and-tokens.md); how distance is measured is
[grid.md](grid.md).

Milestone 4 adds the schema (this page), then the server operations and the
client canvas. Sections below say which parts exist so far.

## Fields (beyond the envelope)

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'scene'` | Literal |
| `name` | non-empty string | |
| `kind` | `'overworld' \| 'area' \| 'battle'` | What the scene is for (CLAUDE.md, Game flow). Nothing in the schema differs by kind yet; the kinds matter to how the client and later milestones treat a scene |
| `width`, `height` | integer 100-32000, default 2000 | The scene's **coordinate space, in scene pixels**. The background is stretched to fill it |
| `background` | non-empty string, optional | A content-addressed asset name (`<hash>.<ext>`, [assets.md](assets.md)). Absent means a blank scene; no default image is stored |
| `grid` | object, defaults below | See next table |
| `links` | array, default empty | Exits to other scenes, in the order the GM made them. A link id appears at most once |

### Grid

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `type` | `'square' \| 'none'` | `square` | `none` is freeform: no snapping, straight-line distance ([grid.md](grid.md)). Hex is deferred, not rejected by accident |
| `size` | integer 10-1000 | 100 | One cell's side, in scene pixels |
| `distance` | number, > 0, <= 1000 | 5 | One cell, in feet |
| `offsetX`, `offsetY` | number -1000 to 1000 | 0 | Shifts the grid lines so they can be lined up with a map's printed grid |

### Link

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | |
| `label` | non-empty string | What the exit is called ("To the cellar") |
| `x`, `y` | number 0-32000 | Where the marker sits, in scene pixels |
| `targetSceneId` | UUID | Whether it names a scene that exists is the server's check when the link is added, not the schema's |

## Why scene pixels, not image pixels
Every position in a scene (tokens, links, the grid offset) is in scene pixels,
not in the pixels of the uploaded image. A client whose GPU cannot hold the
image as one texture downscales it to fit (ADR 0017, decision 8); because the
image is stretched to `width` x `height`, nothing on the map moves when it does.
A scene with no background still has a size, so tokens have bounds before any map
is uploaded.

## Permissions
A new scene is `none` for players: a scene the GM is still building is
invisible. Moving the party to a scene makes it readable, and the server
derives that, never the client (ADR 0017). Operations that create and change
scenes arrive in the milestone's server PRs; this page grows with them.

## Example
```ts
sceneSchema.parse({
  id: '2d7a4e0a-8a3f-4f0e-9d1c-5b6a1f9c3e21',
  worldId: '0b9a3c52-7e0d-4a47-8a0a-6c1d0f6d2b88',
  type: 'scene',
  schemaVersion: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  permissions: { default: 'none' },
  name: 'The Invented Crypt',
  kind: 'battle',
  width: 4000,
  height: 3000,
  background: `${'a'.repeat(64)}.png`,
  grid: { type: 'square', size: 100, distance: 5, offsetX: 0, offsetY: 0 },
  links: [],
});
```

## Testing
`packages/core/src/scene.test.ts`: the defaults, all three kinds and an unknown
one, an explicit grid kept as given, rejected sizes and grid values, and
links (order kept, a duplicate id, an empty label, a malformed target, a
position outside the largest scene).
