import { describe, expect, it } from 'vitest';

import {
  ACTION_COSTS,
  ATTRIBUTES,
  DAMAGE_TYPES,
  PROFICIENCY_BONUS,
  PROFICIENCY_RANKS,
  RARITIES,
  SIZES,
  actionCostSchema,
  attributeSchema,
  damageTypeSchema,
  proficiencyRankSchema,
  raritySchema,
  sizeSchema,
  traitSlugSchema,
} from './common.js';

describe('raritySchema', () => {
  it.each(RARITIES)('accepts %s', (rarity) => {
    expect(raritySchema.safeParse(rarity).success).toBe(true);
  });

  it('rejects a rarity outside the four tiers', () => {
    expect(raritySchema.safeParse('legendary').success).toBe(false);
  });
});

describe('proficiencyRankSchema and PROFICIENCY_BONUS', () => {
  it.each(PROFICIENCY_RANKS)('accepts %s', (rank) => {
    expect(proficiencyRankSchema.safeParse(rank).success).toBe(true);
  });

  it('has a bonus entry for every rank, ascending from untrained to legendary', () => {
    expect(PROFICIENCY_BONUS.untrained).toBe(0);
    expect(PROFICIENCY_BONUS.trained).toBe(2);
    expect(PROFICIENCY_BONUS.expert).toBe(4);
    expect(PROFICIENCY_BONUS.master).toBe(6);
    expect(PROFICIENCY_BONUS.legendary).toBe(8);
  });

  it('every PROFICIENCY_RANKS entry has a PROFICIENCY_BONUS entry, and vice versa', () => {
    expect(Object.keys(PROFICIENCY_BONUS).sort()).toEqual([...PROFICIENCY_RANKS].sort());
  });
});

describe('attributeSchema', () => {
  it.each(ATTRIBUTES)('accepts %s', (attribute) => {
    expect(attributeSchema.safeParse(attribute).success).toBe(true);
  });

  it('rejects a full attribute name instead of its slug', () => {
    expect(attributeSchema.safeParse('strength').success).toBe(false);
  });
});

describe('actionCostSchema', () => {
  it.each(ACTION_COSTS)('accepts %s', (cost) => {
    expect(actionCostSchema.safeParse(cost).success).toBe(true);
  });

  it('rejects a numeric action count -- costs are named slugs, not numbers', () => {
    expect(actionCostSchema.safeParse(1).success).toBe(false);
  });
});

describe('traitSlugSchema', () => {
  it.each(['agile', 'two-hand-d8', 'deadly-d10', 'humanoid'])(
    'accepts the real trait slug %s',
    (slug) => {
      expect(traitSlugSchema.safeParse(slug).success).toBe(true);
    },
  );

  it('rejects an empty string', () => {
    expect(traitSlugSchema.safeParse('').success).toBe(false);
  });

  it('rejects uppercase characters', () => {
    expect(traitSlugSchema.safeParse('Agile').success).toBe(false);
  });

  it('rejects spaces or underscores', () => {
    expect(traitSlugSchema.safeParse('two hand').success).toBe(false);
    expect(traitSlugSchema.safeParse('two_hand').success).toBe(false);
  });

  it('rejects a leading or trailing hyphen', () => {
    expect(traitSlugSchema.safeParse('-agile').success).toBe(false);
    expect(traitSlugSchema.safeParse('agile-').success).toBe(false);
  });
});

describe('damageTypeSchema', () => {
  it.each(DAMAGE_TYPES)('accepts %s', (damageType) => {
    expect(damageTypeSchema.safeParse(damageType).success).toBe(true);
  });

  it('rejects a legacy alignment-damage spelling not used by the Remaster', () => {
    expect(damageTypeSchema.safeParse('unholy').success).toBe(false);
  });

  it('rejects the pre-Remaster positive/negative naming', () => {
    expect(damageTypeSchema.safeParse('positive').success).toBe(false);
    expect(damageTypeSchema.safeParse('negative').success).toBe(false);
  });
});

describe('sizeSchema', () => {
  it.each(SIZES)('accepts %s', (size) => {
    expect(sizeSchema.safeParse(size).success).toBe(true);
  });

  it('rejects a size outside the six categories', () => {
    expect(sizeSchema.safeParse('colossal').success).toBe(false);
  });
});
