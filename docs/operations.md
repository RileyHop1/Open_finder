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
| `chat.sendRoll` | `{ expression, label? }` | The **raw text** the player typed (`"1d20+7"`), never a computed result — see below. `label` (1 to 120 characters, trimmed) says what the roll is for and is shown on its card; the generic action sends it |
| `actor.create` | `{ kind, name }` | `kind` is `character`, `npc`, or `hazard`. The server builds the system data (a blank level 1 sheet for a character); a `system` in the payload is dropped, not honored. The sender becomes `owner`, everyone else `observer`. Needs a claimed seat |
| `actor.createFromCreature` | `{ packId, slug }` | **GM only.** Makes an NPC from a compendium creature (a Monster Core stat block). Names the entry and nothing else: the server copies it from its own compendium ([ADR 0015](adr/0015-compendium-read-side.md)), so a client cannot supply a monster's stats. The NPC starts at full hit points with no conditions, is named for the creature, and is **hidden from players** (`none`): they never receive its sheet or hit points, only its token. An entry that is not a creature, or not in the compendium (with a hint when nothing has been imported), is refused. Each call makes a new actor |
| `actor.update` | `{ actorId, changes }` | `changes` maps dotted paths to new values; see "`actor.update` paths" below. Owner or GM only. 1 to 50 paths |
| `actor.addItem` | `{ actorId, packId, slug, quantity? }` | Names a compendium entry and nothing else. The server copies it from its own compendium ([ADR 0015](adr/0015-compendium-read-side.md)); a client cannot supply item content. Characters only. Each add is a separate item, unequipped, quantity 1 |
| `party.addItem` | `{ packId, slug, quantity? }` | **GM only.** Copies the compendium entry into the party stash as a new item (the GM's loot hand-out), `quantity` (1 to 9999, default 1) in one stack. Like `actor.addItem` it names the entry and nothing else: the server makes the copy ([ADR 0014](adr/0014-actor-document-shape.md)). Creates the party if there is none |
| `actor.setQuickbar` | `{ actorId, modifiers?, hotbar? }` | Replaces the actor's saved situational modifiers and/or hotbar whole ([actor.md](actor.md)); at least one list, the other is left alone. Owner or GM only. The server stores them and never applies a modifier itself: the player's client adds the active ones to the roll (ADR 0023) |
| `actor.updateItem` | `{ actorId, itemId, equipped?, quantity? }` | At least one of the two. The only fields a client may change on an item. Equipping armor takes off any other armor |
| `actor.removeItem` | `{ actorId, itemId }` | |
| `actor.addCondition` | `{ actorId, slug, value?, duration? }` | The ordinary way, on a character or a monster (the three condition operations both work on either). A second source of a valued condition keeps the **higher** value, never the sum; the value is clamped to the condition's maximum; it clears whatever the condition supersedes. `value` 1 to 99 |
| `actor.setCondition` | `{ actorId, slug, value?, duration? }` | The manual override: sets the value exactly, so it can go down, and `value: 0` removes the condition. Same clamping and clearing. Both take an optional `duration` ([conditions.md](conditions.md), Durations): refused unless it is a valid one, and a turn-anchored one must name an existing combatant. `setCondition`'s duration replaces the old one; none clears it |
| `actor.removeCondition` | `{ actorId, slug }` | Removing one the character does not have is not an error |
| `actor.applyDamage` | `{ actorId, amount, critical? }` | Owner or GM. Temporary hit points absorb first. **A character** dropped to 0 is knocked out (dying 1, 2 on `critical`, plus wounded); damage landing at 0 raises dying; damage left after 0 that is at least its maximum kills outright; dying reaching 4 minus doomed kills. Death adds a `dead` condition. A chat line tells the table (kept from players when the actor is not public). **A monster** only loses hit points and, at 0 in an active combat, is marked `defeated`. `critical` is the caller's, since the actor operation does not know a strike's degree ([conditions.md](conditions.md), "The dying chain") |
| `actor.heal` | `{ actorId, amount }` | Owner or GM. Heals up to the maximum. A character raised above 0 ends dying and unconsciousness and gains wounded if it was dying (a stable one only wakes); a dead character is refused (clear `dead` by hand). A monster raised above 0 is no longer defeated |
| `actor.rollRecovery` | `{ actorId }` | **GM only.** A dying character's recovery check: a flat check against DC 10 plus dying (critical success -2, success -1, failure +1, critical failure +2). Dying reaching 0 leaves the character stable and wounded; reaching the death threshold adds `dead`. Posts a `check` card and a line saying what it did, both kept from players when the actor is not public. **It also runs by itself** at the start of a dying character's turn, in the same operation as `combat.start` and `combat.nextTurn`; this is the re-roll and the way to run one outside a combat. Refused for a character who is not dying |
| `actor.rollCheck` | `{ actorId, statistic, dc?, modifiers? }` | Rolls Perception, a save (`fortitude`, `reflex`, `will`), or `skill:<slug>` for a character or a monster (an NPC made from a creature, rolled from its printed numbers and conditions) and posts a `check` chat message ([chatMessage.md](chatMessage.md)). `dc` 0 to 99 adds a degree of success. Owner or GM only; anything else (`ac`, `classDc`, an unknown skill) is refused |
| `actor.rollStrike` | `{ actorId, itemId | strikeKey, attackNumber?, dc?, targetTokenId?, modifiers? }` | Rolls the 1st, 2nd, or 3rd attack of a turn (sets the Multiple Attack Penalty). **`attackNumber` is optional in an active combat:** left out, the server takes it from the tracker (the attacker's attacks this turn plus one, capped at 3) and counts the attack; given, it is an override and the tracker counts nothing. With no active combat there is no tracker, so it is required. **`targetTokenId`** names the token struck: its actor's Armor Class becomes the DC (an explicit `dc` still wins, as the override), so the card shows the degree of success. A token the seat cannot read is *not found*, and a target with no Armor Class (a hazard) is refused. The card names the target only when its token is visible to everyone, and shows the AC only when its actor is public, so a card never gives away a hidden creature or a monster's AC; the degree is shown either way. **Flanking** is worked out when a melee strike at a gridded target is rolled: if the attacker and another token on its side hold opposite sides of the target, the target is off-guard against this attack, the DC is 2 lower, and the card says it was flanking ([grid.md](grid.md), "Flanking") with an **equipped weapon** (`itemId`) or a monster's strike (`strikeKey`, e.g. `strike:vine`, as `prepareNpc` keys it; a creature has no items). Exactly one of the two is required, and it must match the actor's kind. Posts a `strikeAttack` chat message. Owner or GM only. An unequipped or non-weapon item is refused |
| `actor.rollDamage` | `{ actorId, itemId | strikeKey, critical }` | Rolls that weapon's damage, doubled with `deadly`/`fatal` applied when `critical`, and posts a `strikeDamage` message. The roller decides whether it was a critical; nothing links it to an attack roll yet |
| `party.addMember` | `{ actorId }` | **GM only.** Appends to the party, creating it on first use. A character or NPC; a hazard is refused. Adding a current member changes nothing |
| `party.removeMember` | `{ actorId }` | **GM only.** Not being a member is not an error |
| `party.reorder` | `{ memberIds }` | **GM only.** Must list exactly the current members, each once; anything else is rejected so a stale client cannot add or drop someone by reordering |
| `scene.create` | `{ name, kind }` | **GM only.** `kind` is `overworld`, `area`, or `battle`. The server builds the rest: a blank 2000px scene with the default 100px / 5 ft square grid and no map. It is created **hidden from players** (`none`) and stays so until the party is moved there ([scene.md](scene.md)) |
| `scene.update` | `{ sceneId, changes }` | **GM only.** `changes` is any of `name`, `kind`, `width`, `height`, `background`, and a partial `grid`; at least one, no other keys. The grid merges field by field, so changing the cell size keeps the offset. `background` is an uploaded image name (`<64 hex>.<png|jpg|webp|gif>`) or `null` to clear it; the file's existence is not checked. Links have their own operations |
| `scene.delete` | `{ sceneId }` | **GM only.** Also deletes the scene's tokens, clears the party's scene if it was there, and removes other scenes' exits into it. The scene's combats and their combatants go too. All ride in the same broadcast |
| `scene.activate` | `{ sceneId, at? }` | **GM only.** Moves the party to a scene, in one transaction: sets the party's `sceneId` (creating the party if there is none), makes the scene readable to players and the scene the party left unreadable again, re-derives the visibility of every token on both, and gives each party member who has no token on the new scene one, in a row at `at` (an exit's position, on the scene) or the scene's centre. Token size comes from the creature (NPC) or the ancestry (character), else one square. Players who held the old scene and its tokens are told to drop them. Allowed on the party's current scene, where it just places anyone missing |
| `scene.addLink` | `{ sceneId, label, x, y, targetSceneId }` | **GM only.** Adds an exit: a labelled point (scene pixels) that leads to another scene. The server issues the link's id. The target must be a scene that exists and is not this one, and the point must lie on this scene (0 to its `width`, 0 to its `height`). Two exits to the same place are allowed |
| `scene.removeLink` | `{ sceneId, linkId }` | **GM only.** Removing an exit that is already gone is not an error and changes nothing |
| `actor.delete` | `{ actorId }` | Owner or GM only. A document the sender cannot read is reported as *not found*, never as forbidden, so a rejection does not confirm a hidden actor exists. If the actor was in the party it is removed from it, and the changed party rides in the same broadcast. Its tokens, on every scene, are deleted with it, along with those tokens' combatants, and ride in the same broadcast as deletions |
| `token.create` | `{ sceneId, actorId, at?, hidden? }` | **GM only.** Puts an actor's token on a scene (any actor, hazards included; a second token for the same actor is allowed). `at` is where its centre goes, the scene's centre if absent; the server snaps it to the scene's grid and refuses a point off the scene. The size comes from the actor, never the client. Players see it only if the scene is the party's and `hidden` is not `true`: a token pre-placed on a scene the party has not reached stays invisible until it arrives |
| `token.update` | `{ tokenId, changes }` | **GM only.** `changes` is any of `hidden`, `showHpBar` (whether players see its HP bar; `hpBar` itself is server-maintained and refused here), `size` (1 to 12 squares), and `name` (a map label, or `null` for the actor's name); at least one, no other keys. Position is not here: moving has its own operation. Visibility is **re-derived** from the new `hidden` and the scene, so hiding a token a player holds sends that player a deletion, and showing it sends the token. A size change re-snaps the token, since a two-square token is centred on a grid intersection and a one-square one on a cell |
| `token.move` | `{ tokenId, x, y }` | The **settled** position after a drag, the only durable move (ADR 0005, decision 6). The server snaps the point to the scene's grid (a two-square token centres on an intersection) and keeps it on the scene, so the client sends a request, not a final position; a move that lands where the token already is writes nothing. **Who may move it is decided by the token's actor**: the GM any token; a player only a token they can see whose actor they own. A token the player cannot see is *not found*, never forbidden. No speed limit. **While a combat is active** a player moves a token only on its combatant's turn: any other move is refused with "it is not this token's turn", unless the GM's free-movement switch is on or the token has a grant (`combat.setMovementRuling`). The GM is never blocked, and a token that is not in the combat, or a scene with no active combat, is free. **When it is the mover's own combatant's turn**, the move's distance also spends the Strides it costs (`combat.ts`'s `spendMovement`, [combat.md](combat.md)): a player's move that would cross the turn's action capacity is refused outright and the token does not move; the GM's own overspend only warns, same as `combat.spendAction`. Moving a token back is `combat.undo` (ADR 0019), not a flag on this operation. **In an active combat**, leaving a square a creature with Reactive Strike threatens also posts a reaction prompt, seen only by that creature's owners and the GM; the reaction is never spent for them ([action-economy.md](action-economy.md), "Reactions"). Last write wins |
| `token.delete` | `{ tokenId }` | **GM only.** Takes the token off its scene; the actor is untouched. A player is told only if they could see the token. The token's combatants are removed with it, ending any condition anchored to them |
| `template.place` | `{ sceneId, shape, at, to?, feet, widthFeet?, tokenId?, label? }` | Any seat. Puts a burst, cone, line or emanation on a gridded scene; every seat sees it. A cone or line needs `to`, an emanation needs `tokenId` (a token on the scene). A burst or cone origin snaps to a square. Posts a chat line naming the creatures caught that the table can see, and a GM-only line for hidden ones. Applies nothing ([template.md](template.md)) |
| `template.remove` | `{ templateId }` | The GM or the seat that placed it. Not an error if it is already gone |
| `combat.create` | `{ sceneId }` | **GM only.** Makes a `pending` combat on the scene and enrols the party's tokens and every token that is not hidden, each with no initiative yet; a hidden token stays out. Only one unfinished (`pending` or `active`) combat may exist. A pending combat and its combatants are `none` to players ([combat.md](combat.md)) |
| `combat.addCombatant` | `{ combatId, tokenId, hidden? }` | **GM only.** Adds a token that is on the combat's scene to a combat that has not ended; a token joins once. `hidden` keeps it out of the players' view of the order. In a combat that is already running it rolls its Perception at once and takes its place in the order |
| `combat.removeCombatant` | `{ combatantId }` | **GM only.** Removes the combatant and ends every condition anchored to its turn (`duration.type: 'turn'`) on any actor; those actors ride in the same broadcast. The combatant whose turn it is cannot be removed: step the turn first |
| `combat.rollInitiative` | `{ combatantId, statistic? }` | **GM only.** Rolls Perception (or another rollable statistic, such as `skill:stealth`) for the combatant's actor and stores the total as its initiative; rolling again replaces it. The roll is a `check` chat message, readable only by the GM when the combatant is hidden. Refused once the combat has ended |
| `combat.setInitiative` | `{ combatantId, initiative }` | **GM only.** The override: sets the number exactly (fractions allowed, within +/-1000), or `null` to make the combatant unrolled again |
| `combat.moveCombatant` | `{ combatantId, beforeId? }` | **GM only.** Puts the combatant immediately before another, or last when `beforeId` is absent, by choosing initiative numbers (`placeCombatant`, [combat.md](combat.md)); the combatants whose number changed ride in the broadcast. A place that cannot be reached by number (among the unrolled, or no gap left) is refused with what to do instead |
| `combat.start` | `{ combatId }` | **GM only.** The only thing that begins a combat. In one transaction: everyone with no initiative rolls Perception (a number the GM set is kept; a creature that cannot roll, a hazard, stays unrolled), the combat and every combatant not marked `hidden` become readable, the top of the order takes the first turn of round 1, and that turn's start-of-turn rules run (stunned, durations). Refused when nobody can take a turn, or the combat has started or ended |
| `combat.end` | `{ combatId }` | **GM only.** Clears the turn pointer and every out-of-turn grant, ends every condition anchored to a combatant's turn, and keeps the combat as a record (readable if it had begun, hidden if it never did). Frees the one-combat rule |
| `combat.nextTurn` | `{ combatId }` | **GM, or the active combatant's own owner** (the player's "End turn"; anyone else is refused). Passes the turn, in one transaction: the end-of-turn rules for the combatant leaving (frightened drops by 1, "until the end of its turn" conditions end) and spends its one-off movement grant, then the start-of-turn rules for the one arriving (turn state resets, stunned costs actions, `rounds` durations tick). The round counts up when the order wraps. Defeated and unrolled combatants are skipped. What the rules changed is told to the table in one chat line. Only for an active combat. The leaving combatant's **persistent damage** is then rolled and applied, and its DC 15 flat check made, in the same operation (`persistentDamage.ts`) |
| `combat.previousTurn` | `{ combatId }` | **GM only.** Steps back one place (and one round when the order wraps) for a mis-click. It moves the pointer and the round only: conditions and actions the boundary rules changed are not undone, so the GM sets those by hand. Refused at the first turn of round 1 |
| `combat.setMovementRuling` | `{ combatId, freeMovement?, grant? }` | **GM only.** `freeMovement` lifts the turn rule for everyone (a chase, a cutscene); `grant` is `{ combatantId, allowed }` and lets one combatant's token move out of turn, or takes that back. At least one of the two. A grant is spent when that combatant's turn next ends. Refused for an ended combat or a combatant from another combat |
| `combat.spendAction` | `{ combatantId, actions?, reaction? }` | The combatant's actor's **owner or the GM**; only in an active combat. `actions` adds to the actions spent this turn (negative gives them back, never below 0); `reaction` sets whether the reaction is used. It need not be that combatant's turn. **A player's spend (never a give-back) that would cross `actionCapacity` is refused outright**, naming how many actions are left; nothing is written. **The GM is never refused**: an overspend or a second reaction from the GM goes through with a chat warning instead, kept from players when the combatant is hidden ([action-economy.md](action-economy.md)) |
| `combat.undo` | `{ combatId }` | Pops the current turn's most recent undo step and writes every document it touched back to how it was (ADR 0019, [combat.md](combat.md), "Turn undo"). The GM may undo any step; a player only one their own seat opened. Refused with "there is nothing to undo this turn" when the stack is empty. A roll's chat message is never restored or removed |

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
  entire actor and, for a character, `system` against `characterDataSchema`, and
  for an NPC made from a creature (`actor.createFromCreature`), against
  `npcDataSchema`. That is how the GM sets a monster's hit points
  (`system.hp.current`, `system.hp.temp`) or toughens its copy
  (`system.creature.hp`). A hand-made NPC, with no creature, is not held to it.
  If anything is invalid the whole batch is rejected with the first problem
  (`invalid change: system.level: ...`) and nothing is written or broadcast.
- **Stored as parsed.** Defaults are filled in and fields the schema does not
  know are dropped.

## Not an operation: the live drag preview

While someone drags a token, the others watch it move. That is the `token.drag`
**socket event**, not an operation, and it is deliberately outside the pipeline
above ([ADR 0005](adr/0005-concurrency.md), decision 6;
[ADR 0017](adr/0017-scenes-and-tokens.md), decision 5): it is never stored, never
sequenced, never replayed on reconnect, and has no acknowledgement. A dropped one
costs one frame of someone else's drag, because the settled `token.move` above is
what actually changes the token.

| Direction | Event | Payload |
| --- | --- | --- |
| client to server | `token.drag` | `{ tokenId, x, y }`, the token's centre in scene pixels, **raw** (not snapped, so the drag stays smooth) |
| server to client | `token.drag` | The same `{ tokenId, x, y }`, with `x` and `y` kept on the token's scene |

- **Who may send one is exactly who may move the token** (`loadMovableToken`,
  shared with `token.move`): the GM any token, a player only a token they can see
  whose actor they own.
- **Who receives one is whoever can read the token**, and never the connection
  that sent it. A hidden token's drag, or one on a scene the party is not in,
  reaches no player.
- **Rate-limited to 30 a second per connection**, leading edge, so the first
  preview of a drag always goes. The excess is dropped, not queued.
- A refused, malformed, or rate-limited preview is dropped without a word, since
  there is nothing to answer.

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

**`modifiers` on `actor.rollCheck` and `actor.rollStrike`** is an optional list of up to 10 `{ value: -50..50, label? }`: the roller's switched-on situational modifiers ([actor.md](actor.md), `actor.setQuickbar`). The server adds each to the roll as an applied, untyped "Situational" entry, so the chat breakdown shows it. It never decides one applies; it adds exactly what the roller sent ([ADR 0023](adr/0023-calculate-dont-enforce.md)). Strike *damage* takes none.
