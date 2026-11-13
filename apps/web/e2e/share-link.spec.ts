import { expect, kpiValue, openShamanInWorkbench, simDraft, test } from './helpers';

// Share link round trip: sim, share from the run page, open the link in a fresh browser context (no shared
// in-memory state or IndexedDB), check the character arrived, and sim it. Same engine + same seed + same
// iterations must give exactly the sharer's mean.
test('share link round trip restores the character and reproduces the result', async ({ page, browser }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openShamanInWorkbench(page);
  await simDraft(page, '0001');
  const original = await kpiValue(page, 'Mean DPS · 95% CI');

  // The page header's Share; the ability table also has a sortable "Share" column header.
  await page.getByRole('button', { name: 'Share', exact: true }).first().click();
  // Sharing compresses the payload first, then writes the clipboard: wait for the link to land.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/s#.+/);
  const link = await page.evaluate(() => navigator.clipboard.readText());

  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage();
    await other.goto(link);
    await expect(other.getByRole('heading', { level: 1, name: /Testshaman/ })).toBeVisible();
    await expect(other.getByText("Captain's Circlet of the Boar")).toBeVisible();

    await other.getByRole('button', { name: 'Sim it' }).click();
    await expect(other).toHaveURL(/\/runs\/0001$/, { timeout: 60_000 });
    expect(await kpiValue(other, 'Mean DPS · 95% CI')).toBe(original);
  } finally {
    await fresh.close();
  }
});
