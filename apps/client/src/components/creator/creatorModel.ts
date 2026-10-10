/**
 * The character creator's state, kept out of the component so it can be
 * tested without a DOM (milestone 8, `docs/character-build.md`). A draft is
 * the build being assembled plus the name and which step the player is on. It
 * is saved in this browser only, so closing the creator or reloading the page
 * does not lose it, and it is never sent anywhere until the player creates the
 * character.
 *
 * Nothing here enforces a rule (ADR 0023): the preview is whatever
 * `deriveCharacter` proposes, warnings included, for every choice the draft
 * holds.
 */

import type { Actor } from '@hearthtable/core';
import {
  attributeSchema,
  characterBuildSchema,
  characterDataSchema,
  deriveCharacter,
  newCharacterData,
  type CharacterData,
  type DeriveInputs,
  type DeriveWarning,
} from '@hearthtable/pf2e';
import { z } from 'zod';

/** The creator's steps, in order. */
export const CREATOR_STEPS = [
  { id: 'ancestry', label: 'Ancestry' },
  { id: 'background', label: 'Background' },
  { id: 'class', label: 'Class' },
  { id: 'class-choices', label: 'Class choices' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'skills', label: 'Skills' },
  { id: 'feats', label: 'Feats' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'review', label: 'Review' },
] as const;

export type CreatorStepId = (typeof CREATOR_STEPS)[number]['id'];

const stepIds = CREATOR_STEPS.map((s) => s.id) as [CreatorStepId, ...CreatorStepId[]];

export const creatorDraftSchema = z.object({
  name: z.string().max(100).default(''),
  step: z.enum(stepIds).default('ancestry'),
  build: characterBuildSchema.default(characterBuildSchema.parse({})),
  keyAttribute: attributeSchema.optional(),
});

export type CreatorDraft = z.infer<typeof creatorDraftSchema>;

export function emptyDraft(): CreatorDraft {
  return creatorDraftSchema.parse({});
}

/** The step after `step`, or the same one at the end. */
export function nextStep(step: CreatorStepId): CreatorStepId {
  const index = stepIds.indexOf(step);
  return stepIds[Math.min(index + 1, stepIds.length - 1)] ?? step;
}

/** The step before `step`, or the same one at the start. */
export function previousStep(step: CreatorStepId): CreatorStepId {
  const index = stepIds.indexOf(step);
  return stepIds[Math.max(index - 1, 0)] ?? step;
}

/**
 * The classes the creator can build completely today: the seven martial
 * classes, which need feat picks and proficiencies but no spellcasting or
 * resource subsystem. Every other class can still be picked, with a visible
 * warning that its setup arrives later (milestone 8, stages b and c).
 */
export const MARTIAL_CLASS_SLUGS: readonly string[] = [
  'fighter',
  'ranger',
  'rogue',
  'barbarian',
  'investigator',
  'monk',
  'swashbuckler',
];

const STORAGE_KEY = 'hearthtable.creatorDraft';

/** The saved draft, or a fresh one when none is saved, it no longer parses, or storage is unavailable. */
export function loadDraft(): CreatorDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = creatorDraftSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        return parsed.data;
      }
    }
  } catch {
    // Storage blocked or the text was not JSON: start over.
  }
  return emptyDraft();
}

/** Remembers `draft` in this browser; silently does nothing if storage refuses. */
export function saveDraft(draft: CreatorDraft): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // A convenience only.
  }
}

/** Forgets the saved draft. */
export function clearDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}

/** The entries a draft's references resolve to, once the steps that pick them have fetched them. */
export type PreviewEntries = Pick<
  DeriveInputs,
  'ancestry' | 'heritage' | 'background' | 'class' | 'classFeatures'
>;

export interface Preview {
  readonly actor: Actor;
  readonly warnings: readonly DeriveWarning[];
}

/** A fixed id: the preview is never stored, so every draft can share one. */
const PREVIEW_ID = '00000000-0000-4000-8000-000000000001';

/** The character the draft would make at level 1, as an actor the real sheet can show. */
export function previewOf(draft: CreatorDraft, entries: PreviewEntries = {}): Preview {
  const derived = deriveCharacter({
    build: draft.build,
    level: 1,
    keyAttribute: draft.keyAttribute,
    ...entries,
    resolve: () => undefined,
  });
  const base = newCharacterData();
  const system: CharacterData = characterDataSchema.parse({
    ...base,
    level: derived.level,
    attributes: derived.attributes,
    keyAttribute: derived.keyAttribute,
    ranks: derived.ranks,
    ancestryHp: derived.ancestryHp,
    classHp: derived.classHp,
    speed: derived.speed,
    hp: { current: 0 },
    build: draft.build,
  });
  // Starts at full health, like a character the server creates.
  const maxHp =
    derived.ancestryHp + (derived.classHp + derived.attributes.con) * derived.level;
  const now = new Date(0).toISOString();
  return {
    actor: {
      id: PREVIEW_ID,
      worldId: PREVIEW_ID,
      type: 'actor',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: now,
      updatedAt: now,
      kind: 'character',
      name: draft.name.trim() === '' ? 'New character' : draft.name.trim(),
      system: { ...system, hp: { current: Math.max(0, maxHp), temp: 0 } },
    },
    warnings: derived.warnings,
  };
}
