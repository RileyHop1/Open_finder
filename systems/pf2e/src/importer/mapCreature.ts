/**
 * Maps an upstream `npc`-type Actor entry onto a draft `CreatureEntry`.
 * Every field path below is this project's best-informed guess at
 * Foundry's PF2e NPC actor shape, not yet verified against a real fetch --
 * **(confirm)** during the real-data importer run. A wrong path fails the
 * whole entry closed rather than importing a stat block with garbage
 * numbers, which matters more here than anywhere else in the importer: a
 * GM trusts a monster's AC and attack lines at the table without checking
 * them against a book.
 *
 * **Strikes come from embedded items, not `system`.** Unlike every other
 * content kind, a creature's attacks live as sibling `melee`-type Items on
 * the Actor document (`entry.items`), which is why `reader.ts` carries that
 * array at all. Any embedded `melee` item this mapper can't fully parse
 * fails the whole creature closed -- there is no per-strike "downgrade"
 * channel the way rule elements have one, so a half-wrong attack line is
 * worse than no import at all.
 */

import type { Provenance } from '@hearthtable/core';

import {
  ATTRIBUTES,
  damageTypeSchema,
  traitSlugSchema,
  type DamageType,
} from '../content/common.js';
import type {
  CreatureAttributes,
  CreatureDefenseAdjustment,
  CreatureEntry,
  CreatureSavingThrows,
  CreatureSpeeds,
  CreatureStrike,
  CreatureStrikeDamage,
} from '../content/creature.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { mapEntryRuleElements } from './mapRuleElements.js';
import type { UpstreamEntry } from './reader.js';
import {
  asRecord,
  filterValidTraitSlugs,
  mapSizeCode,
  nestedNumberField,
  nestedStringArrayField,
  nestedStringField,
  parseDieSize,
  slugify,
} from './upstreamHelpers.js';

const OTHER_SPEED_TYPES = ['fly', 'swim', 'climb', 'burrow'] as const;
type OtherSpeedType = (typeof OTHER_SPEED_TYPES)[number];

function isOtherSpeedType(value: unknown): value is OtherSpeedType {
  return (OTHER_SPEED_TYPES as readonly unknown[]).includes(value);
}

/** `attributes.speed`: a required land speed plus any number of named other-movement speeds. */
function mapSpeeds(speedRaw: unknown): CreatureSpeeds | undefined {
  const record = asRecord(speedRaw);
  const land = record?.value;
  if (typeof land !== 'number' || !Number.isInteger(land) || land < 0) {
    return undefined;
  }

  const speeds: { land: number } & Partial<Record<OtherSpeedType, number>> = { land };
  const otherSpeeds = record?.otherSpeeds;
  if (Array.isArray(otherSpeeds)) {
    for (const other of otherSpeeds) {
      const otherRecord = asRecord(other);
      const type = otherRecord?.type;
      const value = otherRecord?.value;
      if (
        isOtherSpeedType(type) &&
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value > 0
      ) {
        speeds[type] = value;
      }
    }
  }
  return speeds;
}

/** `abilities.{str,dex,...}.mod`: a creature's ability modifiers are already the finished number, not a score. */
function mapAttributes(
  record: Record<string, unknown> | undefined,
): CreatureAttributes | undefined {
  if (record === undefined) {
    return undefined;
  }
  const scores: Partial<Record<(typeof ATTRIBUTES)[number], number>> = {};
  for (const key of ATTRIBUTES) {
    const mod = asRecord(record[key])?.mod;
    if (typeof mod !== 'number' || !Number.isInteger(mod)) {
      return undefined;
    }
    scores[key] = mod;
  }
  return scores as CreatureAttributes;
}

/** `saves.{fortitude,reflex,will}.value`. */
function mapSavingThrows(
  record: Record<string, unknown> | undefined,
): CreatureSavingThrows | undefined {
  const fortitude = asRecord(record?.fortitude)?.value;
  const reflex = asRecord(record?.reflex)?.value;
  const will = asRecord(record?.will)?.value;
  if (
    typeof fortitude !== 'number' ||
    typeof reflex !== 'number' ||
    typeof will !== 'number'
  ) {
    return undefined;
  }
  return { fortitude, reflex, will };
}

/**
 * Resistances and weaknesses are supplementary tags, like traits -- a
 * malformed entry is dropped individually rather than failing the whole
 * creature, the same lenience `filterValidTraitSlugs` gives traits.
 */
function mapDefenseAdjustments(raw: unknown): readonly CreatureDefenseAdjustment[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const adjustments: CreatureDefenseAdjustment[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    const damageType = record?.type;
    const value = record?.value;
    if (
      typeof damageType === 'string' &&
      damageType.length > 0 &&
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value > 0
    ) {
      adjustments.push({ damageType, value });
    }
  }
  return adjustments;
}

/** Same lenience as `mapDefenseAdjustments`: an open record, so one bad entry doesn't sink the whole stat block. */
function mapSkills(raw: unknown): Record<string, number> {
  const record = asRecord(raw);
  if (record === undefined) {
    return {};
  }
  const skills: Record<string, number> = {};
  for (const [slug, value] of Object.entries(record)) {
    const base = asRecord(value)?.base;
    if (typeof base === 'number' && Number.isInteger(base)) {
      skills[slug] = base;
    }
  }
  return skills;
}

