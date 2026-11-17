import { deflateRawSync } from 'node:zlib';
import { expect, openShamanInWorkbench, simDraft, test, type Page } from './helpers';

// Character lineages (utils/lineage.ts), the persisted Workbench draft (utils/draft-store.ts), the run
// links that used to be dead ends, and the pre-sim guard for gear the game data lacks.

const simBar = (page: Page) => page.getByRole('region', { name: 'Sim' });

/** Picks a spec preset on the start screen; it opens in the workbench. */
async function startFromPreset(page: Page, name: string) {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Start from a spec' })
    .getByRole('button', { name, exact: true })
    .click();
  await expect(page).toHaveURL(/\/workbench$/);
}

test('a new character never shows another character’s run as its baseline', async ({ page }) => {
  await openShamanInWorkbench(page);
  await simDraft(page, '0001');

  // Character B from a spec preset: a new lineage, so no last run, no "vs #0001".
  await startFromPreset(page, 'Elemental');
  await expect(page.getByRole('heading', { level: 1, name: /Elemental Shaman/ })).toBeVisible();
  await expect(page.getByText(/draft from import · not simmed yet/)).toBeVisible();
  await expect(page.getByText(/draft from run #0001/)).toHaveCount(0);
  await expect(simBar(page).getByRole('button', { name: /^Sim draft(?! vs)/ })).toBeVisible();
  const lastRun = page
    .getByRole('term')
    .filter({ hasText: /^Last run$/ })
    .locator('xpath=following-sibling::dd');
  await expect(lastRun).toHaveText('—');

  // Its first run has no baseline and no Δ card.
  await simDraft(page, '0002');
  await expect(page.getByText('run #0002 · no baseline')).toBeVisible();
  await expect(page.getByText(/^Δ vs baseline/)).toHaveCount(0);

  // A second run of B is compared with B's first, not with A.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workbench' }).click();
  await expect(simBar(page).getByRole('button', { name: 'Sim draft vs #0002' })).toBeVisible();
  await simDraft(page, '0003');
  await expect(page.getByText(/^Δ vs baseline #0002/)).toBeVisible();
});

test('the workbench draft survives a reload, and a typed URL with only history offers the latest run', async ({
  page,
}) => {
  await openShamanInWorkbench(page);
  await simDraft(page, '0001');
  await page.goto('/workbench');
  await expect(page.getByRole('heading', { level: 1, name: /Testshaman/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /Testshaman/ })).toBeVisible();
  await expect(page.getByText(/draft from run #0001/)).toBeVisible();
  await expect(simBar(page).getByRole('button', { name: 'Sim draft vs #0001' })).toBeVisible();

  // No stored draft (cleared storage), but the run history is there: no dead end.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText('No character to edit')).toBeVisible();
  await page.getByRole('button', { name: 'Open run #0001' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Testshaman/ })).toBeVisible();
  await expect(page.getByText(/draft from run #0001/)).toBeVisible();
});

test('a Recent runs row opens its run, and Add variant opens that run’s character', async ({ page }) => {
  await openShamanInWorkbench(page);
  await simDraft(page, '0001');
  // Load another character, so the workbench no longer holds the shaman.
  await startFromPreset(page, 'Elemental');

  await page.goto('/');
  const row = page.getByRole('region', { name: 'Recent runs' }).getByRole('row').filter({ hasText: '#0001' });
  // Click the character cell, not the run-number link.
  await row.getByText('Testshaman').click();
  await expect(page).toHaveURL(/\/runs\/0001$/);

  await page.getByRole('button', { name: 'Add variant' }).click();
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.getByRole('heading', { level: 1, name: /Testshaman/ })).toBeVisible();
  await expect(page.getByText(/draft from run #0001/)).toBeVisible();
  await expect(simBar(page).getByRole('button', { name: 'Sim draft vs #0001' })).toBeVisible();
});

/** A share link (utils/share-codec.ts, v1) whose mage wears a trinket no data build has. */
function bogusItemLink(): string {
  const payload = {
    v: 1,
    character: {
      name: 'Bogusmage',
      class: 'mage',
      spec: 'mage',
      race: 'human',
      gear: { trinket1: { itemId: 999999 } },
      talents: '',
      rotation: { kind: 'preset', presetId: 'default' },
    },
    iterations: 1000,
    seed: 7,
    engineId: 'any-engine',
    kind: 'draft',
  };
  const b64 = deflateRawSync(Buffer.from(JSON.stringify(payload)))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `/s#${b64}`;
}

test('gear missing from the game data is left out of the sim, with a readable warning', async ({ page }) => {
  await page.goto(bogusItemLink());
  await expect(page.getByRole('heading', { level: 1, name: /Bogusmage/ })).toBeVisible();

  // The workbench names the slot and id before anyone sims.
  await page.getByRole('link', { name: 'Open in workbench' }).click();
  await expect(page).toHaveURL(/\/workbench$/);
  const warning = page.getByTestId('left-out');
  await expect(warning).toContainText('Trinket 1 item 999999');

  // The sim runs (the engine would panic on the unknown id), and the run says what was left out.
  await simDraft(page, '0001');
  await expect(
    page.getByText(/Trinket 1 item 999999 is not in data build .* left out of the sim/),
  ).toBeVisible();
  await expect(page.getByText(/goroutine|Stack Trace/)).toHaveCount(0);
});
