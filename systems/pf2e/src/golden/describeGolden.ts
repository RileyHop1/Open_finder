/**
 * The golden-test harness: a fixture type describing a character or
 * creature's expected `Statistic`s, and `describeGolden`, which turns a
 * fixture plus the rules-layer output it should match into a Vitest test
 * tree. See `docs/golden-tests.md`.
 *
 * Per ADR 0008's consequences section, a golden test asserts not just a
 * `Statistic`'s total but which of its modifiers ended up applied vs
 * suppressed -- a modifier's type quietly changing from `status` to
 * `circumstance` can leave a total unchanged while still breaking the
 * breakdown, and a test that only checked totals would never catch that.
 *
 * The comparison itself (`compareGolden`) is kept separate from the
 * Vitest wiring (`describeGolden`) so it can be unit-tested directly,
 * including its failure paths -- `describe`/`it`/`expect` calls are
 * side-effecting test registration, not something a test can assert
 * against from inside the same run.
 */

import type { Statistic } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

export interface GoldenModifierExpectation {
  readonly slug: string;
  readonly applied: boolean;
  /** Only checked when provided -- an applied modifier, or one suppressed by something the fixture doesn't care to pin, can omit this. */
  readonly suppressedBy?: string;
}

export interface GoldenStatisticExpectation {
  readonly total: number;
  /** Modifiers worth pinning by name -- not every modifier on the statistic needs an entry here. */
  readonly modifiers?: readonly GoldenModifierExpectation[];
}

export interface GoldenFixture {
  readonly name: string;
  readonly statistics: Readonly<Record<string, GoldenStatisticExpectation>>;
}

export interface GoldenDiscrepancy {
  readonly statistic: string;
  readonly message: string;
}

/**
 * Compares `actual` against `fixture`, returning one `GoldenDiscrepancy`
 * per mismatch -- an empty array means every expectation in the fixture
 * held. Checks, per statistic: the statistic is present, its `total`
 * matches, and each named modifier expectation is present with the
 * expected `applied` (and `suppressedBy`, if given).
 */
export function compareGolden(
  fixture: GoldenFixture,
  actual: Readonly<Record<string, Statistic>>,
): readonly GoldenDiscrepancy[] {
  const discrepancies: GoldenDiscrepancy[] = [];

  for (const [key, expected] of Object.entries(fixture.statistics)) {
    const statistic = actual[key];
    if (statistic === undefined) {
      discrepancies.push({
        statistic: key,
        message: `expected a "${key}" statistic, but none was provided`,
      });
      continue;
    }

    if (statistic.total !== expected.total) {
      discrepancies.push({
        statistic: key,
        message: `expected total ${expected.total}, got ${statistic.total}`,
      });
    }

    for (const modifierExpectation of expected.modifiers ?? []) {
      const modifier = statistic.modifiers.find(
        (candidate) => candidate.slug === modifierExpectation.slug,
      );
      if (modifier === undefined) {
        discrepancies.push({
          statistic: key,
          message: `expected a "${modifierExpectation.slug}" modifier, but none was found`,
        });
        continue;
      }

      if (modifier.applied !== modifierExpectation.applied) {
        const expectedState = modifierExpectation.applied ? 'applied' : 'suppressed';
        const actualState = modifier.applied ? 'applied' : 'suppressed';
        discrepancies.push({
          statistic: key,
          message: `expected modifier "${modifierExpectation.slug}" to be ${expectedState}, but it was ${actualState}`,
        });
      }

      if (
        modifierExpectation.suppressedBy !== undefined &&
        modifier.suppressedBy !== modifierExpectation.suppressedBy
      ) {
        discrepancies.push({
          statistic: key,
          message: `expected modifier "${modifierExpectation.slug}" to be suppressed by "${modifierExpectation.suppressedBy}", but it was suppressed by ${modifier.suppressedBy ?? 'nothing'}`,
        });
      }
    }
  }

  return discrepancies;
}

/**
 * Registers one `it` per named statistic in `fixture`, each asserting that
 * statistic has no discrepancies against `buildActual`'s output. Failing
 * on a per-statistic basis, rather than one `it` for the whole fixture,
 * means a broken save doesn't hide a broken skill in the same run.
 *
 * `buildActual` runs once, synchronously, when the block is collected --
 * every Stack D builder is a pure function, so there is nothing here that
 * needs a `beforeAll`.
 */
export function describeGolden(
  fixture: GoldenFixture,
  buildActual: () => Readonly<Record<string, Statistic>>,
): void {
  describe(fixture.name, () => {
    const actual = buildActual();

    for (const [key, expected] of Object.entries(fixture.statistics)) {
      it(`"${key}" matches the golden fixture`, () => {
        const discrepancies = compareGolden(
          { name: fixture.name, statistics: { [key]: expected } },
          actual,
        );
        expect(discrepancies).toEqual([]);
      });
    }
  });
}
