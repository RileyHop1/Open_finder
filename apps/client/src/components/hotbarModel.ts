/**
 * Small helpers for the hotbar (ADR 0023): which slot a key opens, how a
 * saved action reads on its slot, and the immutable edits the UI makes. The
 * slots are fixed positions, keys 1 to 9 then 0, so an empty slot keeps its
 * place and a key always means the same slot.
 */

import type { HotbarAction } from '@hearthtable/core';
import { HOTBAR_SLOTS } from '@hearthtable/core';

import type { GenericActionCost } from './actionBarModel.js';

/** The key that opens slot `index` (0-based): `1` to `9`, then `0` for the tenth. */
export function slotKey(index: number): string {
  return index === HOTBAR_SLOTS - 1 ? '0' : String(index + 1);
}

/** The slot a pressed `key` opens, or `undefined` for any other key. */
export function slotForKey(key: string): number | undefined {
  if (key.length !== 1 || key < '0' || key > '9') {
    return undefined;
  }
  return key === '0' ? HOTBAR_SLOTS - 1 : Number(key) - 1;
}

/** A cost as the player reads it: diamonds for actions, ↺ for a reaction, nothing for free. */
export function costGlyph(cost: GenericActionCost): string {
  return cost === 'reaction' ? '↺' : cost === 'free' ? '' : '◆'.repeat(cost);
}

/** `slots` with position `index` replaced by `action` (or emptied with `null`). */
export function withSlot(
  slots: readonly (HotbarAction | null)[],
  index: number,
  action: HotbarAction | null,
): (HotbarAction | null)[] {
  return slots.map((slot, i) => (i === index ? action : slot));
}

/** The default name offered when saving: the action's text, or its dice, cut to the 24-character limit. */
export function defaultSlotName(text: string, dice: string): string {
  const source = text.trim() === '' ? dice.trim() : text.trim();
  return source.slice(0, 24);
}
