// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

import { io } from 'socket.io-client';

import { createSocket, emitOperation } from './socket.js';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(io).mockReset();
});

describe('createSocket', () => {
  it("connects with this browser's device token and does not auto-connect", () => {
    vi.mocked(io).mockReturnValue({} as ReturnType<typeof io>);

    createSocket();

    expect(io).toHaveBeenCalledTimes(1);
    const [options] = vi.mocked(io).mock.calls[0] ?? [];
    expect(options).toMatchObject({ autoConnect: false });
    const auth = (options as { auth?: { deviceToken?: unknown } } | undefined)?.auth;
    expect(typeof auth?.deviceToken).toBe('string');
    expect((auth?.deviceToken as string).length).toBeGreaterThan(0);
  });
});

describe('emitOperation', () => {
  it('resolves with whatever the server acks back', async () => {
    const emit = vi.fn(
      (_event: string, _payload: unknown, ack: (response: { ok: boolean }) => void) => {
        ack({ ok: true });
      },
    );
    const socket = { emit } as unknown as Parameters<typeof emitOperation>[0];

    const operation = { id: crypto.randomUUID(), type: 'seat.claim', payload: {} };
    const result = await emitOperation(socket, operation);

    expect(emit).toHaveBeenCalledWith('operation', operation, expect.any(Function));
    expect(result).toEqual({ ok: true });
  });
});
