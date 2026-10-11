import type { BackgroundEntry, ClassEntry } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import {
  intelligenceOf,
  isNamedSkill,
  loreSlug,
  skillNotes,
  skillSlots,
} from './skillPlan.js';

// Everything below is invented (ADR 0013).
const cls = {
  name: 'Invented Vanguard',
  keyAttributeOptions: ['str'],
  skills: { trainedSkillCount: 3, automaticallyTrained: ['athletics'] },
} as unknown as ClassEntry;
const background = {
  name: 'Invented Trade',
  boostOptions: ['str'],
  trainedSkills: ['guild-lore'],
} as unknown as BackgroundEntry;

describe('loreSlug', () => {
  it('names a Lore the way the build stores it', () => {
    expect(loreSlug('Academia Lore')).toBe('academia-lore');
    expect(loreSlug('  farming ')).toBe('farming-lore');
    expect(loreSlug('Lore')).toBe('');
    expect(loreSlug('!!')).toBe('');
  });
});

describe('skillSlots', () => {
  it('trains the class’s and background’s skills outright and allows count plus Intelligence', () => {
    const slots = skillSlots(cls, background, 2);
    expect(slots.automatic).toEqual([
      { skill: 'athletics', from: 'class' },
      { skill: 'guild-lore', from: 'background' },
    ]);
    expect(slots.allowed).toBe(5);
  });

  it('never lets a negative Intelligence take picks away', () => {
    expect(skillSlots(cls, background, -1).allowed).toBe(3);
  });

  it('is empty without entries', () => {
    expect(skillSlots(undefined, undefined, 0)).toEqual({ automatic: [], allowed: 0 });
  });
});

describe('intelligenceOf', () => {
  it('reads Intelligence from the boosts picked so far', () => {
    expect(intelligenceOf({}, { free: ['int', 'str'] }, undefined)).toBe(1);
    expect(intelligenceOf({}, {}, undefined)).toBe(0);
  });
});

describe('skillNotes and isNamedSkill', () => {
  const slots = skillSlots(cls, background, 0);

  it('is quiet when the picks are as the rules ask', () => {
    expect(skillNotes(['acrobatics', 'arcana', 'stealth'], slots)).toEqual([]);
  });

  it('says what is off, and still counts it', () => {
    expect(skillNotes(['acrobatics', 'arcana', 'stealth', 'nature'], slots)).toEqual([
      '4 chosen but only 3 allowed. All are applied.',
    ]);
    expect(skillNotes(['athletics'], slots)).toEqual([
      'Athletics is already trained by your class, so this pick adds nothing.',
    ]);
  });

  it('tells a named skill from a Lore', () => {
    expect(isNamedSkill('athletics')).toBe(true);
    expect(isNamedSkill('guild-lore')).toBe(false);
  });
});
