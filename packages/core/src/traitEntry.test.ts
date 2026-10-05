import { describe, expect, it } from 'vitest';

import { traitEntrySchema } from './traitEntry.js';

describe('traitEntrySchema', () => {
  it('accepts a slug, a name, and rich text', () => {
    const result = traitEntrySchema.safeParse({
      slug: 'agile',
      name: 'Agile',
      text: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'A sentence.' }] }],
    });
    expect(result.success).toBe(true);
  });

  it('requires text, unlike CompendiumEntry.text -- a glossary entry with nothing to show is pointless', () => {
    const result = traitEntrySchema.safeParse({ slug: 'agile', name: 'Agile' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty slug or name', () => {
    expect(
      traitEntrySchema.safeParse({ slug: '', name: 'Agile', text: [] }).success,
    ).toBe(false);
    expect(
      traitEntrySchema.safeParse({ slug: 'agile', name: '', text: [] }).success,
    ).toBe(false);
  });
});
