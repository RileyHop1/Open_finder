import { describe, expect, it } from 'vitest';

import { baseDocumentSchema } from './index.js';

describe('@hearthtable/core public API', () => {
  it('exposes the document schema via the package entry point', () => {
    const result = baseDocumentSchema.safeParse({
      id: crypto.randomUUID(),
      worldId: crypto.randomUUID(),
      type: 'party',
      schemaVersion: 1,
      permissions: { default: 'observer' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
