import {
  expect,
  expectNamedAbilities,
  kpiValue,
  openShamanInWorkbench,
  pasteShaman,
  simDraft,
  test,
} from './helpers';

test('import the shaman export, open it in the workbench, sim and read the analysis', async ({ page }) => {
  const parsed = await pasteShaman(page);

  // Parse report: format, identity (spec picked from the converted loadout talents), slot count and the warning
  // the real export raises. Its talents convert (verified shaman tree), so no DEFAULT-05.
  await expect(parsed.getByText('SimC addon export · 12.1.5-04')).toBeVisible();
  await expect(parsed.getByText(/Enhancement Shaman · level 42/)).toBeVisible();
  // The slot count names what is empty (this shaman's export has no off hand).
  await expect(parsed.getByRole('definition').filter({ hasText: '16/17 (no off hand)' })).toBeVisible();
  await expect(parsed.getByRole('listitem').filter({ hasText: /Warning\s*DEFAULT-05/ })).toHaveCount(0);
  for (const code of ['LEVEL-07']) {
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

  // KPI strip: the mean is a real number. Which number is upstream's tuning (447 DPS at one engine, 498 three
  // days later), and engine sync's smoke test is what holds each spec's DPS to a range.
  expect(await kpiValue(page, 'Mean DPS · 95% CI')).toBeGreaterThan(0);
  await expect(page.getByText('run #0001 · no baseline')).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: /^1,000$/ })).toBeVisible();

  // The plain summary on top: DPS ±, the fight, iterations, and no earlier run. Its top abilities are checked
  // with the ability table below.
  const summary = page.getByTestId('run-summary');
  await expect(summary).toContainText(/\d+\.\d DPS\s*± \d+\.\d/);
  await expect(summary).toContainText(/on Patchwerk.*, averaged over 1,000 simulated fights\./);
  await expect(summary).toContainText('This is the first run of Testshaman in this browser.');

  // Every analysis panel renders with its data, not an empty state.
  const panel = (name: string) => page.getByRole('region', { name });
  await expect(
    panel('DPS distribution').getByRole('table', { name: /^Histogram of DPS across 1,000/ }),
  ).toBeAttached();
  await expect(panel('Convergence').getByRole('table', { name: /^Running mean settles at/ })).toBeAttached();
  await expect(panel('Fight timeline').getByRole('table', { name: /^Fight 1 of 1,000/ })).toBeAttached();
  // Every damage row is named, none as a bare "Spell N" (the weapon imbue's strike is not in the item database
  // and takes its name from the engine's spell table), and the summary leads with the three biggest.
  await expectNamedAbilities(page);
  // The run page repeats the import's level warning: its DPS is what a player compares with the game.
  await expect(
    panel('Run notes')
      .getByRole('listitem')
      .filter({ hasText: /level 42/ }),
  ).toContainText('the engine only sims level 60');

  // The run is listed under Runs in the header and on the start screen.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'New run' }).click();
  await expect(page.getByRole('region', { name: 'Recent runs' }).getByText('#0001')).toBeVisible();
});
