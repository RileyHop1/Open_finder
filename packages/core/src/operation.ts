/**
 * The client-to-server operation vocabulary and the server's broadcast
 * envelope -- see ADR 0005, "Concurrency: operation log, authoritative
 * server". Only the operations this milestone's lobby and chat actually
 * need are defined here (`seat.claim`, `seat.release`, `chat.sendMessage`,
 * `chat.sendRoll`); the vocabulary grows per slice as later milestones need
 * more, per CLAUDE.md's Development order section.
 */

import { z } from 'zod';

import { actorKindSchema } from './actor.js';
import { MAX_INITIATIVE } from './combat.js';
import { baseDocumentSchema } from './document.js';
import { hotbarSchema, situationalModifiersSchema } from './quickbar.js';
import { idSchema, timestampSchema } from './record.js';
import { MAX_SCENE_PIXELS, sceneGridChangesSchema, sceneKindSchema } from './scene.js';
import { seatSchema } from './seat.js';
import { MAX_TEMPLATE_FEET, templateShapeSchema } from './template.js';
import { MAX_TOKEN_SIZE } from './token.js';

/**
 * What a client actually sends over the wire: an intent (`type`) and its
 * data (`payload`). `id` is client-generated so a retried send can be
 * deduplicated -- see ADR 0005.
 *
 * Deliberately has no `worldId` or `seatId`. Both are facts the server
 * already knows from the connection itself -- which world's room this
 * socket joined, and which seat (if any) this connection has claimed -- and
 * must derive itself rather than trust a client-supplied value for.
 * ADR 0005's server-authoritative model means identity comes from the
 * connection, never from the payload; a client that could self-report its
 * own seatId could claim to be someone it isn't.
 */
export const clientOperationSchema = z.object({
  id: idSchema,
  type: z.string().min(1),
  payload: z.unknown(),
});

export type ClientOperation = z.infer<typeof clientOperationSchema>;

/**
 * The full record after the server processes a `ClientOperation`: identity
 * filled in from the connection (`worldId` always; `seatId` only once the
 * connection has claimed a seat -- absent for the `seat.claim` that does the
 * claiming), `sequence` assigned by the operations table, `appliedAt`
 * stamped at apply time. This is what gets persisted and what gets
 * broadcast (see `broadcastSchema` below).
 */
export const appliedOperationSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  seatId: idSchema.optional(),
  type: z.string().min(1),
  payload: z.unknown(),
  sequence: z.number().int().positive(),
  appliedAt: timestampSchema,
});

export type AppliedOperation = z.infer<typeof appliedOperationSchema>;

/**
 * Claim a seat -- see ADR 0007. No envelope-level `seatId` is expected on
 * this operation's *applied* form in the common case: a connection sending
 * this usually doesn't hold a seat yet. A connection that already holds a
 * different seat may also send this to switch directly; the handler
 * auto-releases the old seat rather than requiring a separate
 * `seat.release` first, matching "click a character, unclick if wrong."
 *
 * `pin` is optional and only checked when the target seat has one set
 * (Seat's own `pin` field -- see `seat.ts`). It is not a secret and this is
 * not authentication; it exists only to stop an accidental GM-seat claim,
 * per ADR 0007 and Seat's own TSDoc.
 */
export const seatClaimOperationSchema = clientOperationSchema.extend({
  type: z.literal('seat.claim'),
  payload: z.object({ seatId: idSchema, pin: z.string().optional() }),
});

/**
 * Release the seat *this connection* currently holds. No payload target --
 * releasing is inherently self-referential, and the server already knows
 * which seat that is from the connection's own applied `seatId`.
 */
export const seatReleaseOperationSchema = clientOperationSchema.extend({
  type: z.literal('seat.release'),
  payload: z.object({}),
});

/** Post a plain chat message. */
export const chatSendMessageOperationSchema = clientOperationSchema.extend({
  type: z.literal('chat.sendMessage'),
  payload: z.object({ text: z.string().min(1) }),
});

/**
 * Request a dice roll. The payload carries the raw expression text the
 * player typed (e.g. `"1d20+7"`); the server -- never the client -- parses
 * and evaluates it with `@hearthtable/dice`, per that package's "the server
 * rolls" rule. The resulting `ChatMessage` stores the structured
 * `RollResult`, never a rendered string, per CLAUDE.md's ChatMessage rule.
 */
export const chatSendRollOperationSchema = clientOperationSchema.extend({
  type: z.literal('chat.sendRoll'),
  payload: z.object({
    expression: z.string().min(1).max(200),
    /** What the roll is for ("Pries the door open"), shown on its chat card. Optional: a bare `/roll` has none. */
    label: z.string().trim().min(1).max(120).optional(),
  }),
});

/** The largest total a GM may set on a roll by hand: a sanity bound, not a rule. */
export const MAX_GM_ROLL_TOTAL = 100_000;

