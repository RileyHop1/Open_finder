import { describe, expect, it } from 'vitest';

import { applyLicenseFilter } from './licenseFilter.js';
import type { UpstreamEntry } from './reader.js';

// Synthetic, invented fixtures throughout -- never real upstream content
// (ADR 0013).
function makeEntry(
  system: unknown,
  overrides: Partial<UpstreamEntry> = {},
): UpstreamEntry {
  return {
    path: 'invented/entry.json',
    id: 'aaaaaaaaaaaaaaaa',
    name: 'Invented Entry',
    type: 'feat',
    system,
    ...overrides,
  };
}

describe('applyLicenseFilter -- accept/reject table', () => {
  it.each([
    [
      'an Item-shaped entry (system.publication) that is ORC + remaster',
      {
        publication: { title: 'Pathfinder Player Core', license: 'ORC', remaster: true },
      },
      true,
    ],
    [
      'an Actor-shaped entry (system.details.publication) that is ORC + remaster',
      {
        details: {
          publication: {
            title: 'Pathfinder Monster Core',
            license: 'ORC',
            remaster: true,
          },
        },
      },
      true,
    ],
    [
      'OGL-licensed content, even if marked remaster: true',
      { publication: { title: 'Pathfinder Bestiary', license: 'OGL', remaster: true } },
      false,
    ],
    [
      'ORC-licensed content that is not Remaster (remaster: false)',
      { publication: { title: 'Some Legacy Book', license: 'ORC', remaster: false } },
      false,
    ],
    [
      'a publication object missing its title',
      { publication: { license: 'ORC', remaster: true } },
      false,
    ],
    ['system with no publication anywhere', { level: { value: 1 } }, false],
    ['a non-object system', 'not an object', false],
    ['a null system', null, false],
  ] as const)('%s', (_description, system, expectedOk) => {
    const result = applyLicenseFilter(makeEntry(system));
    expect(result.ok).toBe(expectedOk);
  });
});

describe('applyLicenseFilter -- results', () => {
  it('returns the mapped Provenance on success', () => {
    const result = applyLicenseFilter(
      makeEntry({
        publication: { title: 'Pathfinder Player Core', license: 'ORC', remaster: true },
      }),
    );
    expect(result).toEqual({
      ok: true,
      provenance: {
        publication: 'Pathfinder Player Core',
        license: 'ORC',
        remaster: true,
      },
    });
  });

  it('records a reason on failure', () => {
    const result = applyLicenseFilter(makeEntry({}));
    expect(result).toEqual({ ok: false, reason: 'missing-provenance' });
  });

  it('prefers system.publication over system.details.publication when both are somehow present', () => {
    // Not a real upstream shape -- a real entry only ever has one. Pins the
    // deterministic tie-break rather than leaving it to iteration order.
    const result = applyLicenseFilter(
      makeEntry({
        publication: { title: 'Pathfinder Player Core', license: 'ORC', remaster: true },
        details: {
          publication: {
            title: 'Pathfinder Monster Core',
            license: 'ORC',
            remaster: true,
          },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provenance.publication).toBe('Pathfinder Player Core');
    }
  });
});
