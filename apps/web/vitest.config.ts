import { defineConfig } from 'vitest/config';
// Unit tests for the app's pure helpers (app/utils). Components and composables are covered by the e2e suite.
export default defineConfig({
  test: { name: 'web', include: ['app/utils/**/*.test.ts'], environment: 'node' },
});
