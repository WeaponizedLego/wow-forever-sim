import { defineConfig, devices } from '@playwright/test';

// Browser e2e against the production build: `nuxt generate` output served as static files by e2e/serve.mjs,
// with the real engine staged (node scripts/stage-engine.mjs). The `e2e` package script does all three.
const port = Number(process.env.E2E_PORT ?? 4173);
const ci = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  // Sims are real (WASM in workers) but kept at 1k iterations, so a few seconds each.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  // Every sim already fans out over all cores; one test at a time keeps timings honest.
  workers: 1,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node e2e/serve.mjs ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !ci,
    timeout: 10_000,
  },
});
