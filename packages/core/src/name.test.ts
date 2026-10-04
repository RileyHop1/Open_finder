import { describe, expect, it } from 'vitest';

import { sameName } from './name.js';

describe('sameName', () => {
  it('matches identical names', () => {
    expect(sameName('Valeros', 'Valeros')).toBe(true);
  });

  it('ignores case', () => {
    expect(sameName('Valeros', 'valeros')).toBe(true);
    expect(sameName('VALEROS', 'valeros')).toBe(true);
  });

  it('ignores surrounding whitespace', () => {
    expect(sameName(' Valeros ', 'Valeros')).toBe(true);
  });

  it('treats different names as different', () => {
    expect(sameName('Valeros', 'Ezren')).toBe(false);
  });

  it('does not collapse internal whitespace', () => {
    expect(sameName('Val eros', 'Valeros')).toBe(false);
  });
});
