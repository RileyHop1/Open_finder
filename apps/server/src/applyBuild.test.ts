import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type { CharacterData, Pf2eEntry } from '@hearthtable/pf2e';
import {
  characterDataSchema,
  pf2eEntrySchema,
  prepareCharacter,
} from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, updateActor } from './actors.js';
import { applyBuild } from './applyBuild.js';
import { addItem } from './items.js';
import type { CompendiumIndex } from './compendium.js';
import { OperationRejected } from './rejection.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-apply-build-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-01T00:00:00.000Z';
const base = (packId: string, slug: string) => ({
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId,
  slug,
  name: slug,
  provenance: {
    publication: 'Pathfinder Player Core',
    license: 'ORC' as const,
    remaster: true as const,
  },
  traits: [],
  ruleElements: [],
  description: '',
});

// Everything below is invented (ADR 0013).
const entries: Pf2eEntry[] = [
  pf2eEntrySchema.parse({
    ...base('ancestries', 'invented-folk'),
    kind: 'ancestry',
    hp: 8,
    size: 'medium',
    speed: 30,
  }),
  pf2eEntrySchema.parse({
    ...base('backgrounds', 'invented-background'),
    kind: 'background',
    boostOptions: ['str'],
    trainedSkills: ['invented-lore'],
  }),
  pf2eEntrySchema.parse({
    ...base('classes', 'invented-vanguard'),
    kind: 'class',
    keyAttributeOptions: ['str', 'dex'],
    hpPerLevel: 10,
    proficiencies: {
      perception: { expert: 1 },
      savingThrows: {
        fortitude: { expert: 1 },
        reflex: { trained: 1 },
        will: { trained: 1 },
      },
      classDc: { trained: 1 },
      weapons: {
        unarmed: {},
        simple: { trained: 1 },
        martial: { trained: 1 },
        advanced: {},
      },
      armor: { unarmored: { trained: 1 }, light: {}, medium: {}, heavy: {} },
    },
    skills: { trainedSkillCount: 3, automaticallyTrained: ['athletics'] },
    advancement: {
      ancestryFeatLevels: [1],
      classFeatLevels: [1],
      generalFeatLevels: [3],
      skillFeatLevels: [2],
      skillIncreaseLevels: [3],
    },
  }),
  pf2eEntrySchema.parse({
    ...base('classes', 'invented-scholar'),
    kind: 'class',
    keyAttributeOptions: ['int'],
    hpPerLevel: 6,
    proficiencies: {
      perception: { trained: 1 },
      savingThrows: {
        fortitude: { trained: 1 },
        reflex: { trained: 1 },
        will: { expert: 1 },
      },
      classDc: { trained: 1 },
      weapons: { unarmed: {}, simple: { trained: 1 }, martial: {}, advanced: {} },
      armor: { unarmored: { trained: 1 }, light: {}, medium: {}, heavy: {} },
    },
    skills: { trainedSkillCount: 2, automaticallyTrained: [] },
  }),
  pf2eEntrySchema.parse({
    ...base('classes', 'wizard'),
    kind: 'class',
    keyAttributeOptions: ['int'],
    hpPerLevel: 6,
    proficiencies: {
      perception: { trained: 1 },
      savingThrows: {
        fortitude: { trained: 1 },
        reflex: { trained: 1 },
        will: { expert: 1 },
      },
      classDc: { trained: 1 },
      weapons: { unarmed: {}, simple: { trained: 1 }, martial: {}, advanced: {} },
      armor: { unarmored: { trained: 1 }, light: {}, medium: {}, heavy: {} },
    },
    skills: { trainedSkillCount: 2, automaticallyTrained: [] },
  }),
  // The same stub as a spontaneous caster: only the slug decides the casting table.
  pf2eEntrySchema.parse({
    ...base('classes', 'bard'),
    kind: 'class',
    keyAttributeOptions: ['cha'],
    hpPerLevel: 8,
    proficiencies: {
      perception: { expert: 1 },
      savingThrows: {
        fortitude: { trained: 1 },
        reflex: { trained: 1 },
        will: { expert: 1 },
      },
      classDc: { trained: 1 },
      weapons: { unarmed: {}, simple: { trained: 1 }, martial: {}, advanced: {} },
      armor: { unarmored: { trained: 1 }, light: { trained: 1 }, medium: {}, heavy: {} },
    },
    skills: { trainedSkillCount: 4, automaticallyTrained: [] },
  }),
  ...[
    ['invented-spark', ['cantrip']],
    ['invented-glow', ['cantrip']],
    ['invented-burst', []],
  ].map(([slug, traits]) =>
    pf2eEntrySchema.parse({
      ...base('spells', slug as string),
      kind: 'spell',
      traits,
      rank: 1,
      traditions: ['arcane', 'occult'],
      castTime: '2',
      range: { kind: 'feet', value: 30 },
    }),
  ),
  pf2eEntrySchema.parse({
    ...base('class-features', 'rally'),
    kind: 'classFeature',
    classSlugs: ['invented-vanguard'],
    level: 1,
  }),
  pf2eEntrySchema.parse({
    ...base('class-features', 'late-feature'),
    kind: 'classFeature',
    classSlugs: ['invented-vanguard'],
    level: 9,
  }),
  pf2eEntrySchema.parse({
    ...base('class-features', 'invented-instinct'),
    kind: 'classFeature',
    classSlugs: ['invented-vanguard'],
    level: 3,
    ruleElements: [
      {
        kind: 'choiceSet',
        prompt: 'Choose Invented Instinct',
        choices: [
          { label: 'Alpha', value: 'alpha' },
          { label: 'Beta', value: 'beta' },
        ],
        rollOptionPrefix: 'instinct',
        grantsFromPackId: 'class-features',
      },
    ],
  }),
  ...['alpha', 'beta'].map((slug) =>
    pf2eEntrySchema.parse({
      ...base('class-features', slug),
      kind: 'classFeature',
      classSlugs: ['invented-vanguard'],
      level: 3,
      tags: ['vanguard-instinct'],
    }),
  ),
  pf2eEntrySchema.parse({ ...base('equipment', 'rope'), kind: 'gear' }),
  pf2eEntrySchema.parse({
    ...base('feats', 'sudden-charge'),
    kind: 'feat',
    level: 1,
    category: 'class',
    prerequisites: [],
  }),
];

