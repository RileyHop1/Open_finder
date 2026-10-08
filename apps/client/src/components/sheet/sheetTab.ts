/**
 * Which sheet tab a viewer last had open, remembered in this browser only
 * (a per-viewer convenience: it never reaches the server or other viewers).
 * Storage can be missing or throw (private windows, blocked site data), so
 * every access falls back to the Overview tab instead of failing.
 */

const KEY = 'hearthtable.sheetTab';

/** The remembered tab id, or `overview` when nothing is stored or storage is unavailable. */
export function rememberedTab(): string {
  try {
    return localStorage.getItem(KEY) ?? 'overview';
  } catch {
    return 'overview';
  }
}

/** Remembers `id` as the last open tab; silently does nothing if storage refuses. */
export function rememberTab(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // A convenience only; losing it just reopens Overview next time.
  }
}
