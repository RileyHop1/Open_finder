<script setup lang="ts">
/**
 * One scene's settings for the GM: name, kind, the map picture, its size, and the
 * grid (type, cell size, feet per cell, offset). Each field saves the moment it
 * changes, as one small `scene.update`, so two edits to different fields never
 * overwrite each other (ADR 0005: last write wins per field), and the GM sees
 * the result on the map straight away, which is how the grid is lined up with
 * the printed one on the picture.
 *
 * It sends nothing itself: it emits `change` with the fields that changed, and
 * `SceneManager` sends them. Uploading a map reads the picture's size first, so
 * the scene becomes exactly that size; a picture larger than a scene may be is
 * refused here with the reason, before anything is uploaded.
 */
import { MAX_SCENE_PIXELS, type Scene } from '@hearthtable/core';
import { ref } from 'vue';

import {
  ACCEPTED_IMAGE_TYPES,
  assetUrl,
  isAcceptedImage,
  uploadAsset,
} from '../../api/assets.js';
import { readImageSize } from './imageSize.js';

const props = defineProps<{ scene: Scene; worldId: string }>();
const emit = defineEmits<{ change: [changes: Record<string, unknown>] }>();

const accept = ACCEPTED_IMAGE_TYPES.join(',');
const busy = ref(false);
const problem = ref<string>();

const KINDS = [
  ['area', 'Area'],
  ['battle', 'Battle map'],
  ['overworld', 'Overworld'],
] as const;

/** Saves a number field when it holds a whole, in-range value; otherwise leaves the scene alone. */
function saveNumber(
  event: Event,
  apply: (value: number) => Record<string, unknown>,
): void {
  const input = event.target as HTMLInputElement;
  const value = input.valueAsNumber;
  if (Number.isFinite(value) && input.checkValidity()) {
    emit('change', apply(value));
  }
}

function saveGrid(field: string, event: Event): void {
  saveNumber(event, (value) => ({ grid: { [field]: value } }));
}

