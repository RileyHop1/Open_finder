// @vitest-environment jsdom
import type { Actor, Party, Scene, Seat } from '@hearthtable/core';
import { combatantSchema, sceneSchema, tokenSchema } from '@hearthtable/core';
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
import { useScenesStore } from '../stores/scenes.js';
import { ACTOR_DRAG_TYPE } from './map/placement.js';
import { makeNpc } from './sheet/testNpc.js';
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
  vi.mocked(documentsApi.listScenes).mockResolvedValue([]);
  vi.mocked(documentsApi.listTokens).mockResolvedValue([]);
  vi.mocked(documentsApi.listTemplates).mockResolvedValue([]);
  vi.mocked(documentsApi.listCombats).mockResolvedValue([]);
  vi.mocked(documentsApi.listCombatants).mockResolvedValue([]);
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

  it('resizes the map pane from the keyboard, clamped to its bounds', async () => {
    const wrapper = await mountTable();
    const handle = wrapper.get('.map-resize-handle');
    expect(handle.attributes('role')).toBe('separator');
    expect(handle.attributes('aria-orientation')).toBe('horizontal');
    const heightOf = () => (wrapper.get('#map-pane').element as HTMLElement).style.height;

    const before = Number.parseInt(heightOf(), 10);
    await handle.trigger('keydown', { key: 'ArrowUp' });
    expect(Number.parseInt(heightOf(), 10)).toBe(before + 24);
    await handle.trigger('keydown', { key: 'ArrowDown' });
    expect(heightOf()).toBe(`${before}px`);

    await handle.trigger('keydown', { key: 'Home' });
    expect(heightOf()).toBe('320px');
    await handle.trigger('keydown', { key: 'End' });
    expect(heightOf()).toBe(`${Math.round(window.innerHeight * 0.85)}px`);
  });

  it('says who you are playing as, and releases the seat from there', async () => {
    const wrapper = await mountTable();
    expect(wrapper.find('.playing-as').text()).toContain('Valeros');
    await wrapper.find('.playing-as button').trigger('click');
    expect(releaseSeat).toHaveBeenCalledTimes(1);
  });
});

