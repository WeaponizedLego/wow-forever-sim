import { expect, kpiValue, openShamanInWorkbench, pasteShaman, simDraft, test } from './helpers';

test('import the shaman export, open it in the workbench, sim and read the analysis', async ({ page }) => {
  const parsed = await pasteShaman(page);

  // Parse report: format, identity, slot count and the three warnings the real export raises.
  await expect(parsed.getByText('SimC addon export · 12.1.5-04')).toBeVisible();
  await expect(parsed.getByText(/Elemental Shaman · level 42/)).toBeVisible();
  await expect(parsed.getByRole('definition').filter({ hasText: '16/17' })).toBeVisible();
  for (const code of ['LEVEL-07', 'SPEC-06', 'DEFAULT-05']) {
    await expect(
      parsed
        .getByRole('listitem')
        .filter({ hasText: new RegExp(`Warning\\s*${code}`) })
        .first(),
    ).toBeVisible();
  }

  await openShamanInWorkbench(page);
  await expect(page.getByRole('heading', { level: 1, name: /Testshaman/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Head: Captain's Circlet of the Boar/ })).toBeVisible();

  await simDraft(page, '0001');

  // KPI strip: the mean is a real number in the band this export sims at (~315 DPS).
  const mean = await kpiValue(page, 'Mean DPS · 95% CI');
  expect(mean).toBeGreaterThan(250);
  expect(mean).toBeLessThan(400);
  await expect(page.getByText('run #0001 · no baseline')).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: /^1,000$/ })).toBeVisible();

  // Every analysis panel renders with its data, not an empty state.
  const panel = (name: string) => page.getByRole('region', { name });
  await expect(
    panel('DPS distribution').getByRole('table', { name: /^Histogram of DPS across 1,000/ }),
  ).toBeAttached();
  await expect(panel('Convergence').getByRole('table', { name: /^Running mean settles at/ })).toBeAttached();
  await expect(panel('Fight timeline').getByRole('table', { name: /^Fight 1 of 1,000/ })).toBeAttached();
  const abilities = panel('Damage by ability').getByRole('table', { name: 'Damage by ability' });
  await expect(abilities.getByRole('row').filter({ hasText: 'Lightning Bolt' }).first()).toBeVisible();
  await expect(panel('Run notes').getByRole('listitem').first()).toBeVisible();

  // The run is listed under Runs in the header and on the start screen.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'New run' }).click();
  await expect(page.getByRole('region', { name: 'Recent runs' }).getByText('#0001')).toBeVisible();
});