/**
 * The GM's override of a roll already in chat: the card shows "GM set to N
 * (rolled M)", and where the roll carries a DC, the degree of success is
 * recomputed from the new total. The roll itself is never changed -- every
 * term, and its own `total`, stay exactly as rolled (`docs/dice.md`, "The GM
 * can edit a roll"). Never an undo: `combat.undo` (ADR 0019) leaves every
 * roll alone, by design, and this is the GM's own fix for one instead. GM
 * only. Refused for a message that is not a roll.
 */
export const chatAdjustRollOperationSchema = clientOperationSchema.extend({
  type: z.literal('chat.adjustRoll'),
  payload: z.object({
    messageId: idSchema,
    total: z.number().int().min(-MAX_GM_ROLL_TOTAL).max(MAX_GM_ROLL_TOTAL),
  }),
});

/**
 * Create an actor. The creating seat becomes its `owner` and everyone else at
 * the table can see it (`observer`); the GM can change either afterwards. The
 * payload carries only a kind and a name: the server builds the system data
 * itself (blank, ready to hand-build) and never trusts one from a client.
 */
export const actorCreateOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.create'),
  payload: z.object({
    kind: actorKindSchema,
    name: z.string().trim().min(1).max(100),
  }),
});

/** Delete an actor. Only its owners (and the GM, who always owns) may. */
export const actorDeleteOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.delete'),
  payload: z.object({ actorId: idSchema }),
});

/** The most field changes one `actor.update` may carry. */
export const MAX_ACTOR_CHANGES = 50;

/**
 * Change fields of an actor. `changes` maps a dotted path to its new value,
 * for example `{ "system.attributes.str": 4, "name": "Valeria" }`. Paths, not
 * a whole document, so two players editing different fields never overwrite
 * each other (ADR 0005: last write wins *per field*). A `null` value removes
 * the field. The server decides which paths are editable and re-validates the
 * whole actor afterwards; this schema only bounds the shape.
 */
export const actorUpdateOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.update'),
  payload: z.object({
    actorId: idSchema,
    changes: z
      .record(z.string().min(1), z.unknown())
      .refine((changes) => Object.keys(changes).length > 0, {
        message: 'changes must name at least one field',
      })
      .refine((changes) => Object.keys(changes).length <= MAX_ACTOR_CHANGES, {
        message: `changes may name at most ${String(MAX_ACTOR_CHANGES)} fields`,
      }),
  }),
});

/**
 * Replace an actor's saved modifiers and/or hotbar whole (ADR 0023). Each list
 * is sent complete, so two edits to the same list are last-write-wins, which is
 * fine for one player's own bar. Owner or GM only. At least one list.
 */
export const actorSetQuickbarOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.setQuickbar'),
  payload: z
    .object({
      actorId: idSchema,
      modifiers: situationalModifiersSchema.optional(),
      hotbar: hotbarSchema.optional(),
    })
    .refine(
      (payload) => payload.modifiers !== undefined || payload.hotbar !== undefined,
      {
        message: 'send modifiers, hotbar, or both',
      },
    ),
});

/** The most of one item a stack may hold. A sanity bound, not a rule. */
export const MAX_ITEM_QUANTITY = 9999;

/**
 * Add a compendium entry to a character as a new item. The payload names the
 * entry (`packId` and `slug`) and nothing else: the server looks it up in its
 * own compendium and copies it, so a client can never supply item stats. See
 * ADR 0014.
 */
export const actorAddItemOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.addItem'),
  payload: z.object({
    actorId: idSchema,
    packId: z.string().min(1).max(100),
    slug: z.string().min(1).max(200),
  }),
});

/**
 * Make an NPC from a compendium creature (a Monster Core stat block). GM only.
 * Like `actor.addItem` it names the entry (`packId` and `slug`) and nothing
 * else: the server copies it from its own compendium, so a client can never
 * supply a monster's stats. The new actor is hidden from players (`none`), so
 * they never receive its sheet or hit points; its token is what the table sees.
 */
export const actorCreateFromCreatureOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.createFromCreature'),
  payload: z.object({
    packId: z.string().min(1).max(100),
    slug: z.string().min(1).max(200),
  }),
});

/**
 * Change an item's `equipped` flag or `quantity`. Those are the only two
 * fields a client may change on an embedded item; the item's content is the
 * server's copy of the compendium entry and stays as it was.
 */
export const actorUpdateItemOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.updateItem'),
  payload: z
    .object({
      actorId: idSchema,
      itemId: idSchema,
      equipped: z.boolean().optional(),
      quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY).optional(),
    })
    .refine(
      (payload) => payload.equipped !== undefined || payload.quantity !== undefined,
      {
        message: 'name at least one of equipped or quantity',
      },
    ),
});

/** Remove an item from a character. */
export const actorRemoveItemOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.removeItem'),
  payload: z.object({ actorId: idSchema, itemId: idSchema }),
});