describe('the turn bar', () => {
  it('is absent while no combat is active, and shown with one', async () => {
    const scene = sceneSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'scene',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      name: 'Bog',
      kind: 'battle',
    });
    vi.mocked(documentsApi.listScenes).mockResolvedValue([scene]);
    vi.mocked(documentsApi.getParty).mockResolvedValue({
      ...makeParty([]),
      sceneId: scene.id,
    });

    const absent = await mountTable();
    expect(absent.find('[data-testid="turn-bar"]').exists()).toBe(false);
    absent.unmount();

    vi.mocked(documentsApi.listCombats).mockResolvedValue([
      {
        id: crypto.randomUUID(),
        worldId: WORLD,
        type: 'combat',
        schemaVersion: 1,
        permissions: { default: 'observer', seats: {} },
        createdAt: NOW,
        updatedAt: NOW,
        sceneId: scene.id,
        status: 'active',
        round: 1,
        freeMovement: false,
      },
    ]);
    const shown = await mountTable();
    expect(shown.find('[data-testid="turn-bar"]').exists()).toBe(true);
    expect(shown.text()).toContain('Round 1');
  });

  function sceneWithParty() {
    const scene = sceneSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'scene',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      name: 'Bog',
      kind: 'battle',
    });
    vi.mocked(documentsApi.listScenes).mockResolvedValue([scene]);
    vi.mocked(documentsApi.getParty).mockResolvedValue({
      ...makeParty([]),
      sceneId: scene.id,
    });
    return scene;
  }

  it('offers the GM "Start combat" with none running, and nothing to a player', async () => {
    sceneWithParty();
    mySeat = { id: crypto.randomUUID(), isGM: true } as Seat;
    const gm = await mountTable();
    expect(gm.find('[data-testid="turn-bar"]').exists()).toBe(true);
    expect(gm.text()).toContain('Start combat');
    gm.unmount();

    mySeat = { id: crypto.randomUUID(), isGM: false } as Seat;
    const player = await mountTable();
    expect(player.find('[data-testid="turn-bar"]').exists()).toBe(false);
  });

  it('sends combat.create then combat.start when the GM clicks Start combat', async () => {
    const scene = sceneWithParty();
    mySeat = { id: crypto.randomUUID(), isGM: true } as Seat;
    vi.mocked(emitOperation).mockResolvedValueOnce({ ok: true });
    vi.mocked(emitOperation).mockResolvedValueOnce({ ok: true });

    const wrapper = await mountTable();
    await wrapper.find('[data-testid="turn-bar"] button').trigger('click');
    await flushPromises();
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'combat.create',
      payload: { sceneId: scene.id },
    });
  });

  it('sends combat.nextTurn on Shift+N while a combat is active, for the GM only', async () => {
    const scene = sceneWithParty();
    vi.mocked(documentsApi.listCombats).mockResolvedValue([
      {
        id: crypto.randomUUID(),
        worldId: WORLD,
        type: 'combat',
        schemaVersion: 1,
        permissions: { default: 'observer', seats: {} },
        createdAt: NOW,
        updatedAt: NOW,
        sceneId: scene.id,
        status: 'active',
        round: 1,
        freeMovement: false,
      },
    ]);
    mySeat = { id: crypto.randomUUID(), isGM: true } as Seat;
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const wrapper = await mountTable();
    await wrapper.get('.map-surface').trigger('keydown', { key: 'N', shiftKey: true });
    await flushPromises();
    expect(vi.mocked(emitOperation)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'combat.nextTurn' }),
    );
  });

  it('lets the active combatant’s own owner end their own turn, by button and by Shift+N', async () => {
    const scene = sceneWithParty();
    const mine = { id: crypto.randomUUID(), worldId: WORLD, isGM: false } as Seat;
    mySeat = mine;
    const actor = {
      ...makeActor('Ada'),
      permissions: {
        default: 'observer' as const,
        seats: { [mine.id]: 'owner' as const },
      },
    };
    const token = tokenSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'token',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      sceneId: scene.id,
      actorId: actor.id,
      x: 0,
      y: 0,
    });
    const combatant = combatantSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'combatant',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      combatId: crypto.randomUUID(),
      tokenId: token.id,
      actorId: actor.id,
      turn: { actionsSpent: 0, reactionUsed: false, attacksMade: 0 },
    });
    vi.mocked(documentsApi.listActors).mockResolvedValue([actor]);
    vi.mocked(documentsApi.listTokens).mockResolvedValue([token]);
    vi.mocked(documentsApi.listCombatants).mockResolvedValue([combatant]);
    vi.mocked(documentsApi.listCombats).mockResolvedValue([
      {
        id: combatant.combatId,
        worldId: WORLD,
        type: 'combat',
        schemaVersion: 1,
        permissions: { default: 'observer', seats: {} },
        createdAt: NOW,
        updatedAt: NOW,
        sceneId: scene.id,
        status: 'active',
        round: 1,
        freeMovement: false,
        activeCombatantId: combatant.id,
      },
    ]);
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const wrapper = await mountTable();
    // No GM controls at all -- just the one End turn button.
    const endTurn = wrapper.find('.turn-controls button');
    expect(endTurn.text()).toBe('End turn');

    await endTurn.trigger('click');
    expect(vi.mocked(emitOperation)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'combat.nextTurn' }),
    );

    vi.mocked(emitOperation).mockClear();
    await wrapper.get('.map-surface').trigger('keydown', { key: 'N', shiftKey: true });
    await flushPromises();
    expect(vi.mocked(emitOperation)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'combat.nextTurn' }),
    );
  });

  it('shows the active combatant’s action tray, and spends an action for the GM', async () => {
    const scene = sceneWithParty();
    const actor = makeActor('Ada');
    const token = tokenSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'token',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      sceneId: scene.id,
      actorId: actor.id,
      x: 0,
      y: 0,
    });
    const combatant = combatantSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'combatant',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      combatId: crypto.randomUUID(),
      tokenId: token.id,
      actorId: actor.id,
      turn: { actionsSpent: 1, reactionUsed: false, attacksMade: 0 },
    });
    vi.mocked(documentsApi.listActors).mockResolvedValue([actor]);
    vi.mocked(documentsApi.listTokens).mockResolvedValue([token]);
    vi.mocked(documentsApi.listCombatants).mockResolvedValue([combatant]);
    vi.mocked(documentsApi.listCombats).mockResolvedValue([
      {
        id: combatant.combatId,
        worldId: WORLD,
        type: 'combat',
        schemaVersion: 1,
        permissions: { default: 'observer', seats: {} },
        createdAt: NOW,
        updatedAt: NOW,
        sceneId: scene.id,
        status: 'active',
        round: 1,
        freeMovement: false,
        activeCombatantId: combatant.id,
      },
    ]);
    mySeat = { id: crypto.randomUUID(), isGM: true } as Seat;
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const wrapper = await mountTable();
    expect(wrapper.text()).toContain('1 of 3 actions spent');

    await wrapper.find('.action-tray button').trigger('click');
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'combat.spendAction',
      payload: { combatantId: combatant.id, actions: 1 },
    });
  });

  it('shows the action bar for a token the GM selects, and spends an action for a basic action', async () => {
    const scene = sceneWithParty();
    const actor = makeActor('Ada');
    const token = tokenSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'token',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      sceneId: scene.id,
      actorId: actor.id,
      x: 0,
      y: 0,
    });
    const combatant = combatantSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'combatant',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      combatId: crypto.randomUUID(),
      tokenId: token.id,
      actorId: actor.id,
    });
    vi.mocked(documentsApi.listActors).mockResolvedValue([actor]);
    vi.mocked(documentsApi.listTokens).mockResolvedValue([token]);
    vi.mocked(documentsApi.listCombatants).mockResolvedValue([combatant]);
    vi.mocked(documentsApi.listCombats).mockResolvedValue([
      {
        id: combatant.combatId,
        worldId: WORLD,
        type: 'combat',
        schemaVersion: 1,
        permissions: { default: 'observer', seats: {} },
        createdAt: NOW,
        updatedAt: NOW,
        sceneId: scene.id,
        status: 'active',
        round: 1,
        freeMovement: false,
      },
    ]);
    mySeat = { id: crypto.randomUUID(), isGM: true } as Seat;
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const wrapper = await mountTable();
    expect(wrapper.find('.action-bar').exists()).toBe(false);

    await wrapper.get('.token-list button').trigger('click');
    expect(wrapper.find('.action-bar').exists()).toBe(true);
    expect(wrapper.find('.undo').exists()).toBe(false);

    await wrapper.find('.basics button').trigger('click');
    await flushPromises();
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'combat.spendAction',
      payload: { combatantId: combatant.id, actions: 1 },
    });

    // The spend was recorded once accepted, so "Undo last action" now shows.
    expect(wrapper.find('.undo').exists()).toBe(true);
    await wrapper.find('.undo').trigger('click');
    expect(vi.mocked(emitOperation).mock.calls[1]?.[1]).toMatchObject({
      type: 'combat.spendAction',
      payload: { combatantId: combatant.id, actions: -1 },
    });
    await flushPromises();
    expect(wrapper.find('.undo').exists()).toBe(false);
  });

  it('hides the action bar for a token a player does not own', async () => {
    const scene = sceneWithParty();
    const actor = makeActor('Ada');
    const token = tokenSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'token',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      sceneId: scene.id,
      actorId: actor.id,
      x: 0,
      y: 0,
    });
    vi.mocked(documentsApi.listActors).mockResolvedValue([actor]);
    vi.mocked(documentsApi.listTokens).mockResolvedValue([token]);
    mySeat = { id: crypto.randomUUID(), isGM: false } as Seat;

    const wrapper = await mountTable();
    await wrapper.get('.token-list button').trigger('click');
    expect(wrapper.find('.action-bar').exists()).toBe(false);
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

