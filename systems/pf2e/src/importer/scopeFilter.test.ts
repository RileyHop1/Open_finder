import { describe, expect, it } from 'vitest';

import { PUBLICATION_ALLOW_LIST, applyScopeFilter } from './scopeFilter.js';

function makeProvenance(publication: string) {
  return { publication, license: 'ORC' as const, remaster: true as const };
}

describe('applyScopeFilter', () => {
  it.each(PUBLICATION_ALLOW_LIST)('accepts %s', (publication) => {
    expect(applyScopeFilter(makeProvenance(publication)).ok).toBe(true);
  });

  it('rejects a publication not on the allow-list, even if genuinely ORC and Remaster', () => {
    // Rage of Elements is real ORC/Remaster content (ADR 0003 would let us
    // ship it) but is explicitly out of scope (ADR 0006).
    const result = applyScopeFilter(makeProvenance('Pathfinder Rage of Elements'));
    expect(result).toEqual({ ok: false, reason: 'publication-not-in-scope' });
  });

  it('is an exact-match allow-list, not a prefix or substring match', () => {
    // A near-miss must fail closed, not fuzzy-match into an allowed title.
    expect(applyScopeFilter(makeProvenance('Pathfinder Player Core 3')).ok).toBe(false);
    expect(applyScopeFilter(makeProvenance('Player Core')).ok).toBe(false);
  });

  it('rejects an empty publication string', () => {
    expect(applyScopeFilter(makeProvenance('')).ok).toBe(false);
  });
});
