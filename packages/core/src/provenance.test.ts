import { describe, expect, it } from 'vitest';

import { provenanceSchema } from './provenance.js';

function makeProvenance(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    publication: 'Pathfinder Player Core',
    license: 'ORC',
    remaster: true,
    ...overrides,
  };
}

describe('provenanceSchema', () => {
  it('accepts a well-formed provenance record', () => {
    const result = provenanceSchema.safeParse(makeProvenance());
    expect(result.success).toBe(true);
  });

  it('rejects an empty publication string', () => {
    const result = provenanceSchema.safeParse(makeProvenance({ publication: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects a license outside the accepted set', () => {
    // OGL is real upstream data (see the spike behind ADR 0011/0012), but
    // this project never imports it -- a Provenance can only be built for
    // content that already passed the ORC/Remaster filter.
    const result = provenanceSchema.safeParse(makeProvenance({ license: 'OGL' }));
    expect(result.success).toBe(false);
  });

  it('rejects remaster: false -- the schema cannot represent non-Remaster content', () => {
    const result = provenanceSchema.safeParse(makeProvenance({ remaster: false }));
    expect(result.success).toBe(false);
  });

  it('rejects a missing license entirely', () => {
    const { license: _license, ...rest } = makeProvenance();
    const result = provenanceSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
