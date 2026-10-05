import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildTraitGlossary,
  flattenLangStrings,
  traitLangKey,
  writeTraitGlossary,
} from './traitGlossary.js';

describe('traitLangKey', () => {
  it('PascalCases a plain slug', () => {
    expect(traitLangKey('agile')).toBe('PF2E.TraitDescriptionAgile');
    expect(traitLangKey('finesse')).toBe('PF2E.TraitDescriptionFinesse');
  });

  it('joins a hyphenated slug without separators', () => {
    expect(traitLangKey('free-hand')).toBe('PF2E.TraitDescriptionFreeHand');
  });

  it('drops a trailing die-size suffix', () => {
    expect(traitLangKey('two-hand-d8')).toBe('PF2E.TraitDescriptionTwoHand');
    expect(traitLangKey('deadly-d10')).toBe('PF2E.TraitDescriptionDeadly');
  });

  it('drops a trailing single-letter suffix (a damage-type code)', () => {
    expect(traitLangKey('versatile-p')).toBe('PF2E.TraitDescriptionVersatile');
  });

  it('drops a trailing bare-number suffix', () => {
    expect(traitLangKey('splash-99')).toBe('PF2E.TraitDescriptionSplash');
  });

  it('never strips the only segment, even if it looks droppable', () => {
    // An invented edge case -- no real trait is just "d8" -- but a single
    // segment must never be stripped down to nothing.
    expect(traitLangKey('d8')).toBe('PF2E.TraitDescriptionD8');
  });
});

describe('flattenLangStrings', () => {
  it('flattens nested objects into dotted keys', () => {
    const flat = flattenLangStrings({
      PF2E: { TraitDescriptionAgile: 'Reduces MAP.', Other: { Nested: 'deep' } },
    });
    expect(flat.get('PF2E.TraitDescriptionAgile')).toBe('Reduces MAP.');
    expect(flat.get('PF2E.Other.Nested')).toBe('deep');
  });

  it('ignores non-string, non-object values and arrays', () => {
    const flat = flattenLangStrings({ PF2E: { count: 3, list: ['a', 'b'], ok: null } });
    expect(flat.size).toBe(0);
  });
});

describe('buildTraitGlossary', () => {
  const LANG = flattenLangStrings({
    PF2E: {
      TraitDescriptionAgile: 'Reduces the Multiple Attack Penalty.',
      TraitDescriptionFinesse: 'Use Dexterity instead of Strength.',
    },
  });

  it('builds a glossary entry for every resolvable slug, converting its text', () => {
    const { entries, misses } = buildTraitGlossary(['agile', 'finesse'], LANG);
    expect(misses).toEqual([]);
    expect(entries).toEqual([
      {
        slug: 'agile',
        name: 'Agile',
        text: [{ kind: 'text', value: 'Reduces the Multiple Attack Penalty.' }],
      },
      {
        slug: 'finesse',
        name: 'Finesse',
        text: [{ kind: 'text', value: 'Use Dexterity instead of Strength.' }],
      },
    ]);
  });

  it('counts an unresolvable slug as a miss, without throwing', () => {
    const { entries, misses } = buildTraitGlossary(['agile', 'no-such-trait'], LANG);
    expect(entries.map((e) => e.slug)).toEqual(['agile']);
    expect(misses).toEqual(['no-such-trait']);
  });

  it('deduplicates repeated slugs and sorts the output', () => {
    const { entries } = buildTraitGlossary(['finesse', 'agile', 'agile'], LANG);
    expect(entries.map((e) => e.slug)).toEqual(['agile', 'finesse']);
  });

  it('title-cases a hyphenated slug into a display name', () => {
    const lang = flattenLangStrings({
      PF2E: { TraitDescriptionFreeHand: 'Usable one-handed.' },
    });
    const { entries } = buildTraitGlossary(['free-hand'], lang);
    expect(entries[0]?.name).toBe('Free Hand');
  });
});

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hearthtable-trait-glossary-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('writeTraitGlossary', () => {
  it('writes traits.json as a plain array, with no manifest', () => {
    const outputDir = makeTempDir();
    writeTraitGlossary(
      [{ slug: 'agile', name: 'Agile', text: [{ kind: 'text', value: 'Reduces MAP.' }] }],
      outputDir,
    );

    expect(existsSync(join(outputDir, 'traits.json'))).toBe(true);
    const written: unknown = JSON.parse(
      readFileSync(join(outputDir, 'traits.json'), 'utf8'),
    );
    expect(written).toEqual([
      { slug: 'agile', name: 'Agile', text: [{ kind: 'text', value: 'Reduces MAP.' }] },
    ]);
  });
});
