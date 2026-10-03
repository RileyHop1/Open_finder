# Template

An area effect on a scene: a burst, cone, line, or emanation
([grid.md](grid.md), "Templates"). `@hearthtable/core`'s `templateSchema` extends
the shared envelope ([documents.md](documents.md)). It stores only the shape and
where it was placed; the squares it covers and the creatures caught are derived
from the scene's grid when needed, and **nothing is applied**: the GM confirms
targets.

## Fields (beyond the envelope)

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'template'` | Literal |
| `sceneId` | UUID | The scene it is on |
| `shape` | `burst` \| `cone` \| `line` \| `emanation` | |
| `x`, `y` | number 0-32000 | The origin in scene pixels: a burst's centre (snapped to a square), a cone's or line's start, or the source token's centre for an emanation |
| `toX`, `toY` | number, optional | Where a cone or line aims. Absent for a burst or emanation |
| `feet` | integer 0-1000 | Radius (burst, emanation) or length (cone, line) |
| `widthFeet` | integer 1-1000, default 5 | A line's width |
| `tokenId` | UUID, optional | The token an emanation comes from |
| `label` | string, optional | "Fireball", shown in the chat line |
| `placedBy` | UUID | The seat that placed it, who may also remove it |

## Permissions
`default: 'observer'`: every seat sees every template.

## Operations
`template.place` (any seat) and `template.remove` (the GM or the placing seat);
see [operations.md](operations.md). A gridless scene is refused, since it has no
squares to list creatures from. Placing posts a chat line naming the creatures
caught that the table can see, and a second GM-only line naming hidden ones.
Deleting a scene deletes its templates.

**Implemented in M5 C.9a.** `scenes.ts` keeps a `shownTemplates` list the same
way it keeps `shownTokens`, kept live by the same broadcast merge. `MapView.vue`
renders every one as a translucent blue cell overlay (`templateCells.ts`,
the same `burst`/`cone`/`line`/`emanation` grid math `apps/server/src/
templates.ts` uses, so the client's picture and the server's own idea of the
template never disagree), under the tokens like the action bar's range
highlight. A `TemplateList.vue` panel lists each by shape, feet, and label,
with a "Remove" button for the GM or the placing seat -- the only route to
remove one, which makes it keyboard-reachable for free.

**Implemented in M5 C.9b**, closing out C.9. A "Template" toggle (button, or
`T`) puts the map into placement mode: click the map for a burst's or
cone's/line's origin (snapped to a cell; a line's is not, matching the
server's own snapping), or click a token for an emanation's source --
`templatePlacement.ts` builds the eventual `template.place` payload only
once enough is chosen (an origin, plus an aim for a cone or line). A cone
or line's aim either follows the pointer (drag to rotate) or one of eight
compass buttons, the keyboard route to the same rotation
(`templatePlacement.ts`'s `compassAim`). While pending, the same preview
cells (`templateCells.ts`, reused from C.9a) shade the map and a live
"Catches" line lists the tokens they would catch, so nothing is placed
blind. Nothing is sent to the server until "Place template" or Enter;
Escape cancels the whole tool.
