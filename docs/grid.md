# Grid, movement, and measurement

What a `Scene`'s grid means and how distance is computed. Owned by milestone 4
(Scenes) and consumed by milestone 5 (combat, templates).

## Square only in v1
**Square grid, 5 feet per square by default, configurable per scene.** Hex grids
are deferred, not excluded — PF2e supports them and some published maps use them.

The deferral is only affordable if it is not a rewrite later, so: **distance,
movement cost, and template shapes go through a `GridStrategy` interface** from
the start. `SquareGrid` is the only implementation in v1. Nothing outside that
interface may assume squares — no `Math.abs(dx)` scattered through the movement
code.

Gridless scenes (freeform measurement, no snapping) are the natural third
implementation and are useful for area maps where exact positioning does not
matter. Cheap once the interface exists.

### The interface, and where each piece lives
`GridStrategy` and `GridlessGrid` are in `@hearthtable/core` (`packages/core/src/grid/`);
`SquareGrid`, whose diagonal rule is a game rule, is in `systems/pf2e` (milestone 4,
A.4). Positions are scene pixels and distances are feet; a scene's `grid.size`
pixels is `grid.distance` feet ([scene.md](scene.md)). A strategy answers four
questions:

| Method | Answers |
| --- | --- |
| `snap(center, size)` | The nearest legal centre for a token `size` squares across. An odd side centres on a cell, an even one on a grid intersection. Idempotent |
| `cellsUnder(footprint)` | The cells a token covers. Empty for a gridless scene |
| `pathDistance(path)` | Feet along a route of centre points. Path-dependent, per *Diagonals* below |
| `distanceBetween(a, b)` | Feet between two footprints, to each one's nearest occupied square |

**Gridless distance** is the straight line scaled by pixels per foot, with no
diagonal rule (there is no grid to count diagonals on). Between two footprints it
is the gap between the rectangles spanned by the **centres of the squares each
would occupy**, so two one-square tokens are measured centre to centre, and a
Large token is measured from the square nearest the other, which is what the
square grid does. Tokens that share or overlap a square are 0 feet apart.

## Diagonals
PF2e does not use Euclidean distance. **The first diagonal costs 5 feet, the
second costs 10, alternating thereafter** — the 1-2-1 pattern. Checked against
Archives of Nethys, Player Core's Grid Movement, 2026-10-01: four diagonal squares
cost 5, 10, 5, 10, for 30 feet. The count is tracked "across all your movement
during your turn" and reset at the end of the turn.

This means distance is **path-dependent**, not a function of the two endpoints
alone. Two tokens the same number of squares apart can be different distances
depending on the route counted. The implementation must count along a path, and
the diagonal count must carry across the segments of one movement.

`SquareGrid.pathDistance` counts the diagonals of the **whole path it is given**.
The rule's real scope is a turn, so the combat tracker (milestone 5) is the one
that knows when to reset the count; until it exists, "a path" is the unit. A
consequence worth knowing: two orthogonal steps (10 feet) are cheaper than the
two-square diagonal (15 feet), so a waypoint can shorten a path, which is why the
shared grid contract does not assert a triangle inequality.

Distance **between two footprints** (`distanceBetween`) uses the same alternating
count on the squares separating their nearest edges, starting fresh. That is our
reading for range and reach, which the grid page does not spell out: see
`docs/rulings.md`, "Distance between tokens counts diagonals the same way".

This is the detail most likely to be implemented as Chebyshev distance by
accident and never noticed until someone measures a reach weapon.

## Token size
| Size | Footprint |
| --- | --- |
| Tiny | 1 square (shares a square) |
| Small, Medium | 1 square |
| Large | 2×2 |
| Huge | 3×3 |
| Gargantuan | 4×4 |

Checked against Archives of Nethys (Size, Space, and Reach), 2026-10-01: a Small
or Medium creature is a 5-foot space (1 square), Large 10 feet, Huge 15 feet,
Gargantuan "20 feet or more", and multiple Tiny creatures can share one square.
Gargantuan is 4×4 as a **minimum**: a larger one needs its token size raised by
hand (`token.size`, up to 12). `footprintForSize` in `systems/pf2e` is the mapping.

