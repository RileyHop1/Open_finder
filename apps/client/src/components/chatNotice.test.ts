import type { ChatTextMessage } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { isPrivateNotice } from './chatNotice.js';

const NOW = '2026-10-01T00:00:00.000Z';

function textMessage(permissions: ChatTextMessage['permissions']): ChatTextMessage {
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'chatMessage',
    schemaVersion: 1,
    permissions,
    createdAt: NOW,
    updatedAt: NOW,
    seatId: crypto.randomUUID(),
    kind: 'text',
    text: 'A creature can use Reactive Strike.',
  };
}

describe('isPrivateNotice', () => {
  it('is a notice when it names specific seats and no one else', () => {
    const seatId = crypto.randomUUID();
    expect(
      isPrivateNotice(textMessage({ default: 'none', seats: { [seatId]: 'observer' } })),
    ).toBe(true);
  });

  it('is not a notice when it names no one (a GM-only aside)', () => {
    expect(isPrivateNotice(textMessage({ default: 'none', seats: {} }))).toBe(false);
  });

  it('is not a notice when it is visible to everyone', () => {
    expect(isPrivateNotice(textMessage({ default: 'observer', seats: {} }))).toBe(false);
  });
});
