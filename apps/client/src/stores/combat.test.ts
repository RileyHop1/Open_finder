// @vitest-environment jsdom
import type {
  Actor,
  BaseDocument,
  Combat,
  Combatant,
  Party,
  Scene,
  Token,
} from '@hearthtable/core';
import {
  actorSchema,
  combatSchema,
  combatantSchema,
  partySchema,
  sceneSchema,
  tokenSchema,
} from '@hearthtable/core';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import * as documentsApi from '../api/documents.js';
import { createSocket, emitOperation } from '../realtime/socket.js';
import { useCombatStore } from './combat.js';
import { useConnectionStore } from './connection.js';
import { useDocumentsStore } from './documents.js';
import { useScenesStore } from './scenes.js';

vi.mock('../api/documents.js');
vi.mock('../realtime/socket.js');

type Handler = (...args: never[]) => void;

const NOW = '2026-10-01T00:00:00.000Z';
const WORLD = crypto.randomUUID();

const base = (type: string) => ({
  id: crypto.randomUUID(),
  worldId: WORLD,
  type,
  schemaVersion: 1,
  permissions: { default: 'observer', seats: {} },
  createdAt: NOW,
  updatedAt: NOW,
});

const makeScene = (): Scene =>
  sceneSchema.parse({ ...base('scene'), name: 'Bog', kind: 'battle' });

const makeActor = (name: string, kind: 'character' | 'npc' = 'npc'): Actor =>
  actorSchema.parse({
    ...base('actor'),
    kind,
    name,
    system: kind === 'character' ? { conditions: [], items: [] } : { conditions: [] },
  });

const makeToken = (sceneId: string, actorId: string): Token =>
  tokenSchema.parse({ ...base('token'), sceneId, actorId, x: 150, y: 250 });

const makeCombatant = (
  combatId: string,
  tokenId: string,
  actorId: string,
  fields: Partial<Combatant> = {},
): Combatant =>
  combatantSchema.parse({
    ...base('combatant'),
    combatId,
    tokenId,
    actorId,
    ...fields,
  });

const makeCombat = (sceneId: string, fields: Partial<Combat> = {}): Combat =>
  combatSchema.parse({
    ...base('combat'),
    sceneId,
    status: 'active',
    round: 1,
    ...fields,
  });

const makeParty = (sceneId: string): Party =>
  partySchema.parse({
    ...base('party'),
    name: 'Party',
    memberIds: [],
    level: 1,
    sceneId,
  });

const tombstone = (document: BaseDocument): BaseDocument => ({ ...document });

let handlers: Map<string, Handler>;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  handlers = new Map();
  vi.mocked(createSocket).mockReturnValue({
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
  } as never);
  vi.mocked(documentsApi.listActors).mockResolvedValue([]);
  vi.mocked(documentsApi.getParty).mockResolvedValue(undefined);
  vi.mocked(documentsApi.listScenes).mockResolvedValue([]);
  vi.mocked(documentsApi.listTokens).mockResolvedValue([]);
  vi.mocked(documentsApi.listCombats).mockResolvedValue([]);
  vi.mocked(documentsApi.listCombatants).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function broadcast(
  documents: unknown[],
  deleted: BaseDocument[] = [],
): Promise<void> {
  handlers.get('broadcast')?.({
    sequence: 1,
    operation: { id: 'op', worldId: 'w', type: 'x', payload: {}, appliedAt: '' },
    documents,
    deleted,
    seats: [],
  } as never);
  await nextTick();
}

/** Two combatants, rolled 10 and 5, the 10 active, on the party's scene. */
async function table() {
  const scene = makeScene();
  const hero = makeActor('Ada', 'character');
  const goblin = makeActor('Goblin');
  const heroToken = makeToken(scene.id, hero.id);
  const goblinToken = makeToken(scene.id, goblin.id);
  const combat = makeCombat(scene.id);
  const fast = makeCombatant(combat.id, heroToken.id, hero.id, { initiative: 10 });
  const slow = makeCombatant(combat.id, goblinToken.id, goblin.id, { initiative: 5 });
  const active = { ...combat, activeCombatantId: fast.id };

  vi.mocked(documentsApi.listActors).mockResolvedValue([hero, goblin]);
  vi.mocked(documentsApi.getParty).mockResolvedValue(makeParty(scene.id));
  vi.mocked(documentsApi.listScenes).mockResolvedValue([scene]);
  vi.mocked(documentsApi.listTokens).mockResolvedValue([heroToken, goblinToken]);
  vi.mocked(documentsApi.listCombats).mockResolvedValue([active]);
  vi.mocked(documentsApi.listCombatants).mockResolvedValue([fast, slow]);

  const connection = useConnectionStore();
  connection.connect();
  const documents = useDocumentsStore();
  const scenes = useScenesStore();
  const store = useCombatStore();
  await documents.load(WORLD);
  await scenes.load(WORLD);
  await store.load(WORLD);
  return {
    store,
    scene,
    combat: active,
    fast,
    slow,
    hero,
    goblin,
    heroToken,
    goblinToken,
  };
}

