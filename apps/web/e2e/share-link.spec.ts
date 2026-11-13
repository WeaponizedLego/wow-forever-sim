import { expect, openShamanInWorkbench, simDraft, test } from './helpers';

// FIXME(P1 share links): enable after the P1 lane (share links at /s#<fragment>) merges into phase-3.
// Expected round trip:
//   1. Import the shaman export, sim it (run #0001), and on the run page press "Share".
//   2. The share link is /s#<compressed character + settings + engine tag>, copied to the clipboard
//      (and/or shown in a field we can read).
//   3. Open that link in a fresh browser context (no in-memory state carried over).
//   4. The app loads the engine version pinned in the link and opens the same character: workbench header
//      "Testshaman · Dwarf Elemental Shaman", Head = Captain's Circlet of the Boar, same fight settings.
//   5. Sim it at 1k: the mean is in the same band as the original run (250–400 DPS). If the link pins the
//      same seed and iteration count, the mean matches the original exactly.
// Adjust the locators below to whatever P1 ships (button name, where the link is shown).
test.fixme('share link round trip restores the character and settings', async ({ page, browser }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openShamanInWorkbench(page);
  await simDraft(page, '0001');
  await page.getByRole('button', { name: 'Share' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/s#.+/);

  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto(link);
  await expect(other.getByRole('heading', { level: 1, name: /Testshaman/ })).toBeVisible();
  await expect(other.getByRole('button', { name: /^Head: Captain's Circlet of the Boar/ })).toBeVisible();
  await fresh.close();
});
