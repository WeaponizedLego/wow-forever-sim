import { expect, kpiValue, openShamanInWorkbench, simDraft, test } from './helpers';

test('swap an item in the workbench, see the pending diff, sim again and compare to the baseline', async ({
  page,
}) => {
  await openShamanInWorkbench(page);
  await simDraft(page, '0001');
  const baseline = await kpiValue(page, 'Mean DPS · 95% CI');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workbench' }).click();
  const pending = page.getByRole('region', { name: 'Pending changes' });
  await expect(pending.getByText('No changes since run #0001.')).toBeVisible();

  // Item picker: search, pick, equip.
  await page.getByRole('button', { name: /^Head: Captain's Circlet of the Boar/ }).click();
  const picker = page.getByRole('dialog', { name: 'Pick head item' });
  await picker.getByRole('searchbox', { name: /Search items/ }).fill("Cassandra's Grace");
  await picker
    .getByRole('list', { name: 'Items' })
    .getByRole('button', { name: /^Cassandra's Grace/ })
    .click();
  await picker.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(picker).toBeHidden();

  await expect(page.getByRole('button', { name: /^Head: Cassandra's Grace/ })).toBeVisible();
  await expect(pending.getByText(/Cassandra's Grace/)).toBeVisible();
  await expect(pending.getByRole('button', { name: 'Discard' })).toBeEnabled();

  await simDraft(page, '0002');

  // Run #0002 is compared against #0001: a Δ tile with a signed number that matches the two means.
  await expect(page.getByText(/^Δ vs baseline #0001/)).toBeVisible();
  const mean = await kpiValue(page, 'Mean DPS · 95% CI');
  const delta = await kpiValue(page, /^Δ vs baseline #0001/);
  expect(mean).toBeGreaterThan(250);
  expect(Math.abs(mean - baseline - delta)).toBeLessThan(0.2);
});