describe('activeCombat and order', () => {
  it('finds the unfinished combat on the shown scene and orders by initiative', async () => {
    const { store, combat, fast, slow } = await table();
    expect(store.activeCombat).toEqual(combat);
    expect(store.order.map((c) => c.id)).toEqual([fast.id, slow.id]);
    expect(store.activeCombatant?.id).toBe(fast.id);
    expect(store.activeIsUnseen).toBe(false);
  });

  it('sees nobody when there is no combat on the shown scene', async () => {
    const store = useCombatStore();
    const connection = useConnectionStore();
    connection.connect();
    await store.load(WORLD);
    expect(store.activeCombat).toBeUndefined();
    expect(store.order).toEqual([]);
  });

  it('leaves out an ended combat', async () => {
    const { store, combat } = await table();
    await broadcast([{ ...combat, status: 'ended' }]);
    expect(store.activeCombat).toBeUndefined();
  });

  it('says someone unseen is acting when the active combatant never arrived', async () => {
    const { store, combat, fast } = await table();
    await broadcast([{ ...combat, activeCombatantId: crypto.randomUUID() }], []);
    void fast;
    expect(store.activeIsUnseen).toBe(true);
  });

  it('removes a combatant on its tombstone', async () => {
    const { store, slow } = await table();
    await broadcast([], [tombstone(slow)]);
    expect(store.order.map((c) => c.id)).not.toContain(slow.id);
  });

  it('reloads from the server after a reconnect', async () => {
    const { store, combat } = await table();
    vi.mocked(documentsApi.listCombats).mockResolvedValue([{ ...combat, round: 2 }]);
    handlers.get('connect')?.();
    await nextTick();
    await nextTick();
    expect(store.activeCombat?.round).toBe(2);
  });
});

describe('the GM’s controls', () => {
  async function emptyTable() {
    const scene = makeScene();
    vi.mocked(documentsApi.getParty).mockResolvedValue(makeParty(scene.id));
    vi.mocked(documentsApi.listScenes).mockResolvedValue([scene]);

    const connection = useConnectionStore();
    connection.connect();
    await useDocumentsStore().load(WORLD);
    await useScenesStore().load(WORLD);
    const store = useCombatStore();
    await store.load(WORLD);
    return { store, scene };
  }

  it('creates and starts a combat when none exists yet, in one call', async () => {
    const { store, scene } = await emptyTable();
    const created = makeCombat(scene.id, { status: 'pending', round: 0 });
    vi.mocked(emitOperation).mockImplementationOnce(async () => {
      await broadcast([created]);
      return { ok: true };
    });
    vi.mocked(emitOperation).mockResolvedValueOnce({ ok: true });

    expect(await store.startCombat()).toBe(true);
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'combat.create',
      payload: { sceneId: scene.id },
    });
    expect(vi.mocked(emitOperation).mock.calls[1]?.[1]).toMatchObject({
      type: 'combat.start',
      payload: { combatId: created.id },
    });
  });

  it('starts straight away when an unfinished combat already exists', async () => {
    const { store, scene } = await emptyTable();
    const pending = makeCombat(scene.id, { status: 'pending', round: 0 });
    await broadcast([pending]);
    vi.mocked(emitOperation).mockResolvedValueOnce({ ok: true });

    expect(await store.startCombat()).toBe(true);
    expect(emitOperation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'combat.start',
      payload: { combatId: pending.id },
    });
  });

  it('surfaces a rejected combat.create and never calls combat.start', async () => {
    const { store } = await emptyTable();
    vi.mocked(emitOperation).mockResolvedValueOnce({ ok: false, error: 'not the GM' });

    expect(await store.startCombat()).toBe(false);
    expect(store.error).toBe('not the GM');
    expect(emitOperation).toHaveBeenCalledTimes(1);
  });

  it('does nothing with no scene shown', async () => {
    const store = useCombatStore();
    const connection = useConnectionStore();
    connection.connect();
    await store.load(WORLD);
    expect(await store.startCombat()).toBe(false);
    expect(emitOperation).not.toHaveBeenCalled();
  });

  it('sends the active combat’s id for end, next and previous turn', async () => {
    const { store, combat } = await table();
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    await store.endCombat();
    await store.nextTurn();
    await store.previousTurn();
    expect(vi.mocked(emitOperation).mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ type: 'combat.end', payload: { combatId: combat.id } }),
      expect.objectContaining({
        type: 'combat.nextTurn',
        payload: { combatId: combat.id },
      }),
      expect.objectContaining({
        type: 'combat.previousTurn',
        payload: { combatId: combat.id },
      }),
    ]);
  });

  it('is a no-op for end, next and previous turn with no active combat', async () => {
    const { store } = await emptyTable();
    expect(await store.endCombat()).toBe(false);
    expect(await store.nextTurn()).toBe(false);
    expect(await store.previousTurn()).toBe(false);
    expect(emitOperation).not.toHaveBeenCalled();
  });
});

describe('adding combatants and overriding initiative', () => {
  it('finds a combatant by its token, or not', async () => {
    const { store, fast, heroToken, goblinToken } = await table();
    expect(store.combatantByToken(heroToken.id)?.id).toBe(fast.id);
    expect(store.combatantByToken(goblinToken.id)).toBeDefined();
    expect(store.combatantByToken(crypto.randomUUID())).toBeUndefined();
  });

  it('sends combat.addCombatant with the active combat’s id, token and hidden flag', async () => {
    const { store, combat } = await table();
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const tokenId = crypto.randomUUID();

    expect(await store.addCombatant(tokenId, true)).toBe(true);
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'combat.addCombatant',
      payload: { combatId: combat.id, tokenId, hidden: true },
    });
  });

  it('is a no-op for addCombatant with no active combat', async () => {
    const store = useCombatStore();
    const connection = useConnectionStore();
    connection.connect();
    await store.load(WORLD);
    expect(await store.addCombatant(crypto.randomUUID(), false)).toBe(false);
    expect(emitOperation).not.toHaveBeenCalled();
  });

  it('sends combat.setInitiative for a combatant', async () => {
    const { store, fast } = await table();
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    expect(await store.setInitiative(fast.id, 18)).toBe(true);
    expect(vi.mocked(emitOperation).mock.calls[0]?.[1]).toMatchObject({
      type: 'combat.setInitiative',
      payload: { combatantId: fast.id, initiative: 18 },
    });
  });
});
