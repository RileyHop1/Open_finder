<script setup lang="ts">
/**
 * The app's root shell: header, skip link, and the `<main>` landmark. What
 * renders inside `<main>` is CampaignSelect until a campaign is active, then
 * Lobby -- reactively, via `worldsStore`'s own state, not a router (nothing
 * here needs deep links or browser back/forward yet). CampaignSelect's own
 * `onMounted` hook is what actually populates `worldsStore`; this component
 * deliberately doesn't fetch a second time, just reads whatever that
 * populates. There is no way back to CampaignSelect once a campaign is
 * active -- the server has no "deactivate" route yet either, so there is
 * nothing this screen could call even if it offered one.
 */
import { computed } from 'vue';

import CampaignLobby from './components/CampaignLobby.vue';
import CampaignSelect from './components/CampaignSelect.vue';
import { useWorldsStore } from './stores/worlds.js';

const worldsStore = useWorldsStore();

const activeWorld = computed(() =>
  worldsStore.worlds.find((world) => world.id === worldsStore.activeWorldId),
);
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="app-header">
      <h1>Hearthtable</h1>
    </header>
    <main id="main-content">
      <CampaignLobby
        v-if="activeWorld"
        :world-id="activeWorld.id"
        :world-name="activeWorld.name"
      />
      <CampaignSelect v-else />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
}

.app-header {
  border-bottom: 1px solid var(--color-border);
  padding: var(--space-3) var(--space-4);
}

.app-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

main {
  padding: var(--space-4);
}

/**
 * A standard skip-link: invisible until it receives keyboard focus, then
 * jumps straight to the main landmark -- CLAUDE.md's Accessibility section:
 * "every action reachable without a mouse." This is the first focusable
 * element on every page, on purpose.
 */
.skip-link {
  position: absolute;
  top: 0;
  left: -9999px;
  z-index: 100;
}

.skip-link:focus {
  left: var(--space-2);
  top: var(--space-2);
  background: var(--color-surface);
  padding: var(--space-2);
  color: var(--color-text);
}
</style>
