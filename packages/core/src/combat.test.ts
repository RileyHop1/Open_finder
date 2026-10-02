import { describe, expect, it } from 'vitest';

import {
  COMBAT_STATUSES,
  combatSchema,
  combatantSchema,
  MAX_COUNTER,
  MAX_INITIATIVE,
  MAX_ROUND,
} from './combat.js';

function envelope() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    worldId: crypto.randomUUID(),
    permissions: { default: 'observer' as const },
  };
}

function combatFields() {
  return { ...envelope(), type: 'combat' as const, sceneId: crypto.randomUUID() };
}

function combatantFields() {
  return {
    ...envelope(),
    type: 'combatant' as const,
    combatId: crypto.randomUUID(),
    tokenId: crypto.randomUUID(),
    actorId: crypto.randomUUID(),
  };
}

describe('combatSchema', () => {
  it('starts pending, at round 0, with nobody active', () => {
    const parsed = combatSchema.parse(combatFields());
    expect(parsed.status).toBe('pending');
    expect(parsed.round).toBe(0);
    expect(parsed.activeCombatantId).toBeUndefined();
  });

  it('keeps a running combat: its round and whose turn it is, by id', () => {
    const activeCombatantId = crypto.randomUUID();
    const parsed = combatSchema.parse({
      ...combatFields(),
      status: 'active',
      round: 3,
      activeCombatantId,
    });
    expect(parsed).toMatchObject({ status: 'active', round: 3, activeCombatantId });
  });

  it('accepts each status and no other', () => {
    for (const status of COMBAT_STATUSES) {
      expect(combatSchema.safeParse({ ...combatFields(), status }).success).toBe(true);
    }
    expect(combatSchema.safeParse({ ...combatFields(), status: 'paused' }).success).toBe(
      false,
    );
  });

  it('rejects a round that is negative, a fraction, or past the bound', () => {
    expect(combatSchema.safeParse({ ...combatFields(), round: -1 }).success).toBe(false);
    expect(combatSchema.safeParse({ ...combatFields(), round: 1.5 }).success).toBe(false);
    expect(
      combatSchema.safeParse({ ...combatFields(), round: MAX_ROUND + 1 }).success,
    ).toBe(false);
  });

  it('rejects an active combatant that is not an id, and a missing scene', () => {
    expect(
      combatSchema.safeParse({ ...combatFields(), activeCombatantId: 'nope' }).success,
    ).toBe(false);
    const { sceneId: _sceneId, ...withoutScene } = combatFields();
    expect(combatSchema.safeParse(withoutScene).success).toBe(false);
  });
});

describe('combatantSchema', () => {
  it('defaults to unrolled, in the fight, visible, with a fresh turn', () => {
    const parsed = combatantSchema.parse(combatantFields());
    expect(parsed.initiative).toBeUndefined();
    expect(parsed.defeated).toBe(false);
    expect(parsed.hidden).toBe(false);
    expect(parsed.turn).toEqual({ actionsSpent: 0, reactionUsed: false, attacksMade: 0 });
  });

  it('keeps an initiative, including a negative one, and the flags', () => {
    expect(
      combatantSchema.parse({ ...combatantFields(), initiative: -2, hidden: true }),
    ).toMatchObject({ initiative: -2, hidden: true });
    expect(combatantSchema.parse({ ...combatantFields(), defeated: true }).defeated).toBe(
      true,
    );
  });

  it('fills the rest of a partly written turn', () => {
    const parsed = combatantSchema.parse({
      ...combatantFields(),
      turn: { actionsSpent: 2 },
    });
    expect(parsed.turn).toEqual({ actionsSpent: 2, reactionUsed: false, attacksMade: 0 });
  });

  it('allows spending more actions than a turn has: the app warns and never blocks', () => {
    const parsed = combatantSchema.parse({
      ...combatantFields(),
      turn: { actionsSpent: 4, attacksMade: 4, reactionUsed: true },
    });
    expect(parsed.turn.actionsSpent).toBe(4);
  });

  it('rejects an initiative that is a fraction or past the bound', () => {
    expect(
      combatantSchema.safeParse({ ...combatantFields(), initiative: 12.5 }).success,
    ).toBe(false);
    expect(
      combatantSchema.safeParse({ ...combatantFields(), initiative: MAX_INITIATIVE + 1 })
        .success,
    ).toBe(false);
    expect(
      combatantSchema.safeParse({ ...combatantFields(), initiative: -MAX_INITIATIVE - 1 })
        .success,
    ).toBe(false);
  });

  it('rejects counters that are negative, fractions, or past the bound', () => {
    for (const turn of [
      { actionsSpent: -1 },
      { actionsSpent: 1.5 },
      { attacksMade: MAX_COUNTER + 1 },
      { reactionUsed: 'yes' },
    ]) {
      expect(combatantSchema.safeParse({ ...combatantFields(), turn }).success).toBe(
        false,
      );
    }
  });

  it('needs the combat, the token, and the actor', () => {
    for (const key of ['combatId', 'tokenId', 'actorId'] as const) {
      const fields: Record<string, unknown> = { ...combatantFields() };
      delete fields[key];
      expect(combatantSchema.safeParse(fields).success).toBe(false);
    }
  });
});
