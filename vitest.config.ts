import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/web'],
    exclude: ['**/node_modules/**', '.claude/**'],
  },
});
