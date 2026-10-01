# Operations

The client-to-server vocabulary and the server's broadcast envelope, from
`@hearthtable/core`'s `operation.ts`. Architectural background is ADR 0005;
this page documents the concrete shapes that actually exist right now.

**The vocabulary grows per slice.** Milestone 1 defined the four lobby and chat
operations; milestone 3 adds `actor.*` as the character sheet needs them. A later milestone adds more when it needs
them — this page grows with the code, not ahead of it.

## Two envelopes, not one

**What a client sends** (`ClientOperation`): `{ id, type, payload }`. Nothing
else. In particular, no `worldId` and no `seatId`.

**What the server broadcasts** (`AppliedOperation`, inside a `Broadcast`):
adds `worldId`, `seatId` (if the connection has claimed a seat), `sequence`,
and `appliedAt`.

The missing `worldId`/`seatId` on the client side is deliberate, not an
oversight: both are facts the server already knows from the connection itself
— which world's room this socket joined, and which seat (if any) it has
claimed — and it must derive them itself rather than trust a client-supplied
value. ADR 0005's server-authoritative model means identity comes from the
connection, never from the payload; a client that could self-report its own
`seatId` could claim to be someone it isn't.

## The operations

| Type | Payload | Notes |
| --- | --- | --- |
| `seat.claim` | `{ seatId, pin? }` | The seat to claim, plus an optional PIN. A connection already holding a different seat may send this directly to switch — the handler auto-releases the old one rather than requiring a separate release first |
| `seat.release` | `{}` | No target — releasing is self-referential, the server already knows which seat this connection holds |
| `chat.sendMessage` | `{ text }` | Plain chat |
| `chat.sendRoll` | `{ expression }` | The **raw text** the player typed (`"1d20+7"`), never a computed result — see below |
| `actor.create` | `{ kind, name }` | `kind` is `character`, `npc`, or `hazard`. The server builds the system data (a blank level 1 sheet for a character); a `system` in the payload is dropped, not honored. The sender becomes `owner`, everyone else `observer`. Needs a claimed seat |
| `actor.update` | `{ actorId, changes }` | `changes` maps dotted paths to new values; see "`actor.update` paths" below. Owner or GM only. 1 to 50 paths |
| `actor.addItem` | `{ actorId, packId, slug }` | Names a compendium entry and nothing else. The server copies it from its own compendium ([ADR 0015](adr/0015-compendium-read-side.md)); a client cannot supply item content. Characters only. Each add is a separate item, unequipped, quantity 1 |
| `actor.updateItem` | `{ actorId, itemId, equipped?, quantity? }` | At least one of the two. The only fields a client may change on an item. Equipping armor takes off any other armor |
| `actor.removeItem` | `{ actorId, itemId }` | |
| `actor.addCondition` | `{ actorId, slug, value? }` | The ordinary way. A second source of a valued condition keeps the **higher** value, never the sum; the value is clamped to the condition's maximum; it clears whatever the condition supersedes. `value` 1 to 99 |
| `actor.setCondition` | `{ actorId, slug, value? }` | The manual override: sets the value exactly, so it can go down, and `value: 0` removes the condition. Same clamping and clearing |
| `actor.removeCondition` | `{ actorId, slug }` | Removing one the character does not have is not an error |
| `actor.rollCheck` | `{ actorId, statistic, dc? }` | Rolls Perception, a save (`fortitude`, `reflex`, `will`), or `skill:<slug>` for a character and posts a `check` chat message ([chatMessage.md](chatMessage.md)). `dc` 0 to 99 adds a degree of success. Owner or GM only; anything else (`ac`, `classDc`, an unknown skill) is refused |
| `actor.rollStrike` | `{ actorId, itemId, attackNumber, dc? }` | Rolls the 1st, 2nd, or 3rd attack of a turn (sets the Multiple Attack Penalty) with an **equipped weapon**, and posts a `strikeAttack` chat message. Owner or GM only. An unequipped or non-weapon item is refused |
| `actor.rollDamage` | `{ actorId, itemId, critical }` | Rolls that weapon's damage, doubled with `deadly`/`fatal` applied when `critical`, and posts a `strikeDamage` message. The roller decides whether it was a critical; nothing links it to an attack roll yet |
| `party.addMember` | `{ actorId }` | **GM only.** Appends to the party, creating it on first use. A character or NPC; a hazard is refused. Adding a current member changes nothing |
| `party.removeMember` | `{ actorId }` | **GM only.** Not being a member is not an error |
| `party.reorder` | `{ memberIds }` | **GM only.** Must list exactly the current members, each once; anything else is rejected so a stale client cannot add or drop someone by reordering |
| `scene.create` | `{ name, kind }` | **GM only.** `kind` is `overworld`, `area`, or `battle`. The server builds the rest: a blank 2000px scene with the default 100px / 5 ft square grid and no map. It is created **hidden from players** (`none`) and stays so until the party is moved there ([scene.md](scene.md)) |
| `scene.update` | `{ sceneId, changes }` | **GM only.** `changes` is any of `name`, `kind`, `width`, `height`, `background`, and a partial `grid`; at least one, no other keys. The grid merges field by field, so changing the cell size keeps the offset. `background` is an uploaded image name (`<64 hex>.<png|jpg|webp|gif>`) or `null` to clear it; the file's existence is not checked. Links have their own operations |
| `scene.delete` | `{ sceneId }` | **GM only.** Also deletes the scene's tokens, clears the party's scene if it was there, and removes other scenes' exits into it. All ride in the same broadcast |
| `scene.activate` | `{ sceneId, at? }` | **GM only.** Moves the party to a scene, in one transaction: sets the party's `sceneId` (creating the party if there is none), makes the scene readable to players and the scene the party left unreadable again, re-derives the visibility of every token on both, and gives each party member who has no token on the new scene one, in a row at `at` (an exit's position, on the scene) or the scene's centre. Token size comes from the creature (NPC) or the ancestry (character), else one square. Players who held the old scene and its tokens are told to drop them. Allowed on the party's current scene, where it just places anyone missing |
| `scene.addLink` | `{ sceneId, label, x, y, targetSceneId }` | **GM only.** Adds an exit: a labelled point (scene pixels) that leads to another scene. The server issues the link's id. The target must be a scene that exists and is not this one, and the point must lie on this scene (0 to its `width`, 0 to its `height`). Two exits to the same place are allowed |
| `scene.removeLink` | `{ sceneId, linkId }` | **GM only.** Removing an exit that is already gone is not an error and changes nothing |
| `actor.delete` | `{ actorId }` | Owner or GM only. A document the sender cannot read is reported as *not found*, never as forbidden, so a rejection does not confirm a hidden actor exists. If the actor was in the party it is removed from it, and the changed party rides in the same broadcast. Its tokens, on every scene, are deleted with it and ride in the same broadcast as deletions |
| `token.create` | `{ sceneId, actorId, at?, hidden? }` | **GM only.** Puts an actor's token on a scene (any actor, hazards included; a second token for the same actor is allowed). `at` is where its centre goes, the scene's centre if absent; the server snaps it to the scene's grid and refuses a point off the scene. The size comes from the actor, never the client. Players see it only if the scene is the party's and `hidden` is not `true`: a token pre-placed on a scene the party has not reached stays invisible until it arrives |
| `token.update` | `{ tokenId, changes }` | **GM only.** `changes` is any of `hidden`, `size` (1 to 12 squares), and `name` (a map label, or `null` for the actor's name); at least one, no other keys. Position is not here: moving has its own operation. Visibility is **re-derived** from the new `hidden` and the scene, so hiding a token a player holds sends that player a deletion, and showing it sends the token. A size change re-snaps the token, since a two-square token is centred on a grid intersection and a one-square one on a cell |
| `token.move` | `{ tokenId, x, y }` | The **settled** position after a drag, the only durable move (ADR 0005, decision 6). The server snaps the point to the scene's grid (a two-square token centres on an intersection) and keeps it on the scene, so the client sends a request, not a final position; a move that lands where the token already is writes nothing. **Who may move it is decided by the token's actor**: the GM any token; a player only a token they can see whose actor they own. A token the player cannot see is *not found*, never forbidden. Free movement: no speed limit or turn check until combat. Last write wins |
| `token.delete` | `{ tokenId }` | **GM only.** Takes the token off its scene; the actor is untouched. A player is told only if they could see the token |

### The `pin` on `seat.claim`

Only checked when the target seat has one set (`Seat.pin`, see
[world-and-seats.md](world-and-seats.md)). Like the field it's checked
against, this is **not authentication** — no hashing, no rate limiting. It
exists only so a claim on a PIN-protected (typically GM) seat can carry the
PIN, stopping an accidental claim, per ADR 0007.

### Why `chat.sendRoll` carries text, not a number

`@hearthtable/dice`'s own rule is that the server rolls, never the client. The
payload reflects that literally: it has no field for a total, a degree of
success, or anything else a client could have computed. The server parses and
evaluates the expression with `@hearthtable/dice` and the resulting
`ChatMessage` stores the structured `RollResult` — never a rendered string,
per CLAUDE.md's ChatMessage rule.

### `actor.update` paths

```ts
{ actorId, changes: { "name": "Valeria", "system.attributes.str": 4, "portrait": null } }
```

A map of dotted path to value, not a whole document, so two players editing
different fields never overwrite each other (ADR 0005: last write wins *per
field*). `null` removes the field. A path is segments of letters, digits, `_`
and `-` (so `system.ranks.skills.academia-lore` works); `__proto__`,
`constructor`, and `prototype` are refused.

- **Editable:** `name`, `portrait`, and anything inside `system` **except**
  `system.items` and `system.conditions`. Those have their own operations (adding
  an item, or a second source of a condition, needs logic a plain overwrite does
  not have). Everything else (`id`, `type`, `kind`, `permissions`, timestamps) is
  the server's, and is refused.
- **Arrays are never indexed into.** A path that runs through an array or a
  number is refused.
- **Validated whole.** After applying the changes the server re-validates the
  entire actor and, for a character, `system` against `characterDataSchema`. If
  anything is invalid the whole batch is rejected with the first problem
  (`invalid change: system.level: ...`) and nothing is written or broadcast.
- **Stored as parsed.** Defaults are filled in and fields the schema does not
  know are dropped.

## The broadcast envelope

```ts
{ sequence, operation, documents, seats }
```

`documents`, `deleted`, and `seats` are what changed — never a diff format. This is the
simplest shape that satisfies ADR 0005; a diff format is exactly the kind of
complexity CLAUDE.md's Development order section says not to build ahead of a
real need.

`deleted` lists documents the operation removed (or, for a viewer, left unreadable: see "Taking access away" below), as **bare envelopes** — id,
type, permissions, timestamps, and nothing of the body (it is not parsed loose,
so the type-specific fields are stripped), so a deletion never re-sends what was
removed. It carries the permissions so each viewer is told only about deletions
of documents they could read. It defaults to `[]`.

`seats` is its own array, separate from `documents`, because a `Seat` isn't
one — it doesn't extend `baseDocumentSchema` (see
[world-and-seats.md](world-and-seats.md)) — so a seat change had nowhere to
go in a `documents`-only envelope. It validates fully against `seatSchema`,
not loosely: `Seat` has no concrete subtypes the way a document does, so
there's no "losing a subtype's own fields" problem here to guard against.

