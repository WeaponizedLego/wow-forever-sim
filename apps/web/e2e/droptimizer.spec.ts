import { expect, openShamanInWorkbench, test } from './helpers';

test('droptimizer: one boss, ranked drops, equip the best into the draft', async ({ page }) => {
  await openShamanInWorkbench(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Droptimizer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Droptimizer/ })).toBeVisible();

  await page.getByLabel('Dungeon or raid').selectOption({ label: 'Scarlet Monastery' });
  const bosses = page.getByRole('group', { name: 'Bosses' });
  // Every boss starts selected; narrow to one small boss.
  await bosses.getByRole('button', { name: 'All', exact: true }).click();
  await bosses.getByRole('button', { name: /^Bloodmage Thalnos/ }).click();
  await expect(bosses.getByRole('button', { name: /^Bloodmage Thalnos/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const drops = page.getByRole('table', { name: 'Drops to sim' });
  await expect(drops).toBeVisible();
  const items = await drops.getByRole('row').count(); // header + one row per item
  expect(items).toBeGreaterThan(1);

  await page.getByRole('group', { name: 'Fast pass' }).getByRole('button', { name: '250' }).click();
  await page.getByRole('checkbox', { name: /Then re-run the top/ }).uncheck();
  await page.getByRole('button', { name: /^Sim \d+ drops?$/ }).click();

  const ranking = page.getByRole('table', { name: 'Droptimizer ranking' });
  await expect(ranking).toBeVisible({ timeout: 60_000 });
  // Header + the equipped set + one row per item.
  await expect(ranking.getByRole('row')).toHaveCount(items + 1);
  await expect(ranking.getByRole('row').filter({ hasText: 'Currently equipped' })).toHaveCount(1);
  await expect(ranking.getByRole('row').filter({ hasText: /Better|Worse|Within noise/ })).toHaveCount(
    items - 1,
  );
  await expect(page.getByRole('table', { name: 'Upgrades by boss' })).toContainText('Bloodmage Thalnos');

  // Equip the top drop that is not the equipped set and check it lands on the workbench draft.
  const row = ranking
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'Equip', exact: true }) })
    .first();
  // The forest plot's label reads "<item>: <mean>, 95% CI …".
  const label = (await row.getByRole('img').getAttribute('aria-label')) ?? '';
  const name = label.slice(0, label.lastIndexOf(':'));
  expect(name.length).toBeGreaterThan(0);
  await row.getByRole('button', { name: 'Equip' }).click();
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.getByRole('region', { name: 'Pending changes' })).toContainText(name);
});