/** A condition slug: lowercase kebab-case, the same shape a trait slug has. */
const conditionSlugSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase kebab-case slug');

/** The largest condition value a payload may carry. A sanity bound; each condition's own maximum is the server's. */
export const MAX_CONDITION_VALUE = 99;

/**
 * When a condition ends, as the game system defines it (`systems/pf2e`'s
 * `conditionDurationSchema`: until a combatant's turn, a count of rounds, ...).
 * Core is system-agnostic, so it carries the object and the server checks its
 * shape; absent means "until removed".
 */
const conditionDurationPayloadSchema = z.record(z.string(), z.unknown());

/**
 * Apply a condition to a character the ordinary way: a second source of a
 * valued condition keeps the *higher* value, never the sum, and the condition
 * clears whatever it supersedes. `value` is for valued conditions and is
 * ignored for a binary one.
 */
export const actorAddConditionOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.addCondition'),
  payload: z.object({
    actorId: idSchema,
    slug: conditionSlugSchema,
    value: z.number().int().min(1).max(MAX_CONDITION_VALUE).optional(),
    duration: conditionDurationPayloadSchema.optional(),
  }),
});

/**
 * Set a condition to exactly this value: the manual override CLAUDE.md
 * requires beside every automated change. Unlike `actor.addCondition` it can
 * lower a value, and a `value` of 0 removes the condition.
 */
export const actorSetConditionOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.setCondition'),
  payload: z.object({
    actorId: idSchema,
    slug: conditionSlugSchema,
    value: z.number().int().min(0).max(MAX_CONDITION_VALUE).optional(),
    duration: conditionDurationPayloadSchema.optional(),
  }),
});

/** Remove a condition from a character. */
export const actorRemoveConditionOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.removeCondition'),
  payload: z.object({ actorId: idSchema, slug: conditionSlugSchema }),
});

/** The largest DC a roll payload may carry: a sanity bound, as for conditions. */
export const MAX_ROLL_DC = 99;

/**
 * Roll a check from a character's sheet: the server resolves the statistic
 * (`perception`, a save, or `skill:<slug>`), rolls the d20, and posts a
 * structured `check` chat message. `dc`, when given, adds a degree of
 * success. Owner or GM only.
 */
export const actorRollCheckOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.rollCheck'),
  payload: z.object({
    actorId: idSchema,
    statistic: z.string().min(1).max(80),
    dc: z.number().int().min(0).max(MAX_ROLL_DC).optional(),
  }),
});

/**
 * Names the strike to roll: a character's equipped weapon by `itemId`, or a
 * monster's strike by `strikeKey` (`strike:<name>`, as `prepareNpc` keys it).
 * Exactly one must be given.
 */
const strikeTargetShape = {
  itemId: idSchema.optional(),
  strikeKey: z.string().min(1).max(100).optional(),
};

const hasOneStrikeTarget = (p: {
  itemId?: string | undefined;
  strikeKey?: string | undefined;
}) => (p.itemId === undefined) !== (p.strikeKey === undefined);

const STRIKE_TARGET_MESSAGE = 'give exactly one of itemId and strikeKey';

/**
 * Roll a strike's attack for an equipped weapon (`itemId`) or a monster's
 * strike (`strikeKey`). `attackNumber` is the 1st, 2nd, or 3rd attack this
 * turn, which sets the Multiple Attack Penalty. Left out, the server takes it
 * from the combat tracker (the attacker's count this turn plus one) and counts the
 * attack; given, it is the GM's or player's override and the tracker counts
 * nothing. Outside an active combat there is no tracker, so it is required.
 * `dc` adds a degree of success. `targetTokenId` names a token to strike: its actor's
 * Armor Class becomes the DC (an explicit `dc` still wins, as the override), and the
 * card names the target. Owner or GM only.
 */
export const actorRollStrikeOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.rollStrike'),
  payload: z
    .object({
      actorId: idSchema,
      ...strikeTargetShape,
      attackNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      dc: z.number().int().min(0).max(MAX_ROLL_DC).optional(),
      targetTokenId: idSchema.optional(),
    })
    .refine(hasOneStrikeTarget, { message: STRIKE_TARGET_MESSAGE }),
});

/** Roll a strike's damage, normal or critical, for an equipped weapon or a monster's strike. Owner or GM only. */
export const actorRollDamageOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.rollDamage'),
  payload: z
    .object({ actorId: idSchema, ...strikeTargetShape, critical: z.boolean() })
    .refine(hasOneStrikeTarget, { message: STRIKE_TARGET_MESSAGE }),
});

/** Add an actor to the party (created on first use). GM only. */
export const partyAddMemberOperationSchema = clientOperationSchema.extend({
  type: z.literal('party.addMember'),
  payload: z.object({ actorId: idSchema }),
});

