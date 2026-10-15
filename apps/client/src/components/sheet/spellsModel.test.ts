import type { CharacterData, CharacterItem, SpellcastingEntry } from '@hearthtable/pf2e';
import { newCharacterData } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { spellsView } from './spellsModel.js';

const NOW = '2026-10-15T00:00:00.000Z';

function spell(name: string, rank: number, traits: string[] = []): CharacterItem {
  return {
    id: crypto.randomUUID(),
    equipped: false,
    quantity: 1,
    entry: {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      packId: 'spells',
      slug: name.toLowerCase().replaceAll(' ', '-'),
      name,
      kind: 'spell',
      traits,
      ruleElements: [],
      description: '',
      rank,
    },
  } as unknown as CharacterItem;
}

function withCasting(
  items: CharacterItem[],
  spellcasting: SpellcastingEntry[],
  focusMax = 0,
): CharacterData {
  return {
    ...newCharacterData(),
    items,
    spellcasting,
    focusPoints: { max: focusMax, current: focusMax },
  };
}

const base = {
  id: crypto.randomUUID(),
  name: 'Test spellcasting',
  tradition: 'divine',
  attribute: 'wis',
  rank: 'trained',
  cantrips: [] as string[],
} as const;

describe('spellsView', () => {
  it('shows nothing for a character who casts nothing', () => {
    const view = spellsView(withCasting([spell('Heal', 1)], []));
    expect(view.any).toBe(false);
    expect(view.entries).toEqual([]);
    expect(view.focusSpells).toEqual([]);
  });

  it('counts a prepared rank by its cast rows and groups rows by slot rank', () => {
    const heal = spell('Heal', 1);
    const bless = spell('Bless', 1);
    const sound = spell('Sound Body', 2);
    const view = spellsView(
      withCasting(
        [heal, bless, sound],
        [
          {
            ...base,
            kind: 'prepared',
            slots: { '1': 2, '2': 1 },
            prepared: [
              { rank: 1, itemId: heal.id, expended: true },
              { rank: 1, itemId: bless.id, expended: false },
              { rank: 2, itemId: sound.id, expended: false },
            ],
          },
        ],
      ),
    );
    const entry = view.entries[0];
    expect(entry?.ranks).toEqual([
      { rank: 1, max: 2, used: 1, left: 1, over: 0 },
      { rank: 2, max: 1, used: 0, left: 1, over: 0 },
    ]);
    expect(entry?.groups.map((g) => g.rank)).toEqual([1, 2]);
    expect(entry?.groups[0]?.spells.map((s) => [s.name, s.expended])).toEqual([
      ['Bless', false],
      ['Heal', true],
    ]);
    expect(entry?.attackKey).toBe(`spellAttack:${base.id}`);
    expect(entry?.dcKey).toBe(`spellDc:${base.id}`);
  });

  it('puts a spell prepared in a higher slot under that slot, not its own rank', () => {
    const heal = spell('Heal', 1);
    const view = spellsView(
      withCasting(
        [heal],
        [
          {
            ...base,
            kind: 'prepared',
            slots: { '1': 1, '3': 1 },
            prepared: [{ rank: 3, itemId: heal.id, expended: false }],
          },
        ],
      ),
    );
    expect(view.entries[0]?.groups.map((g) => g.rank)).toEqual([3]);
    expect(view.entries[0]?.highestRank).toBe(3);
  });

  it('reads spontaneous slots as used of max and lets used pass max', () => {
    const view = spellsView(
      withCasting(
        [],
        [
          {
            ...base,
            kind: 'spontaneous',
            slots: { '1': { max: 3, used: 1 }, '2': { max: 2, used: 3 } },
            repertoire: [],
            signature: [],
          },
        ],
      ),
    );
    expect(view.entries[0]?.ranks).toEqual([
      { rank: 1, max: 3, used: 1, left: 2, over: 0 },
      { rank: 2, max: 2, used: 3, left: 0, over: 1 },
    ]);
  });

  it('leaves out a rank with no slots and nothing used, but keeps an overspent one', () => {
    const view = spellsView(
      withCasting(
        [],
        [
          {
            ...base,
            kind: 'spontaneous',
            slots: {
              '1': { max: 0, used: 0 },
              '2': { max: 0, used: 1 },
              '3': { max: 1, used: 0 },
            },
            repertoire: [],
            signature: [],
          },
        ],
      ),
    );
    expect(view.entries[0]?.ranks.map((r) => r.rank)).toEqual([2, 3]);
  });

  it('groups a repertoire by spell rank and lists cantrips apart', () => {
    const zap = spell('Zap', 1, ['cantrip']);
    const fear = spell('Fear', 1);
    const fireball = spell('Fireball', 3);
    const view = spellsView(
      withCasting(
        [zap, fear, fireball],
        [
          {
            ...base,
            kind: 'spontaneous',
            slots: { '1': { max: 3, used: 0 }, '2': { max: 3, used: 0 } },
            repertoire: [fireball.id, fear.id],
            signature: [],
            cantrips: [zap.id],
          },
        ],
      ),
    );
    const entry = view.entries[0];
    expect(entry?.cantrips.map((s) => s.name)).toEqual(['Zap']);
    expect(entry?.groups.map((g) => [g.rank, g.spells.map((s) => s.name)])).toEqual([
      [1, ['Fear']],
      [3, ['Fireball']],
    ]);
    // Heightening is offered up to the highest rank with slots.
    expect(entry?.highestRank).toBe(2);
  });

  it('counts spells it cannot find instead of failing, and skips non-spell items', () => {
    const gear = { ...spell('Rope', 1), entry: { kind: 'gear', name: 'Rope' } };
    const view = spellsView(
      withCasting(
        [gear as unknown as CharacterItem],
        [
          {
            ...base,
            kind: 'spontaneous',
            slots: { '1': { max: 1, used: 0 } },
            repertoire: [crypto.randomUUID()],
            signature: [],
            cantrips: [gear.id],
          },
        ],
      ),
    );
    expect(view.entries[0]?.missing).toBe(2);
    expect(view.entries[0]?.groups).toEqual([]);
    expect(view.entries[0]?.cantrips).toEqual([]);
  });

  it('lists focus spells and shows the pool even with no entry', () => {
    const lay = spell('Lay on Hands', 1, ['focus']);
    const plain = spell('Heal', 1);
    const view = spellsView(withCasting([plain, lay], [], 1));
    expect(view.any).toBe(true);
    expect(view.focus).toEqual({ max: 1, current: 1 });
    expect(view.focusSpells.map((s) => s.name)).toEqual(['Lay on Hands']);
  });
});
