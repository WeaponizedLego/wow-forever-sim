import { expect, expectNamedAbilities, RAW_LABEL, simDraft, test } from './helpers';

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

test('a healer spec cannot start, and says why in plain words', async ({ page }) => {
  await page.goto('/');
  const specs = page.getByRole('region', { name: 'Start from a spec' });
  for (const name of ['Holy', 'Restoration']) {
    const button = specs.getByRole('button', { name, exact: true }).first();
    await expect(button).toBeDisabled();
    await expect(button).toHaveAccessibleDescription('Not simmed: this tool sims damage only');
  }
});

test('a Fury Warrior preset run names every ability, hand and proc', async ({ page }) => {
  await page.goto('/');
  const specs = page.getByRole('region', { name: 'Start from a spec' });
  await specs.getByRole('button', { name: 'Fury Pre-BiS', exact: true }).click();
  await expect(page).toHaveURL(/\/workbench$/);
  await simDraft(page, '0001');

  // Every row is named: swings, strikes per hand, extra attacks by their source, consumables by their item. Which
  // of those the preset's gear and rotation produce is upstream's, so only the two hands are asked for by name:
  // the build dual wields, and each hand's swings are a row of their own.
  const names = await expectNamedAbilities(page);
  expect(names).toEqual(expect.arrayContaining(['Melee (main hand)', 'Melee (off hand)']));

  const panel = (name: string) => page.getByRole('region', { name });
  // The timeline (DPS table and aura lanes) names its auras, and lists each 5 s bucket once.
  const timeline = panel('Fight timeline');
  await expect(timeline.getByRole('table', { name: /^Fight 1 of 1,000/ })).toBeAttached();
  await expect(timeline).not.toContainText(RAW_LABEL);
  const times = await timeline
    .getByRole('table', { name: /^Fight 1 of 1,000/ })
    .locator('tbody tr')
    .evaluateAll((rows) => rows.map((r) => r.querySelector('td, th')?.textContent?.trim() ?? ''));
  expect(times.length).toBeGreaterThan(30);
  expect(new Set(times).size).toBe(times.length);
});
