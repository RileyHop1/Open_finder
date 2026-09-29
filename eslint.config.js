// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'systems/pf2e/.data/**',
      'worlds/**',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...pluginVue.configs['flat/recommended'],

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Root-level tooling files, and Vite's own config files (which run
          // under Vite/Node, not as part of any package's browser-facing
          // `src/` typecheck scope), belong to no package tsconfig.
          allowDefaultProject: [
            'vitest.config.ts',
            'eslint.config.js',
            'apps/client/vite.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- The TypeScript section of CLAUDE.md, mechanically enforced. ---
      // "No `any`, no `@ts-ignore`. If truly unavoidable, use `@ts-expect-error`
      //  with a comment explaining why."
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],

      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // `eslint-plugin-vue`'s recommended config already routes `.vue` files
  // through `vue-eslint-parser`; this layers typescript-eslint's own parser
  // in for the `<script>` block specifically, so type-aware rules (like the
  // no-explicit-any / no-unsafe-* rules from `recommendedTypeChecked` above)
  // apply inside Vue components too, not just plain `.ts` files.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // --- The plugin boundary from ADR 0001, as a second line of defence. ---
  // Not declaring the dependency already makes this fail to resolve; this
  // reports it as an intelligible lint error rather than a module-not-found.
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@hearthtable/pf2e', '@hearthtable/pf2e/*'],
              message:
                'packages/core is system-agnostic and must not depend on a game system. See docs/adr/0001-stack.md.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Vite/Vitest config files run under the "default project" fallback above
  // (they belong to no package's real tsconfig), where type-aware rules
  // don't reliably resolve third-party plugin factories like
  // `@vitejs/plugin-vue`'s `vue()` -- it type-checks fine for real code
  // (`vue-tsc`/`tsc --noEmit` both pass), so this is a lint-tooling
  // limitation of the default-project fallback, not a real type error.
  {
    files: ['vitest.config.ts', '**/vite.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
);