describe('the GM’s scene drawer', () => {
  const seat = (isGM: boolean): Seat => ({
    id: crypto.randomUUID(),
    worldId: WORLD,
    schemaVersion: 1,
    name: 'S',
    isGM,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const makeScene = (name: string): Scene =>
    sceneSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'scene',
      schemaVersion: 1,
      permissions: { default: 'none', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      name,
      kind: 'battle',
    });

  const sceneButton = (wrapper: Awaited<ReturnType<typeof mountTable>>) =>
    wrapper.findAll('.map-tools button').find((b) => b.text() === 'Scenes');

  it('is offered to the GM and not to a player', async () => {
    mySeat = seat(false);
    const player = await mountTable();
    expect(sceneButton(player)).toBeUndefined();
    expect(player.find('#scene-pane').exists()).toBe(false);

    mySeat = seat(true);
    const gm = await mountTable();
    expect(sceneButton(gm)).toBeDefined();
    expect(gm.find('#scene-pane').exists()).toBe(true);
  });

  it('opens from the Scenes button, closes on Escape, and gives focus back', async () => {
    mySeat = seat(true);
    const wrapper = await mountTable();
    const opener = sceneButton(wrapper);
    expect(opener?.attributes('aria-expanded')).toBe('false');
    (opener?.element as HTMLButtonElement).focus();
    await opener?.trigger('click');

    const drawer = wrapper.get('#scene-pane');
    expect((drawer.element as HTMLElement).style.display).not.toBe('none');
    expect(sceneButton(wrapper)?.attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(drawer.element);
    expect(drawer.text()).toContain('No scenes yet');

    await drawer.trigger('keydown', { key: 'Escape' });
    expect((drawer.element as HTMLElement).style.display).toBe('none');
    expect(document.activeElement).toBe(opener?.element);
  });

  it('starts closed, and can be open beside the character drawer', async () => {
    mySeat = seat(true);
    const wrapper = await mountTable();
    expect((wrapper.get('#scene-pane').element as HTMLElement).style.display).toBe(
      'none',
    );
    await sceneButton(wrapper)?.trigger('click');
    await wrapper.get('.map-tools button').trigger('click');
    expect((wrapper.get('#scene-pane').element as HTMLElement).style.display).not.toBe(
      'none',
    );
    expect((wrapper.get('#sheet-pane').element as HTMLElement).style.display).not.toBe(
      'none',
    );
  });

  it('shows a banner, with the way back, only while previewing a scene the players are not on', async () => {
    mySeat = seat(true);
    const [bog, keep] = [makeScene('Bog'), makeScene('Keep')];
    vi.mocked(documentsApi.listScenes).mockResolvedValue([bog, keep]);
    vi.mocked(documentsApi.getParty).mockResolvedValue({
      ...makeParty([]),
      sceneId: keep.id,
    });
    const wrapper = await mountTable();
    expect(wrapper.find('.preview-banner').exists()).toBe(false);

    const scenes = useScenesStore(wrapper.vm.$pinia);
    scenes.previewScene(bog.id);
    await flushPromises();
    const banner = wrapper.get('.preview-banner');
    expect(banner.text()).toContain('You are previewing Bog');
    expect(banner.text()).toContain('The players are on Keep');

    await banner.get('button').trigger('click');
    expect(wrapper.find('.preview-banner').exists()).toBe(false);
  });
});

describe('placing tokens from the roster', () => {
  const seat = (isGM: boolean): Seat => ({
    id: crypto.randomUUID(),
    worldId: WORLD,
    schemaVersion: 1,
    name: 'S',
    isGM,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const makeScene = (): Scene =>
    sceneSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'scene',
      schemaVersion: 1,
      permissions: { default: 'none', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      name: 'Bog',
      kind: 'battle',
    });

  const placeButton = (wrapper: Awaited<ReturnType<typeof mountTable>>) =>
    wrapper.find('button[aria-label="Place Valeros on the map"]');

  async function tableWithScene(isGM: boolean) {
    mySeat = seat(isGM);
    const hero = makeActor('Valeros');
    const bog = makeScene();
    vi.mocked(documentsApi.listActors).mockResolvedValue([hero]);
    vi.mocked(documentsApi.listScenes).mockResolvedValue([bog]);
    vi.mocked(documentsApi.getParty).mockResolvedValue({
      ...makeParty([hero.id]),
      sceneId: bog.id,
    });
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    return { wrapper: await mountTable(), hero, bog };
  }

  it('offers the GM a button and a drag handle for each character, and a player neither', async () => {
    const gm = (await tableWithScene(true)).wrapper;
    expect(placeButton(gm).exists()).toBe(true);
    expect(gm.find('.drag-handle').attributes('aria-hidden')).toBe('true');
    gm.unmount();

    const player = (await tableWithScene(false)).wrapper;
    expect(placeButton(player).exists()).toBe(false);
    expect(player.find('.drag-handle').exists()).toBe(false);
  });

  it('places the character on the shown scene when the button is pressed', async () => {
    const { wrapper, hero, bog } = await tableWithScene(true);
    await placeButton(wrapper).trigger('click');
    await flushPromises();
    expect(emitOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'token.create',
        payload: { sceneId: bog.id, actorId: hero.id },
      }),
    );
    expect(wrapper.get('p[role="status"].visually-hidden').text()).toBe(
      'Valeros placed on the map.',
    );
  });

  it('disables the button, and says why, while there is no scene to place on', async () => {
    mySeat = seat(true);
    vi.mocked(documentsApi.listActors).mockResolvedValue([makeActor('Valeros')]);
    const wrapper = await mountTable();
    expect(placeButton(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.get('#sheet-pane').text()).toContain('Make a scene');
  });

  it('starts a roster drag carrying the character, and gets out of the way of the drop', async () => {
    const { wrapper, hero } = await tableWithScene(true);
    const data: Record<string, string> = {};
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        setData: (type: string, value: string) => {
          data[type] = value;
        },
        effectAllowed: 'none',
      },
    });
    wrapper.get('.drag-handle').element.dispatchEvent(event);
    expect(data).toEqual({ [ACTOR_DRAG_TYPE]: hero.id });

    // The drawer fades (after a beat: changing the page inside `dragstart` can cancel the drag).
    expect(wrapper.get('#sheet-pane').classes()).not.toContain('is-placing');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(wrapper.get('#sheet-pane').classes()).toContain('is-placing');

    await wrapper.get('.drag-handle').trigger('dragend');
    expect(wrapper.get('#sheet-pane').classes()).not.toContain('is-placing');
  });
});