Distance to a multi-square token is measured to its **nearest** occupied square
**(confirm: the page we checked does not say how reach or range to a
multi-square creature is counted; this is the usual table reading)**.
Tiny creatures sharing a square is a real rule, not an edge case, and the token
layer has to allow co-occupancy rather than assuming one token per square.

## Drawing the grid far out

A grid line is two scene pixels wide, so when a large map is fitted to a small
screen (an 8000-pixel map in a laptop window has cells under ten pixels across) the
lines are thinner than a pixel and alias into uneven bands. The client fades the
grid out as one cell shrinks below 16 screen pixels and stops drawing it under 4;
it is solid again as soon as you zoom in to where it is useful. This is display
only: snapping and distances do not change.

## Measuring

The client's ruler (`M`, or the Ruler button) and the distances in the token list
both go through the scene's `GridStrategy`, so they give the number a token's
move shows. The ruler runs between the *centres of cells* (a click snaps to the
cell it is in), counts diagonals 5, 10, 5... along the whole route, and on a
gridless scene is a straight line in feet from exactly where you click. The token
list's "N ft away" is `distanceBetween` the selected token and each other, to the
nearest occupied square (a Large creature is measured from its edge). Both are
local to the screen; nothing is sent.

## Reach and threatened area
Default melee reach is 5 feet; reach weapons extend it, and larger creatures have
larger natural reach. Reach is a property of the **attack**, not only the creature,
so a Large creature wielding a reach weapon is not simply "10 feet."
(`systems/pf2e/src/rules/reach.ts`.)

- **`naturalReach(size)`**: 5 feet for Medium or smaller, then 10, 15, and 20 for
  Large, Huge, and Gargantuan: five feet per square of `footprintForSize`.
- **`meleeReach(size, hasReachTrait)`**: natural reach, plus 5 feet if the weapon
  or strike has the `reach` trait. A Large creature with a reach weapon is **15**
  feet (10 + 5). The caller reads the trait off the weapon.
- **`threatenedCells(grid, attacker, reachFeet)`** is `GridStrategy.emanation`,
  named for this use, and **`threatens`** asks whether those cells overlap the
  target's own cells. A gridless scene has no cells, so nothing is threatened there.

The threatened area is what flanking and Attack of Opportunity test against.

## Flanking
Two allies flank a target when they are on **opposite sides** of it and both
threaten it; the target is **off-guard** to both. (`systems/pf2e/src/rules/flanking.ts`.)

- **`flanks(grid, target, allyA, allyB)`**: both allies threaten the target with
  their own reach (`threatens`), and their centres are on opposite sides of it.
  Symmetric in the two allies.
- **`onOppositeSides(target, a, b)`**: the direction from `a` to the target and
  from the target to `b` agree within **22.5 degrees**
  (`OPPOSITE_SIDES_TOLERANCE_DEGREES`): a line from one ally through the target
  continues, roughly, to the other. Allies straight across, or on opposite
  diagonals, flank; one on the same side, at a right angle, or 45 degrees off the
  line does not. It works at any distance, so a reach weapon can flank from two
  squares away.
- **(confirm)** the exact geometric test is a judgment call, and Archives of Nethys
  is unreachable from the environment this was written in. Centres are used for every
  footprint, a simplification for a larger ally. See [rulings.md](rulings.md),
  "Flanking: opposite sides by a relaxed straight-line test".

The app **detects and applies** flanking automatically, because it is pure
geometry and getting it right every round by hand is exactly the tedium this
project exists to remove. It surfaces *why* — the off-guard condition names
flanking as its source (see `docs/conditions.md`), so a player can see where the
penalty came from and a GM can remove it if they disagree.

## Difficult terrain
- **Difficult terrain** costs an extra 5 feet per square entered.
- **Greater difficult terrain** costs an extra 10.
- Terrain is a property of scene regions, not of individual squares, so that a
  GM paints an area rather than clicking cells.

## Templates
Cone, burst, emanation, and line, needed by milestone 5 for spells and abilities.
Each is a `GridStrategy` method returning the set of affected squares, because
the shapes are defined in grid terms and differ between square and hex. All four
exist now (milestone 5, A.9a and A.9b).

