import type { DegreeOfSuccess } from '@hearthtable/dice/pure';
import { describe, expect, it } from 'vitest';

import type { AppliedCondition } from '../content/character.js';
import type { DyingState } from './dyingChain.js';
import {
  damageWhileDying,
  deathThreshold,
  dyingStateOf,
  healFromDying,
  instantDeath,
  knockOut,
  recoveryChange,
  recoveryCheck,
  recoveryDc,
  withDyingState,
} from './dyingChain.js';

const HEALTHY: DyingState = { dying: 0, wounded: 0, doomed: 0, unconscious: false };

function state(fields: Partial<DyingState>): DyingState {
  return { ...HEALTHY, ...fields };
}

describe('deathThreshold and recoveryDc', () => {
  it('is 4 less doomed, never below 1', () => {
    expect([0, 1, 2, 3, 4, 5].map(deathThreshold)).toEqual([4, 3, 2, 1, 1, 1]);
  });

  it('puts the recovery DC at 10 plus dying', () => {
    expect([1, 2, 3, 4].map(recoveryDc)).toEqual([11, 12, 13, 14]);
  });

  it('moves dying by -2, -1, +1, +2 for the four degrees', () => {
    expect(recoveryChange('criticalSuccess')).toBe(-2);
    expect(recoveryChange('success')).toBe(-1);
    expect(recoveryChange('failure')).toBe(1);
    expect(recoveryChange('criticalFailure')).toBe(2);
  });
});

describe('knockOut -- golden cases', () => {
  // [wounded, doomed, critical, dying stored, dead]
  it.each([
    [0, 0, false, 1, false],
    [0, 0, true, 2, false],
    [1, 0, false, 2, false],
    [1, 0, true, 3, false],
    [2, 0, false, 3, false],
    [2, 0, true, 4, true],
    [3, 0, false, 4, true],
    [3, 0, true, 4, true],
    [0, 1, false, 1, false],
    [0, 1, true, 2, false],
    [1, 1, false, 2, false],
    [1, 1, true, 3, true],
    [0, 2, false, 1, false],
    [0, 2, true, 2, true],
    [1, 2, false, 2, true],
    [0, 3, false, 1, true],
    [0, 4, false, 1, true],
  ])(
    'wounded %i, doomed %i, critical %s -> dying %i, dead %s',
    (wounded, doomed, critical, dying, dead) => {
      const result = knockOut(state({ wounded, doomed }), { critical });
      expect(result.state.dying).toBe(dying);
      expect(result.dead).toBe(dead);
      expect(result.state.unconscious).toBe(true);
      expect(result.state.wounded).toBe(wounded);
    },
  );

  it('says it knocked the character out, and that it died when it did', () => {
    expect(knockOut(state({}), { critical: false }).events).toEqual([
      { kind: 'knockedOut', dying: 1 },
    ]);
    expect(knockOut(state({ wounded: 3 }), { critical: false }).events).toEqual([
      { kind: 'knockedOut', dying: 4 },
      { kind: 'dead', reason: 'dying' },
    ]);
  });
});

describe('damageWhileDying -- golden cases', () => {
  // [doomed, dying before, critical, dying after, dead]
  it.each([
    [0, 1, false, 2, false],
    [0, 1, true, 3, false],
    [0, 2, false, 3, false],
    [0, 2, true, 4, true],
    [0, 3, false, 4, true],
    [0, 3, true, 4, true],
    [1, 1, false, 2, false],
    [1, 1, true, 3, true],
    [1, 2, false, 3, true],
    [1, 2, true, 4, true],
    [1, 3, false, 4, true],
    [2, 1, false, 2, true],
  ])(
    'doomed %i, dying %i, critical %s -> dying %i, dead %s',
    (doomed, before, critical, after, dead) => {
      const result = damageWhileDying(
        state({ doomed, dying: before, unconscious: true }),
        {
          critical,
        },
      );
      expect(result.state.dying).toBe(after);
      expect(result.dead).toBe(dead);
    },
  );

  it('knocks a stable character out again, with wounded added', () => {
    const stable = state({ unconscious: true, wounded: 1 });
    const result = damageWhileDying(stable, { critical: false });
    expect(result.state).toMatchObject({ dying: 2, wounded: 1, unconscious: true });
    expect(result.events[0]).toEqual({ kind: 'knockedOut', dying: 2 });
  });

  it('reports the change in dying', () => {
    expect(
      damageWhileDying(state({ dying: 1, unconscious: true }), { critical: false })
        .events,
    ).toEqual([{ kind: 'dyingChanged', from: 1, to: 2 }]);
  });
});

