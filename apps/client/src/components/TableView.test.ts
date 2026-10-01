// @vitest-environment jsdom
import type { Actor, Party, Seat } from '@hearthtable/core';
import { newCharacterData } from '@hearthtable/pf2e';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as assetsApi from '../api/assets.js';
import * as compendiumApi from '../api/compendium.js';
import * as documentsApi from '../api/documents.js';
import { createSocket, emitOperation } from '../realtime/socket.js';
import { useConnectionStore } from '../stores/connection.js';
import { useLobbyStore } from '../stores/lobby.js';
import TableView from './TableView.vue';

// The lobby store (releasing a seat) and the chat panel are other components'
// concerns; this test is about the layout and the character roster.
vi.mock('../stores/lobby.js', () => ({ useLobbyStore: vi.fn() }));
vi.mock('../api/assets.js');
vi.mock('../api/compendium.js');
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
  vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(true);
  vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
    { packId: 'equipment', slug: 'rope', name: 'Rope', kind: 'gear', traits: [] },
  ]);
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

// Tables are attached to the document so focus can be asserted; clear them between tests.
afterEach(() => {
  document.body.innerHTML = '';
});

async function mountTable() {
  const pinia = createPinia();
  const wrapper = mount(TableView, {
    attachTo: document.body,
    props: { worldId: WORLD, seatName: 'Valeros' },
    global: { plugins: [pinia], stubs: { ChatLog: { template: '<p>chat</p>' } } },
  });
  useConnectionStore(pinia).connect();
  await flushPromises();
  return wrapper;
}

