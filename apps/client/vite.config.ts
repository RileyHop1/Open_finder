import vue from '@vitejs/plugin-vue';
// From 'vitest/config', not plain 'vite': that re-exports Vite's own
// `defineConfig` with the type extended to allow the `test` block below.
// See that block's own comment for why it's here at all.
import { defineConfig } from 'vitest/config';

const SERVER_URL = 'http://127.0.0.1:3000';

/**
 * Dev-only convenience: proxies API and realtime traffic to the server so
 * the client can be developed with `vite`'s hot-reloading dev server while
 * still talking to a real `@hearthtable/server` instance running separately
 * on its default port. Never used in production -- there, `apps/server`
 * serves this package's own built output directly (`staticDir` in
 * `apps/server/src/app.ts`), so there is no separate origin to proxy from.
 */
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': SERVER_URL,
      '/socket.io': {
        target: SERVER_URL,
        ws: true,
      },
    },
  },
  // A `test` block is declared here (via `defineConfig` from 'vitest/config'
  // rather than plain 'vite') even though the actual test settings live in
  // the root `vitest.config.ts`: Vite/Vitest config resolution uses the
  // NEAREST config file found by searching upward from the current working
  // directory, not a merge of every ancestor. `pnpm --filter
  // @hearthtable/client test` (CWD inside this package) finds THIS file and
  // never reaches the root config at all -- so this file is what actually
  // governs a scoped test run of this package, including which files count
  // as tests and which environment they run under (see each test file's own
  // `// @vitest-environment jsdom` comment for that last part; verified this
  // resolution behavior directly rather than assuming it).
});
