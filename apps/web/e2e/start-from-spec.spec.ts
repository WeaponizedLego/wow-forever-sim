import { expect, test } from './helpers';

test('start from a spec preset and land on the workbench with gear', async ({ page }) => {
  await page.goto('/');
  const specs = page.getByRole('region', { name: 'Start from a spec' });
  await specs.getByRole('button', { name: 'Elemental', exact: true }).click();

  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.getByRole('heading', { level: 1, name: /Elemental Shaman/ })).toBeVisible();
  const gear = page.getByRole('table', { name: 'Equipped gear' });
  await expect(gear).toBeVisible();
  // The preset fills the gear: a real head and main hand, not "Empty".
  await expect(gear.getByRole('button', { name: /^Head: / })).not.toHaveAccessibleName(/^Head: Empty/);
  await expect(gear.getByRole('button', { name: /^Main hand: / })).not.toHaveAccessibleName(
    /^Main hand: Empty/,
  );
  await expect(page.getByRole('button', { name: /^Sim draft/ })).toBeEnabled();
});
