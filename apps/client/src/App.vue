<script setup lang="ts">
/**
 * The scaffold's root component. Real screens (campaign select, the lobby)
 * land in the next two PRs; this just proves the toolchain -- Vite, Vue's
 * `<script setup>`, the design tokens, Pinia (wired in `main.ts`), and the
 * a11y baseline below -- actually works end to end before anything is built
 * on top of it.
 */
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="app-header">
      <h1>Hearthtable</h1>
    </header>
    <main id="main-content">
      <p>
        The server runs the game. This screen will let a GM pick a campaign and let
        players join its lobby.
      </p>
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
