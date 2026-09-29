import { describe, expect, it } from 'vitest';

import { deterministicId, uuidV5 } from './deterministicId.js';

describe('deterministicId', () => {
  it('is deterministic: the same name always produces the same id', () => {
    expect(deterministicId('aaaaaaaaaaaaaaaa')).toBe(deterministicId('aaaaaaaaaaaaaaaa'));
  });

  it('produces different ids for different names', () => {
    expect(deterministicId('aaaaaaaaaaaaaaaa')).not.toBe(
      deterministicId('bbbbbbbbbbbbbbbb'),
    );
  });

  it('produces a well-formed UUID with version 5 and the RFC 4122 variant', () => {
    const id = deterministicId('some-upstream-id');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('matches the well-known "uuid" npm package for NAMESPACE_DNS + www.example.com', () => {
    // Cross-checked directly against the widely-used `uuid` package's v5
    // output for this exact input (not shipped as a dependency here -- see
    // the module doc for why this is implemented directly instead), so this
    // is a check of the actual algorithm, not just this file's own
    // arithmetic repeated twice.
    const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // NAMESPACE_DNS
    const name = 'www.example.com';
    expect(uuidV5(namespace, name)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });
});
