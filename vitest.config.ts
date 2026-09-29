import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Needed so a test can import a `.vue` single-file component directly
  // (apps/client). Harmless for every other package, which has none.
  plugins: [vue()],
  root: import.meta.dirname,
  test: {
    include: ['{apps,packages,systems}/*/src/**/*.{test,spec}.ts'],
    passWithNoTests: false,
    // Every package but apps/client is pure logic and stays on Vitest's
    // default `node` environment, which is faster and has nothing to fake.
    // `environmentMatchGlobs` would be the declarative way to scope jsdom to
    // just that package, but it did not reliably match here across both this
    // unified run and a `pnpm --filter @hearthtable/client test` run (whose
    // CWD resolves a different config file entirely -- see that package's
    // own `vite.config.ts`); a `// @vitest-environment jsdom` comment at the
    // top of each file that actually mounts a component is what both
    // invocations honor correctly, verified directly rather than assumed.
  },
});
