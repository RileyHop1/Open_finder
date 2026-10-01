<script setup lang="ts">
/**
 * A character's portrait: the image if there is one, otherwise a placeholder
 * (their initial in a circle). An owner or the GM also gets a file picker and a
 * Remove button. The picker is a real, labelled file input, so it is
 * keyboard-operable and works on a tablet's file chooser. A file that is not
 * an image the server accepts is refused here with a message, before anything
 * is sent; the server checks the file's contents again.
 *
 * It never talks to the server: it emits the chosen file (`upload`) or the
 * request to remove the portrait (`clear`), and `TableView` does the upload and
 * the `actor.update`.
 */
import { computed, ref } from 'vue';

import { ACCEPTED_IMAGE_TYPES, assetUrl, isAcceptedImage } from '../../api/assets.js';

const props = defineProps<{
  name: string;
  /** The stored asset name (`<hash>.<ext>`), if the actor has a portrait. */
  portrait?: string | undefined;
  worldId: string;
  editable?: boolean;
  /** An upload is in flight. */
  busy?: boolean;
  /** Why the last upload failed, if it did. */
  error?: string | undefined;
}>();
const emit = defineEmits<{ upload: [file: File]; clear: [] }>();

const refusal = ref<string>();
const initial = computed(() => props.name.trim().charAt(0).toUpperCase() || '?');
const accept = ACCEPTED_IMAGE_TYPES.join(',');

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file === undefined) {
    return;
  }
  if (!isAcceptedImage(file)) {
    refusal.value = 'Choose a PNG, JPEG, WebP, or GIF image.';
    return;
  }
  refusal.value = undefined;
  emit('upload', file);
}
</script>

<template>
  <section class="portrait-picker" aria-label="Portrait">
    <img
      v-if="portrait"
      class="portrait"
      :src="assetUrl(worldId, portrait)"
      :alt="`Portrait of ${name}`"
    />
    <span
      v-else
      class="portrait placeholder"
      role="img"
      :aria-label="`${name} has no portrait`"
      >{{ initial }}</span
    >

    <div v-if="editable" class="controls">
      <label for="portrait-file">Portrait image</label>
      <input
        id="portrait-file"
        type="file"
        :accept="accept"
        :disabled="busy"
        @change="onPick"
      />
      <button v-if="portrait" type="button" :disabled="busy" @click="emit('clear')">
        Remove portrait
      </button>
      <p v-if="busy" role="status">Uploading…</p>
      <p v-if="refusal ?? error" role="alert" class="problem">{{ refusal ?? error }}</p>
    </div>
  </section>
</template>

<style scoped>
.portrait-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.portrait {
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  object-fit: cover;
}

.placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-border);
  color: var(--color-text);
  font-size: 2.5rem;
  font-weight: 700;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.controls p {
  margin: 0;
  flex-basis: 100%;
}

.controls input,
.controls button {
  min-height: var(--touch-target-min);
}

.problem {
  color: var(--color-danger);
}
</style>
