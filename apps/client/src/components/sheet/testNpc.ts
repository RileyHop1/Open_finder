/** An invented monster as an NPC actor, for the sheet tests (never a published stat block). */
import type { Actor } from '@hearthtable/core';
import { creatureEntrySchema, newNpcFromCreature } from '@hearthtable/pf2e';

const NOW = '2026-10-01T00:00:00.000Z';

export const BOG_STRANGLER = creatureEntrySchema.parse({
  id: '20000000-0001-5000-8000-000000000001',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'bestiary',
  slug: 'invented-bog-strangler',
  name: 'Invented Bog Strangler',
  kind: 'creature',
  provenance: { publication: 'Pathfinder Monster Core', license: 'ORC', remaster: true },
  traits: ['plant', 'swamp'],
  level: 3,
  size: 'large',
  perception: 8,
  ac: 19,
  savingThrows: { fortitude: 10, reflex: 6, will: 7 },
  hp: 45,
  speeds: { land: 25, swim: 10 },
  attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
  skills: { athletics: 11, stealth: 7 },
  strikes: [
    {
      name: 'Vine',
      attackBonus: 11,
      traits: [],
      damage: [{ diceNumber: 1, dieFaces: 8, bonus: 4, damageType: 'bludgeoning' }],
    },
  ],
});

export function makeNpc(overrides: Partial<Actor> = {}): Actor {
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'none', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'npc',
    name: 'Invented Bog Strangler',
    system: newNpcFromCreature(BOG_STRANGLER, {
      packId: 'bestiary',
      slug: 'invented-bog-strangler',
    }),
    ...overrides,
  };
}
