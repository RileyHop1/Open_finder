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

  it('renders a private notice (M5 C.10) distinctly, with no sender name', async () => {
    const seatId = crypto.randomUUID();
    const message = makeTextMessage({
      permissions: { default: 'none', seats: { [seatId]: 'observer' } },
      text: 'Ada can use Reactive Strike: a goblin moved out of their reach.',
    });
    vi.mocked(chatApi.listChatMessages).mockResolvedValue([message]);

    const wrapper = mountChatLog();
    await flushPromises();

    const notice = wrapper.get('.chat-notice');
    expect(notice.text()).toContain('Notice');
    expect(notice.text()).toContain('Ada can use Reactive Strike');
    expect(wrapper.find('.sender').exists()).toBe(false);
  });

  it('renders a GM-only aside the ordinary way, since it names no specific seat', async () => {
    const seat = makeSeat({ name: 'Riley' });
    const message = makeTextMessage({
      seatId: seat.id,
      permissions: { default: 'none', seats: {} },
      text: 'Also caught, unseen: a hidden goblin.',
    });
    vi.mocked(chatApi.listChatMessages).mockResolvedValue([message]);
    vi.mocked(useLobbyStore).mockReturnValue({ seats: [seat] } as never);

    const wrapper = mountChatLog();
    await flushPromises();

    expect(wrapper.find('.chat-notice').exists()).toBe(false);
    expect(wrapper.get('.sender').text()).toBe('Riley:');
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

  /** jsdom never lays out real pixels, so scrollHeight/clientHeight are stubbed by hand. */
  function stubScrollMetrics(
    el: Element,
    { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number },
  ): void {
    Object.defineProperty(el, 'scrollHeight', {
      value: scrollHeight,
      configurable: true,
    });
    Object.defineProperty(el, 'clientHeight', {
      value: clientHeight,
      configurable: true,
    });
  }

  it('opens scrolled to the newest message', async () => {
    const seat = makeSeat({ name: 'Riley' });
    vi.mocked(chatApi.listChatMessages).mockResolvedValue([makeTextMessage()]);
    vi.mocked(useLobbyStore).mockReturnValue({ seats: [seat] } as never);

    const wrapper = mountChatLog();
    const list = wrapper.get('.messages').element;
    stubScrollMetrics(list, { scrollHeight: 500, clientHeight: 100 });
    await flushPromises();

    expect(list.scrollTop).toBe(500);
  });

  it('follows a new message down when already at the bottom', async () => {
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const wrapper = mountChatLog();
    const list = wrapper.get('.messages').element;
    stubScrollMetrics(list, { scrollHeight: 100, clientHeight: 100 });
    await flushPromises();
    list.scrollTop = 0;

    stubScrollMetrics(list, { scrollHeight: 500, clientHeight: 100 });
    connectSharedConnection();
    await wrapper.find('#chat-input').setValue('hello table');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(list.scrollTop).toBe(500);
  });

  it('does not yank the view away from a reader scrolled up into history', async () => {
    const seat = makeSeat({ name: 'Riley' });
    vi.mocked(chatApi.listChatMessages).mockResolvedValue([makeTextMessage()]);
    vi.mocked(useLobbyStore).mockReturnValue({ seats: [seat] } as never);

    const wrapper = mountChatLog();
    const list = wrapper.get('.messages').element;
    stubScrollMetrics(list, { scrollHeight: 1000, clientHeight: 100 });
    await flushPromises();

    // Scrolled well away from the bottom, reading history.
    list.scrollTop = 10;
    list.dispatchEvent(new Event('scroll'));

    connectSharedConnection();
    const onBroadcast = stubSocket.handlers.get('broadcast');
    onBroadcast?.({
      sequence: 1,
      operation: {
        id: crypto.randomUUID(),
        worldId: crypto.randomUUID(),
        type: 'chat.sendMessage',
        payload: {},
        sequence: 1,
        appliedAt: new Date().toISOString(),
      },
      documents: [makeTextMessage()],
    } as never);
    await flushPromises();

    expect(list.scrollTop).toBe(10);
  });

  describe('the GM editing a plain roll', () => {
    it('shows no edit control for a non-GM viewer', async () => {
      const seat = makeSeat({ name: 'Riley', isGM: false });
      vi.mocked(chatApi.listChatMessages).mockResolvedValue([makeRollMessage(seat.id)]);
      vi.mocked(useLobbyStore).mockReturnValue({ seats: [seat], mySeat: seat } as never);

      const wrapper = mountChatLog();
      await flushPromises();

      expect(wrapper.find('.gm-edit-toggle').exists()).toBe(false);
    });

    it("shows 'GM set to N (rolled M)' once gmTotal is set", async () => {
      const seat = makeSeat({ name: 'Riley' });
      const roll = makeRollMessage(seat.id);
      vi.mocked(chatApi.listChatMessages).mockResolvedValue([
        { ...roll, gmTotal: 20 } as never,
      ]);
      vi.mocked(useLobbyStore).mockReturnValue({ seats: [seat], mySeat: seat } as never);

      const wrapper = mountChatLog();
      await flushPromises();

      expect(wrapper.text()).toContain('GM set to 20');
      expect(wrapper.text()).toContain('rolled 13');
    });

    it('sends chat.adjustRoll with the typed total when the GM submits an edit', async () => {
      const gm = makeSeat({ name: 'Riley', isGM: true });
      const roll = makeRollMessage(gm.id);
      vi.mocked(chatApi.listChatMessages).mockResolvedValue([roll]);
      vi.mocked(useLobbyStore).mockReturnValue({ seats: [gm], mySeat: gm } as never);
      vi.mocked(emitOperation).mockResolvedValue({ ok: true });

      const wrapper = mountChatLog();
      await flushPromises();
      connectSharedConnection();

      await wrapper.find('.gm-edit-toggle').trigger('click');
      await wrapper.find('.gm-edit input').setValue('20');
      await wrapper.find('.gm-edit').trigger('submit');
      await flushPromises();

      expect(emitOperation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'chat.adjustRoll',
          payload: { messageId: roll.id, total: 20 },
        }),
      );
    });
  });
});
