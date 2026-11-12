import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { name: 'importers', include: ['src/**/*.test.ts'], passWithNoTests: true },
});
