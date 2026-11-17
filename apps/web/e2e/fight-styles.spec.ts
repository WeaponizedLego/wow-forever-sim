import { expect, kpiValue, openShamanInWorkbench, simDraft, test, type Page } from './helpers';

// Fight styles: pick each one in the Workbench's Fight tab, sim, and check the run says which fight it was.
// The dungeon slice needs an engine built with our slice patch (tools/engine-build/patches/); an engine
// without it still sims, and the run header says the pulls did not run as scheduled. Both pass here, with an
// annotation saying which engine this was.

async function openFightTab(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workbench' }).click();
  await page.getByRole('link', { name: /^Fight/ }).click();
  await expect(page).toHaveURL(/tab=fight/);
  return page.getByRole('group', { name: 'Fight style' });
}

async function pick(page: Page, label: string) {
  const styles = await openFightTab(page);
  await styles.getByRole('button', { name: label, exact: true }).click();
  await expect(styles.getByRole('button', { name: label, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

/** The schedule's lanes, read from its table view. */
async function scheduleRows(page: Page): Promise<string[]> {
  const schedule = page.getByRole('region', { name: 'Fight schedule' });
  await schedule.getByRole('button', { name: 'Table' }).click();
  const rows = await schedule.getByRole('table').getByRole('row').allInnerTexts();
  await schedule.getByRole('button', { name: 'Chart' }).click();
  return rows.slice(1).map((r) => r.split('\t')[0]!.trim());
}

const runFight = (page: Page) =>
  page
    .locator('dl')
    .filter({ hasText: 'Iterations' })
    .getByText(/^(Patchwerk|Dungeon|Custom)/);

test('fight styles: pick, sim, and the run is labelled with its fight', async ({ page }) => {
  await openShamanInWorkbench(page);

  // A new character fights Patchwerk 3 min; its fields are fixed, not editable.
  const styles = await openFightTab(page);
  await expect(styles.getByRole('button', { name: 'Patchwerk 3 min' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Duration')).toHaveCount(0);
  expect(await scheduleRows(page)).toEqual(['Raid boss']);
  await simDraft(page, '0001');
  await expect(runFight(page)).toHaveText('Patchwerk 3 min');
  const pw3 = await kpiValue(page, 'Mean DPS · 95% CI');

  // Patchwerk 5 min: one pending change, one boss.
  await pick(page, 'Patchwerk 5 min');
  await expect(
    page.getByRole('region', { name: 'Pending changes' }).getByText(/Patchwerk 5 min/),
  ).toBeVisible();
  expect(await scheduleRows(page)).toEqual(['Raid boss']);
  await simDraft(page, '0002');
  await expect(runFight(page)).toHaveText('Patchwerk 5 min');

  // Dungeon slice: four packs and a boss on the schedule, 15 mobs in one sim.
  await pick(page, 'Dungeon slice 5 min');
  expect(await scheduleRows(page)).toEqual([
    'Pack 1 · 4 mobs',
    'Pack 2 · 3 mobs',
    'Boss · 1 mob',
    'Pack 3 · 5 mobs',
    'Pack 4 · 2 mobs',
  ]);
  await expect(page.getByText('15 mobs, up to 5 at once')).toBeVisible();
  await expect(page.getByLabel('Duration')).toHaveCount(0);
  await simDraft(page, '0003');
  const slice = runFight(page);
  await expect(slice).toHaveText(/^Dungeon slice 5 min/);
  const sliceText = await slice.innerText();
  test.info().annotations.push({
    type: 'engine',
    description: sliceText.includes('not as scheduled')
      ? 'engine without the slice patch: pulls after the first never spawned'
      : 'engine with the slice patch: pulls ran as scheduled',
  });
  const sliceDps = await kpiValue(page, 'Mean DPS · 95% CI');
  expect(sliceDps).toBeGreaterThan(0);
  expect(sliceDps).not.toBe(pw3);

  // Custom: the manual fields come back, starting from the last fight; 3 targets for 2 minutes.
  await pick(page, 'Custom');
  await page.getByLabel('Duration').fill('120');
  await page.getByRole('group', { name: 'Targets' }).getByRole('button', { name: '3', exact: true }).click();
  await page
    .getByRole('group', { name: 'Target level' })
    .getByRole('button', { name: '63', exact: true })
    .click();
  await page.getByLabel('± variation').fill('5');
  expect(await scheduleRows(page)).toEqual(['3 raid targets']);
  await simDraft(page, '0004');
  await expect(runFight(page)).toHaveText('Custom 120 s ±5 · 3 tgt');
});