async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file === undefined) {
    return;
  }
  if (!isAcceptedImage(file)) {
    problem.value = 'Choose a PNG, JPEG, WebP, or GIF image.';
    return;
  }
  busy.value = true;
  problem.value = undefined;
  try {
    const size = await readImageSize(file);
    if (size.width > MAX_SCENE_PIXELS || size.height > MAX_SCENE_PIXELS) {
      problem.value = `That picture is ${size.width} x ${size.height}. A scene can be at most ${MAX_SCENE_PIXELS} pixels on a side.`;
      return;
    }
    if (size.width < 100 || size.height < 100) {
      problem.value = 'That picture is smaller than 100 pixels on a side.';
      return;
    }
    const stored = await uploadAsset(props.worldId, file);
    emit('change', { background: stored.name, ...size });
  } catch (caught) {
    problem.value = caught instanceof Error ? caught.message : 'upload failed';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="scene-editor" :aria-label="`Settings for ${scene.name}`">
    <p>
      <label :for="`scene-name-${scene.id}`">Name</label>
      <input
        :id="`scene-name-${scene.id}`"
        type="text"
        :value="scene.name"
        maxlength="100"
        @change="
          (e) => {
            const name = (e.target as HTMLInputElement).value.trim();
            if (name !== '') emit('change', { name });
          }
        "
      />
    </p>
    <p>
      <label :for="`scene-kind-${scene.id}`">Kind</label>
      <select
        :id="`scene-kind-${scene.id}`"
        :value="scene.kind"
        @change="(e) => emit('change', { kind: (e.target as HTMLSelectElement).value })"
      >
        <option v-for="[value, label] in KINDS" :key="value" :value="value">
          {{ label }}
        </option>
      </select>
    </p>

    <fieldset>
      <legend>Map picture</legend>
      <img
        v-if="scene.background"
        class="map-thumb"
        :src="assetUrl(worldId, scene.background)"
        :alt="`The map picture of ${scene.name}`"
      />
      <p v-else class="hint">No picture yet: the scene is a blank grid.</p>
      <p>
        <label :for="`scene-file-${scene.id}`">
          {{ scene.background ? 'Replace the picture' : 'Upload a picture' }}
        </label>
        <input
          :id="`scene-file-${scene.id}`"
          type="file"
          :accept="accept"
          :disabled="busy"
          @change="onPick"
        />
      </p>
      <p v-if="busy" role="status">Uploading…</p>
      <p v-if="problem" role="alert" class="problem">{{ problem }}</p>
      <button
        v-if="scene.background"
        type="button"
        @click="emit('change', { background: null })"
      >
        Remove the picture
      </button>
    </fieldset>

    <fieldset>
      <legend>Size</legend>
      <p class="hint">In pixels. Uploading a picture sets this to the picture's size.</p>
      <p>
        <label :for="`scene-width-${scene.id}`">Width</label>
        <input
          :id="`scene-width-${scene.id}`"
          type="number"
          min="100"
          :max="MAX_SCENE_PIXELS"
          step="1"
          :value="scene.width"
          @change="(e) => saveNumber(e, (width) => ({ width }))"
        />
        <label :for="`scene-height-${scene.id}`">Height</label>
        <input
          :id="`scene-height-${scene.id}`"
          type="number"
          min="100"
          :max="MAX_SCENE_PIXELS"
          step="1"
          :value="scene.height"
          @change="(e) => saveNumber(e, (height) => ({ height }))"
        />
      </p>
    </fieldset>

    <fieldset>
      <legend>Grid</legend>
      <p class="hint">
        Change these while watching the map: line the grid up with the one printed on the
        picture.
      </p>
      <p>
        <label :for="`grid-type-${scene.id}`">Grid</label>
        <select
          :id="`grid-type-${scene.id}`"
          :value="scene.grid.type"
          @change="
            (e) =>
              emit('change', { grid: { type: (e.target as HTMLSelectElement).value } })
          "
        >
          <option value="square">Square</option>
          <option value="none">None (freeform)</option>
        </select>
      </p>
      <p>
        <label :for="`grid-size-${scene.id}`">Square size (pixels)</label>
        <input
          :id="`grid-size-${scene.id}`"
          type="number"
          min="10"
          max="1000"
          step="1"
          :value="scene.grid.size"
          @change="(e) => saveGrid('size', e)"
        />
      </p>
      <p>
        <label :for="`grid-distance-${scene.id}`">Feet per square</label>
        <input
          :id="`grid-distance-${scene.id}`"
          type="number"
          min="1"
          max="1000"
          step="any"
          :value="scene.grid.distance"
          @change="(e) => saveGrid('distance', e)"
        />
      </p>
      <p>
        <label :for="`grid-x-${scene.id}`">Shift right (pixels)</label>
        <input
          :id="`grid-x-${scene.id}`"
          type="number"
          min="-1000"
          max="1000"
          step="1"
          :value="scene.grid.offsetX"
          @change="(e) => saveGrid('offsetX', e)"
        />
        <label :for="`grid-y-${scene.id}`">Shift down (pixels)</label>
        <input
          :id="`grid-y-${scene.id}`"
          type="number"
          min="-1000"
          max="1000"
          step="1"
          :value="scene.grid.offsetY"
          @change="(e) => saveGrid('offsetY', e)"
        />
      </p>
    </fieldset>
  </section>
</template>

<style scoped>
.scene-editor p {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-2) 0;
}

.scene-editor input,
.scene-editor select,
.scene-editor button {
  min-height: var(--touch-target-min);
}

.scene-editor input[type='number'] {
  width: 6rem;
}

fieldset {
  margin: var(--space-3) 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.map-thumb {
  max-width: 100%;
  max-height: 8rem;
  object-fit: contain;
}

.hint {
  color: var(--color-text-muted);
}

.problem {
  color: var(--color-danger);
}
</style>
