<script setup lang="ts">
/**
 * The app's root shell: header, skip link, and the `<main>` landmark. What
 * renders inside `<main>` is CampaignSelect for now -- the GM's first
 * screen (see that component's own doc comment). The lobby (next PR) will
 * need App.vue to switch between the two once a campaign is active; that
 * conditional isn't here yet because the lobby it would switch to doesn't
 * exist yet either.
 */
import CampaignSelect from './components/CampaignSelect.vue';
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="app-header">
      <h1>Hearthtable</h1>
    </header>
    <main id="main-content">
      <CampaignSelect />
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
