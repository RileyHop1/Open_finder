import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages,systems}/*/src/**/*.{test,spec}.ts'],
    passWithNoTests: false,
  },
});
