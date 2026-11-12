import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { name: 'gamedata', include: ['src/**/*.test.ts'], passWithNoTests: true },
});