describe('recoveryCheck -- golden cases', () => {
  const degrees: DegreeOfSuccess[] = [
    'criticalSuccess',
    'success',
    'failure',
    'criticalFailure',
  ];

  // dying before -> [dying after, dead] for each degree above, wounded 0, doomed 0
  const table: Record<number, [number, boolean][]> = {
    1: [
      [0, false],
      [0, false],
      [2, false],
      [3, false],
    ],
    2: [
      [0, false],
      [1, false],
      [3, false],
      [4, true],
    ],
    3: [
      [1, false],
      [2, false],
      [4, true],
      [4, true],
    ],
  };

  for (const [before, rows] of Object.entries(table)) {
    degrees.forEach((degree, index) => {
      const [after, dead] = rows[index] ?? [0, false];
      it(`dying ${before}, ${degree} -> dying ${after}${dead ? ', dead' : ''}`, () => {
        const result = recoveryCheck(
          state({ dying: Number(before), unconscious: true }),
          degree,
        );
        expect(result.state.dying).toBe(after);
        expect(result.dead).toBe(dead);
      });
    });
  }

  it('ends dying at 0, raises wounded by one, and leaves the character unconscious', () => {
    for (const wounded of [0, 1, 2]) {
      const result = recoveryCheck(
        state({ dying: 1, wounded, unconscious: true }),
        'success',
      );
      expect(result.state).toEqual({
        dying: 0,
        wounded: wounded + 1,
        doomed: 0,
        unconscious: true,
      });
      expect(result.dead).toBe(false);
      expect(result.events).toEqual([
        { kind: 'dyingChanged', from: 1, to: 0 },
        { kind: 'stabilised' },
        { kind: 'woundedRaised', from: wounded, to: wounded + 1 },
      ]);
    }
  });

  it('lets a critical success from dying 2 end it too', () => {
    expect(
      recoveryCheck(state({ dying: 2, unconscious: true }), 'criticalSuccess').state,
    ).toMatchObject({ dying: 0, wounded: 1 });
  });

  it('lets doomed lower where a failure kills', () => {
    // doomed 1: dies at dying 3.
    expect(
      recoveryCheck(state({ dying: 2, doomed: 1, unconscious: true }), 'failure').dead,
    ).toBe(true);
    expect(
      recoveryCheck(state({ dying: 1, doomed: 1, unconscious: true }), 'failure').dead,
    ).toBe(false);
    expect(
      recoveryCheck(state({ dying: 1, doomed: 1, unconscious: true }), 'criticalFailure')
        .dead,
    ).toBe(true);
  });

  it('does nothing for a character who is not dying', () => {
    const stable = state({ unconscious: true, wounded: 1 });
    const result = recoveryCheck(stable, 'criticalFailure');
    expect(result.state).toEqual(stable);
    expect(result.events).toEqual([]);
  });
});

describe('healFromDying -- golden cases', () => {
  it.each([
    [1, 0],
    [2, 0],
    [3, 0],
    [1, 1],
    [2, 2],
  ])('dying %i, wounded %i: wakes up, dying ends, wounded +1', (dying, wounded) => {
    const result = healFromDying(state({ dying, wounded, unconscious: true }));
    expect(result.state).toEqual({
      dying: 0,
      wounded: wounded + 1,
      doomed: 0,
      unconscious: false,
    });
    expect(result.dead).toBe(false);
    expect(result.events).toEqual([
      { kind: 'dyingChanged', from: dying, to: 0 },
      { kind: 'revived' },
      { kind: 'woundedRaised', from: wounded, to: wounded + 1 },
    ]);
  });

  it('only wakes a stable character: wounded is not raised twice for one drop', () => {
    const result = healFromDying(state({ unconscious: true, wounded: 1 }));
    expect(result.state).toMatchObject({ unconscious: false, wounded: 1 });
    expect(result.events).toEqual([{ kind: 'revived' }]);
  });

  it('changes nothing for a character who is awake', () => {
    expect(healFromDying(state({ wounded: 2 }))).toEqual({
      state: state({ wounded: 2 }),
      dead: false,
      events: [],
    });
  });
});

