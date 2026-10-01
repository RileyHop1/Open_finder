/**
 * Limits how often `send` runs, without ever losing the last word: the first
 * call goes out at once, calls inside the interval are held, and when it ends
 * the **latest** held call goes out. That is what a live drag preview wants
 * (ADR 0005, decision 6): a steady stream while the pointer moves, and the final
 * position always sent, so the others never see a token stop short of where it
 * was let go.
 */
export interface Throttled<Args extends unknown[]> {
  (...args: Args): void;
  /** Drops a held call, for when the thing it described is over. */
  cancel(): void;
}

export function createThrottle<Args extends unknown[]>(
  send: (...args: Args) => void,
  intervalMs: number,
): Throttled<Args> {
  let lastSent = Number.NEGATIVE_INFINITY;
  let held: Args | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    timer = undefined;
    if (held !== undefined) {
      const args = held;
      held = undefined;
      lastSent = Date.now();
      send(...args);
    }
  }

  const throttled = ((...args: Args) => {
    const wait = lastSent + intervalMs - Date.now();
    if (wait <= 0 && timer === undefined) {
      lastSent = Date.now();
      send(...args);
      return;
    }
    held = args;
    timer ??= setTimeout(flush, Math.max(wait, 0));
  }) as Throttled<Args>;

  throttled.cancel = () => {
    held = undefined;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  return throttled;
}
