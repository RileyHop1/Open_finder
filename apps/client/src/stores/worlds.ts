/**
 * The GM's campaign list: every world that exists, which one (if any) is
 * currently active, and the actions to create or activate one. Backed by
 * plain REST (`../api/worlds.ts`), not a realtime operation -- this is setup
 * done before anyone connects over the socket, not gameplay.
 */

import type { World } from '@hearthtable/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

import {
  activateWorld,
  createWorld,
  deactivateWorld,
  deleteWorld,
  getActiveWorld,
  listWorlds,
} from '../api/worlds.js';

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

export const useWorldsStore = defineStore('worlds', () => {
  const worlds = ref<World[]>([]);
  const activeWorldId = ref<string>();
  const loading = ref(false);
  const error = ref<string>();

  /** Loads every campaign and which one is active. Safe to call repeatedly (the GM revisiting this screen). */
  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = undefined;
    try {
      const [allWorlds, active] = await Promise.all([listWorlds(), getActiveWorld()]);
      worlds.value = allWorlds;
      activeWorldId.value = active?.id;
    } catch (caught) {
      error.value = messageOf(caught, 'failed to load campaigns');
    } finally {
      loading.value = false;
    }
  }

  /** Creates a new campaign and adds it to the list. Does not activate it. */
  async function create(name: string): Promise<void> {
    error.value = undefined;
    try {
      const world = await createWorld(name);
      worlds.value = [...worlds.value, world];
    } catch (caught) {
      error.value = messageOf(caught, 'failed to create campaign');
    }
  }

  /** Activates `id`, making it the campaign the server serves to connecting clients. */
  async function activate(id: string): Promise<void> {
    error.value = undefined;
    try {
      const world = await activateWorld(id);
      activeWorldId.value = world.id;
    } catch (caught) {
      error.value = messageOf(caught, 'failed to activate campaign');
    }
  }

  /** Leaves the active campaign: back to the campaign list, for everyone at the table. */
  async function deactivate(): Promise<void> {
    error.value = undefined;
    try {
      await deactivateWorld();
      activeWorldId.value = undefined;
    } catch (caught) {
      error.value = messageOf(caught, 'failed to leave the campaign');
    }
  }

  /** Permanently deletes campaign `id` and removes it from the list. Refused while it is the active campaign. */
  async function remove(id: string): Promise<void> {
    error.value = undefined;
    try {
      await deleteWorld(id);
      worlds.value = worlds.value.filter((world) => world.id !== id);
    } catch (caught) {
      error.value = messageOf(caught, 'failed to delete campaign');
    }
  }

  return {
    worlds,
    activeWorldId,
    loading,
    error,
    refresh,
    create,
    activate,
    deactivate,
    remove,
  };
});
