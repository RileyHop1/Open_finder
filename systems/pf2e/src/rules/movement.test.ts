import { actorSchema, type Actor } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { BOG_STRANGLER } from '../golden/goldenCreatures.js';
import { newCharacterData, newNpcFromCreature } from '../index.js';
import { speedOf, stridesFor } from './movement.js';

const NOW = new Date().toISOString();

function actor(kind: Actor['kind'], system: Record<string, unknown>): Actor {
  return actorSchema.parse({
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'actor',
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    permissions: { default: 'owner', seats: {} },
    kind,
    name: 'Fixture',
    system,
  });
}

describe('stridesFor', () => {
  it('costs one Stride for a move within one Speed, from a stationary start', () => {
    expect(stridesFor(0, 25, 25)).toBe(1);
    expect(stridesFor(0, 10, 25)).toBe(1);
  });

  it('costs nothing for no movement', () => {
    expect(stridesFor(0, 0, 25)).toBe(0);
    expect(stridesFor(40, 0, 25)).toBe(0);
  });

  it('costs a second Stride only once the total crosses another Speed', () => {
    // 20 + 5 = 25: still fits inside the one Stride already paid for.
    expect(stridesFor(20, 5, 25)).toBe(0);
    // 20 + 10 = 30: crosses into a second Speed's worth of distance.
    expect(stridesFor(20, 10, 25)).toBe(1);
  });

  it('never charges twice for ground already paid for this turn', () => {
    expect(stridesFor(25, 10, 25)).toBe(1);
    expect(stridesFor(25, 25, 25)).toBe(1);
  });

  it('charges one Stride per foot at Speed 0', () => {
    expect(stridesFor(0, 5, 0)).toBe(5);
    expect(stridesFor(10, 3, 0)).toBe(3);
  });
});

describe('speedOf', () => {
  it("reads a character's hand-set speed field", () => {
    expect(speedOf(actor('character', newCharacterData()))).toBe(25);
    expect(speedOf(actor('character', { ...newCharacterData(), speed: 30 }))).toBe(30);
  });

  it("reads an NPC's land speed from its embedded creature entry", () => {
    expect(speedOf(actor('npc', newNpcFromCreature(BOG_STRANGLER)))).toBe(
      BOG_STRANGLER.speeds.land,
    );
  });

  it('is undefined for a hazard, or data that does not match its kind', () => {
    expect(speedOf(actor('hazard', {}))).toBeUndefined();
    expect(speedOf(actor('character', { not: 'a character' }))).toBeUndefined();
    expect(speedOf(actor('npc', { not: 'an npc' }))).toBeUndefined();
  });
});
