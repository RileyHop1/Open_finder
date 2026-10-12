import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterBuild } from '@hearthtable/pf2e';
import { characterBuildSchema } from '@hearthtable/pf2e';

import {
  type CreationDeps,
  createCharacterFromDraft,
  newActorWaiter,
} from './createCharacter.js';

const build: CharacterBuild = characterBuildSchema.parse({
  class: { packId: 'classes', slug: 'invented-vanguard' },
});

const rope = {
  packId: 'equipment',
  slug: 'rope',
  name: 'Rope',
  priceInCopper: 10,
  quantity: 2,
};

/** A server that accepts everything except the operation types in `refuse`. */
function fakeDeps(refuse: string[] = [], arrives = true) {
  const sent: { type: string; payload: unknown }[] = [];
  const deps: CreationDeps = {
    send: (type, payload) => {
      sent.push({ type, payload });
      return Promise.resolve(!refuse.includes(type));
    },
    knownActorIds: () => new Set(['old']),
    waitForNewActor: () => Promise.resolve(arrives ? 'new-actor' : undefined),
    lastError: () => (refuse.length > 0 ? 'refused by the server' : undefined),
  };
  return { deps, sent };
}

const input = {
  name: '  Valeria ',
  build,
  keyAttribute: 'dex' as const,
  equipment: [rope],
};

describe('createCharacterFromDraft', () => {
  it('creates, applies the build, adds the gear and gives the change, in that order', async () => {
    const { deps, sent } = fakeDeps();
    const result = await createCharacterFromDraft(input, deps);

    expect(result).toEqual({ ok: true, actorId: 'new-actor' });
    expect(sent.map((s) => s.type)).toEqual([
      'actor.create',
      'actor.applyBuild',
      'actor.addItem',
      'actor.adjustCoins',
    ]);
    expect(sent[0]?.payload).toEqual({ kind: 'character', name: 'Valeria' });
    expect(sent[1]?.payload).toEqual({
      actorId: 'new-actor',
      build,
      keyAttribute: 'dex',
    });
    expect(sent[2]?.payload).toEqual({
      actorId: 'new-actor',
      packId: 'equipment',
      slug: 'rope',
      quantity: 2,
    });
    // 15 gp less 2 ropes (2 sp) = 14 gp 8 sp.
    expect(sent[3]?.payload).toEqual({
      actorId: 'new-actor',
      delta: { gp: 14, sp: 8, cp: 0 },
    });
  });

  it('names an unnamed character, and sends no key attribute that was not chosen', async () => {
    const { deps, sent } = fakeDeps();
    await createCharacterFromDraft(
      { ...input, name: ' ', keyAttribute: undefined, equipment: [] },
      deps,
    );
    expect(sent[0]?.payload).toEqual({ kind: 'character', name: 'New character' });
    expect(sent[1]?.payload).not.toHaveProperty('keyAttribute');
  });

  it('gives no change when the whole purse was spent (and none when it was overspent)', async () => {
    const { deps, sent } = fakeDeps();
    await createCharacterFromDraft(
      { ...input, equipment: [{ ...rope, priceInCopper: 1500, quantity: 1 }] },
      deps,
    );
    expect(sent.map((s) => s.type)).not.toContain('actor.adjustCoins');
  });

  it('stops at a refused create with nothing made', async () => {
    const { deps, sent } = fakeDeps(['actor.create']);
    expect(await createCharacterFromDraft(input, deps)).toEqual({
      ok: false,
      actorId: undefined,
      step: 'create',
      message: 'refused by the server',
    });
    expect(sent).toHaveLength(1);
  });

  it('says so when the new character never arrives', async () => {
    const { deps } = fakeDeps([], false);
    expect(await createCharacterFromDraft(input, deps)).toMatchObject({
      ok: false,
      actorId: undefined,
      step: 'arrive',
    });
  });

  it('keeps the character it made when a later step is refused, and names the step', async () => {
    for (const [refused, step] of [
      ['actor.applyBuild', 'build'],
      ['actor.addItem', 'equipment'],
      ['actor.adjustCoins', 'coins'],
    ] as const) {
      const { deps } = fakeDeps([refused]);
      expect(await createCharacterFromDraft(input, deps)).toMatchObject({
        ok: false,
        actorId: 'new-actor',
        step,
      });
    }
  });
});

describe('newActorWaiter', () => {
  it('resolves at once for an actor that has already arrived', async () => {
    const actors = ref([{ id: 'old' }, { id: 'fresh' }]);
    await expect(newActorWaiter(() => actors.value)(new Set(['old']))).resolves.toBe(
      'fresh',
    );
  });

  it('waits for one that arrives later', async () => {
    const actors = ref([{ id: 'old' }]);
    const waiting = newActorWaiter(() => actors.value)(new Set(['old']));
    actors.value = [...actors.value, { id: 'fresh' }];
    await expect(waiting).resolves.toBe('fresh');
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    const actors = ref([{ id: 'old' }]);
    const waiting = newActorWaiter(() => actors.value, 1000)(new Set(['old']));
    await vi.advanceTimersByTimeAsync(1001);
    await expect(waiting).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
