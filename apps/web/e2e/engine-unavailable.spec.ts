import { expect, SHAMAN_SIMC, test } from './helpers';

// A build without a staged engine has no /engine/current.json. Simulate that by answering 404 for it.
test.beforeEach(async ({ page }) => {
  await page.route('**/engine/current.json', (route) => route.fulfill({ status: 404, body: 'Not found' }));
});

test('engine unavailable: plain notice, no crash, spec presets still open', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No engine is staged for this build' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Engine & data' }).getByText('not staged')).toBeVisible();

  // Pasting cannot be checked (the item data ships with the engine) and nothing can be simmed.
  await page.getByLabel('Pasted export').fill(SHAMAN_SIMC);
  const parsed = page.getByRole('region', { name: 'Parsed' });
  await expect(parsed.getByRole('button', { name: 'Sim as-is' })).toBeDisabled();

  // Starting from a spec still loads the preset into the workbench.
  await page
    .getByRole('region', { name: 'Start from a spec' })
    .getByRole('button', { name: 'Elemental', exact: true })
    .click();
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.getByRole('heading', { level: 1, name: /Elemental Shaman/ })).toBeVisible();
});
