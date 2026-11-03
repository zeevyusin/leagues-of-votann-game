import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the built site works from any folder (GitHub Pages serves it at /<repo>/).
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
