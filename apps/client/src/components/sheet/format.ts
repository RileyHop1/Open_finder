/** Small display helpers for the character sheet. Pure, so they are tested without mounting anything. */

/** `+3`, `-1`, `+0`: a bonus always shows its sign. */
export function signed(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

/** `academia-lore` -> `Academia Lore`; `skill:athletics` -> `Athletics`. */
export function titleCase(slug: string): string {
  const name = slug.startsWith('skill:') ? slug.slice('skill:'.length) : slug;
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
