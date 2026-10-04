/**
 * Whether two names are the same for uniqueness purposes: trimmed, then
 * compared case-insensitively. "Valeros" and " valeros " collide; a GM
 * typing the same seat, character, or campaign name twice should be told so
 * in plain words, not left to find two "Valeros" rows later.
 */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
