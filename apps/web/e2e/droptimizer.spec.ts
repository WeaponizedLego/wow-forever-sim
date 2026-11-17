import { expect, openShamanInWorkbench, test } from './helpers';

test('droptimizer: pick bosses, ranked drops, re-run the top, equip the best into the draft', async ({
  page,
}) => {
  // Eleven drops, a fast pass and a 10k re-run of the top eight.
  test.setTimeout(180_000);
  await openShamanInWorkbench(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Droptimizer' }).click();
  // The header names who the drops are simmed on, and links back to the Workbench.
  const heading = page.getByRole('heading', { level: 1, name: /Droptimizer/ });
  await expect(heading).toHaveText(/Droptimizer\s*· Testshaman · Dwarf Enhancement Shaman · 42/);
  await expect(page.getByRole('link', { name: 'Edit in Workbench' })).toHaveAttribute('href', '/workbench');

  // A raid the game data lists only a few drops for says so, so a thin pool does not look like a bug.
  await page.getByLabel('Dungeon or raid').selectOption({ label: 'Molten Core' });
  await expect(page.getByTestId('thin-data')).toHaveText(
    /The game data currently lists \d+ drops? for \d+ bosses in this raid; more appear as the data updates\./,
  );

  await page.getByLabel('Dungeon or raid').selectOption({ label: 'Scarlet Monastery' });
  await expect(page.getByTestId('thin-data')).toHaveCount(0);
  const bosses = page.getByRole('group', { name: 'Bosses' });
  const all = bosses.getByRole('button', { name: 'All', exact: true });
  const chip = (name: string) => bosses.getByRole('button', { name: new RegExp(`^${name}`) });
  const simButton = page.getByRole('button', { name: /^Sim \d+ drops?$/ });

  // Every boss starts selected under All, with no boss chip pressed.
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(chip('Bloodmage Thalnos')).toHaveAttribute('aria-pressed', 'false');
  // One click on a boss isolates it.
  await chip('Bloodmage Thalnos').click();
  await expect(chip('Bloodmage Thalnos')).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(bosses.getByRole('button', { pressed: true })).toHaveCount(1);
  // The Sim button counts what the chip counts.
  const thalnosDrops = Number(/(\d+)\s*$/.exec(await chip('Bloodmage Thalnos').innerText())![1]);
  await expect(simButton).toHaveText(`Sim ${thalnosDrops} drop${thalnosDrops === 1 ? '' : 's'}`);
  // All brings every boss back; another click isolates again; further clicks add bosses.
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(bosses.getByRole('button', { pressed: true })).toHaveCount(1);
  await chip('Bloodmage Thalnos').click();
  await chip('Herod').click();
  await chip('Arcanist Doan').click();
  await expect(bosses.getByRole('button', { pressed: true })).toHaveCount(3);
  await expect(page.getByTestId('boss-hint')).toHaveText(/^3 of \d+ bosses/);

  const drops = page.getByRole('table', { name: 'Drops to sim' });
  await expect(drops).toBeVisible();
  const items = (await drops.getByRole('row').count()) - 1; // header + one row per item
  expect(items).toBeGreaterThan(8); // more than the re-run takes, so some rows are not re-run
  await expect(simButton).toHaveText(`Sim ${items} drops`);

  await page.getByRole('group', { name: 'Fast pass' }).getByRole('button', { name: '250' }).click();
  await page.getByRole('checkbox', { name: /Then re-run the top/ }).uncheck();
  await simButton.click();

  const ranking = page.getByRole('table', { name: 'Droptimizer ranking' });
  await expect(ranking).toBeVisible({ timeout: 60_000 });
  // Header + the equipped set + one row per item.
  await expect(ranking.getByRole('row')).toHaveCount(items + 2);
  await expect(ranking.getByRole('row').filter({ hasText: 'Currently equipped' })).toHaveCount(1);
  await expect(ranking.getByRole('row').filter({ hasText: /Better|Worse|Within noise/ })).toHaveCount(items);
  await expect(page.getByRole('table', { name: 'Upgrades by boss' })).toContainText('Bloodmage Thalnos');
  // One pass: a single Δ column, and one noise floor.
  await expect(ranking.getByRole('columnheader', { name: 'Change vs equipped' })).toBeVisible();
  const header = page.getByRole('region', { name: 'Droptimizer' });
  await expect(header.locator('dd').filter({ hasText: /^±[\d.]+ at 250 it$/ })).toHaveCount(1);

  // The drops left out are listed by name under their reason, not just counted.
  const leftOut = page.getByRole('region', { name: 'Left out' });
  const leftOutItems = leftOut
    .getByRole('list', { name: /^Left out: / })
    .first()
    .getByRole('listitem');
  await expect(leftOutItems.first()).toBeVisible();
  await expect(leftOutItems.first()).not.toHaveText(/^Item \d+$/);

  // Re-run the top drops at 10k: the Δ column splits into the muted quick pass and the final number.
  await page.getByRole('button', { name: /^Re-run top \d+ at 10k$/ }).click();
  await expect(ranking.getByRole('columnheader', { name: /^Final change vs equipped/ })).toBeVisible({
    timeout: 150_000,
  });
  await expect(ranking.getByRole('columnheader', { name: /^Quick pass change vs equipped/ })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 150_000 });
  await expect(page.getByText(/Final Δ\s*are the numbers to go by/)).toBeVisible();
  // Each pass's verdicts against its own noise floor, in the note and the header.
  await expect(page.getByTestId('rerun-note')).toContainText(/250 it noise floor ±[\d.]+/);
  await expect(page.getByTestId('rerun-note')).toContainText(/10k noise floor ±[\d.]+/);
  await expect(header.locator('dd').filter({ hasText: /^±[\d.]+ at 250 it · ±[\d.]+ at 10k$/ })).toHaveCount(
    1,
  );
  // Drops past the top eight keep their quick-pass Δ and verdict, and say they were not re-run.
  const notRerun = ranking.getByRole('row').filter({ hasText: 'not re-run' });
  await expect(notRerun).toHaveCount(items - 8);
  await expect(notRerun.filter({ hasText: /Better|Worse|Within noise/ })).toHaveCount(items - 8);

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