/** Take an actor out of the party. GM only; not an error if it was not a member. */
export const partyRemoveMemberOperationSchema = clientOperationSchema.extend({
  type: z.literal('party.removeMember'),
  payload: z.object({ actorId: idSchema }),
});

/**
 * Set the party's display order. `memberIds` must list exactly the current
 * members, each once; the server rejects anything else so a stale client
 * cannot silently add or drop someone by reordering. GM only.
 */
export const partyReorderOperationSchema = clientOperationSchema.extend({
  type: z.literal('party.reorder'),
  payload: z.object({ memberIds: z.array(idSchema) }),
});

/** Create a scene. GM only. The server builds the rest (a blank 2000px scene with the default grid, hidden from players); a client cannot supply it. */
export const sceneCreateOperationSchema = clientOperationSchema.extend({
  type: z.literal('scene.create'),
  payload: z.object({
    name: z.string().trim().min(1).max(100),
    kind: sceneKindSchema,
  }),
});

const sceneSizeSchema = z.number().int().min(100).max(MAX_SCENE_PIXELS);

/**
 * The fields `scene.update` may change, each optional, so two edits to
 * different fields never overwrite each other (ADR 0005: last write wins per
 * field). `background` is an asset name from an upload, or `null` to clear it;
 * `grid` is a partial grid, merged field by field. Unknown keys are refused and
 * so is an empty change. Links are not here: they have their own operations.
 */
export const sceneChangesSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    kind: sceneKindSchema,
    width: sceneSizeSchema,
    height: sceneSizeSchema,
    background: z.string().min(1).max(100).nullable(),
    grid: sceneGridChangesSchema,
  })
  .partial()
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'a scene change must set at least one field',
  });

/** Change a scene's name, kind, size, background, or grid. GM only. */
export const sceneUpdateOperationSchema = clientOperationSchema.extend({
  type: z.literal('scene.update'),
  payload: z.object({ sceneId: idSchema, changes: sceneChangesSchema }),
});

/** Delete a scene, with its tokens, and clear it from the party and from other scenes' links. GM only. */
export const sceneDeleteOperationSchema = clientOperationSchema.extend({
  type: z.literal('scene.delete'),
  payload: z.object({ sceneId: idSchema }),
});

/**
 * Add an exit to a scene: a labelled point that leads to another scene. GM
 * only. The server issues the link's id; whether the target is a real, different
 * scene and whether the point lies on this scene are its checks, not the schema's.
 */
export const sceneAddLinkOperationSchema = clientOperationSchema.extend({
  type: z.literal('scene.addLink'),
  payload: z.object({
    sceneId: idSchema,
    label: z.string().trim().min(1).max(100),
    x: z.number().min(0).max(MAX_SCENE_PIXELS),
    y: z.number().min(0).max(MAX_SCENE_PIXELS),
    targetSceneId: idSchema,
  }),
});

/** Remove an exit from a scene. GM only; not an error if it was already gone. */
export const sceneRemoveLinkOperationSchema = clientOperationSchema.extend({
  type: z.literal('scene.removeLink'),
  payload: z.object({ sceneId: idSchema, linkId: idSchema }),
});

/**
 * Move the party to a scene: every player's view follows, the scene and its
 * visible tokens are revealed, and the scene the party left is hidden again.
 * GM only. `at` is where newly placed party tokens go (an exit's position, so
 * the party arrives at the door it used); absent means the scene's centre. The
 * server checks that it lies on the scene.
 */
export const sceneActivateOperationSchema = clientOperationSchema.extend({
  type: z.literal('scene.activate'),
  payload: z.object({
    sceneId: idSchema,
    at: z
      .object({
        x: z.number().min(0).max(MAX_SCENE_PIXELS),
        y: z.number().min(0).max(MAX_SCENE_PIXELS),
      })
      .optional(),
  }),
});

/**
 * Put an actor's token on a scene. GM only. `at` is where its centre goes (the
 * scene's centre if absent) and the server snaps it to the scene's grid; the
 * size is the server's, from the actor. Whether a player can see it is derived
 * by the server from the scene and `hidden`, never sent.
 */
export const tokenCreateOperationSchema = clientOperationSchema.extend({
  type: z.literal('token.create'),
  payload: z.object({
    sceneId: idSchema,
    actorId: idSchema,
    at: z
      .object({
        x: z.number().min(0).max(MAX_SCENE_PIXELS),
        y: z.number().min(0).max(MAX_SCENE_PIXELS),
      })
      .optional(),
    hidden: z.boolean().optional(),
  }),
});

/**
 * The fields `token.update` may change (`hpBar` is not one: the server owns it), each optional so two edits to different
 * fields never overwrite each other. `name` is a label for the map, or `null`
 * to go back to the actor's name. Position is not here: moving has its own
 * operation. Unknown keys are refused and so is an empty change.
 */
