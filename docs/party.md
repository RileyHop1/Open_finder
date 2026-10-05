# Party

The adventuring group. `@hearthtable/core`'s `partySchema` extends the shared
envelope ([documents.md](documents.md)). It is its own document, not a flag on
each actor, because the party bar, the overworld marker, and shared travel all
need one owner for who is in the group and in what order.

## Fields (beyond the envelope)

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'party'` | Literal |
| `name` | non-empty string | |
| `memberIds` | array of UUID | Actor ids, in display order (the party bar's order). No duplicates |
| `level` | integer 1-20, default 1 | The level the encounter builder budgets against (milestone 13) |
| `sceneId` | UUID, optional | The scene the party is in: the one every player's view follows and whose tokens they may see ([scene.md](scene.md), [ADR 0017](adr/0017-scenes-and-tokens.md)). Absent until the GM first places the party. Whether it names an existing scene is the server's check, not the schema's |

Shared inventory is deliberately not modeled yet; it lands with the first
feature that needs it. Whether an id actually refers to an existing actor is
the server's check when membership changes, not the schema's.

## Operations

One party per world, created the first time `party.addMember` runs; its
permissions are `observer` for everyone and owned by no player, so only the GM
(who always owns) changes it. `party.addMember`, `party.removeMember`, and
`party.reorder` are in [operations.md](operations.md). The server checks that an
added id is a character or NPC actor that exists, and that a reorder lists
exactly the current members. Deleting a member's actor removes it from the party
in the same transaction.

## Testing

`packages/core/src/party.test.ts`: a default level of 1, an empty party, member
order preserved, and rejection of a duplicate member, a malformed id, and a
level outside 1-20.
