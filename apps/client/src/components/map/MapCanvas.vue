<script setup lang="ts">
/**
 * The map canvas: owns one PixiJS `Application` for as long as it is on
 * screen. It mounts the canvas, keeps it the size of its box, and destroys
 * the application (and its WebGL context) when it goes away. It draws
 * nothing yet; the map, grid, and tokens are layers added to the
 * application it hands out through `ready`.
 *
 * PixiJS is loaded with a dynamic import, so it is a separate chunk that is
 * only fetched when a map is first shown, and every screen without a map
 * (the lobby, the tests of other components) never pays for it.
 *
 * A browser without WebGL2 gets a plain-language message in the canvas's
 * place instead of a blank box (CLAUDE.md: WebGL2 is required). The same
 * message covers PixiJS failing to start for any other reason, since the
 * person looking at it can do the same thing about either.
 */
import type { Application } from 'pixi.js';
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { supportsWebGL2 } from './webgl.js';

const emit = defineEmits<{ ready: [app: Application] }>();

const host = ref<HTMLElement | null>(null);
const status = ref<'loading' | 'ready' | 'unavailable'>('loading');

let app: Application | undefined;
let unmounted = false;

onMounted(async () => {
  const element = host.value;
  if (element === null || !supportsWebGL2()) {
    status.value = 'unavailable';
    return;
  }
  try {
    const { Application: PixiApplication } = await import('pixi.js');
    const created = new PixiApplication();
    await created.init({
      resizeTo: element,
      background: 0x1c1a17,
      antialias: true,
      preference: 'webgl',
    });
    if (unmounted) {
      // Left the page while PixiJS was starting up: nobody will use it.
      created.destroy(true, { children: true });
      return;
    }
    app = created;
    element.appendChild(created.canvas);
    status.value = 'ready';
    emit('ready', created);
  } catch {
    status.value = 'unavailable';
  }
});

onBeforeUnmount(() => {
  unmounted = true;
  app?.destroy(true, { children: true });
  app = undefined;
});
</script>

<template>
  <div ref="host" class="map-canvas" data-testid="map-canvas">
    <p v-if="status === 'unavailable'" class="map-canvas-message" role="alert">
      The map needs WebGL 2, and this browser could not start it. Try a current Chrome,
      Edge, Firefox, or Safari, and check that hardware acceleration is turned on in its
      settings.
    </p>
  </div>
</template>

<style scoped>
.map-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 12rem;
  overflow: hidden;
  background: #1c1a17;
}

.map-canvas :deep(canvas) {
  display: block;
}

.map-canvas-message {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: var(--space-4);
  color: #ece7dc;
  text-align: center;
}
</style>
