import { expect, simDraft, test } from './helpers';

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

/** A label that leaks an engine id or tag: "Melee (tag 14)", "Item 10646", "Spell 12345". */
const RAW_LABEL = /tag -?\d|\b(Item|Spell|Other action) \d+/;

test('a Fury Warrior preset run names every ability, hand and proc', async ({ page }) => {
  await page.goto('/');
  const specs = page.getByRole('region', { name: 'Start from a spec' });
  await specs.getByRole('button', { name: 'Fury Pre-BiS', exact: true }).click();
  await expect(page).toHaveURL(/\/workbench$/);
  await simDraft(page, '0001');

  const summary = page.getByTestId('run-summary');
  await expect(summary).toContainText(/Most damage/);
  await expect(summary).not.toContainText(RAW_LABEL);

  const panel = (name: string) => page.getByRole('region', { name });
  const abilities = panel('Damage by ability').getByRole('table', { name: 'Damage by ability' });
  // Dual wield: each hand's swings, Whirlwind's strikes per hand, extra attacks by their source, and the sapper.
  for (const name of [
    'Melee (main hand)',
    'Melee (off hand)',
    'Whirlwind (main hand)',
    'Whirlwind (off hand)',
    'Melee (Hand of Justice)',
    'Goblin Sapper Charge',
  ])
    await expect(abilities.getByRole('row').filter({ hasText: name }).first()).toBeAttached();
  await expect(abilities.getByRole('row').filter({ hasText: RAW_LABEL })).toHaveCount(0);

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