describe('layout', () => {
  it('has a party bar, a map, a character pane, and a chat pane, each a named landmark', async () => {
    const wrapper = await mountTable();
    expect(wrapper.find('nav[aria-label="Party"]').exists()).toBe(true);
    expect(wrapper.find('section[aria-label="Map"]').exists()).toBe(true);
    expect(wrapper.find('section[aria-labelledby="sheet-heading"]').exists()).toBe(true);
    expect(wrapper.find('#chat-pane').text()).toContain('chat');
  });

  it('offers a skip link to each region, and each target exists and can take focus', async () => {
    const wrapper = await mountTable();
    const hrefs = wrapper.findAll('.skip-links a').map((a) => a.attributes('href'));
    expect(hrefs).toEqual(['#party-bar', '#map-pane', '#sheet-pane', '#chat-pane']);
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

describe('map and character drawer', () => {
  const drawerOf = (wrapper: Awaited<ReturnType<typeof mountTable>>) =>
    wrapper.get('#sheet-pane').element as HTMLElement;
  const isShown = (wrapper: Awaited<ReturnType<typeof mountTable>>) =>
    drawerOf(wrapper).style.display !== 'none';

  it('puts the map first, with a plain empty state until a scene is showing', async () => {
    const wrapper = await mountTable();
    expect(wrapper.get('[data-testid="map-pane"]').text()).toContain(
      'No scene is showing yet',
    );
  });

  it('starts with the drawer closed, and out of the tab order', async () => {
    const wrapper = await mountTable();
    expect(isShown(wrapper)).toBe(false);
    const opener = wrapper.get('.map-tools button');
    expect(opener.attributes('aria-expanded')).toBe('false');
    expect(opener.attributes('aria-controls')).toBe('sheet-pane');
  });

  it('opens from the Characters button and closes from its Close button', async () => {
    const wrapper = await mountTable();
    await wrapper.get('.map-tools button').trigger('click');
    expect(isShown(wrapper)).toBe(true);
    expect(wrapper.get('.map-tools button').attributes('aria-expanded')).toBe('true');

    await wrapper.get('.drawer-close').trigger('click');
    expect(isShown(wrapper)).toBe(false);
    expect(wrapper.get('.map-tools button').attributes('aria-expanded')).toBe('false');
  });

  it('opens on that character’s sheet when a party card is pressed', async () => {
    const a = makeActor('Anna');
    vi.mocked(documentsApi.listActors).mockResolvedValue([a]);
    vi.mocked(documentsApi.getParty).mockResolvedValue(makeParty([a.id]));
    const wrapper = await mountTable();

    await wrapper.get('.party-members button').trigger('click');
    expect(isShown(wrapper)).toBe(true);
    expect(wrapper.get('.sheet h3').text()).toBe('Anna');
  });

  it('closes on Escape and puts focus back on what opened it', async () => {
    const wrapper = await mountTable();
    const opener = wrapper.get('.map-tools button').element as HTMLButtonElement;
    opener.focus();
    await wrapper.get('.map-tools button').trigger('click');
    expect(document.activeElement).toBe(drawerOf(wrapper));

    await wrapper.get('#sheet-pane').trigger('keydown', { key: 'Escape' });
    expect(isShown(wrapper)).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('opens from the skip link, and keeps what was open when it closes', async () => {
    const a = makeActor('Anna');
    vi.mocked(documentsApi.listActors).mockResolvedValue([a]);
    const wrapper = await mountTable();

    const skip = wrapper.findAll('.skip-links a').find((l) => l.text().includes('sheet'));
    await skip?.trigger('click');
    expect(isShown(wrapper)).toBe(true);

    await wrapper.get('.roster button').trigger('click');
    await wrapper.get('.drawer-close').trigger('click');
    await wrapper.get('.map-tools button').trigger('click');
    expect(wrapper.get('.sheet h3').text()).toBe('Anna');
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
    expect(buttons.map((x) => x.find('.name').text())).toEqual(['Bram', 'Anna']);

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

  it('sends actor.addItem naming only the compendium entry, from the picker', async () => {
    mySeat = seat({ isGM: true });
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const hero = makeActor('Anna');
    const wrapper = await openHero(hero);

    const details = wrapper.find('details.picker');
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger('toggle');
    await flushPromises();
    await wrapper.find('.results button').trigger('click');

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.addItem',
      payload: { actorId: hero.id, packId: 'equipment', slug: 'rope' },
    });
  });

  describe('rolling', () => {
    async function gmAtTable() {
      mySeat = seat({ isGM: true });
      vi.mocked(emitOperation).mockResolvedValue({ ok: true });
      const hero = makeActor('Anna');
      const wrapper = await openHero(hero);
      return { hero, wrapper };
    }
    const sent = () => vi.mocked(emitOperation).mock.calls.map((call) => call[1]);

    it('rolls a skill with no DC when the box is empty', async () => {
      const { hero, wrapper } = await gmAtTable();
      await wrapper.find('button[aria-label="Roll Athletics"]').trigger('click');
      expect(sent()[0]).toMatchObject({
        type: 'actor.rollCheck',
        payload: { actorId: hero.id, statistic: 'skill:athletics' },
      });
      expect(sent()[0]?.payload).not.toHaveProperty('dc');
    });

    it('rolls against the DC that was typed', async () => {
      const { hero, wrapper } = await gmAtTable();
      await wrapper.find('#roll-dc').setValue('18');
      await wrapper.find('button[aria-label="Roll Perception"]').trigger('click');
      expect(sent()[0]).toMatchObject({
        type: 'actor.rollCheck',
        payload: { actorId: hero.id, statistic: 'perception', dc: 18 },
      });
    });

    it('offers no roll controls to a seat that only observes the character', async () => {
      mySeat = seat();
      const wrapper = await openHero(makeActor('Anna'));
      expect(wrapper.find('#roll-dc').exists()).toBe(false);
      expect(wrapper.find('button[aria-label="Roll Athletics"]').exists()).toBe(false);
    });
  });

  it('sends the condition operations with the chosen slug and value', async () => {
    mySeat = seat({ isGM: true });
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
      {
        packId: 'conditions',
        slug: 'frightened',
        name: 'Frightened',
        kind: 'condition',
        traits: [],
      },
    ]);
    const hero = makeActor('Anna');
    const wrapper = await openHero(hero);

    await wrapper.find('#condition-pick').setValue('frightened');
    await wrapper.find('#condition-value').setValue('2');
    await wrapper.find('form.add-condition').trigger('submit');
    await flushPromises();

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.addCondition',
      payload: { actorId: hero.id, slug: 'frightened', value: 2 },
    });
  });

  it('applies damage as one optimistic actor.update of the hit point fields', async () => {
    mySeat = seat({ isGM: true });
    vi.mocked(emitOperation).mockReturnValue(new Promise(() => undefined));
    const base = makeActor('Anna');
    const hero = {
      ...base,
      system: {
        ...(base.system as object),
        ancestryHp: 8,
        classHp: 10,
        hp: { current: 12, temp: 0 },
      },
    };
    const wrapper = await openHero(hero);

    await wrapper.find('#hp-amount').setValue('5');
    await wrapper.find('.hp-controls').trigger('submit');
    await flushPromises();

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.update',
      payload: { actorId: hero.id, changes: { 'system.hp.current': 7 } },
    });
    expect(wrapper.find('.hp-read').text()).toBe('7 / 18');
  });

  describe('managing the party', () => {
    it('is offered to the GM and sends party.addMember for the chosen character', async () => {
      mySeat = seat({ isGM: true });
      vi.mocked(emitOperation).mockResolvedValue({ ok: true });
      const hero = makeActor('Anna');
      const wrapper = await openHero(hero);

      await wrapper.find('#party-add').setValue(hero.id);
      await wrapper.find('form.add').trigger('submit');
      await flushPromises();

      expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
        type: 'party.addMember',
        payload: { actorId: hero.id },
      });
    });

    it('is not offered to a player', async () => {
      mySeat = seat();
      const wrapper = await openHero(makeActor('Anna'));
      expect(wrapper.find('.party-manager').exists()).toBe(false);
    });
  });

  describe('portrait', () => {
    const png = () => new File([new Uint8Array([1])], 'p.png', { type: 'image/png' });
    async function choose(wrapper: Awaited<ReturnType<typeof openHero>>) {
      const input = wrapper.find('#portrait-file');
      Object.defineProperty(input.element, 'files', {
        value: [png()],
        configurable: true,
      });
      await input.trigger('change');
      await flushPromises();
    }

    it('uploads the picked image, then points the actor at the stored name', async () => {
      mySeat = seat({ isGM: true });
      const name = `${'a'.repeat(64)}.png`;
      vi.mocked(assetsApi.uploadAsset).mockResolvedValue({ name, url: '/x' });
      vi.mocked(assetsApi.isAcceptedImage).mockReturnValue(true);
      vi.mocked(emitOperation).mockReturnValue(new Promise(() => undefined));
      const hero = makeActor('Anna');
      const wrapper = await openHero(hero);

      await choose(wrapper);

      expect(assetsApi.uploadAsset).toHaveBeenCalledWith(WORLD, expect.any(File));
      expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
        type: 'actor.update',
        payload: { actorId: hero.id, changes: { portrait: name } },
      });
    });

    it('shows the server’s reason and changes nothing when the upload is refused', async () => {
      mySeat = seat({ isGM: true });
      vi.mocked(assetsApi.isAcceptedImage).mockReturnValue(true);
      vi.mocked(assetsApi.uploadAsset).mockRejectedValue(
        new Error('the file is not a valid image of that type'),
      );
      const wrapper = await openHero(makeActor('Anna'));

      await choose(wrapper);

      expect(wrapper.find('.portrait-picker [role="alert"]').text()).toBe(
        'the file is not a valid image of that type',
      );
      expect(emitOperation).not.toHaveBeenCalled();
    });
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
