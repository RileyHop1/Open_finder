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
  it('costs one Stride for any move up to one Speed', () => {
    expect(stridesFor(5, 25)).toBe(1);
    expect(stridesFor(25, 25)).toBe(1);
  });

  it('costs nothing for no movement', () => {
    expect(stridesFor(0, 25)).toBe(0);
  });

  it('costs a minimum of one Stride even for a short move', () => {
    expect(stridesFor(1, 25)).toBe(1);
  });

  it('costs a second Stride once the move itself outruns one Speed', () => {
    expect(stridesFor(30, 25)).toBe(2);
    expect(stridesFor(50, 25)).toBe(2);
    expect(stridesFor(51, 25)).toBe(3);
  });

  it('charges every separate move its own Stride, never a running total', () => {
    // Two 5 ft moves cost one Stride each, not one Stride total.
    expect(stridesFor(5, 25)).toBe(1);
    expect(stridesFor(5, 25)).toBe(1);
  });

  it('charges one Stride per foot at Speed 0', () => {
    expect(stridesFor(5, 0)).toBe(5);
    expect(stridesFor(3, 0)).toBe(3);
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
