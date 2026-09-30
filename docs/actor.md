# Actor

A PC, NPC, or hazard. `@hearthtable/core`'s `actorSchema` extends the shared
envelope ([documents.md](documents.md)) and stays system-agnostic: the game
system's own data lives in the opaque `system` payload. Rationale in
[ADR 0014](adr/0014-actor-document-shape.md).

## Fields (beyond the envelope)

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'actor'` | Literal |
| `kind` | `'character' \| 'npc' \| 'hazard'` | One document type for all three, per CLAUDE.md |
| `name` | non-empty string | |
| `portrait` | non-empty string, optional | A content-addressed asset (`<hash>.<ext>`). Absent means the client shows a placeholder; no default image is stored |
| `system` | object | Opaque to core. `systems/pf2e` validates it (`characterDataSchema`, a later PR); the server re-validates after every mutation |

## Permissions

Stored on the envelope, resolved by `resolvePermission` ([operations.md](operations.md)).
Planned defaults (enforced by later server PRs, not by this schema): a player
character is `observer` for everyone with the creator seat as `owner`; the GM
always resolves to `owner`. `none` keeps an actor (a hidden NPC) from being
sent to a seat at all.

## Example

```ts
actorSchema.parse({
  id: crypto.randomUUID(),
  worldId,
  type: 'actor',
  schemaVersion: 1,
  permissions: { default: 'observer', seats: { [seatId]: 'owner' } },
  createdAt: now,
  updatedAt: now,
  kind: 'character',
  name: 'Invented Hero',
  system: {},
});
```

## Testing

`packages/core/src/actor.test.ts`: a well-formed actor with its `system`
payload passed through untouched, an optional portrait, all three kinds,
rejection of an unknown kind / empty name / empty portrait / wrong `type`, and
a `system` that is missing, a string, or an array.
