// @vitest-environment jsdom
import type { Actor, Party, Seat } from '@hearthtable/core';
import { newCharacterData } from '@hearthtable/pf2e';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as documentsApi from '../api/documents.js';
import { createSocket, emitOperation } from '../realtime/socket.js';
import { useConnectionStore } from '../stores/connection.js';
import { useLobbyStore } from '../stores/lobby.js';
import TableView from './TableView.vue';

// The lobby store (releasing a seat) and the chat panel are other components'
// concerns; this test is about the layout and the character roster.
vi.mock('../stores/lobby.js', () => ({ useLobbyStore: vi.fn() }));
vi.mock('../api/documents.js');
vi.mock('../realtime/socket.js');

const NOW = '2026-09-30T00:00:00.000Z';
const WORLD = crypto.randomUUID();

function makeActor(name: string): Actor {
  return {
    id: crypto.randomUUID(),
    worldId: WORLD,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name,
    system: newCharacterData(),
  };
}

function makeParty(memberIds: string[]): Party {
  return {
    id: crypto.randomUUID(),
    worldId: WORLD,
    type: 'party',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    name: 'Party',
    memberIds,
    level: 1,
  };
}

const releaseSeat = vi.fn();
let mySeat: Seat | undefined;
let handlers: Map<string, (...args: never[]) => void>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(documentsApi.listActors).mockResolvedValue([]);
  vi.mocked(documentsApi.getParty).mockResolvedValue(undefined);
  vi.mocked(useLobbyStore).mockReturnValue({
    releaseSeat,
    get mySeat() {
      return mySeat;
    },
  } as never);
  mySeat = undefined;
  handlers = new Map();
  vi.mocked(createSocket).mockReturnValue({
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      handlers.set(event, handler);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as never);
});

async function mountTable() {
  const pinia = createPinia();
  const wrapper = mount(TableView, {
    props: { worldId: WORLD, seatName: 'Valeros' },
    global: { plugins: [pinia], stubs: { ChatLog: { template: '<p>chat</p>' } } },
  });
  useConnectionStore(pinia).connect();
  await flushPromises();
  return wrapper;
}

describe('layout', () => {
  it('has a party bar, a character pane, and a chat pane, each a named landmark', async () => {
    const wrapper = await mountTable();
    expect(wrapper.find('nav[aria-label="Party"]').exists()).toBe(true);
    expect(wrapper.find('section[aria-labelledby="sheet-heading"]').exists()).toBe(true);
    expect(wrapper.find('#chat-pane').text()).toContain('chat');
  });

  it('offers a skip link to each region, and each target exists and can take focus', async () => {
    const wrapper = await mountTable();
    const hrefs = wrapper.findAll('.skip-links a').map((a) => a.attributes('href'));
    expect(hrefs).toEqual(['#party-bar', '#sheet-pane', '#chat-pane']);
    for (const href of hrefs) {
      const target = wrapper.find(href ?? '');
      expect(target.exists()).toBe(true);
      expect(target.attributes('tabindex')).toBe('-1');
    }
  });

  it('loads the characters for this world', async () => {
    await mountTable();
    expect(documentsApi.listActors).toHaveBeenCalledWith(WORLD);
  });

  it('says who you are playing as, and releases the seat from there', async () => {
    const wrapper = await mountTable();
    expect(wrapper.find('.playing-as').text()).toContain('Valeros');
    await wrapper.find('.playing-as button').trigger('click');
    expect(releaseSeat).toHaveBeenCalledTimes(1);
  });
});

describe('party bar', () => {
  it('shows an empty message with no party', async () => {
    const wrapper = await mountTable();
    expect(wrapper.find('.party-bar').text()).toContain('No party yet');
  });

  it('lists the members in party order and opens one on click', async () => {
    const [a, b] = [makeActor('Anna'), makeActor('Bram')];
    vi.mocked(documentsApi.listActors).mockResolvedValue([a, b]);
    vi.mocked(documentsApi.getParty).mockResolvedValue(makeParty([b.id, a.id]));

    const wrapper = await mountTable();
    const buttons = wrapper.findAll('.party-members button');
    expect(buttons.map((x) => x.text())).toEqual(['Bram', 'Anna']);

    await buttons[0]?.trigger('click');
    expect(wrapper.find('.sheet h3').text()).toBe('Bram');
    expect(buttons[0]?.attributes('aria-pressed')).toBe('true');
  });
});