function mapStrikeDamage(raw: unknown): CreatureStrikeDamage | undefined {
  const record = asRecord(raw);
  const diceNumber = record?.dice;
  const dieFaces = parseDieSize(record?.die);
  const damageType = record?.damageType;
  const bonusRaw = record?.bonus;
  if (
    typeof diceNumber !== 'number' ||
    !Number.isInteger(diceNumber) ||
    diceNumber <= 0
  ) {
    return undefined;
  }
  if (dieFaces === undefined) {
    return undefined;
  }
  if (typeof damageType !== 'string' || !damageTypeSchema.safeParse(damageType).success) {
    return undefined;
  }
  const bonus = typeof bonusRaw === 'number' && Number.isInteger(bonusRaw) ? bonusRaw : 0;
  return { diceNumber, dieFaces, bonus, damageType: damageType as DamageType };
}

/** One embedded `melee`-type item. `undefined` means "couldn't parse," which fails the whole creature closed. */
function mapStrike(item: unknown): CreatureStrike | undefined {
  const record = asRecord(item);
  const name = record?.name;
  if (typeof name !== 'string' || name.length === 0) {
    return undefined;
  }
  const system = asRecord(record?.system);
  if (system === undefined) {
    return undefined;
  }
  const attackBonus = asRecord(system.bonus)?.value;
  if (typeof attackBonus !== 'number' || !Number.isInteger(attackBonus)) {
    return undefined;
  }

  const damageRolls = asRecord(system.damageRolls) ?? {};
  const damage: CreatureStrikeDamage[] = [];
  for (const rollRaw of Object.values(damageRolls)) {
    const mapped = mapStrikeDamage(rollRaw);
    if (mapped === undefined) {
      return undefined;
    }
    damage.push(mapped);
  }
  if (damage.length === 0) {
    return undefined;
  }

  const traits = filterValidTraitSlugs(
    nestedStringArrayField(system, 'traits', 'value'),
    (value) => traitSlugSchema.safeParse(value).success,
  );
  return { name, attackBonus, traits, damage };
}

/** `undefined` means an embedded `melee` item couldn't be parsed -- fails the whole creature closed. */
function mapStrikes(items: readonly unknown[]): readonly CreatureStrike[] | undefined {
  const strikes: CreatureStrike[] = [];
  for (const item of items) {
    if (asRecord(item)?.type !== 'melee') {
      continue;
    }
    const strike = mapStrike(item);
    if (strike === undefined) {
      return undefined;
    }
    strikes.push(strike);
  }
  return strikes;
}

export function mapCreature(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<CreatureEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const details = asRecord(system.details);
  const level =
    details === undefined ? undefined : nestedNumberField(details, 'level', 'value');
  if (level === undefined || level < -1 || level > 30) {
    return { ok: false, reason: 'missing-or-invalid-level' };
  }

  const traitsRecord = asRecord(system.traits);
  const sizeCode =
    traitsRecord === undefined
      ? undefined
      : nestedStringField(traitsRecord, 'size', 'value');
  const size = mapSizeCode(sizeCode);
  if (size === undefined) {
    return { ok: false, reason: 'unrecognized-size' };
  }

  const perception = asRecord(system.perception)?.mod;
  if (typeof perception !== 'number' || !Number.isInteger(perception)) {
    return { ok: false, reason: 'missing-or-invalid-perception' };
  }

  const attributesRecord = asRecord(system.attributes);
  const ac = asRecord(attributesRecord?.ac)?.value;
  if (typeof ac !== 'number' || !Number.isInteger(ac) || ac <= 0) {
    return { ok: false, reason: 'missing-or-invalid-ac' };
  }

  const savingThrows = mapSavingThrows(asRecord(system.saves));
  if (savingThrows === undefined) {
    return { ok: false, reason: 'missing-or-invalid-saving-throws' };
  }

  const hp = asRecord(attributesRecord?.hp)?.value;
  if (typeof hp !== 'number' || !Number.isInteger(hp) || hp <= 0) {
    return { ok: false, reason: 'missing-or-invalid-hp' };
  }

  const speeds = mapSpeeds(attributesRecord?.speed);
  if (speeds === undefined) {
    return { ok: false, reason: 'missing-or-invalid-speed' };
  }

  const attributes = mapAttributes(asRecord(system.abilities));
  if (attributes === undefined) {
    return { ok: false, reason: 'missing-or-invalid-attributes' };
  }

  const strikes = mapStrikes(entry.items ?? []);
  if (strikes === undefined) {
    return { ok: false, reason: 'unparseable-strike' };
  }

  const slug =
    typeof system.slug === 'string' && system.slug.length > 0
      ? system.slug
      : slugify(entry.name);
  const traits = filterValidTraitSlugs(
    nestedStringArrayField(system, 'traits', 'value'),
    (value) => traitSlugSchema.safeParse(value).success,
  );
  const description = nestedStringField(system, 'description', 'value') ?? '';
  const languages =
    details === undefined
      ? []
      : (nestedStringArrayField(details, 'languages', 'value') ?? []);
  const resistances = mapDefenseAdjustments(attributesRecord?.resistances);
  const weaknesses = mapDefenseAdjustments(attributesRecord?.weaknesses);
  const skills = mapSkills(system.skills);
  const { elements } = mapEntryRuleElements(system.rules);

  return {
    ok: true,
    entry: {
      id: deterministicId(entry.id),
      schemaVersion: 1,
      createdAt: importedAt,
      updatedAt: importedAt,
      packId: 'creatures',
      slug,
      name: entry.name,
      kind: 'creature',
      provenance,
      traits,
      ruleElements: elements,
      description,
      level,
      size,
      perception,
      ac,
      savingThrows,
      hp,
      resistances,
      weaknesses,
      speeds,
      attributes,
      skills,
      strikes,
      languages,
    },
  };
}
