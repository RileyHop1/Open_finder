<script setup lang="ts">
/**
 * The GM's scene manager: every scene, with what the GM does to a scene --
 * make one (a name and a kind), edit it (`SceneEditor`), look at it privately,
 * move the party to it, or delete it. The party follows one scene (ADR 0017),
 * and "Move party here" is how the GM moves it; the table's view follows
 * everyone's.
 *
 * **Preview is local.** "Preview" changes only what this GM's browser shows, so
 * a scene can be built and checked while the players stay where they are;
 * "Edit" previews the scene too, because the grid is lined up by eye. The table
 * shows a banner while a preview is on, with the way back.
 *
 * Nothing here is optimistic: the server decides (a new scene's defaults, what a
 * deletion takes with it), and the result arrives as a broadcast.
 */
import { SCENE_KINDS, type SceneKind } from '@hearthtable/core';
import { computed, ref, watch } from 'vue';

import { useScenesStore } from '../../stores/scenes.js';
import SceneEditor from './SceneEditor.vue';

defineProps<{ worldId: string }>();

const scenes = useScenesStore();

const KIND_LABELS: Record<SceneKind, string> = {
  area: 'Area',
  battle: 'Battle map',
  overworld: 'Overworld',
};

const name = ref('');
const kind = ref<SceneKind>('area');
const editingId = ref<string>();
const deletingId = ref<string>();
/** Set while a create is in flight, so the new scene is opened for editing when it arrives. */
const openNextNew = ref(false);

const editing = computed(() =>
  scenes.scenes.find((scene) => scene.id === editingId.value),
);

// A deleted scene cannot stay open, and a new one opens straight into its settings.
watch(
  () => scenes.scenes,
  (current, previous) => {
    if (editingId.value !== undefined && !current.some((s) => s.id === editingId.value)) {
      editingId.value = undefined;
    }
    if (openNextNew.value) {
      const known = new Set(previous.map((s) => s.id));
      const created = current.find((s) => !known.has(s.id));
      if (created !== undefined) {
        openNextNew.value = false;
        edit(created.id);
      }
    }
  },
);

async function create(): Promise<void> {
  const trimmed = name.value.trim();
  if (trimmed === '') {
    return;
  }
  openNextNew.value = true;
  if (await scenes.send('scene.create', { name: trimmed, kind: kind.value })) {
    name.value = '';
  } else {
    openNextNew.value = false;
  }
}

/** Opens a scene's settings and shows it on the map, so changes are seen as they are made. */
function edit(sceneId: string): void {
  editingId.value = editingId.value === sceneId ? undefined : sceneId;
  if (editingId.value !== undefined) {
    scenes.previewScene(sceneId);
  }
}

function preview(sceneId: string): void {
  scenes.previewScene(scenes.shownSceneId === sceneId ? undefined : sceneId);
}

async function moveParty(sceneId: string): Promise<void> {
  if (await scenes.send('scene.activate', { sceneId })) {
    // The party is there now, so there is nothing left to preview.
    scenes.previewScene(undefined);
  }
}

async function remove(sceneId: string): Promise<void> {
  deletingId.value = undefined;
  await scenes.send('scene.delete', { sceneId });
}

function change(changes: Record<string, unknown>): void {
  if (editingId.value !== undefined) {
    void scenes.send('scene.update', { sceneId: editingId.value, changes });
  }
}
</script>

<template>
  <div class="scene-manager">
    <ul v-if="scenes.scenes.length > 0" class="scene-list">
      <li v-for="scene in scenes.scenes" :key="scene.id" class="scene-row">
        <p class="scene-title">
          <strong>{{ scene.name }}</strong>
          <span class="kind">{{ KIND_LABELS[scene.kind] }}</span>
          <span v-if="scene.id === scenes.partySceneId" class="badge">Party is here</span>
          <span
            v-if="scene.id === scenes.shownSceneId && scenes.isPreviewing"
            class="badge"
          >
            Previewing
          </span>
        </p>
        <p class="actions">
          <button
            type="button"
            :disabled="scene.id === scenes.partySceneId"
            @click="moveParty(scene.id)"
          >
            Move party here
          </button>
          <button
            type="button"
            :aria-pressed="scene.id === scenes.shownSceneId && scenes.isPreviewing"
            :disabled="scene.id === scenes.partySceneId"
            @click="preview(scene.id)"
          >
            Preview
          </button>
          <button
            type="button"
            :aria-pressed="scene.id === editingId"
            @click="edit(scene.id)"
          >
            Edit
          </button>
          <button
            v-if="deletingId !== scene.id"
            type="button"
            :aria-label="`Delete ${scene.name}`"
            @click="deletingId = scene.id"
          >
            Delete
          </button>
        </p>
        <p v-if="deletingId === scene.id" class="confirm" role="alert">
          Delete <strong>{{ scene.name }}</strong
          >? Its tokens go with it.
          <button type="button" class="danger" @click="remove(scene.id)">Delete</button>
          <button type="button" @click="deletingId = undefined">Keep it</button>
        </p>
      </li>
    </ul>
    <p v-else class="empty">No scenes yet. Make one below.</p>

    <SceneEditor v-if="editing" :scene="editing" :world-id="worldId" @change="change" />

    <form class="new-scene" @submit.prevent="create">
      <p>
        <label for="new-scene-name">New scene name</label>
        <input id="new-scene-name" v-model="name" type="text" required maxlength="100" />
      </p>
      <p>
        <label for="new-scene-kind">Kind</label>
        <select id="new-scene-kind" v-model="kind">
          <option v-for="value in SCENE_KINDS" :key="value" :value="value">
            {{ KIND_LABELS[value] }}
          </option>
        </select>
      </p>
      <button type="submit">Create scene</button>
    </form>
  </div>
</template>

<style scoped>
.scene-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding: 0;
  list-style: none;
}

.scene-row {
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.scene-title,
.actions,
.confirm,
.new-scene p {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-1) 0;
}

.kind {
  color: var(--color-text-muted);
}

/* A word, so it is never colour alone. */
.badge {
  padding: 0 var(--space-2);
  border: 1px solid var(--color-accent);
  border-radius: 999px;
  font-size: 0.85rem;
}

button,
input,
select {
  min-height: var(--touch-target-min);
}

button[aria-pressed='true'] {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.danger {
  background: var(--color-danger);
  color: var(--color-accent-contrast);
}

.empty {
  color: var(--color-text-muted);
}

.new-scene {
  margin-top: var(--space-3);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-2);
}
</style>
