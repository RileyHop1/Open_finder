import type { Statistic } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { compareGolden, describeGolden, type GoldenFixture } from './describeGolden.js';

function statistic(overrides: Partial<Statistic> = {}): Statistic {
  return {
    total: 10,
    modifiers: [
      {
        slug: 'ability',
        label: 'Ability',
        type: 'ability',
        value: 4,
        source: 'ability',
        enabled: true,
        applied: true,
      },
      {
        slug: 'penalty',
        label: 'Penalty',
        type: 'status',
        value: -2,
        source: 'Invented Effect',
        enabled: true,
        applied: false,
        suppressedBy: 'bigger-penalty',
      },
    ],
    ...overrides,
  };
}

describe('compareGolden', () => {
  it('returns no discrepancies when everything matches', () => {
    const fixture: GoldenFixture = {
      name: 'Invented Fixture',
      statistics: {
        ac: {
          total: 10,
          modifiers: [
            { slug: 'ability', applied: true },
            { slug: 'penalty', applied: false, suppressedBy: 'bigger-penalty' },
          ],
        },
      },
    };

    expect(compareGolden(fixture, { ac: statistic() })).toEqual([]);
  });

  it('flags a missing statistic', () => {
    const fixture: GoldenFixture = {
      name: 'Invented Fixture',
      statistics: { ac: { total: 10 } },
    };

    const discrepancies = compareGolden(fixture, {});

    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]?.statistic).toBe('ac');
    expect(discrepancies[0]?.message).toContain('none was provided');
  });

  it('flags a mismatched total', () => {
    const fixture: GoldenFixture = {
      name: 'Invented Fixture',
      statistics: { ac: { total: 11 } },
    };

    const discrepancies = compareGolden(fixture, { ac: statistic({ total: 10 }) });

    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]?.message).toContain('expected total 11, got 10');
  });

  it('flags a missing modifier', () => {
    const fixture: GoldenFixture = {
      name: 'Invented Fixture',
      statistics: {
        ac: { total: 10, modifiers: [{ slug: 'not-present', applied: true }] },
      },
    };

    const discrepancies = compareGolden(fixture, { ac: statistic() });

    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]?.message).toContain('"not-present"');
  });

  it('flags a modifier expected applied that was actually suppressed, and vice versa', () => {
    const fixture: GoldenFixture = {
      name: 'Invented Fixture',
      statistics: {
        ac: {
          total: 10,
          modifiers: [
            { slug: 'ability', applied: false },
            { slug: 'penalty', applied: true },
          ],
        },
      },
    };

    const discrepancies = compareGolden(fixture, { ac: statistic() });

    expect(discrepancies).toHaveLength(2);
    expect(discrepancies[0]?.message).toContain(
      'expected modifier "ability" to be suppressed, but it was applied',
    );
    expect(discrepancies[1]?.message).toContain(
      'expected modifier "penalty" to be applied, but it was suppressed',
    );
  });

  it('flags a mismatched suppressedBy', () => {
    const fixture: GoldenFixture = {
      name: 'Invented Fixture',
      statistics: {
        ac: {
          total: 10,
          modifiers: [{ slug: 'penalty', applied: false, suppressedBy: 'wrong-slug' }],
        },
      },
    };

    const discrepancies = compareGolden(fixture, { ac: statistic() });

    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]?.message).toContain('suppressed by "wrong-slug"');
  });

  it('does not require every modifier on the statistic to be named in the fixture', () => {
    const fixture: GoldenFixture = {
      name: 'Invented Fixture',
      statistics: { ac: { total: 10, modifiers: [{ slug: 'ability', applied: true }] } },
    };

    expect(compareGolden(fixture, { ac: statistic() })).toEqual([]);
  });
});

describe('describeGolden', () => {
  // A live smoke test: if the wiring below is broken, this file's own test
  // run fails, since describeGolden registers real it() blocks against the
  // ambient Vitest run just like any hand-written test would.
  describeGolden(
    {
      name: 'Invented Golden Fixture',
      statistics: {
        ac: {
          total: 10,
          modifiers: [
            { slug: 'ability', applied: true },
            { slug: 'penalty', applied: false, suppressedBy: 'bigger-penalty' },
          ],
        },
      },
    },
    () => ({ ac: statistic() }),
  );
});