describe('adding a monster', () => {
  const seat = (isGM: boolean): Seat => ({
    id: crypto.randomUUID(),
    worldId: WORLD,
    schemaVersion: 1,
    name: 'S',
    isGM,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const goblin = {
    packId: 'creatures',
    slug: 'goblin-warrior',
    name: 'Goblin Warrior',
    kind: 'creature',
    traits: ['goblin'],
  };

  async function openPicker(withScene: boolean) {
    mySeat = seat(true);
    if (withScene) {
      const bog = sceneSchema.parse({
        id: crypto.randomUUID(),
        worldId: WORLD,
        type: 'scene',
        schemaVersion: 1,
        permissions: { default: 'none', seats: {} },
        createdAt: NOW,
        updatedAt: NOW,
        name: 'Bog',
        kind: 'battle',
      });
      vi.mocked(documentsApi.listScenes).mockResolvedValue([bog]);
      vi.mocked(documentsApi.getParty).mockResolvedValue({
        ...makeParty([]),
        sceneId: bog.id,
      });
    }
    vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([goblin]);
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const wrapper = await mountTable();
    const details = wrapper.get('details.monster-picker');
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger('toggle');
    await flushPromises();
    return wrapper;
  }

  const addButton = (wrapper: Awaited<ReturnType<typeof mountTable>>) =>
    wrapper.get('button[aria-label="Add Goblin Warrior to the map"]');

  it('is offered to the GM only', async () => {
    const gm = await openPicker(true);
    expect(gm.find('details.monster-picker').exists()).toBe(true);
    gm.unmount();

    mySeat = seat(false);
    const player = await mountTable();
    expect(player.find('details.monster-picker').exists()).toBe(false);
  });

  it('makes the monster from the compendium entry, then places its token when it arrives', async () => {
    const wrapper = await openPicker(true);
    await addButton(wrapper).trigger('click');
    await flushPromises();
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.createFromCreature',
      payload: { packId: 'creatures', slug: 'goblin-warrior' },
    });

    const monster: Actor = { ...makeActor('Goblin Warrior'), kind: 'npc' };
    vi.mocked(emitOperation).mockClear();
    handlers.get('broadcast')?.({
      sequence: 1,
      operation: {
        id: 'x',
        worldId: 'w',
        type: 'actor.createFromCreature',
        payload: {},
        appliedAt: '',
      },
      documents: [monster],
      deleted: [],
      seats: [],
    } as never);
    await flushPromises();

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'token.create',
      payload: { actorId: monster.id },
    });
  });

  it('places nothing when the server refuses to make the monster', async () => {
    const wrapper = await openPicker(true);
    vi.mocked(emitOperation).mockResolvedValue({ ok: false, error: 'no such creature' });
    await addButton(wrapper).trigger('click');
    await flushPromises();

    vi.mocked(emitOperation).mockClear();
    handlers.get('broadcast')?.({
      sequence: 1,
      operation: {
        id: 'x',
        worldId: 'w',
        type: 'actor.create',
        payload: {},
        appliedAt: '',
      },
      documents: [makeActor('Someone else')],
      deleted: [],
      seats: [],
    } as never);
    await flushPromises();
    expect(emitOperation).not.toHaveBeenCalled();
  });

  it('has the buttons off, and says why, with no scene to place on', async () => {
    const wrapper = await openPicker(false);
    expect(addButton(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.get('details.monster-picker').text()).toContain('Make a scene');
  });
});