export const tokenChangesSchema = z
  .object({
    hidden: z.boolean(),
    showHpBar: z.boolean(),
    size: z.number().int().min(1).max(MAX_TOKEN_SIZE),
    name: z.string().trim().min(1).max(100).nullable(),
  })
  .partial()
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'a token change must set at least one field',
  });

/** Hide, show, resize, or relabel a token. GM only. */
export const tokenUpdateOperationSchema = clientOperationSchema.extend({
  type: z.literal('token.update'),
  payload: z.object({ tokenId: idSchema, changes: tokenChangesSchema }),
});

/**
 * Move a token to a new centre: the **settled** position after a drag, the only
 * durable move (ADR 0005, decision 6; the live drag preview is a separate,
 * unlogged channel). The GM may move any token, a player only a token whose
 * actor they own. The server snaps the point to the scene's grid and keeps it on
 * the scene, so what a client sends is a request, not a final position.
 */
export const tokenMoveOperationSchema = clientOperationSchema.extend({
  type: z.literal('token.move'),
  payload: z.object({
    tokenId: idSchema,
    x: z.number().min(0).max(MAX_SCENE_PIXELS),
    y: z.number().min(0).max(MAX_SCENE_PIXELS),
  }),
});

/** Take a token off its scene. GM only; the actor is untouched. */
export const tokenDeleteOperationSchema = clientOperationSchema.extend({
  type: z.literal('token.delete'),
  payload: z.object({ tokenId: idSchema }),
});

/**
 * Put an area template on a scene. Any seat may (players cast too). `at` is the
 * origin; a cone or line also needs `to`, the point it aims at, and an emanation
 * needs `tokenId`, the token it comes from. The server needs a gridded scene,
 * snaps the origin, and lists the creatures caught in chat; it applies nothing.
 */
export const templatePlaceOperationSchema = clientOperationSchema.extend({
  type: z.literal('template.place'),
  payload: z.object({
    sceneId: idSchema,
    shape: templateShapeSchema,
    at: z.object({
      x: z.number().min(0).max(MAX_SCENE_PIXELS),
      y: z.number().min(0).max(MAX_SCENE_PIXELS),
    }),
    to: z
      .object({
        x: z.number().min(0).max(MAX_SCENE_PIXELS),
        y: z.number().min(0).max(MAX_SCENE_PIXELS),
      })
      .optional(),
    feet: z.number().int().min(5).max(MAX_TEMPLATE_FEET),
    widthFeet: z.number().int().min(1).max(MAX_TEMPLATE_FEET).optional(),
    tokenId: idSchema.optional(),
    label: z.string().trim().min(1).max(100).optional(),
  }),
});

/** Take a template off its scene. The GM, or the seat that placed it; not an error if it is already gone. */
export const templateRemoveOperationSchema = clientOperationSchema.extend({
  type: z.literal('template.remove'),
  payload: z.object({ templateId: idSchema }),
});

/**
 * Set up a combat on a scene. GM only. The server makes it `pending`, adds the
 * party's tokens and every visible token on the scene as combatants without an
 * initiative (hidden tokens do not join; `combat.addCombatant` adds them), and
 * allows only one unfinished combat per world (ADR 0018).
 */
export const combatCreateOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.create'),
  payload: z.object({ sceneId: idSchema }),
});

/** Add a token to a combat that has not ended. GM only. `hidden` keeps it out of the players' view of the order. */
export const combatAddCombatantOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.addCombatant'),
  payload: z.object({
    combatId: idSchema,
    tokenId: idSchema,
    hidden: z.boolean().optional(),
  }),
});

/** Take a combatant out of its combat, and end any condition that was anchored to its turn. GM only. */
export const combatRemoveCombatantOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.removeCombatant'),
  payload: z.object({ combatantId: idSchema }),
});

/**
 * Roll a combatant's initiative: Perception unless `statistic` names another
 * rollable one (a skill such as `skill:stealth`). GM only. The roll is a `check`
 * chat message, readable only by the GM when the combatant is hidden.
 */
export const combatRollInitiativeOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.rollInitiative'),
  payload: z.object({
    combatantId: idSchema,
    statistic: z.string().min(1).max(80).optional(),
  }),
});

/** Set a combatant's initiative directly (the GM's override), or clear it with `null` so it goes back to unrolled. GM only. */
export const combatSetInitiativeOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.setInitiative'),
  payload: z.object({
    combatantId: idSchema,
    initiative: z.number().min(-MAX_INITIATIVE).max(MAX_INITIATIVE).nullable(),
  }),
});

/**
 * Reorder: put a combatant immediately before another, or last when `beforeId`
 * is absent. The server picks the initiative numbers that make the order come out
 * that way. GM only.
 */
export const combatMoveCombatantOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.moveCombatant'),
  payload: z.object({ combatantId: idSchema, beforeId: idSchema.optional() }),
});

/**
 * Begin a pending combat: roll initiative for everyone who has none, make the
 * combat readable to the table, and give the first turn to the top of the order
 * (round 1). GM only. Nothing else starts a combat (ADR 0018).
 */