describe('a whole sequence: repeated drops are more dangerous', () => {
  it('fails a recovery, passes two, is stable at wounded 1, and is knocked out at dying 2', () => {
    let current = knockOut(HEALTHY, { critical: false }).state;
    expect(current.dying).toBe(1);

    current = recoveryCheck(current, 'failure').state; // 11 to beat, rolled badly
    expect(current.dying).toBe(2);

    current = recoveryCheck(current, 'success').state;
    expect(current.dying).toBe(1);

    current = recoveryCheck(current, 'success').state;
    expect(current).toEqual({ dying: 0, wounded: 1, doomed: 0, unconscious: true });

    current = healFromDying(current).state;
    expect(current).toEqual({ dying: 0, wounded: 1, doomed: 0, unconscious: false });

    const again = knockOut(current, { critical: false });
    expect(again.state.dying).toBe(2);
    expect(again.dead).toBe(false);
  });
});

describe('instantDeath', () => {
  it('kills at damage equal to maximum hit points, and not one less', () => {
    expect(instantDeath({ remainingDamage: 29, maxHp: 30 })).toBe(false);
    expect(instantDeath({ remainingDamage: 30, maxHp: 30 })).toBe(true);
    expect(instantDeath({ remainingDamage: 0, maxHp: 30 })).toBe(false);
  });
});

describe('the condition list adapter', () => {
  it('reads the chain from the conditions, and treats absent ones as zero', () => {
    expect(dyingStateOf([])).toEqual(HEALTHY);
    expect(
      dyingStateOf([
        { slug: 'prone' },
        { slug: 'dying', value: 2 },
        { slug: 'wounded', value: 1 },
        { slug: 'doomed', value: 1 },
        { slug: 'unconscious' },
      ]),
    ).toEqual({ dying: 2, wounded: 1, doomed: 1, unconscious: true });
  });

  it('writes the chain back, keeping every other condition and its place', () => {
    const start: AppliedCondition[] = [
      { slug: 'prone' },
      { slug: 'frightened', value: 2 },
    ];
    const next = withDyingState(
      start,
      state({ dying: 2, wounded: 1, unconscious: true }),
    );
    expect(next).toEqual([
      { slug: 'prone' },
      { slug: 'frightened', value: 2 },
      { slug: 'dying', value: 2 },
      { slug: 'wounded', value: 1 },
      { slug: 'unconscious' },
    ]);
  });

  it('removes what has ended, and leaves a stable character unconscious', () => {
    const start: AppliedCondition[] = [
      { slug: 'dying', value: 1 },
      { slug: 'wounded', value: 1 },
      { slug: 'unconscious' },
      { slug: 'prone' },
    ];
    expect(withDyingState(start, state({ wounded: 2, unconscious: true }))).toEqual([
      { slug: 'wounded', value: 2 },
      { slug: 'unconscious' },
      { slug: 'prone' },
    ]);
    expect(withDyingState(start, HEALTHY)).toEqual([{ slug: 'prone' }]);
  });

  it('never leaves a dying character conscious', () => {
    const next = withDyingState([], state({ dying: 1 }));
    expect(next.map((c) => c.slug)).toContain('unconscious');
  });

  it('does not touch a condition that already has the right value, including its duration', () => {
    const timed: AppliedCondition[] = [
      { slug: 'wounded', value: 1, duration: { type: 'minutes', remaining: 10 } },
    ];
    expect(withDyingState(timed, state({ wounded: 1 }))).toEqual(timed);
  });

  it('round-trips through a knock out', () => {
    const result = knockOut(HEALTHY, { critical: true });
    const conditions = withDyingState([], result.state);
    expect(dyingStateOf(conditions)).toEqual(result.state);
  });
});
