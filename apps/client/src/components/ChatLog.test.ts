// @vitest-environment jsdom
import type { ChatMessage, Seat } from '@hearthtable/core';
import { flushPromises, mount } from '@vue/test-utils';
import { type Pinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as chatApi from '../api/chat.js';
import { createSocket, emitOperation } from '../realtime/socket.js';
import { useConnectionStore } from '../stores/connection.js';
import { useLobbyStore } from '../stores/lobby.js';
import ChatLog from './ChatLog.vue';

// ChatLog only reads `seats` off the lobby store (to resolve a sender's
// name), so that store is stubbed outright rather than dragging in its own
// real dependency chain (api/seats.js, deviceToken.js, connection.js) --
// this component's job is rendering chat, not re-proving the lobby store.
vi.mock('../stores/lobby.js', () => ({ useLobbyStore: vi.fn() }));
vi.mock('../api/chat.js');
vi.mock('../realtime/socket.js');

interface StubSocket {
  on: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  handlers: Map<string, (...args: never[]) => void>;
}

function makeStubSocket(): StubSocket {
  const handlers = new Map<string, (...args: never[]) => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      handlers.set(event, handler);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTextMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: now,
    updatedAt: now,
    seatId: crypto.randomUUID(),
    kind: 'text',
    text: 'hello',
    ...overrides,
  } as ChatMessage;
}

function makeRollMessage(seatId: string): ChatMessage {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: now,
    updatedAt: now,
    seatId,
    kind: 'roll',
    roll: {
      expression: '2d6+4',
      total: 13,
      terms: [
        { kind: 'die', faces: 6, result: 5, kept: true, value: 5 },
        { kind: 'die', faces: 6, result: 4, kept: true, value: 4 },
        { kind: 'constant', value: 4 },
      ],
    },
  } as unknown as ChatMessage;
}

let pinia: Pinia;

function mountChatLog(worldId = crypto.randomUUID()) {
  return mount(ChatLog, {
    props: { worldId },
    global: { plugins: [pinia] },
  });
}

/** Simulates what CampaignLobby.vue's onMounted does in the real app: ChatLog itself never opens the connection. */
function connectSharedConnection(): void {
  useConnectionStore(pinia).connect();
}

let stubSocket: StubSocket;

beforeEach(() => {
  vi.resetAllMocks();
  pinia = createPinia();
  vi.mocked(chatApi.listChatMessages).mockResolvedValue([]);
  stubSocket = makeStubSocket();
  vi.mocked(createSocket).mockReturnValue(stubSocket as never);
  vi.mocked(useLobbyStore).mockReturnValue({ seats: [] } as never);
});

describe('ChatLog', () => {
  it('shows a message when there is no chat history yet', async () => {
    const wrapper = mountChatLog();
    await flushPromises();
    expect(wrapper.text()).toContain('No messages yet');
  });

  it("renders a text message with its sender's name", async () => {
    const seat = makeSeat({ name: 'Riley' });
    const message = makeTextMessage({ seatId: seat.id, text: 'Rolling for initiative.' });
    vi.mocked(chatApi.listChatMessages).mockResolvedValue([message]);
    vi.mocked(useLobbyStore).mockReturnValue({ seats: [seat] } as never);

    const wrapper = mountChatLog();
    await flushPromises();

    expect(wrapper.text()).toContain('Riley');
    expect(wrapper.text()).toContain('Rolling for initiative.');
  });

  it('renders a sheet check as a card naming the character, the roller, and the result', async () => {
    const seat = makeSeat({ name: 'Riley' });
    const now = new Date().toISOString();
    const message = {
      id: crypto.randomUUID(),
      worldId: crypto.randomUUID(),
      type: 'chatMessage',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: now,
      updatedAt: now,
      seatId: seat.id,
      kind: 'check',
      actorId: crypto.randomUUID(),
      actorName: 'Valeria',
      statistic: 'perception',
      label: 'Perception',
      breakdown: { total: 5, modifiers: [] },
      roll: {
        expression: '1d20+5',
        total: 15,
        natural: 10,
        terms: [
          { kind: 'die', faces: 20, result: 10, kept: true, value: 10 },
          { kind: 'constant', value: 5 },
        ],
      },
    } as unknown as ChatMessage;
    vi.mocked(chatApi.listChatMessages).mockResolvedValue([message]);
    vi.mocked(useLobbyStore).mockReturnValue({ seats: [seat] } as never);

    const wrapper = mountChatLog();
    await flushPromises();

    const card = wrapper.find('.roll-card');
    expect(card.find('.title').text()).toBe('Valeria: Perception — rolled by Riley');
    expect(card.find('.result').text()).toBe('Total 15');
  });

  it('renders a roll message with a details breakdown showing the total and each term', async () => {
    const seat = makeSeat({ name: 'Riley' });
    const roll = makeRollMessage(seat.id);
    vi.mocked(chatApi.listChatMessages).mockResolvedValue([roll]);
    vi.mocked(useLobbyStore).mockReturnValue({ seats: [seat] } as never);

    const wrapper = mountChatLog();
    await flushPromises();

    expect(wrapper.text()).toContain('Total: 13');
    const breakdown = wrapper.find('.roll-breakdown').text();
    expect(breakdown).toContain('d6: 5');
    expect(breakdown).toContain('d6: 4');
    expect(breakdown).toContain('+4');
  });

  it('sends a plain message typed into the input', async () => {
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const wrapper = mountChatLog();
    await flushPromises();
    connectSharedConnection();

    await wrapper.find('#chat-input').setValue('hello table');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(emitOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'chat.sendMessage',
        payload: { text: 'hello table' },
      }),
    );
  });

  it('recognizes a leading /roll and sends chat.sendRoll instead', async () => {
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const wrapper = mountChatLog();
    await flushPromises();
    connectSharedConnection();

    await wrapper.find('#chat-input').setValue('/roll 1d20+7');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(emitOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'chat.sendRoll',
        payload: { expression: '1d20+7' },
      }),
    );
  });

  it('clears the input after submitting', async () => {
    vi.mocked(emitOperation).mockReturnValue(new Promise(() => undefined));
    const wrapper = mountChatLog();
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>('#chat-input');
    await input.setValue('hello');
    await wrapper.find('form').trigger('submit');

    expect(input.element.value).toBe('');
  });

  it('shows a pending placeholder for a roll in flight without guessing a result', async () => {
    vi.mocked(emitOperation).mockReturnValue(new Promise(() => undefined));
    const wrapper = mountChatLog();
    await flushPromises();
    connectSharedConnection();

    await wrapper.find('#chat-input').setValue('/roll 1d20+7');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Rolling 1d20+7…');
  });

  it('shows a server error as an alert', async () => {
    vi.mocked(chatApi.listChatMessages).mockRejectedValue(new Error('offline'));
    const wrapper = mountChatLog();
    await flushPromises();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('offline');
  });

  it('has a label associated with the chat input, for keyboard/screen-reader users', async () => {
    const wrapper = mountChatLog();
    await flushPromises();
    expect(wrapper.find('label[for="chat-input"]').exists()).toBe(true);
  });
});