export const combatStartOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.start'),
  payload: z.object({ combatId: idSchema }),
});

/** End a combat: the turn pointer and any out-of-turn grants clear, conditions anchored to a turn end, and the combat stays as a record. GM only. */
export const combatEndOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.end'),
  payload: z.object({ combatId: idSchema }),
});

/**
 * End the active combatant's turn and begin the next one's: the end-of-turn rules
 * for the one leaving, then the start-of-turn rules for the one arriving, in a
 * single transaction. The round counts up when the order wraps. GM only.
 */
export const combatNextTurnOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.nextTurn'),
  payload: z.object({ combatId: idSchema }),
});

/** Step the turn back one place (the GM's undo for a mis-click). It moves the pointer and the round only; it does not undo what the boundary rules changed. GM only. */
export const combatPreviousTurnOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.previousTurn'),
  payload: z.object({ combatId: idSchema }),
});

/**
 * The GM's movement rulings for a combat: `freeMovement` lifts the turn rule for
 * everyone (a chase, a cutscene), and `grant` lets one combatant's token move out
 * of turn (or takes that back). At least one is required. GM only. While a combat
 * is active a player's token otherwise moves only on its combatant's turn.
 */
export const combatSetMovementRulingOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.setMovementRuling'),
  payload: z
    .object({
      combatId: idSchema,
      freeMovement: z.boolean().optional(),
      grant: z.object({ combatantId: idSchema, allowed: z.boolean() }).optional(),
    })
    .refine(
      (payload) => payload.freeMovement !== undefined || payload.grant !== undefined,
      {
        message: 'a movement ruling must set freeMovement or a grant',
      },
    ),
});

/**
 * Spend (or give back) a combatant's actions and reaction this turn. Owner of the
 * combatant's actor, or GM. `actions` adds to the actions spent (negative gives
 * them back, never below 0); `reaction` sets whether the reaction is used. It never
 * refuses an overspend or an off-turn spend: the table is warned in chat instead
 * (docs/action-economy.md). Only for an active combat.
 */
export const combatSpendActionOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.spendAction'),
  payload: z
    .object({
      combatantId: idSchema,
      actions: z.number().int().min(-3).max(3).optional(),
      reaction: z.boolean().optional(),
    })
    .refine(
      (payload) => payload.actions !== undefined || payload.reaction !== undefined,
      {
        message: 'spend some actions or the reaction',
      },
    ),
});

/**
 * Undo the current turn's most recent step: every document it touched goes
 * back to how it was before that step (ADR 0019). The owner of the step's
 * seat may undo it only on that combatant's own turn; the GM may undo any
 * step, at any time. Refused if there is no step to undo.
 */
export const combatUndoOperationSchema = clientOperationSchema.extend({
  type: z.literal('combat.undo'),
  payload: z.object({ combatId: idSchema }),
});

/** The most hit points one damage or healing operation may move: a sanity bound. */
export const MAX_HIT_POINT_CHANGE = 100_000;

/**
 * Deal damage to a character or monster. Owner or GM. Temporary hit points go
 * first. A character dropped to 0 is knocked out (dying, plus wounded), damage at 0
 * raises dying, and enough left over kills outright; `critical` is the caller's
 * (a critical hit raises dying by 2). A monster at 0 is marked defeated in an
 * active combat. See docs/conditions.md, "The dying chain".
 */
export const actorApplyDamageOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.applyDamage'),
  payload: z.object({
    actorId: idSchema,
    amount: z.number().int().min(0).max(MAX_HIT_POINT_CHANGE),
    critical: z.boolean().optional(),
  }),
});

/**
 * Heal a character or monster, up to its maximum. Owner or GM. Healing a character
 * above 0 ends dying and unconsciousness (raising wounded if it was dying); a dead
 * character is refused, since the GM revives by hand.
 */
export const actorHealOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.heal'),
  payload: z.object({
    actorId: idSchema,
    amount: z.number().int().min(0).max(MAX_HIT_POINT_CHANGE),
  }),
});

/**
 * Roll a dying character's recovery check by hand: a flat check against DC 10 plus
 * dying that moves dying by -2, -1, +1 or +2 (docs/conditions.md). GM only. It runs
 * by itself at the start of a dying character's turn; this is the re-roll and the
 * way to run one outside a combat. Refused for a character who is not dying.
 */
export const actorRollRecoveryOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.rollRecovery'),
  payload: z.object({ actorId: idSchema }),
});

