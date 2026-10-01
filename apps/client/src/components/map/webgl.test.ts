import { describe, expect, it } from 'vitest';

import { supportsWebGL2 } from './webgl.js';

describe('supportsWebGL2', () => {
  it('is true when the browser gives a webgl2 context', () => {
    const asked: string[] = [];
    expect(
      supportsWebGL2(() => ({
        getContext: ((kind: string) => {
          asked.push(kind);
          return {};
        }) as HTMLCanvasElement['getContext'],
      })),
    ).toBe(true);
    expect(asked).toEqual(['webgl2']);
  });

  it('is false when the browser declines, or throws', () => {
    expect(supportsWebGL2(() => ({ getContext: () => null }))).toBe(false);
    expect(
      supportsWebGL2(() => ({
        getContext: () => {
          throw new Error('blocked');
        },
      })),
    ).toBe(false);
  });
});
