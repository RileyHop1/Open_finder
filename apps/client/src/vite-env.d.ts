/// <reference types="vite/client" />

/**
 * `vue-tsc` (this package's `typecheck`/`build` scripts) resolves `.vue`
 * imports natively and precisely on its own; it does not need this. Plain
 * `tsc`-based tools that don't understand Single-File Components -- notably
 * ESLint's type-aware rules, which use `typescript-eslint`'s own program,
 * not `vue-tsc`'s -- see an unresolvable module and type every `.vue` import
 * as `any`/error without it. This is the long-standing, standard fallback
 * shim for that gap, not a workaround specific to this project.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