describe('character roster', () => {
  it('shows an empty message, then the characters, and opens one on click', async () => {
    const empty = await mountTable();
    expect(empty.find('.roster').exists()).toBe(false);
    expect(empty.find('#sheet-pane').text()).toContain('No characters yet');

    vi.mocked(documentsApi.listActors).mockResolvedValue([makeActor('Anna')]);
    const wrapper = await mountTable();
    expect(wrapper.find('.sheet').exists()).toBe(false);
    await wrapper.find('.roster button').trigger('click');
    expect(wrapper.find('.sheet h3').text()).toBe('Anna');
  });

  it('creates a character and opens it when it arrives', async () => {
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const wrapper = await mountTable();

    await wrapper.find('#new-character-name').setValue('  Valeria  ');
    await wrapper.find('form.new-character').trigger('submit');
    await flushPromises();

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.create',
      payload: { kind: 'character', name: 'Valeria' },
    });

    const created = makeActor('Valeria');
    handlers.get('broadcast')?.({
      sequence: 1,
      operation: {
        id: 'x',
        worldId: 'w',
        type: 'actor.create',
        payload: {},
        appliedAt: '',
      },
      documents: [created],
      deleted: [],
      seats: [],
    } as never);
    await flushPromises();

    expect(wrapper.find('.sheet h3').text()).toBe('Valeria');
    expect((wrapper.find('#new-character-name').element as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('keeps the name and shows the error when the server refuses', async () => {
    vi.mocked(emitOperation).mockResolvedValue({ ok: false, error: 'nope' });
    const wrapper = await mountTable();

    await wrapper.find('#new-character-name').setValue('Valeria');
    await wrapper.find('form.new-character').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe('nope');
    expect((wrapper.find('#new-character-name').element as HTMLInputElement).value).toBe(
      'Valeria',
    );
  });

  it('closes the sheet when the open character is deleted', async () => {
    const hero = makeActor('Anna');
    vi.mocked(documentsApi.listActors).mockResolvedValue([hero]);
    const wrapper = await mountTable();
    await wrapper.find('.roster button').trigger('click');
    expect(wrapper.find('.sheet').exists()).toBe(true);

    handlers.get('broadcast')?.({
      sequence: 2,
      operation: {
        id: 'y',
        worldId: 'w',
        type: 'actor.delete',
        payload: {},
        appliedAt: '',
      },
      documents: [],
      deleted: [hero],
      seats: [],
    } as never);
    await flushPromises();

    expect(wrapper.find('.sheet').exists()).toBe(false);
  });
});

describe('editing a character', () => {
  const seat = (overrides: Partial<Seat> = {}): Seat => ({
    id: crypto.randomUUID(),
    worldId: WORLD,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });

  async function openHero(hero: Actor) {
    vi.mocked(documentsApi.listActors).mockResolvedValue([hero]);
    const wrapper = await mountTable();
    await wrapper.find('.roster button').trigger('click');
    return wrapper;
  }

  it('offers editing to the owner, shows the edit at once, and sends one actor.update', async () => {
    mySeat = seat();
    const hero = {
      ...makeActor('Anna'),
      permissions: {
        default: 'observer' as const,
        seats: { [mySeat.id]: 'owner' as const },
      },
    };
    vi.mocked(emitOperation).mockReturnValue(new Promise(() => undefined));
    const wrapper = await openHero(hero);

    await wrapper.find('.edit-toggle').trigger('click');
    const label = wrapper.findAll('label').find((l) => l.text() === 'Strength');
    await wrapper.find(`#${CSS.escape(label?.attributes('for') ?? '')}`).setValue('3');
    await flushPromises();

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.update',
      payload: { actorId: hero.id, changes: { 'system.attributes.str': 3 } },
    });
    // Optimistic: the Athletics total already reflects Str +3 (untrained: no rank bonus).
    await wrapper.find('.edit-toggle').trigger('click');
    const athletics = wrapper
      .findAll('tbody tr')
      .find((r) => r.find('th').text() === 'Athletics');
    expect(athletics?.find('.total').text()).toBe('+3');
  });

  it('offers editing to the GM on a character they do not own', async () => {
    mySeat = seat({ isGM: true });
    const wrapper = await openHero({
      ...makeActor('Anna'),
      permissions: { default: 'observer', seats: {} },
    });
    expect(wrapper.find('.edit-toggle').exists()).toBe(true);
  });

  it('offers no editing to a seat that only observes the character', async () => {
    mySeat = seat();
    const wrapper = await openHero(makeActor('Anna'));
    expect(wrapper.find('.sheet').exists()).toBe(true);
    expect(wrapper.find('.edit-toggle').exists()).toBe(false);
  });
});
