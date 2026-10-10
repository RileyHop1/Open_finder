import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { buildUuidResolver } from './upstreamUuid.js';

const entry = (id: string, packId: string, name: string) => ({
  id: deterministicId(id),
  packId,
  name,
});

describe('buildUuidResolver', () => {
  const feat = entry('aaaaaaaaaaaaaaaa', 'feats', 'Invented Strike');
  const action = entry('bbbbbbbbbbbbbbbb', 'actions', 'Invented Strike');
  const twinA = entry('cccccccccccccccc', 'feats', 'Twin');
  const twinB = entry('dddddddddddddddd', 'feats', 'Twin');
  const resolve = buildUuidResolver([feat, action, twinA, twinB]);

  it('resolves a name, using the upstream pack to pick between same-named entries', () => {
    expect(resolve('Compendium.pf2e.feats-srd.Item.Invented Strike')).toBe(feat);
    expect(resolve('Compendium.pf2e.actionspf2e.Item.Invented Strike')).toBe(action);
  });

  it('still resolves the id form first', () => {
    expect(resolve('Compendium.pf2e.feats.Item.bbbbbbbbbbbbbbbb')).toBe(action);
  });

  it('resolves nothing for a pack we do not import', () => {
    expect(resolve('Compendium.pf2e.feat-effects.Item.Invented Strike')).toBeUndefined();
  });

  it('resolves nothing for a name that is still ambiguous within the pack', () => {
    expect(resolve('Compendium.pf2e.feats-srd.Item.Twin')).toBeUndefined();
  });

  it('resolves nothing for an unknown name or a malformed uuid', () => {
    expect(resolve('Compendium.pf2e.feats-srd.Item.Nope')).toBeUndefined();
    expect(resolve('not a uuid')).toBeUndefined();
  });

  it('keeps a name that contains periods whole', () => {
    const dotted = entry('eeeeeeeeeeeeeeee', 'feats', 'Mr. Invented');
    expect(
      buildUuidResolver([dotted])('Compendium.pf2e.feats-srd.Item.Mr. Invented'),
    ).toBe(dotted);
  });
});
