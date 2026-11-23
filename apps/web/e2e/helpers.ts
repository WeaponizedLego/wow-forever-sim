import { readFileSync } from 'node:fs';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

/** The real WoW Forever SimC export: level 42 shaman, Enhancement from its converted loadout talents. */
export const SHAMAN_SIMC = readFileSync(
  new URL('../../../fixtures/import/real/simc-shaman-lvl42.simc', import.meta.url),
  'utf8',
);

/** `test` with an automatic check: any uncaught error in the page (a crash) fails the test. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
      await use(errors);
      expect(errors, 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect, type Page };

/** Pastes the shaman export on the start screen and waits for the parse report. */
export async function pasteShaman(page: Page): Promise<Locator> {
  await page.goto('/');
  await page.getByLabel('Pasted export').fill(SHAMAN_SIMC);
  const parsed = page.getByRole('region', { name: 'Parsed' });
  await expect(parsed.getByText('Testshaman', { exact: true })).toBeVisible();
  return parsed;
}

/** Imports the shaman export and opens it in the workbench. */
export async function openShamanInWorkbench(page: Page): Promise<void> {
  const parsed = await pasteShaman(page);
  await parsed.getByRole('button', { name: 'Open in workbench' }).click();
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.getByRole('table', { name: 'Equipped gear' })).toBeVisible();
}

/**
 * Sims the workbench draft at 1k iterations without stat weights and waits for the run page.
 * The sim bar remembers both choices (localStorage) and a fresh browser starts at 5k with stat weights on, so set
 * both every time.
 */
export async function simDraft(page: Page, runId: string): Promise<void> {
  const bar = page.getByRole('region', { name: 'Sim' });
  await bar.getByRole('button', { name: '1k' }).click();
  await expect(bar.getByRole('button', { name: '1k' })).toHaveAttribute('aria-pressed', 'true');
  await bar.getByRole('checkbox', { name: 'Stat weights' }).uncheck();
  await bar.getByRole('button', { name: /^Sim draft/ }).click();
  await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`), { timeout: 60_000 });
}

/**
 * Reads a KPI tile's headline number on the run page. KPI tiles have no accessible name, so this finds
 * the label text and reads its tile (the label's parent). A role="group" with an
 * aria-label on UiKpiTile would make this a plain getByRole lookup.
 */
export async function kpiValue(page: Page, label: string | RegExp): Promise<number> {
  const tile = page.getByText(label, { exact: typeof label === 'string' }).locator('xpath=..');
  const text = await tile.innerText();
  const m = /([+−-]?[\d,]+\.\d+)/.exec(text.replace(typeof label === 'string' ? label : '', ''));
  if (!m?.[1]) throw new Error(`No number in KPI tile "${label}": ${text}`);
  return Number(m[1].replace(/,/g, '').replace('−', '-'));
}

/** A label that leaks an engine id or tag: "Melee (tag 14)", "Item 10646", "Spell 12345". */
export const RAW_LABEL = /tag -?\d|\b(Item|Spell|Other action) \d+/;

/**
 * Checks a run page's damage rows and the summary's "Most damage" line without naming an ability, and returns the
 * row names, most damage first. What a character casts and how much each ability does is upstream's, and moves
 * with engine syncs: the shaman export's second ability was Flametongue Attack at one engine and Windfury Weapon
 * three days later, and the Fury preset traded Hand of Justice for a Flurry Axe. So this holds the page to what
 * is ours: every row has a real name, and the summary leads with the three biggest rows and their shares.
 */
export async function expectNamedAbilities(page: Page): Promise<string[]> {
  const table = page
    .getByRole('region', { name: 'Damage by ability' })
    .getByRole('table', { name: 'Damage by ability' });
  // Retried as a whole: the rows are there before the game data that names them has loaded.
  let names: string[] = [];
  await expect(async () => {
    names = (await table.locator('tbody tr .name').allTextContents()).map((n) => n.trim());
    expect(names.length, 'damage rows').toBeGreaterThan(3);
    expect(
      names.filter((n) => !n || RAW_LABEL.test(n)),
      'damage rows without a real name',
    ).toEqual([]);
  }).toPass({ timeout: 15_000 });

  // The table opens sorted by DPS, which is the order of the shares the summary takes its top three from.
  const top = names
    .slice(0, 3)
    .map((n) => `${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+%`)
    .join('\\s*·\\s*');
  const summary = page.getByTestId('run-summary');
  await expect(summary).toContainText(new RegExp(`Most damage\\s*${top}`));
  await expect(summary).not.toContainText(RAW_LABEL);
  return names;
}
