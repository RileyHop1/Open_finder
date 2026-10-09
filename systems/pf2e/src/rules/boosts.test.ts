import { describe, expect, it } from 'vitest';

import type { AttributeBoost } from '../content/characterBuild.js';
import { applyBoosts } from './boosts.js';

const boost = (
  level: AttributeBoost['level'],
  source: AttributeBoost['source'],
  attributes: AttributeBoost['attributes'],
): AttributeBoost => ({ level, source, attributes });

// Hand-computed throughout (docs/golden-tests.md): every attribute starts at +0.
describe('applyBoosts', () => {
  it('starts every attribute at +0 with nothing to apply', () => {
    const result = applyBoosts([]);
    expect(Object.values(result.attributes)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(result.warnings).toEqual([]);
  });

  it('adds +1 per boost and takes 1 off for a flaw (an invented level 1 build)', () => {
    const result = applyBoosts(
      [
        boost(1, 'ancestry', ['str', 'con']),
        boost(1, 'background', ['str', 'wis']),
        boost(1, 'class', ['str']),
        boost(1, 'free', ['dex', 'con', 'int', 'cha']),
      ],
      ['cha'],
    );
    // str: ancestry + background + class = +3. dex +1. con: ancestry + free = +2.
    // int +1. wis +1. cha: free +1, flaw -1 = +0.
    expect(result.attributes).toEqual({
      str: 3,
      dex: 1,
      con: 2,
      int: 1,
      wis: 1,
      cha: 0,
    });
    expect(result.warnings).toEqual([]);
  });

  it('makes a boost at +4 or more a partial boost, and two partials +1', () => {
    const toFour = [
      boost(1, 'ancestry', ['str']),
      boost(1, 'background', ['str']),
      boost(1, 'class', ['str']),
      boost(1, 'free', ['str']),
    ];
    const atFour = applyBoosts(toFour);
    expect(atFour.attributes.str).toBe(4);
    expect(atFour.partial.str).toBe(false);

    const onePartial = applyBoosts([...toFour, boost(5, 'free', ['str'])]);
    expect(onePartial.attributes.str).toBe(4);
    expect(onePartial.partial.str).toBe(true);

    const twoPartials = applyBoosts([
      ...toFour,
      boost(5, 'free', ['str']),
      boost(10, 'free', ['str']),
    ]);
    expect(twoPartials.attributes.str).toBe(5);
    expect(twoPartials.partial.str).toBe(false);

    const threePartials = applyBoosts([
      ...toFour,
      boost(5, 'free', ['str']),
      boost(10, 'free', ['str']),
      boost(15, 'free', ['str']),
    ]);
    expect(threePartials.attributes.str).toBe(5);
    expect(threePartials.partial.str).toBe(true);
  });

  it('replays by level, not by the order the batches were stored in', () => {
    const early = boost(1, 'free', ['dex']);
    const late = boost(5, 'free', ['dex']);
    expect(applyBoosts([late, early])).toEqual(applyBoosts([early, late]));
  });

  it('warns about the same attribute boosted twice from one source, and still applies both', () => {
    const result = applyBoosts([boost(1, 'free', ['dex', 'dex'])]);
    expect(result.attributes.dex).toBe(2);
    expect(result.warnings).toEqual([
      { kind: 'duplicate-boost', level: 1, source: 'free', attribute: 'dex' },
    ]);
  });

  it('does not call it a duplicate when two different sources boost the same attribute', () => {
    expect(
      applyBoosts([boost(1, 'ancestry', ['str']), boost(1, 'free', ['str'])]).warnings,
    ).toEqual([]);
  });

  it('warns about a boost from a level the character has not reached, and still applies it', () => {
    const result = applyBoosts(
      [boost(1, 'free', ['str']), boost(5, 'free', ['str'])],
      [],
      4,
    );
    expect(result.attributes.str).toBe(2);
    expect(result.warnings).toEqual([{ kind: 'future-boost', level: 5, source: 'free' }]);
  });
});
