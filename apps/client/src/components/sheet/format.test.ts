import { describe, expect, it } from 'vitest';

import { formatItemBulk, formatPrice, formatTotalBulk } from './format.js';

describe('formatPrice', () => {
  it('splits copper into denominations, largest first, dropping empty ones', () => {
    expect(formatPrice(1235)).toBe('1 pp, 2 gp, 3 sp, 5 cp');
    expect(formatPrice(350)).toBe('3 gp, 5 sp');
  });

  it('shows 0 cp rather than nothing for a zero price', () => {
    expect(formatPrice(0)).toBe('0 cp');
  });
});

describe('formatItemBulk', () => {
  it('reads 0 as negligible and 0.1 as light, PF2e-style', () => {
    expect(formatItemBulk(0)).toBe('—');
    expect(formatItemBulk(0.1)).toBe('L');
  });

  it('shows a whole Bulk value as the plain number', () => {
    expect(formatItemBulk(2)).toBe('2');
  });
});

describe('formatTotalBulk', () => {
  it('rounds a running total to one decimal place, with no shorthand', () => {
    expect(formatTotalBulk(0)).toBe('0');
    expect(formatTotalBulk(0.1)).toBe('0.1');
    expect(formatTotalBulk(3.449)).toBe('3.4');
  });
});
