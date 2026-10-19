/**
 * Reads a Wizard's arcane school's curriculum from its description. Upstream has no
 * field for it: the school feature's text carries it as a heading and a list, one
 * item per rank, each naming its spells as links:
 *
 * ```html
 * <p><strong>Curriculum</strong></p>
 * <ul><li><strong>cantrips:</strong> @UUID[Compendium.pf2e.spells-srd.Item.Shield], ...</li>
 *     <li><strong>1st:</strong> @UUID[Compendium.pf2e.spells-srd.Item.Breathe Fire], ...</li>
 * ```
 *
 * Checked against the pinned data (2026-10-19): every school in the core books is laid
 * out this way (some wrap an item's text in a `<p>`), and Unified Magical Theory has
 * no such list. The spells are named, not identified, so each is slugified the same way
 * an imported spell's slug is; the import smoke checks that every one names a spell that
 * was imported. Text that is not this shape reads as no curriculum, never a guess.
 */

import { slugify } from './upstreamHelpers.js';

/** The heading, then the list straight after it. */
const SECTION = /<strong>\s*Curriculum\s*<\/strong>\s*(?:<\/p>)?\s*<ul>([\s\S]*?)<\/ul>/i;
const ITEM = /<li>([\s\S]*?)<\/li>/g;
/** An item's label, once its tags are stripped: `cantrips:` or `1st:` to `9th:`. */
const LABEL = /^\s*(?:cantrips|([1-9])(?:st|nd|rd|th))\s*:/i;
const SPELL = /@UUID\[Compendium\.pf2e\.spells-srd\.Item\.([^\]]+)\]/g;

/**
 * The curriculum in `html`, as spell slugs by rank (`"0"` for the cantrips), or
 * `undefined` when the text has none.
 */
export function readCurriculum(html: string): Record<string, string[]> | undefined {
  const section = SECTION.exec(html);
  if (section === null) {
    return undefined;
  }
  const curriculum: Record<string, string[]> = {};
  for (const [, item = ''] of (section[1] ?? '').matchAll(ITEM)) {
    const label = LABEL.exec(item.replace(/<[^>]+>/g, ''));
    if (label === null) {
      continue;
    }
    const spells = [...item.matchAll(SPELL)].map(([, name = '']) => slugify(name));
    if (spells.length > 0) {
      curriculum[label[1] ?? '0'] = spells;
    }
  }
  return Object.keys(curriculum).length === 0 ? undefined : curriculum;
}