const compendium: CompendiumIndex = {
  status: () => ({ available: true, packs: [], entryCount: entries.length, skipped: 0 }),
  search: (options = {}) =>
    entries
      .filter(
        (e) =>
          (options.kind === undefined || e.kind === options.kind) &&
          (options.classSlug === undefined ||
            (e.kind === 'classFeature' && e.classSlugs.includes(options.classSlug))),
      )
      .map((e) => ({
        packId: e.packId,
        slug: e.slug,
        name: e.name,
        kind: e.kind,
        traits: [],
      })),
  get: (packId, slug) => entries.find((e) => e.packId === packId && e.slug === slug),
  conditions: () => new Map(),
  traits: () => [],
};

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  return {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const sheetOf = (actorId: string): CharacterData =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

const BUILD = {
  ancestry: { packId: 'ancestries', slug: 'invented-folk' },
  background: { packId: 'backgrounds', slug: 'invented-background' },
  class: { packId: 'classes', slug: 'invented-vanguard' },
  boosts: [
    { level: 1, source: 'ancestry', attributes: ['str', 'con'] },
    { level: 1, source: 'background', attributes: ['str'] },
    { level: 1, source: 'class', attributes: ['str'] },
    { level: 1, source: 'free', attributes: ['str', 'dex'] },
  ],
  feats: [{ slot: 'class', level: 1, feat: { packId: 'feats', slug: 'sudden-charge' } }],
};

function character() {
  const owner = makeSeat();
  const actor = createActor(store, owner, { kind: 'character', name: 'Hero' });
  return { owner, actorId: actor.id };
}

describe('applyBuild', () => {
  it('writes the derived numbers, references, build and items, and starts at full health', () => {
    const { owner, actorId } = character();
    applyBuild(store, owner, compendium, { actorId, build: BUILD });

    const sheet = sheetOf(actorId);
    expect(sheet.attributes).toMatchObject({ str: 4, dex: 1, con: 1, int: 0 });
    expect(sheet.keyAttribute).toBe('str');
    expect(sheet.ranks.perception).toBe('expert');
    expect(sheet.ranks.fortitude).toBe('expert');
    expect(sheet.ranks.skills).toMatchObject({
      athletics: 'trained',
      'invented-lore': 'trained',
    });
    expect(sheet).toMatchObject({ ancestryHp: 8, classHp: 10, speed: 30 });
    expect(sheet.ancestry).toEqual({
      name: 'invented-folk',
      source: { packId: 'ancestries', slug: 'invented-folk' },
    });
    expect(sheet.class?.name).toBe('invented-vanguard');
    expect(sheet.build?.class?.slug).toBe('invented-vanguard');
    // Class features due at level 1 and the picked feat; not the level 9 feature.
    expect(sheet.items.map((i) => i.entry.slug).sort()).toEqual([
      'rally',
      'sudden-charge',
    ]);
    expect(sheet.items[0]?.source).toBeDefined();
    // 8 + (10 + 1) * 1 = 19.
    expect(prepareCharacter(sheet).hp.max.total).toBe(19);
    expect(sheet.hp.current).toBe(19);
  });

  it('uses the level and key attribute it is given', () => {
    const { owner, actorId } = character();
    applyBuild(store, owner, compendium, {
      actorId,
      build: BUILD,
      level: 9,
      keyAttribute: 'dex',
    });
    const sheet = sheetOf(actorId);
    expect(sheet.level).toBe(9);
    expect(sheet.keyAttribute).toBe('dex');
    expect(sheet.items.map((i) => i.entry.slug)).toContain('late-feature');
  });

  it('grants the class feature the build chose, and records the choice', () => {
    const { owner, actorId } = character();
    applyBuild(store, owner, compendium, {
      actorId,
      build: { ...BUILD, classChoices: { instinct: 'alpha' } },
      level: 3,
    });

    const sheet = sheetOf(actorId);
    const slugs = sheet.items.map((i) => i.entry.slug);
    expect(slugs).toContain('invented-instinct');
    expect(slugs).toContain('alpha');
    expect(slugs).not.toContain('beta');
    expect(sheet.choices).toEqual({ instinct: 'alpha' });
  });

  it('grants neither alternative when the choice has not been made', () => {
    const { owner, actorId } = character();
    applyBuild(store, owner, compendium, { actorId, build: BUILD, level: 3 });

    const slugs = sheetOf(actorId).items.map((i) => i.entry.slug);
    expect(slugs).toContain('invented-instinct');
    expect(slugs).not.toContain('alpha');
    expect(slugs).not.toContain('beta');
  });

  describe('the key attribute', () => {
    it('is the class’s own when none is sent, not the blank sheet’s default of Strength', () => {
      const { owner, actorId } = character();
      expect(sheetOf(actorId).keyAttribute).toBe('str');
      applyBuild(store, owner, compendium, {
        actorId,
        build: { class: { packId: 'classes', slug: 'invented-scholar' } },
      });
      expect(sheetOf(actorId).keyAttribute).toBe('int');
    });

    it('is the one that was sent, when there is one', () => {
      const { owner, actorId } = character();
      applyBuild(store, owner, compendium, {
        actorId,
        build: BUILD,
        keyAttribute: 'dex',
      });
      expect(sheetOf(actorId).keyAttribute).toBe('dex');
    });

    it('keeps an earlier choice the class offers when applied again without one', () => {
      const { owner, actorId } = character();
      applyBuild(store, owner, compendium, {
        actorId,
        build: BUILD,
        keyAttribute: 'dex',
      });
      applyBuild(store, owner, compendium, { actorId, build: BUILD, level: 2 });
      expect(sheetOf(actorId).keyAttribute).toBe('dex');
    });
  });

  describe('spellcasting', () => {
    const WIZARD_BUILD = { class: { packId: 'classes', slug: 'wizard' } };

    it('gives a caster its spellcasting entry, from the class and level', () => {
      const { owner, actorId } = character();
      applyBuild(store, owner, compendium, { actorId, build: WIZARD_BUILD, level: 3 });

      const [entry, ...rest] = sheetOf(actorId).spellcasting;
      expect(rest).toEqual([]);
      expect(entry).toMatchObject({
        kind: 'prepared',
        source: 'class:wizard',
        tradition: 'arcane',
        attribute: 'int',
        rank: 'trained',
        slots: { '1': 3, '2': 2 },
      });
    });

    const spellRef = (slug: string) => ({ packId: 'spells', slug });
    const idOf = (actorId: string, slug: string) =>
      sheetOf(actorId).items.find((i) => i.entry.slug === slug)?.id;

    it('grants the picked spells and puts them in a spontaneous caster’s lists', () => {
      const { owner, actorId } = character();
      applyBuild(store, owner, compendium, {
        actorId,
        build: {
          class: { packId: 'classes', slug: 'bard' },
          spells: {
            cantrips: [spellRef('invented-spark')],
            ranked: [spellRef('invented-burst')],
          },
        },
      });

      const [entry] = sheetOf(actorId).spellcasting;
      expect(entry?.cantrips).toEqual([idOf(actorId, 'invented-spark')]);
      expect(entry?.kind === 'spontaneous' ? entry.repertoire : []).toEqual([
        idOf(actorId, 'invented-burst'),
      ]);
    });

    it('gives a prepared caster the ranked picks as items only, to prepare in play', () => {
      const { owner, actorId } = character();
      applyBuild(store, owner, compendium, {
        actorId,
        build: {
          ...WIZARD_BUILD,
          spells: {
            cantrips: [spellRef('invented-spark')],
            ranked: [spellRef('invented-burst')],
          },
        },
      });

      const [entry] = sheetOf(actorId).spellcasting;
      expect(entry?.cantrips).toEqual([idOf(actorId, 'invented-spark')]);
      expect(entry?.kind === 'prepared' ? entry.prepared : undefined).toEqual([]);
      expect(idOf(actorId, 'invented-burst')).toBeDefined();
    });

    it('adds picks on a second apply without duplicating items or list ids', () => {
      const { owner, actorId } = character();
      const build = (cantrips: string[]) => ({
        class: { packId: 'classes', slug: 'bard' },
        spells: { cantrips: cantrips.map(spellRef), ranked: [] },
      });
      applyBuild(store, owner, compendium, { actorId, build: build(['invented-spark']) });
      applyBuild(store, owner, compendium, {
        actorId,
        build: build(['invented-spark', 'invented-glow']),
      });

      const sheet = sheetOf(actorId);
      expect(sheet.items.filter((i) => i.entry.slug === 'invented-spark')).toHaveLength(
        1,
      );
      expect(sheet.spellcasting[0]?.cantrips).toEqual([
        idOf(actorId, 'invented-spark'),
        idOf(actorId, 'invented-glow'),
      ]);
    });

    it('gives a non-caster none', () => {
      const { owner, actorId } = character();
      applyBuild(store, owner, compendium, { actorId, build: BUILD });
      expect(sheetOf(actorId).spellcasting).toEqual([]);
    });

    it('keeps what play changed when it is applied again at a higher level', () => {
      const { owner, actorId } = character();
      applyBuild(store, owner, compendium, { actorId, build: WIZARD_BUILD, level: 1 });
      const first = sheetOf(actorId).spellcasting;
      const played = first.map((e) =>
        e.kind === 'prepared'
          ? {
              ...e,
              prepared: [
                { rank: 1, itemId: crypto.randomUUID(), expended: true },
                { rank: 1, itemId: crypto.randomUUID(), expended: false },
              ],
            }
          : e,
      );
      updateActor(store, owner, {
        actorId,
        changes: { 'system.spellcasting': played },
      });

      applyBuild(store, owner, compendium, { actorId, build: WIZARD_BUILD, level: 5 });

      const [entry, ...rest] = sheetOf(actorId).spellcasting;
      expect(rest).toEqual([]);
      expect(entry?.id).toBe(first[0]?.id);
      expect(entry).toMatchObject({ slots: { '1': 3, '2': 3, '3': 2 } });
      expect(
        entry?.kind === 'prepared' ? entry.prepared.map((p) => p.expended) : [],
      ).toEqual([true, false]);
    });
  });

  it('is safe to apply twice: no duplicate items, and hand-added items survive', () => {
    const { owner, actorId } = character();
    applyBuild(store, owner, compendium, { actorId, build: BUILD });
    addItem(store, owner, compendium, { actorId, packId: 'equipment', slug: 'rope' });
    const before = sheetOf(actorId).items;
    expect(before.map((i) => i.entry.slug).sort()).toEqual([
      'rally',
      'rope',
      'sudden-charge',
    ]);

    applyBuild(store, owner, compendium, { actorId, build: BUILD });
    const after = sheetOf(actorId).items;
    expect(after.map((i) => i.id)).toEqual(before.map((i) => i.id));
  });

  it('puts the values named in keep back, and replaces the rest', () => {
    const { owner, actorId } = character();
    updateActor(store, owner, {
      actorId,
      changes: {
        'system.attributes.str': 7,
        'system.speed': 40,
        'system.ranks.skills.stealth': 'master',
      },
    });
    applyBuild(store, owner, compendium, {
      actorId,
      build: BUILD,
      keep: ['attributes.str', 'speed', 'ranks.skills.stealth'],
    });
    const sheet = sheetOf(actorId);
    expect(sheet.attributes.str).toBe(7);
    expect(sheet.speed).toBe(40);
    expect(sheet.ranks.skills.stealth).toBe('master');
    // Not kept, so derived: dex 1.
    expect(sheet.attributes.dex).toBe(1);
  });

  it('keeps a wounded character’s current hit points instead of healing them', () => {
    const { owner, actorId } = character();
    applyBuild(store, owner, compendium, { actorId, build: BUILD });
    updateActor(store, owner, { actorId, changes: { 'system.hp.current': 5 } });
    applyBuild(store, owner, compendium, { actorId, build: BUILD });
    expect(sheetOf(actorId).hp.current).toBe(5);
  });

  it('applies a build with rules problems anyway (ADR 0023)', () => {
    const { owner, actorId } = character();
    applyBuild(store, owner, compendium, {
      actorId,
      build: { boosts: [{ level: 1, source: 'free', attributes: ['str', 'str'] }] },
    });
    expect(sheetOf(actorId).attributes.str).toBe(2);
  });

  it('lets the GM apply a build to a character they do not own, but not another player', () => {
    const { actorId } = character();
    applyBuild(store, makeSeat({ isGM: true }), compendium, { actorId, build: BUILD });
    expect(sheetOf(actorId).build).toBeDefined();
    expect(() =>
      applyBuild(store, makeSeat(), compendium, { actorId, build: BUILD }),
    ).toThrow(OperationRejected);
  });

  it('rejects data problems: a malformed build, a missing entry, a bad key attribute, an unsafe keep path', () => {
    const { owner, actorId } = character();
    const apply = (payload: Partial<Parameters<typeof applyBuild>[3]>) =>
      applyBuild(store, owner, compendium, { actorId, build: {}, ...payload });
    expect(() => apply({ build: { boosts: [{ level: 2 }] } })).toThrow(/invalid build/);
    expect(() =>
      apply({ build: { class: { packId: 'classes', slug: 'nowhere' } } }),
    ).toThrow(/no class classes\/nowhere/);
    expect(() => apply({ keyAttribute: 'luck' })).toThrow(/not an attribute/);
    expect(() => apply({ keep: ['__proto__.polluted'] })).toThrow(/cannot keep/);
    // Wrong kind of entry under a class reference.
    expect(() =>
      apply({ build: { class: { packId: 'ancestries', slug: 'invented-folk' } } }),
    ).toThrow(/no class/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects an NPC, which has no character sheet', () => {
    const owner = makeSeat({ isGM: true });
    const npc = createActor(store, owner, { kind: 'npc', name: 'Goblin' });
    expect(() =>
      applyBuild(store, owner, compendium, { actorId: npc.id, build: {} }),
    ).toThrow(/does not have a character sheet/);
  });
});
