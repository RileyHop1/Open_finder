/**
 * Groups a character's non-gear items for the Feats and Spells tabs. The
 * inventory holds weapons, armor and gear; everything else a character
 * "has" (feats, class features, actions, spells) is listed here, grouped in
 * the order a player looks for it. Pure and display-only: it never decides
 * whether a feat is allowed, only where it is shown.
 */

import type { CharacterItem } from '@hearthtable/pf2e';

/** One headed list on a tab. */
export interface ItemGroup {
  heading: string;
  items: CharacterItem[];
}

/** The item kinds the Inventory tab lists. */
export const GEAR_KINDS: readonly string[] = ['weapon', 'armor', 'gear'];
/** The item kinds the Feats & features tab lists. */
export const FEAT_KINDS: readonly string[] = ['feat', 'classFeature', 'action'];

const FEAT_ORDER = ['ancestry', 'class', 'skill', 'general', 'archetype'] as const;

const FEAT_HEADINGS: Readonly<Record<string, string>> = {
  ancestry: 'Ancestry feats',
  class: 'Class feats',
  skill: 'Skill feats',
  general: 'General feats',
  archetype: 'Archetype feats',
};

/** `0` for an entry kind with no level of its own (an action). */
function levelOf(item: CharacterItem): number {
  const entry = item.entry;
  return entry.kind === 'feat' || entry.kind === 'classFeature' ? entry.level : 0;
}

function byLevelThenName(a: CharacterItem, b: CharacterItem): number {
  return levelOf(a) - levelOf(b) || a.entry.name.localeCompare(b.entry.name);
}

function group(heading: string, items: CharacterItem[]): ItemGroup[] {
  return items.length === 0 ? [] : [{ heading, items: [...items].sort(byLevelThenName) }];
}

/** Class features, then each feat category, then actions; empty groups are left out. */
export function featGroups(items: readonly CharacterItem[]): ItemGroup[] {
  const feats = items.filter((i) => i.entry.kind === 'feat');
  return [
    ...group(
      'Class features',
      items.filter((i) => i.entry.kind === 'classFeature'),
    ),
    ...FEAT_ORDER.flatMap((category) =>
      group(
        FEAT_HEADINGS[category] ?? category,
        feats.filter((i) => i.entry.kind === 'feat' && i.entry.category === category),
      ),
    ),
    ...group(
      'Actions',
      items.filter((i) => i.entry.kind === 'action'),
    ),
  ];
}

/** Spells by rank, lowest first. */
export function spellGroups(items: readonly CharacterItem[]): ItemGroup[] {
  const spells = items.filter((i) => i.entry.kind === 'spell');
  const ranks = [
    ...new Set(spells.map((i) => (i.entry.kind === 'spell' ? i.entry.rank : 0))),
  ].sort((a, b) => a - b);
  return ranks.map((rank) => ({
    heading: `Rank ${rank}`,
    items: spells
      .filter((i) => i.entry.kind === 'spell' && i.entry.rank === rank)
      .sort((a, b) => a.entry.name.localeCompare(b.entry.name)),
  }));
}

/** The `RulesTerm` kind for an item's name, where one exists (class features have no tooltip kind). */
export function termKindOf(kind: string): 'feat' | 'spell' | 'action' | undefined {
  return kind === 'feat' || kind === 'spell' || kind === 'action' ? kind : undefined;
}
