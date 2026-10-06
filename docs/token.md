# Token

One actor's marker on one scene. `@hearthtable/core`'s `tokenSchema` extends
the shared envelope ([documents.md](documents.md)). A token is a document of its
own, not an entry inside the scene, so a settled move writes and broadcasts one
small row and a hidden token is simply a document a player may not read
([ADR 0017](adr/0017-scenes-and-tokens.md)).

## Fields (beyond the envelope)

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'token'` | Literal |
| `sceneId` | UUID | The scene it is on |
| `actorId` | UUID | The actor it stands for. Whether either id exists is the server's check, not the schema's |
| `name` | non-empty string, optional | A label shown on the map in place of the actor's name ("Goblin 2"). Absent means the actor's name |
| `x`, `y` | number 0-32000 | The token's **centre**, in scene pixels ([scene.md](scene.md)). Fractions are allowed; a grid scene snaps before sending |
| `size` | integer 1-12, default 1 | The footprint in grid squares per side. Core does not know what a creature size is: `systems/pf2e` maps Medium to 1, Large to 2, and so on ([grid.md](grid.md), Token size) |
| `hidden` | boolean, default `false` | Whether players can see it |
| `showHpBar` | boolean, default `false` | Whether players see this token's HP bar. The GM's per-token switch: monster bars start hidden, a character's bar is always shown |
| `hpBar` | `{ current, max }` (integers 0 or more), optional | The hit points a player may see, so a shown monster reads `12/40`. **Server-maintained**: a client cannot set it, and it exists so a player gets two numbers and never the NPC's stat block (NPC actors are not readable by players). An old stored `{ percent }` reads as absent and is refilled the next time the monster or token changes |

## Why the centre
A footprint of 2x2 has no single "cell", and a gridless scene has no cells at
all, so the centre is the one point that means the same thing everywhere. A
grid strategy turns it into the squares covered.

## Permissions
The server derives them, and a client never sets them. A token is readable by
players only when its scene is the party's current scene and `hidden` is false;
the GM always reads everything. Anything that changes either fact recomputes the
affected tokens in the same transaction (`tokenPermissions` in
`apps/server/src/tokens.ts` is the one place that decides it).

**Who makes and changes tokens** (all GM only, in [operations.md](operations.md)):
- `scene.activate` places a token for each party member who has none on the scene
  the party is moving to: a row of tokens at the arrival point or the scene's
  centre, one cell apart and snapped to the scene's grid.
- `token.create` puts any actor's token on any scene, at a point snapped to the
  grid, optionally hidden. `token.update` hides or shows it, resizes it, gives
  it a map label, or turns its HP bar on or off for players. `token.delete` takes it off the scene.
- Deleting an actor deletes its tokens, on every scene.
- `token.move` moves one. The GM may move any token; a player may move a token
  they can see **and whose actor they own**, so a character's owner moves their own
  token and nobody else's. The server snaps and clamps the point, so a client's
  coordinates are a request. The live drag preview other players see while a token
  is being dragged is a separate, unlogged channel (a later PR); only the settled
  position is stored.

A token's `size` comes from the actor: a creature's size for an NPC, the ancestry's
size for a character whose ancestry is a compendium entry, one square otherwise.
The GM can change it by hand (`token.update`), which matters for a Gargantuan
creature larger than 4x4. Resizing re-snaps the token to the grid.

**Hiding takes effect for players who already hold the token.** Setting `hidden`
sends them a deletion, and clearing it sends the token again
([operations.md](operations.md), "Taking access away"). Editing a hidden token
tells players nothing, so it never announces that it exists. A token the GM
pre-places on a scene the party has not reached is invisible until the party
arrives.

## HP bars
Players never receive an NPC actor, so a monster's health reaches them as
`hpBar: { current, max }` on its token. `syncTokenHpBars`
(`apps/server/src/tokenHpBars.ts`) runs inside every operation's transaction: for
each NPC token whose `showHpBar` is on it keeps `hpBar` in step with the actor
(current clamped to 0 through max, temp HP ignored), and clears it when the bar is
off, so a hidden bar leaves no number behind. **Showing a monster's bar therefore
tells players its maximum HP**, a deliberate choice. Changed tokens ride the same
broadcast, and a player's copy contains the token and never the actor. A
character's token carries no `hpBar`: its owner and the party read the character
actor directly.

**On the map** (`sceneView.ts`, `tokenModel.ts`): a thin bar sits under the token,
green above half, amber above a quarter, red below, and the token's label reads
`Goblin 12/40`. A character's bar comes from the character actor and everyone sees
it. A monster's comes from the actor for the GM and from `hpBar` for a player. The
GM sees every monster's bar; one the players are not shown is outlined with dashes.
The token menu (right click, or the Menu key) has "Show HP bar to players" /
"Hide HP bar from players" for monsters, which sends `token.update`.

## Example
```ts
tokenSchema.parse({
  id: '8f1c2a44-3b7e-4c1d-8a55-0e9d6b7a1c30',
  worldId: '0b9a3c52-7e0d-4a47-8a0a-6c1d0f6d2b88',
  type: 'token',
  schemaVersion: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  permissions: { default: 'observer' },
  sceneId: '2d7a4e0a-8a3f-4f0e-9d1c-5b6a1f9c3e21',
  actorId: '5c0d9e17-6a42-4b8e-9f3d-1a2b3c4d5e6f',
  name: 'Goblin 2',
  x: 250,
  y: 350,
  size: 1,
  hidden: false,
});
```

## Testing
`packages/core/src/token.test.ts`: the defaults (one square, visible, no label),
a label and footprint and the hidden flag kept, an empty label and a footprint of
zero or a fraction or too large, positions that are negative or beyond the
largest scene or not a number, positions on the edge and in fractions, and a
malformed scene or actor id.