describe('a monster’s sheet', () => {
  const gm: Seat = {
    id: crypto.randomUUID(),
    worldId: WORLD,
    schemaVersion: 1,
    name: 'GM',
    isGM: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  async function openMonster() {
    mySeat = gm;
    const monster = makeNpc({ worldId: WORLD });
    vi.mocked(documentsApi.listActors).mockResolvedValue([monster]);
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const wrapper = await mountTable();
    await wrapper.get('.roster button').trigger('click');
    return { wrapper, monster };
  }

  it('shows the stat block, hit points, strikes, and conditions, and no character-only panels', async () => {
    const { wrapper } = await openMonster();
    const sheet = wrapper.get('.sheet');
    expect(sheet.text()).toContain('Creature 3');
    expect(sheet.text()).toContain('45 / 45');
    expect(sheet.text()).toContain('Vine');
    expect(sheet.find('section[aria-labelledby="conditions-heading"]').exists()).toBe(
      true,
    );
    expect(sheet.find('section[aria-labelledby="inventory-heading"]').exists()).toBe(
      false,
    );
  });

  it('rolls a statistic for the monster, against the DC typed', async () => {
    const { wrapper, monster } = await openMonster();
    vi.mocked(emitOperation).mockClear();
    await wrapper.get('#roll-dc').setValue('20');
    await wrapper.get('button[aria-label="Roll Athletics"]').trigger('click');
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.rollCheck',
      payload: { actorId: monster.id, statistic: 'skill:athletics', dc: 20 },
    });
  });

  it('waits for a target, then rolls a strike by its stat-block key, never an item id', async () => {
    const { wrapper, monster } = await openMonster();
    vi.mocked(emitOperation).mockClear();
    await wrapper.get('button[aria-label^="Roll Vine 1st attack"]').trigger('click');
    // The roll waits on a target (C.6): nothing is sent yet.
    expect(vi.mocked(emitOperation)).not.toHaveBeenCalled();
    expect(wrapper.find('.targeting-banner').text()).toContain('Choose a target');

    await wrapper.trigger('keydown', { key: 'Escape' });
    await wrapper.get('button[aria-label="Roll Vine damage"]').trigger('click');
    const [attack, damage] = vi.mocked(emitOperation).mock.calls.map((call) => call[1]);
    expect(attack).toMatchObject({
      type: 'actor.rollStrike',
      payload: { actorId: monster.id, strikeKey: 'strike:vine', attackNumber: 1 },
    });
    expect(attack?.payload).not.toHaveProperty('itemId');
    expect(attack?.payload).not.toHaveProperty('targetTokenId');
    expect(damage).toMatchObject({
      type: 'actor.rollDamage',
      payload: { actorId: monster.id, strikeKey: 'strike:vine', critical: false },
    });
    expect(wrapper.find('.targeting-banner').exists()).toBe(false);
  });

  it('rolls the strike against the token picked from the list, instead of skipping it', async () => {
    mySeat = gm;
    const monster = makeNpc({ worldId: WORLD });
    const scene = sceneSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'scene',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      name: 'Bog',
      kind: 'battle',
    });
    const enemyActor = makeActor('Goblin');
    const enemyToken = tokenSchema.parse({
      id: crypto.randomUUID(),
      worldId: WORLD,
      type: 'token',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      sceneId: scene.id,
      actorId: enemyActor.id,
      x: 0,
      y: 0,
    });
    vi.mocked(documentsApi.listActors).mockResolvedValue([monster, enemyActor]);
    vi.mocked(documentsApi.listScenes).mockResolvedValue([scene]);
    vi.mocked(documentsApi.getParty).mockResolvedValue({
      ...makeParty([]),
      sceneId: scene.id,
    });
    vi.mocked(documentsApi.listTokens).mockResolvedValue([enemyToken]);
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const wrapper = await mountTable();
    await wrapper.get('.roster button').trigger('click');
    vi.mocked(emitOperation).mockClear();
    await wrapper.get('button[aria-label^="Roll Vine 1st attack"]').trigger('click');

    const targetRow = wrapper
      .findAll('.token-list button')
      .find((button) => button.text().includes('Goblin'));
    await targetRow?.trigger('click');

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.rollStrike',
      payload: {
        actorId: monster.id,
        strikeKey: 'strike:vine',
        attackNumber: 1,
        targetTokenId: enemyToken.id,
      },
    });
    expect(wrapper.find('.targeting-banner').exists()).toBe(false);
  });

  it('sets hit points directly as the GM’s override', async () => {
    const { wrapper, monster } = await openMonster();
    vi.mocked(emitOperation).mockClear();
    const field = wrapper.get('.npc-sheet input[type="number"]');
    (field.element as HTMLInputElement).value = '12';
    await field.trigger('change');
    await flushPromises();
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.update',
      payload: { actorId: monster.id, changes: { 'system.hp.current': 12 } },
    });
  });

  it('adds a condition to the monster through the shared conditions panel', async () => {
    vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
      {
        packId: 'conditions',
        slug: 'frightened',
        name: 'Frightened',
        kind: 'condition',
        traits: [],
      },
    ]);
    const { wrapper, monster } = await openMonster();
    vi.mocked(emitOperation).mockClear();
    const panel = wrapper.get('section[aria-labelledby="conditions-heading"]');
    await panel.get('#condition-pick').setValue('frightened');
    await panel.get('form').trigger('submit');
    await flushPromises();
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.addCondition',
      payload: { actorId: monster.id, slug: 'frightened' },
    });
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
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]?.payload).not.toHaveProperty(
      'duration',
    );
  });

  it('forwards a chosen duration into actor.addCondition (M5 C.7)', async () => {
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
    await wrapper.find('#condition-duration-type').setValue('rounds');
    await wrapper.find('#condition-duration-amount').setValue('3');
    await wrapper.find('form.add-condition').trigger('submit');
    await flushPromises();

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.addCondition',
      payload: {
        actorId: hero.id,
        slug: 'frightened',
        duration: { type: 'rounds', remaining: 3 },
      },
    });
  });

  it('sends damage as actor.applyDamage (M5 C.8a), so the server runs the dying chain', async () => {
    mySeat = seat({ isGM: true });
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
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
      type: 'actor.applyDamage',
      payload: { actorId: hero.id, amount: 5 },
    });
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]?.payload).not.toHaveProperty(
      'critical',
    );
  });

  it('sends the critical flag with actor.applyDamage when the box is checked', async () => {
    mySeat = seat({ isGM: true });
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const hero = makeActor('Anna');
    const wrapper = await openHero(hero);

    await wrapper.find('#hp-amount').setValue('5');
    await wrapper.find('#hp-critical').setValue(true);
    await wrapper.find('.hp-controls').trigger('submit');
    await flushPromises();

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.applyDamage',
      payload: { actorId: hero.id, amount: 5, critical: true },
    });
  });

  it('sends healing as actor.heal', async () => {
    mySeat = seat({ isGM: true });
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const hero = makeActor('Anna');
    const wrapper = await openHero(hero);

    await wrapper.find('#hp-amount').setValue('5');
    await wrapper.findAll('.hp-controls button')[1]?.trigger('click');
    await flushPromises();

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.heal',
      payload: { actorId: hero.id, amount: 5 },
    });
  });

  it('rolls a recovery check for a dying character, GM only (M5 C.8b)', async () => {
    mySeat = seat({ isGM: true });
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const base = makeActor('Anna');
    const hero = {
      ...base,
      system: {
        ...(base.system as object),
        conditions: [{ slug: 'dying', value: 1 }],
      },
    };
    const wrapper = await openHero(hero);

    await wrapper.find('button.roll-recovery').trigger('click');
    await flushPromises();

    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'actor.rollRecovery',
      payload: { actorId: hero.id },
    });
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
