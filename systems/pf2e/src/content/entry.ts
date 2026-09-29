/**
 * The union of every PF2e content kind, discriminated on `kind` -- the type
 * the importer validates each converted entry against before writing it
 * (ADR 0012), and the type anything reading a pack back gets.
 *
 * `z.discriminatedUnion` accepts `conditionEntrySchema` here even though
 * it's a refined schema (`.extend(...).refine(...)`), not a plain
 * `z.object` like the other twelve -- verified directly against this
 * project's Zod version rather than assumed, since `discriminatedUnion`'s
 * behavior with a wrapped member is exactly the kind of thing worth
 * checking instead of guessing.
 */

import { z } from 'zod';

import { actionEntrySchema } from './action.js';
import { ancestryEntrySchema } from './ancestry.js';
import { armorEntrySchema } from './armor.js';
import { backgroundEntrySchema } from './background.js';
import { classEntrySchema, classFeatureEntrySchema } from './class.js';
import { conditionEntrySchema } from './condition.js';
import { creatureEntrySchema } from './creature.js';
import { featEntrySchema } from './feat.js';
import { gearEntrySchema } from './gear.js';
import { heritageEntrySchema } from './heritage.js';
import { spellEntrySchema } from './spell.js';
import { weaponEntrySchema } from './weapon.js';

export const pf2eEntrySchema = z.discriminatedUnion('kind', [
  actionEntrySchema,
  featEntrySchema,
  weaponEntrySchema,
  armorEntrySchema,
  gearEntrySchema,
  spellEntrySchema,
  ancestryEntrySchema,
  heritageEntrySchema,
  backgroundEntrySchema,
  classEntrySchema,
  classFeatureEntrySchema,
  creatureEntrySchema,
  conditionEntrySchema,
]);

export type Pf2eEntry = z.infer<typeof pf2eEntrySchema>;

/**
 * Every `kind` value `pf2eEntrySchema` accepts. Listed explicitly rather
 * than introspected from the schema -- `conditionEntrySchema` is a refined
 * schema (`ZodEffects`), not a plain `ZodObject` like the other twelve, and
 * it has no public `.shape` to read a literal back out of. A test
 * (`entry.test.ts`) keeps this list honest against the union instead.
 */
export const PF2E_ENTRY_KINDS = [
  'action',
  'feat',
  'weapon',
  'armor',
  'gear',
  'spell',
  'ancestry',
  'heritage',
  'background',
  'class',
  'classFeature',
  'creature',
  'condition',
] as const;

export type Pf2eEntryKind = (typeof PF2E_ENTRY_KINDS)[number];