/**
 * How much a purse changes by, one denomination at a time -- positive to
 * receive, negative to spend. Named `pp`/`gp`/`sp`/`cp` directly (ADR 0021)
 * rather than through a generic "currency" abstraction, the same way
 * `actor.addItem`'s `packId`/`slug` names a real compendium shape instead
 * of staying abstractly system-agnostic: an operation payload is allowed to
 * know the one game system this project ships, the same discipline already
 * applied to every other operation below. Every field is optional so a
 * caller only names the denominations it is touching; the server sums
 * whichever are present and rejects a purse it cannot cover (never a
 * partial deduction) rather than validating signs here -- a spend and a
 * receipt are the same shape, just opposite signs.
 */
export const coinsDeltaSchema = z.object({
  pp: z.number().int().optional(),
  gp: z.number().int().optional(),
  sp: z.number().int().optional(),
  cp: z.number().int().optional(),
});

/** Exported rather than inlined at each call site: `Partial<Coins>` is not the same type under `exactOptionalPropertyTypes` (a Zod `.optional()` field infers as `T | undefined`, not just absent), so handlers take this instead of redeclaring it. */
export type CoinsDelta = z.infer<typeof coinsDeltaSchema>;

/**
 * Adjust a character's purse by `delta`. Owner or GM. The server converts
 * the whole purse to copper, applies the delta, and reassembles the fewest
 * coins (`docs/inventory.md`); a delta that would take any total below zero
 * is refused outright, never partially applied.
 */
export const actorAdjustCoinsOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.adjustCoins'),
  payload: z.object({ actorId: idSchema, delta: coinsDeltaSchema }),
});

/**
 * Adjust the party stash's purse by `delta`, the same rules as
 * `actor.adjustCoins`. GM only, like every other change to the party's
 * shared stash (`party.ts`).
 */
export const partyAdjustCoinsOperationSchema = clientOperationSchema.extend({
  type: z.literal('party.adjustCoins'),
  payload: z.object({ delta: coinsDeltaSchema }),
});

/**
 * One side of an `inventory.transfer`: a character's inventory, or the
 * party's shared stash. There is only ever one party, so `kind: 'party'`
 * needs no further id (ADR 0021).
 */
export const transferHolderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('actor'), actorId: idSchema }),
  z.object({ kind: z.literal('party') }),
]);

export type TransferHolder = z.infer<typeof transferHolderSchema>;

/** A non-negative amount of coins to move -- unlike `coinsDeltaSchema`, never signed: direction comes from `from`/`to`, not the sign of a field. */
const transferAmountSchema = z.object({
  pp: z.number().int().nonnegative().optional(),
  gp: z.number().int().nonnegative().optional(),
  sp: z.number().int().nonnegative().optional(),
  cp: z.number().int().nonnegative().optional(),
});

function sameHolder(a: TransferHolder, b: TransferHolder): boolean {
  return a.kind === 'party' && b.kind === 'party'
    ? true
    : a.kind === 'actor' && b.kind === 'actor' && a.actorId === b.actorId;
}

/**
 * Move an item (by id, optionally splitting a stack with `quantity`) or an
 * amount of coins from `from` to `to`, where each is a character's
 * inventory or the party stash (ADR 0021, `docs/inventory.md`). Exactly one
 * of `item`/`coins` is named; moving both at once is two operations, not
 * one, the same way `actor.addItem` and `actor.adjustCoins` are already
 * separate. The caller must own `from`'s actor, or be the GM (GM only when
 * `from` is the party stash, like every other stash change); `to` needs no
 * permission of its own -- giving something away never requires the
 * recipient's consent in v1. The server checks `from` actually has what is
 * named before moving anything, the same "never a partial deduction" rule
 * `actor.adjustCoins` already follows.
 */
export const inventoryTransferOperationSchema = clientOperationSchema
  .extend({
    type: z.literal('inventory.transfer'),
    payload: z.object({
      from: transferHolderSchema,
      to: transferHolderSchema,
      item: z
        .object({
          itemId: idSchema,
          quantity: z.number().int().positive().optional(),
        })
        .optional(),
      coins: transferAmountSchema.optional(),
    }),
  })
  .refine(
    (operation) =>
      (operation.payload.item === undefined) !== (operation.payload.coins === undefined),
    { message: 'name exactly one of item or coins', path: ['payload'] },
  )
  .refine((operation) => !sameHolder(operation.payload.from, operation.payload.to), {
    message: 'from and to must be different holders',
    path: ['payload'],
  });

/** The payload shape of `inventory.transfer`, exported so `transfer.ts` can type its own handler against it instead of hand-writing an equivalent type (which drifts under `exactOptionalPropertyTypes`). */
export type TransferPayload = z.infer<typeof inventoryTransferOperationSchema>['payload'];

/**
 * Use a consumable: decrements its `uses.current` (or, if it has no `uses`,
 * its `quantity`) and posts a `ChatMessage` with the item's rules text
 * (ADR 0021, `docs/inventory.md`). If that text contains a dice expression,
 * the server rolls it and the card carries the structured result the same
 * way `chat.sendRoll` does -- using a consumable is not a new kind of roll,
 * just a new trigger for one. `useItem` only spends the item and posts the
 * card; anything the roll should *do* (heal HP, remove a condition) goes
 * through the operation for that already (`actor.heal`,
 * `actor.removeCondition`). Owner or GM only.
 */
