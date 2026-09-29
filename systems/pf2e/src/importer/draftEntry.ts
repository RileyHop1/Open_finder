/**
 * What a per-kind content mapper produces, and the shared result shape
 * every one of them returns.
 */

import type { ActionEntry } from '../content/action.js';
import type { AncestryEntry } from '../content/ancestry.js';
import type { ArmorEntry } from '../content/armor.js';
import type { BackgroundEntry } from '../content/background.js';
import type { ClassEntry, ClassFeatureEntry } from '../content/class.js';
import type { ConditionEntry } from '../content/condition.js';
import type { CreatureEntry } from '../content/creature.js';
import type { FeatEntry } from '../content/feat.js';
import type { GearEntry } from '../content/gear.js';
import type { HeritageEntry } from '../content/heritage.js';
import type { SpellEntry } from '../content/spell.js';
import type { WeaponEntry } from '../content/weapon.js';
import type { MappedElement } from './elementMapper.js';

/**
 * Identical to a real content entry except `ruleElements`, which may still
 * contain an `UnresolvedGrantItem` -- resolving those into
 * `@hearthtable/core`'s real `GrantItemElement` needs the full imported
 * entry set (the dependency-resolution pass, `resolveDependencies.ts`),
 * which a single-entry mapper doesn't have. The writer (a later PR)
 * validates the fully-resolved entry against its real Zod schema; nothing
 * before that point can, because a draft carrying an unresolved grant is
 * not yet valid against it.
 */
export type DraftEntry<T extends { ruleElements: unknown }> = Omit<T, 'ruleElements'> & {
  readonly ruleElements: readonly MappedElement[];
};

/**
 * The union of every content kind's draft shape -- what `resolveDependencies`
 * consumes. Listed explicitly, one member per content kind, rather than
 * derived as `DraftEntry<Pf2eEntry>`: `Omit` does not distribute over a
 * union the way this needs, so `Omit<Pf2eEntry, 'ruleElements'>` would
 * collapse the discriminated union into something far looser than intended.
 * Kept in sync with `entry.ts`'s `PF2E_ENTRY_KINDS` by convention; nothing
 * enforces that automatically, the same gap `entry.ts` itself notes about
 * `conditionEntrySchema` not exposing an introspectable member list.
 */
export type DraftPf2eEntry =
  | DraftEntry<ActionEntry>
  | DraftEntry<FeatEntry>
  | DraftEntry<WeaponEntry>
  | DraftEntry<ArmorEntry>
  | DraftEntry<GearEntry>
  | DraftEntry<SpellEntry>
  | DraftEntry<AncestryEntry>
  | DraftEntry<HeritageEntry>
  | DraftEntry<BackgroundEntry>
  | DraftEntry<ClassEntry>
  | DraftEntry<ClassFeatureEntry>
  | DraftEntry<CreatureEntry>
  | DraftEntry<ConditionEntry>;

export type MapContentResult<T> =
  | { readonly ok: true; readonly entry: T }
  | { readonly ok: false; readonly reason: string };
