import type { Actor } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { actorHp, hpPercent } from './actorHp.js';

const NOW = '2026-10-01T00:00:00.000Z';

const actor = (kind: Actor['kind'], system: unknown = {}): Actor =>
  actorSchema.parse({
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'none', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind,
    name: 'Someone',
    system,
  });

describe('hpPercent', () => {
  it('rounds and stays within 0 to 100', () => {
    expect(hpPercent(10, 40)).toBe(25);
    expect(hpPercent(1, 3)).toBe(33);
    expect(hpPercent(-4, 40)).toBe(0);
    expect(hpPercent(50, 40)).toBe(100);
  });

  it('reads a maximum of zero as empty', () => {
    expect(hpPercent(5, 0)).toBe(0);
  });
});

describe('actorHp', () => {
  it('has nothing to say about an actor with no hit points data', () => {
    expect(actorHp(actor('npc'))).toBeUndefined();
    expect(actorHp(actor('character'))).toBeUndefined();
  });
});
