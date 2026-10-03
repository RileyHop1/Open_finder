import type { Actor, Combatant } from '@hearthtable/core';
import { actorSchema, combatantSchema } from '@hearthtable/core';
import { newCharacterData } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { actionTrayView } from './actionTrayModel.js';
import { makeNpc } from './sheet/testNpc.js';

const NOW = '2026-10-01T00:00:00.000Z';
const base = (type: string) => ({
  id: crypto.randomUUID(),
  worldId: crypto.randomUUID(),
  type,
  schemaVersion: 1,
  permissions: { default: 'observer' as const, seats: {} },
  createdAt: NOW,
  updatedAt: NOW,
});

const makeCombatant = (turn: Partial<Combatant['turn']> = {}): Combatant =>
  combatantSchema.parse({
    ...base('combatant'),
    combatId: crypto.randomUUID(),
    tokenId: crypto.randomUUID(),
    actorId: crypto.randomUUID(),
    turn: { actionsSpent: 0, reactionUsed: false, attacksMade: 0, ...turn },
  });

const makeActor = (
  kind: 'character' | 'npc',
  conditions: { slug: string; value?: number }[] = [],
): Actor =>
  actorSchema.parse({
    ...base('actor'),
    kind,
    name: 'A',
    system: kind === 'character' ? { ...newCharacterData(), conditions } : { conditions },
  });

describe('actionTrayView', () => {
  it('reports a plain 3-action turn with nothing spent', () => {
    const view = actionTrayView(makeCombatant(), makeActor('npc'));
    expect(view).toMatchObject({
      capacity: { total: 3, quickenedExtra: false },
      spent: 0,
      reactionUsed: false,
      overspent: 0,
    });
  });

  it('takes capacity from the actor’s conditions, character or NPC alike', () => {
    const slowed = actionTrayView(
      makeCombatant(),
      makeActor('character', [{ slug: 'slowed', value: 1 }]),
    );
    expect(slowed.capacity.total).toBe(2);

    const npc = makeNpc();
    npc.system = { ...npc.system, conditions: [{ slug: 'quickened' }] };
    const quickened = actionTrayView(makeCombatant(), npc);
    expect(quickened.capacity).toEqual({ total: 4, quickenedExtra: true });
  });

  it('is not overspent at or under capacity, and reports the excess over it', () => {
    const atCap = actionTrayView(makeCombatant({ actionsSpent: 3 }), makeActor('npc'));
    expect(atCap.overspent).toBe(0);

    const over = actionTrayView(makeCombatant({ actionsSpent: 5 }), makeActor('npc'));
    expect(over).toMatchObject({ spent: 5, overspent: 2 });
  });

  it('carries the reaction flag through, and defaults conditions to none for an unreadable actor', () => {
    const acting = actionTrayView(makeCombatant({ reactionUsed: true }), undefined);
    expect(acting).toMatchObject({
      capacity: { total: 3, quickenedExtra: false },
      reactionUsed: true,
    });
  });
});
