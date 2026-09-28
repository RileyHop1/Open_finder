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

## Diagonals
PF2e does not use Euclidean distance. **The first diagonal costs 5 feet, the
second costs 10, alternating thereafter** — the 1-2-1 pattern **(confirm against
Player Core's movement section)**.

This means distance is **path-dependent**, not a function of the two endpoints
alone. Two tokens the same number of squares apart can be different distances
depending on the route counted. The implementation must count along a path, and
the diagonal parity must be tracked per movement, not globally.

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

Distance to a multi-square token is measured to its **nearest** occupied square.
Tiny creatures sharing a square is a real rule, not an edge case, and the token
layer has to allow co-occupancy rather than assuming one token per square.

## Reach and threatened area
Default melee reach is 5 feet; reach weapons extend it, and larger creatures have
larger natural reach. Reach is a property of the **attack**, not only the creature,
so a Large creature wielding a reach weapon is not simply "10 feet."

The threatened area is what flanking and Attack of Opportunity test against.

## Flanking
Two allies flank a target when they are on **opposite sides** of it and both
threaten it; the target is **off-guard** to both **(confirm the exact geometric
test — opposite sides is defined by a line through the target's space)**.

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
the shapes are defined in grid terms and differ between square and hex.

Templates highlight affected squares and list the creatures caught, but **do not
auto-apply** effects — the GM confirms targets. Autotargeting an area spell is
the kind of automation that is wrong just often enough to be infuriating.

## Testing
- Diagonal counting: 1, 2, 3, 4 diagonal steps produce 5, 15, 20, 30 feet
  **(confirm these totals)**; mixed orthogonal-and-diagonal paths.
- Distance to Large, Huge, and Gargantuan tokens from several angles.
- Flanking detection: true positives on opposite sides, negatives on adjacent
  corners, and the case where one ally cannot reach.
- Difficult terrain accumulates across a multi-square move.
- Every test runs against the `GridStrategy` interface, not `SquareGrid`
  directly, so a hex implementation inherits the suite.
