import { describe, expect, it } from 'vitest';

import { chatMessageSchema, chatSpellCastMessageSchema } from './chatMessage.js';
import { clientOperationUnionSchema } from './operation.js';

const op = (type: string, payload: unknown) =>
  clientOperationUnionSchema.safeParse({ id: crypto.randomUUID(), type, payload });
const id = () => crypto.randomUUID();

describe('actor.castSpell', () => {
  it('accepts the spell item alone (a cantrip), or with an entry, a rank, or focus', () => {
    expect(op('actor.castSpell', { actorId: id(), itemId: id() }).success).toBe(true);
    expect(
      op('actor.castSpell', { actorId: id(), itemId: id(), entryId: id(), rank: 3 })
        .success,
    ).toBe(true);
    expect(
      op('actor.castSpell', { actorId: id(), itemId: id(), focus: true }).success,
    ).toBe(true);
  });

  it('rejects a missing spell, a bad id, and a rank outside 1 to 10', () => {
    expect(op('actor.castSpell', { actorId: id() }).success).toBe(false);
    expect(op('actor.castSpell', { actorId: 'nope', itemId: id() }).success).toBe(false);
    expect(op('actor.castSpell', { actorId: id(), itemId: id(), rank: 0 }).success).toBe(
      false,
    );
    expect(op('actor.castSpell', { actorId: id(), itemId: id(), rank: 11 }).success).toBe(
      false,
    );
  });
});

describe('actor.refocus and actor.restSpells', () => {
  it.each(['actor.refocus', 'actor.restSpells'])('%s takes an actor', (type) => {
    expect(op(type, { actorId: id() }).success).toBe(true);
    expect(op(type, {}).success).toBe(false);
  });
});

describe('the spellCast chat message', () => {
  const base = {
    id: id(),
    worldId: id(),
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
    seatId: id(),
    kind: 'spellCast',
    actorId: id(),
    actorName: 'Valeria',
    spellName: 'Invented Burst',
    castRank: 2,
    cost: 'slot',
    overspent: false,
    text: 'It bursts.',
  };

  it('accepts a card with and without a DC and an attack bonus', () => {
    expect(chatSpellCastMessageSchema.safeParse(base).success).toBe(true);
    expect(
      chatMessageSchema.safeParse({
        ...base,
        dc: 17,
        save: 'reflex',
        basic: true,
        attackBonus: 7,
        tradition: 'arcane',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown cost and a rank outside 1 to 10', () => {
    expect(chatSpellCastMessageSchema.safeParse({ ...base, cost: 'gold' }).success).toBe(
      false,
    );
    expect(chatSpellCastMessageSchema.safeParse({ ...base, castRank: 11 }).success).toBe(
      false,
    );
  });
});