export const actorUseItemOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.useItem'),
  payload: z.object({ actorId: idSchema, itemId: idSchema }),
});

/**
 * Every operation type a client may currently send. The server validates
 * an incoming message against this union before doing anything else with
 * it (ADR 0005, step one of "validate, apply, sequence, broadcast"). New
 * operation types join this union as later milestones add the features
 * that need them -- never speculatively ahead of a real caller.
 */
export const clientOperationUnionSchema = z.discriminatedUnion('type', [
  seatClaimOperationSchema,
  seatReleaseOperationSchema,
  chatSendMessageOperationSchema,
  chatSendRollOperationSchema,
  chatAdjustRollOperationSchema,
  actorCreateOperationSchema,
  actorDeleteOperationSchema,
  actorUpdateOperationSchema,
  actorSetQuickbarOperationSchema,
  actorCreateFromCreatureOperationSchema,
  actorAddItemOperationSchema,
  actorUpdateItemOperationSchema,
  actorRemoveItemOperationSchema,
  actorAddConditionOperationSchema,
  actorSetConditionOperationSchema,
  actorRollCheckOperationSchema,
  actorRollStrikeOperationSchema,
  actorRollDamageOperationSchema,
  partyAddMemberOperationSchema,
  partyRemoveMemberOperationSchema,
  partyReorderOperationSchema,
  actorRemoveConditionOperationSchema,
  sceneCreateOperationSchema,
  sceneUpdateOperationSchema,
  sceneDeleteOperationSchema,
  sceneAddLinkOperationSchema,
  sceneRemoveLinkOperationSchema,
  sceneActivateOperationSchema,
  tokenCreateOperationSchema,
  tokenUpdateOperationSchema,
  tokenDeleteOperationSchema,
  tokenMoveOperationSchema,
  templatePlaceOperationSchema,
  templateRemoveOperationSchema,
  combatCreateOperationSchema,
  combatAddCombatantOperationSchema,
  combatRemoveCombatantOperationSchema,
  combatRollInitiativeOperationSchema,
  combatSetInitiativeOperationSchema,
  combatMoveCombatantOperationSchema,
  combatStartOperationSchema,
  combatEndOperationSchema,
  combatNextTurnOperationSchema,
  combatPreviousTurnOperationSchema,
  combatSetMovementRulingOperationSchema,
  combatSpendActionOperationSchema,
  combatUndoOperationSchema,
  actorApplyDamageOperationSchema,
  actorHealOperationSchema,
  actorRollRecoveryOperationSchema,
  actorAdjustCoinsOperationSchema,
  partyAdjustCoinsOperationSchema,
  inventoryTransferOperationSchema,
  actorUseItemOperationSchema,
]);

export type AnyClientOperation = z.infer<typeof clientOperationUnionSchema>;

/**
 * What the server sends to every connected client after applying an
 * operation: the sequence number, the applied operation itself, the
 * documents that changed, and the seats that changed -- never a diff
 * format. This is the simplest shape that satisfies ADR 0005; a diff format
 * is exactly the kind of speculative complexity CLAUDE.md's Development
 * order section warns against building ahead of a real need for it.
 *
 * `documents` validates against the shared envelope in **loose** mode
 * (`.loose()`, not the default), which matters: Zod's default `z.object()`
 * silently *strips* unknown keys on parse, verified directly against this
 * project's Zod version before choosing this. A concrete document (e.g. a
 * future Party's `memberIds`) validated through the plain base schema would
 * lose its own fields on the way through this envelope. `.loose()` checks
 * the shared fields and passes everything else through unchanged -- full
 * type-specific validation already happened when the document was created
 * or updated against its own concrete schema, so this envelope only needs
 * to confirm "at least a document," not re-validate everything.
 *
 * `seats` is separate from `documents` because a `Seat` isn't one (`seat.ts`
 * doesn't extend `baseDocumentSchema` -- see `docs/world-and-seats.md`), so
 * it validates fully against `seatSchema` rather than needing the same
 * loose-mode treatment; there's no concrete-subtype-losing-fields problem
 * here since `Seat` has no subtypes.
 */
export const broadcastSchema = z.object({
  sequence: z.number().int().positive(),
  operation: appliedOperationSchema,
  documents: z.array(baseDocumentSchema.loose()),
  /**
   * Documents this operation deleted, as bare envelopes (not loose: the
   * type-specific body is stripped on purpose, so a deletion never re-sends
   * what was removed). Carries the permissions so each viewer is told only
   * about deletions of documents they could read.
   */
  deleted: z.array(baseDocumentSchema).default([]),
  seats: z.array(seatSchema),
});

export type Broadcast = z.infer<typeof broadcastSchema>;