### Why `documents` validates in loose mode

Each entry validates against the shared document envelope in **loose** mode
(`baseDocumentSchema.loose()`), not the default. This matters, and was
verified directly rather than assumed: Zod's default `z.object()` silently
**strips unknown keys** on parse.

```
z.object({ a: z.string() }).safeParse({ a: 'x', extra: 'y' })
// → { a: 'x' } -- `extra` is gone
```

If a future concrete document (say, `Party` with its own `memberIds` field)
were validated through the plain base schema on its way through this
envelope, its own fields would vanish silently. `.loose()` checks the shared
fields and passes everything else through unchanged. This is correct, not
just convenient: full type-specific validation already happened when the
document was created or updated against its *own* concrete schema (which
doesn't exist yet, but will validate the whole shape when it does) — this
envelope only needs to confirm "at least a document," not re-validate
everything a second time.

## Permission resolution

`resolvePermission(seat, document)` — not part of `operation.ts`, but the
mechanism every operation handler will use to decide what a seat may do.

- The GM always resolves to `owner`, regardless of what the document stores
  ("GM sees all," CLAUDE.md's Architecture section).
- Otherwise: an explicit per-seat override on the document wins; no override
  falls back to the document's own `default`.
- A seat and a document from **different worlds** always resolve to `none`,
  even for a GM seat. No real caller should ever call this with a mismatched
  pair — every caller resolves within one connection's single active world —
  but the function does not trust that it won't happen.

## Who receives what (milestone 3)

Everything the server sends is filtered by who is asking
(`apps/server/src/visibility.ts`). This is **spoiler protection for the normal
UI, not access control**: ADR 0007 trusts the table, and `Seat.pin` and
`claimedByDeviceToken` are still not redacted.

`canReadDocument(seat, document)` (`packages/core`) is the rule. A document is
sent only to a viewer who resolves to `observer` or `owner`. A viewer with no
seat yet (the lobby) resolves to the document's `default`. `limited` is
**withheld entirely** for now: it is meant to show that a document exists
without its details, which needs a per-type redaction step that does not exist
yet, and sending it whole would leak everything.

- **Live broadcasts.** Each connected socket receives its own filtered copy.
  Documents (and deletions) it cannot read are dropped, and if any were dropped the operation's
  `payload` is replaced by `{}` too (a payload such as an `actor.update` can
  describe the document the viewer must not see), unless the viewer is the GM.
  The `sequence` and the operation's `id` and `type` are always kept, so a
  client never sees a gap in the sequence.
- **Taking access away.** A document that an operation leaves unreadable to a
  viewer who *could* read it before is sent to that viewer as a **deletion**, so
  their client drops the copy they hold (hiding a token, moving the party out of
  a scene). The tombstone is the document's envelope as they last saw it, with no
  body. A viewer who could not read it before hears nothing: editing a hidden
  document never announces that it exists. The server learns "before" by
  recording each document's stored state ahead of its first write in the
  operation (`previousDocuments.ts`), at the store boundary, so a handler cannot
  forget to say that it changed who may see something ([ADR
  0017](adr/0017-scenes-and-tokens.md), decision 3). `scene.activate` is the
  first operation to use it: moving the party takes the old scene and its
  tokens away from players who held them. A socket test in `realtime.test.ts`
  pins that, and fails if the recording is unplugged.
- **Sync replay.** The log does not record which documents an operation
  touched, so the rule is by type: `seat.*` and `chat.*` keep their payload,
  anything else has its payload withheld from everyone but the GM.
- **`GET /api/worlds/:id/documents`.** The caller is identified by an
  `x-device-token` header, the same token the socket handshake carries. A
  request with no header, or a token no seat holds, is judged as a viewer with
  no seat. Clients must send the header on every documents request.

## Testing

See `packages/core/src/operation.test.ts` and `permission.test.ts`. Notably:
the union genuinely discriminates (a `seat.claim`-shaped payload sent as
`chat.sendMessage` is rejected, not silently accepted); a `chat.sendRoll`
payload carrying an extra `total` field parses successfully but that field is
gone from the output, proving a client cannot smuggle a result through;
`broadcastSchema` round-trips a document with unknown extra fields intact,
proving `.loose()` actually behaves as documented above and not just in
theory; and a malformed seat in `broadcastSchema.seats` is rejected, proving
that array is fully validated rather than accidentally inheriting `documents`'
loose treatment.

Also covered: `apps/server/src/visibility.test.ts` (live broadcast, sync replay, and stored-row filtering for a GM, a player, and a viewer with no seat), the documents route in `app.test.ts` (a hidden document, a per-seat grant, the GM), and a sync test in `realtime.test.ts`. There is no real-socket test of a hidden document yet, because no operation creates one until `actor.create` (B.2); the per-socket emit is covered by `broadcastFor`'s unit tests and the existing multi-client socket tests.
