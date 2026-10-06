<script setup lang="ts">
/**
 * The app's root shell: header, skip link, and the `<main>` landmark. What
 * renders inside `<main>` is CampaignSelect until a campaign is active, then
 * Lobby -- reactively, via `worldsStore`'s own state, not a router (nothing
 * here needs deep links or browser back/forward yet). CampaignSelect's own
 * `onMounted` hook is what actually populates `worldsStore`; this component
 * deliberately doesn't fetch a second time, just reads whatever that
 * populates. The GM's "Back to campaigns" button in CampaignLobby is the
 * way back: it calls `worldsStore.deactivate()`, which clears
 * `activeWorldId`, and this computed switches back to CampaignSelect on
 * its own -- no extra wiring needed here.
 *
 * **Map-first (ADR 0022):** once a seat is claimed, `TableView` (inside
 * `CampaignLobby`) is the whole page -- it positions itself to fill the
 * viewport on its own. This shell's own header and the `<main>` padding
 * around it would otherwise show through as dead space around that full-bleed
 * layout, so both go away for exactly as long as a seat is held.
 */
import { computed } from 'vue';

import CampaignLobby from './components/CampaignLobby.vue';
import CampaignSelect from './components/CampaignSelect.vue';
import { useLobbyStore } from './stores/lobby.js';
import { useWorldsStore } from './stores/worlds.js';

const worldsStore = useWorldsStore();
const lobby = useLobbyStore();

const activeWorld = computed(() =>
  worldsStore.worlds.find((world) => world.id === worldsStore.activeWorldId),
);

const seated = computed(() => lobby.mySeat !== undefined);
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--seated': seated }">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header v-if="!seated" class="app-header">
      <h1>Hearthtable</h1>
    </header>
    <main id="main-content" :class="{ 'main--seated': seated }">
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

/* TableView makes itself position: fixed; inset: 0 once seated -- this
   shell's own box no longer needs to size around it. */
.app-shell--seated {
  min-height: 0;
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

.main--seated {
  padding: 0;
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
