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
| `level` | integer 1-20, default 1 | The level the encounter builder budgets against (milestone 12) |

Shared inventory is deliberately not modeled yet; it lands with the first
feature that needs it. Whether an id actually refers to an existing actor is
the server's check when membership changes, not the schema's.

## Testing

`packages/core/src/party.test.ts`: a default level of 1, an empty party, member
order preserved, and rejection of a duplicate member, a malformed id, and a
level outside 1-20.