Templates highlight affected squares and list the creatures caught, but **do not
auto-apply** effects — the GM confirms targets. Autotargeting an area spell is
the kind of automation that is wrong just often enough to be infuriating.

### Burst and emanation
Both return cells in row-major order, and both return an empty array on a
gridless scene (there are no cells; the client draws the circle directly from
the radius and the scene's pixels-per-foot).

- **`burst(origin, radiusFeet)`**: every cell within `radiusFeet` of `origin`,
  by the grid's own distance rule -- the same rule `distanceBetween` already
  measures with, applied from a point instead of between two footprints.
  `origin` is snapped to the nearest 1-square cell before measuring, the same
  way a token snaps. A 5-foot burst is the origin and its eight neighbours
  (every adjacent square, including diagonally, is one diagonal step); a
  10-foot burst reaches two squares straight or a two-and-one combination, but
  not the two-square diagonal, which needs 15 (`squareGrid.test.ts`, "burst").
- **`emanation(footprint, radiusFeet)`**: every cell within `radiusFeet` of the
  footprint's **nearest edge** -- `distanceBetween`'s measurement, applied to
  every cell in a bounding box instead of to one other footprint. At
  `radiusFeet` 0 this is exactly `cellsUnder(footprint)`, since emanation always
  includes the creature's own space. A Large (2x2) footprint's 5-foot emanation
  reaches one square past each edge, including the diagonal corners.
- **(confirm)** which point a burst may originate from -- a cell's centre, a
  corner, or any grid intersection -- is not settled from memory and Archives of
  Nethys is unreachable from the environment this was written in. See
  [rulings.md](rulings.md), "Burst and emanation origin points".

### Cone and line
A cone or line is a **drawn shape**, not a measured distance, so which squares
it covers is a different question from `burst`/`emanation`'s distance count:
`cone` and `line` test a cell's **centre point** against the shape in real pixel
space (an angle test, a perpendicular-distance-and-projection test), never
`distanceBetween`'s diagonal count. **(confirm)**: an overlap-area or
corner-inclusion test is the alternative, and memory of which the rules intend
is unverified -- see [rulings.md](rulings.md).

- **`line(from, to, widthFeet)`**: a rectangle along the segment, `widthFeet`
  wide, not a capsule with rounded ends -- it does not extend past either
  endpoint. Empty when `from` equals `to`.
- **`cone(origin, towards, lengthFeet)`**: within `lengthFeet` of `origin` by
  plain distance, inside the 90-degree arc facing `towards` (PF2e's fixed cone
  angle; not a parameter). The origin's own cell is always included. Empty when
  `towards` equals `origin`. Always a subset of `burst(origin, lengthFeet)`,
  since a cone is a wedge of the same circle a burst draws.
- Both return `[]` on a gridless scene, like `burst`/`emanation`; the client
  draws the shape directly from the feet values.

## Testing
- Diagonal counting: 1, 2, 3, 4 diagonal steps produce 5, 15, 20, 30 feet
  (verified 2026-10-01, see Diagonals); mixed orthogonal-and-diagonal paths, and
  the count carrying across the segments of one path
  (`systems/pf2e/src/rules/squareGrid.test.ts`).
- Distance to Large, Huge, and Gargantuan tokens from several angles (same file).
- Flanking detection: true positives on opposite sides, negatives on adjacent
  corners, and the case where one ally cannot reach.
- Difficult terrain accumulates across a multi-square move.
- Every test runs against the `GridStrategy` interface, not `SquareGrid`
  directly, so a hex implementation inherits the suite. The shared suite is
  `describeGridStrategy` (`packages/core/src/grid/contract.ts`, imported as
  `@hearthtable/core/grid-contract`): no distance for fewer than two points, a
  path measures the same reversed, snapping is idempotent and moves a point by at
  most a cell, a footprint covers no cells or exactly size x size, a footprint is
  0 feet from itself and measures symmetrically, neighbouring one-square tokens
  are one cell of feet apart, and a Large token is measured from its nearest
  edge. It runs at two scales (100px = 5ft, 70px = 10ft) so a strategy that
  assumes one fails.
- The suite does **not** assert that a waypoint never shortens a path. On the
  PF2e square grid it can (two orthogonal steps are 10 ft; a two-square diagonal
  is 15 ft), so that property is not universal.
