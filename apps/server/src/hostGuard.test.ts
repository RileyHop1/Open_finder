import { describe, expect, it } from 'vitest';

import { assertNotAllInterfaces } from './hostGuard.js';

describe('assertNotAllInterfaces', () => {
  it('throws for 0.0.0.0', () => {
    expect(() => assertNotAllInterfaces('0.0.0.0')).toThrow(/all interfaces/);
  });

  it('throws for the IPv6 equivalent, ::', () => {
    expect(() => assertNotAllInterfaces('::')).toThrow(/all interfaces/);
  });

  it('allows localhost', () => {
    expect(() => assertNotAllInterfaces('127.0.0.1')).not.toThrow();
  });

  it('allows a specific LAN interface address', () => {
    expect(() => assertNotAllInterfaces('192.168.1.42')).not.toThrow();
  });

  it('allows a specific ZeroTier/Tailscale-style interface address', () => {
    expect(() => assertNotAllInterfaces('100.64.0.5')).not.toThrow();
  });

  it('allows a hostname', () => {
    expect(() => assertNotAllInterfaces('my-laptop.local')).not.toThrow();
  });
});
