import { readFileSync } from 'node:fs';
import { expect, kpiValue, simDraft, test, type Page } from './helpers';

/** A real link from wowhead.com/forever/gear-planner (Wowhead's own encoding): Orc SV hunter, 16 items, 3/19/29. */
const LINK = readFileSync(
  new URL('../../../fixtures/import/real/wowhead-forever-sv-hunter.url', import.meta.url),
  'utf8',
).trim();

async function paste(page: Page, text: string) {
  await page.goto('/');
  await page.getByLabel('Pasted export').fill(text);
  return page.getByRole('region', { name: 'Parsed' });
}

test('a Wowhead Forever planner link imports, opens in the workbench and sims', async ({ page }) => {
  const parsed = await paste(page, `My gear: ${LINK}`);
  await expect(parsed.getByText('Wowhead planner link · WoW Forever')).toBeVisible();
  await expect(parsed.getByText(/Orc Hunter · level 60/)).toBeVisible();
  await expect(parsed.getByRole('definition').filter({ hasText: '16/17' })).toBeVisible();
  await expect(parsed.getByRole('definition').filter({ hasText: '3/19/29' })).toBeVisible();
  // Every item and enchant was found: only info notes (spec picked from talents, preset rotation…).
  await expect(parsed.getByRole('listitem').filter({ hasText: /^Warning/ })).toHaveCount(0);
  await expect(parsed.getByRole('listitem').filter({ hasText: 'SPEC-06' })).toBeVisible();

  await parsed.getByRole('button', { name: 'Open in workbench' }).click();
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.getByRole('button', { name: /^Head: Beaststalker's Cap/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Main hand: Legionite Glaive/ })).toBeVisible();

  await simDraft(page, '0001');
  expect(await kpiValue(page, 'Mean DPS · 95% CI')).toBeGreaterThan(100);
});

test('Wowhead links that cannot be used say why', async ({ page }) => {
  // A class Forever does not have: an error, and nothing to open.
  let parsed = await paste(page, 'https://www.wowhead.com/forever/gear-planner/death-knight/orc');
  await expect(parsed.getByText('Wowhead planner link · WoW Forever')).toBeVisible();
  await expect(parsed.getByText(/does not exist in WoW Forever/)).toBeVisible();
  await expect(parsed.getByRole('button', { name: 'Open in workbench' })).toBeDisabled();

  // Retail planner: class and race are read, the gear code is not.
  parsed = await paste(page, 'https://www.wowhead.com/gear-planner/hunter/orc/AAAA');
  await expect(parsed.getByText('Wowhead planner link · retail')).toBeVisible();
  await expect(parsed.getByText(/retail WoW planner, whose gear code cannot be read/)).toBeVisible();

  // A link to another Wowhead page says to copy the planner's address instead.
  parsed = await paste(page, 'https://www.wowhead.com/forever/item=16677');
  await expect(parsed.getByText('Wowhead link, not the gear planner')).toBeVisible();
  await expect(parsed.getByText(/Open your build in the planner/)).toBeVisible();
  await expect(parsed.getByRole('button', { name: 'Open in workbench' })).toBeDisabled();

  // Anything else is not a recognised format, and the note lists what is.
  parsed = await paste(page, 'hello there');
  await expect(parsed.getByText('format not recognised', { exact: true })).toBeVisible();
  await expect(parsed.getByText(/a Wowhead gear planner link/)).toBeVisible();
});
