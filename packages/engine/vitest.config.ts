import { defineConfig } from 'vitest/config';

// Real-WASM tests (skipped when packages/engine/vendor/ is empty) run full 5,000-iteration sims:
// ~10 s on one worker, longer when the whole suite shares the CPU.
export default defineConfig({
  test: {
    name: 'engine',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
