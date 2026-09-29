import { describe, expect, it } from 'vitest';

import { UPSTREAM_COMMIT, UPSTREAM_PACKS_CHECKSUM, UPSTREAM_REPO } from './upstream.js';

describe('upstream pin', () => {
  it('names the correct repository', () => {
    expect(UPSTREAM_REPO).toBe('https://github.com/foundryvtt/pf2e.git');
  });

  it('pins a full 40-character commit SHA, not a branch or tag', () => {
    expect(UPSTREAM_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });

  it('carries a real sha256 checksum, not a placeholder', () => {
    expect(UPSTREAM_PACKS_CHECKSUM).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
