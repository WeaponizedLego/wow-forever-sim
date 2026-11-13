import { readFileSync } from 'node:fs';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

/** The real WoW Forever SimC export: Elemental Shaman, level 42, sims around 315 DPS. */
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
 * The sim bar resets to its defaults (5k, stat weights on) each time the workbench mounts, so set both every time.
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
