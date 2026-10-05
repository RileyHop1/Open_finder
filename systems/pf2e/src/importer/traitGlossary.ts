/**
 * The trait glossary (ADR 0020 decision 5): a short glossary entry for
 * every trait slug an imported entry actually carries, built from
 * upstream's `static/lang/en.json` rather than any `packs/` compendium --
 * traits have no publication to filter by (ADR 0003's filter works on
 * entries), so scoping the output to "used by something already imported"
 * is this project's own licensing mitigation, not upstream's. See the ADR
 * for why that's considered acceptable, and its fallback if it isn't.
 *
 * Upstream's lang keys are `PF2E.TraitDescription<PascalCase>`, derived
 * from a trait's display name, not its slug. A weapon-trait slug often
 * carries a parametrized suffix the *description* doesn't vary by -- a die
 * size (`two-hand-d8`, `deadly-d10`) or a damage-type letter
 * (`versatile-p`) -- and upstream's key drops it. `traitLangKey` reverses
 * that: strip a trailing die-size, bare-number, or single-letter segment,
 * then PascalCase what's left. It's a heuristic, not a lookup table, and it
 * does not resolve every real trait (`splash-10`'s own key,
 * `TraitDescriptionSplash10`, keeps its number, so stripping it misses) --
 * a miss here just means no glossary entry for that trait, counted by the
 * caller for the coverage report, never a failure.
 */

import type { RichText, TraitEntry } from '@hearthtable/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { htmlToRichText } from './htmlToRichText.js';

const DROPPABLE_SUFFIX = /^(d\d+|\d+|[a-z])$/;

/** `agile` -> `PF2E.TraitDescriptionAgile`; `two-hand-d8` -> `PF2E.TraitDescriptionTwoHand`. */
export function traitLangKey(slug: string): string {
  const segments = slug.split('-').filter((segment) => segment.length > 0);
  while (segments.length > 1) {
    const last = segments[segments.length - 1] ?? '';
    if (!DROPPABLE_SUFFIX.test(last)) {
      break;
    }
    segments.pop();
  }
  const pascal = segments
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
  return `PF2E.TraitDescription${pascal}`;
}

/** `two-hand` -> `Two Hand` -- a display name, since upstream's lang file carries no trait name separate from its description. */
function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

/**
 * Flattens a nested JSON object (upstream's `en.json`) into dotted keys,
 * e.g. `{ PF2E: { TraitDescriptionAgile: '...' } }` ->
 * `Map { 'PF2E.TraitDescriptionAgile' -> '...' }`. Every key in the file is
 * flattened, not only `TraitDescription*` ones -- cheap for a one-time
 * import-time pass, and it keeps this function ignorant of which prefix
 * `traitLangKey` happens to use today.
 */
export function flattenLangStrings(json: unknown): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  flattenInto(json, '', out);
  return out;
}

function flattenInto(value: unknown, prefix: string, out: Map<string, string>): void {
  if (typeof value === 'string') {
    out.set(prefix, value);
    return;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    flattenInto(child, prefix === '' ? key : `${prefix}.${key}`, out);
  }
}

export interface TraitGlossaryResult {
  readonly entries: readonly TraitEntry[];
  /** Trait slugs used by at least one imported entry with no resolvable lang key -- a bare-name tooltip fallback, not a failure (ADR 0020 decision 6). */
  readonly misses: readonly string[];
}

/**
 * One entry per slug in `traitSlugs` that resolves to a key present in
 * `langStrings`, plus every slug that didn't. Slugs are deduplicated and
 * sorted, so the result -- and the file `writeTraitGlossary` writes from it
 * -- is deterministic across runs given the same inputs.
 */
export function buildTraitGlossary(
  traitSlugs: readonly string[],
  langStrings: ReadonlyMap<string, string>,
): TraitGlossaryResult {
  const uniqueSlugs = [...new Set(traitSlugs)].sort();
  const entries: TraitEntry[] = [];
  const misses: string[] = [];

  for (const slug of uniqueSlugs) {
    const description = langStrings.get(traitLangKey(slug));
    if (description === undefined) {
      misses.push(slug);
      continue;
    }
    const text: RichText = htmlToRichText(description);
    entries.push({ slug, name: titleCaseSlug(slug), text });
  }

  return { entries, misses: misses.sort() };
}

/** Writes `traits.json`: the glossary alone, as a plain array -- no per-entry files and no manifest, unlike `writePacks.ts`'s packs, since this is one short, flat list rather than a pack a world imports from. */
export function writeTraitGlossary(
  entries: readonly TraitEntry[],
  outputDir: string,
): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'traits.json'), `${JSON.stringify(entries, null, 2)}\n`);
}
