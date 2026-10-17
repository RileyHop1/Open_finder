import { describe, expect, it } from 'vitest';

import { holdsForOwnClass, readClassFeatureRules } from './classFeatureRules.js';

// Invented upstream-shaped rules (ADR 0013).
const skill = (slug: string, value: number, predicate?: unknown) => ({
  key: 'ActiveEffectLike',
  mode: 'upgrade',
  path: `system.skills.${slug}.rank`,
  value,
  ...(predicate === undefined ? {} : { predicate }),
});
const grant = (predicate?: unknown) => ({
  key: 'GrantItem',
  uuid: 'Compendium.pf2e.feats-srd.Item.Invented Feat',
  ...(predicate === undefined ? {} : { predicate }),
});

describe('holdsForOwnClass', () => {
  const own = ['invented-class'];

  it('holds for no predicate, the feature’s own class, and an or naming it', () => {
    expect(holdsForOwnClass(undefined, own)).toBe(true);
    expect(holdsForOwnClass(['class:invented-class'], own)).toBe(true);
    expect(
      holdsForOwnClass([{ or: ['class:invented-class', 'feat:invented-explorer'] }], own),
    ).toBe(true);
  });

  it('holds for a not of a feat or of a granter: another route to the same feature', () => {
    expect(
      holdsForOwnClass([{ not: 'feat:invented-explorer:invented-order' }], own),
    ).toBe(true);
    expect(
      holdsForOwnClass([{ not: 'parent:granter:slug:invented-evolution' }], own),
    ).toBe(true);
  });

  it('does not hold for another class, a condition, a level, or a shape it does not read', () => {
    for (const predicate of [
      ['class:another-class'],
      ['self:condition:cursebound'],
      [{ gte: ['self:level', 13] }],
      [{ not: 'deity' }],
      'class:invented-class',
    ]) {
      expect(holdsForOwnClass(predicate, own)).toBe(false);
    }
  });
});

describe('readClassFeatureRules', () => {
  const own = ['invented-class'];

  it('takes skill training out of the rules, by skill slug and rank', () => {
    const read = readClassFeatureRules(
      [skill('thievery', 1), skill('stealth', 2, ['class:invented-class'])],
      own,
    );
    expect(read.skillRankUps).toEqual({ thievery: 'trained', stealth: 'expert' });
    expect(read.rules).toEqual([]);
  });

  it('leaves alone a skill path that is chosen, a lowering, or a predicate it cannot read', () => {
    const chosen = {
      ...skill('x', 1),
      path: 'system.skills.{item|flags.system.rulesSelections.skill}.rank',
    };
    const rules = [chosen, skill('arcana', 0), skill('nature', 1, ['self:level:5'])];
    const read = readClassFeatureRules(rules, own);
    expect(read.skillRankUps).toEqual({});
    expect(read.rules).toEqual(rules);
  });

  it('drops a grant’s predicate when it holds for the feature’s own class, and keeps the rest', () => {
    const read = readClassFeatureRules(
      [
        grant([
          { or: ['class:invented-class', 'feat:invented-explorer:invented-order'] },
        ]),
        grant(['self:condition:cursebound']),
        grant(),
      ],
      own,
    );
    expect(read.rules).toEqual([grant(), grant(['self:condition:cursebound']), grant()]);
  });

  it('passes through rules that are not an array', () => {
    expect(readClassFeatureRules(undefined, own)).toEqual({
      rules: undefined,
      skillRankUps: {},
    });
  });
});
