import { expect, openShamanInWorkbench, test, type Page } from './helpers';

async function addCandidate(page: Page, slot: string, item: string) {
  const row = page
    .getByRole('region', { name: 'Candidates' })
    .getByRole('listitem')
    .filter({ has: page.getByText(slot, { exact: true }) });
  await row.getByRole('button', { name: 'Add' }).click();
  await row.getByRole('searchbox', { name: `Search ${slot.toLowerCase()} items` }).fill(item);
  await row
    .getByRole('button', { name: new RegExp(`^${item}`) })
    .first()
    .click();
  await expect(row.getByRole('button', { name: `Remove ${item}` })).toBeVisible();
  await row.getByRole('button', { name: 'Done' }).click();
}

test('top gear: 3 candidates across 2 slots rank with verdicts', async ({ page }) => {
  await openShamanInWorkbench(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Top gear' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Top gear/ })).toBeVisible();

  await addCandidate(page, 'Head', 'Gemburst Circlet');
  await addCandidate(page, 'Head', 'Spellpower Goggles Xtreme Plus');
  await addCandidate(page, 'Neck', 'Vision of Voodress');

  // (equipped + 2) heads × (equipped + 1) necks.
  await page.getByRole('group', { name: 'Iterations' }).getByRole('button', { name: '1k' }).click();
  await page.getByRole('button', { name: 'Run 6 combinations' }).click();

  const ranking = page.getByRole('table', { name: 'Top gear ranking' });
  await expect(ranking).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('showing 6 of 6 · sorted by mean')).toBeVisible();
  // Header row + 6 combinations, one of them the equipped set; the rest each carry a verdict.
  await expect(ranking.getByRole('row')).toHaveCount(7);
  await expect(ranking.getByRole('row').filter({ hasText: 'Currently equipped' })).toHaveCount(1);
  const verdicts = ranking.getByRole('row').filter({ hasText: /Better|Worse|Within noise/ });
  await expect(verdicts).toHaveCount(5);
});
