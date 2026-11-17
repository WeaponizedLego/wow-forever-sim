import { expect, openShamanInWorkbench, simDraft, test, type Page } from './helpers';

const talentsPanel = (page: Page) => page.getByRole('region', { name: 'Talents' });
const engineString = (page: Page) =>
  talentsPanel(page).getByRole('textbox', { name: 'Engine talent string' });

test('the SimC loadout talents arrive converted, build a tree by clicking, sim it, and the run carries the build', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openShamanInWorkbench(page);

  // The export's client loadout string, converted on import: Enhancement 25, Restoration 8.
  const tabs = page.getByRole('navigation', { name: 'Workbench' });
  await tabs.getByRole('link', { name: /^Talents/ }).click();
  await expect(page).toHaveURL(/tab=talents$/);
  const panel = talentsPanel(page);
  await panel.locator('summary', { hasText: 'Engine talent string' }).click(); // open the advanced <details>
  await expect(engineString(page)).toHaveValue('-0530303100212122-053');
  await expect(panel.getByTestId('talent-total')).toHaveText('0/25/8 · 33/51');

  // Clear Enhancement and Restoration, then spend in Elemental by clicking.
  await panel.getByRole('button', { name: 'Reset Enhancement' }).click();
  await panel.getByRole('button', { name: 'Reset Restoration' }).click();
  await expect(panel.getByTestId('talent-total')).toHaveText('0/0/0 · 0/51');

  const elemental = panel.getByRole('region', { name: 'Elemental tree' });
  const talents = elemental.getByRole('button', { name: /, \d of \d/ });
  // The second row starts locked: it needs 5 points in Elemental.
  const rowTwo = elemental.locator('button[data-talent]').nth(
    await elemental.locator('button[data-talent]').evaluateAll((els) => {
      const tops = els.map((e) => (e.parentElement?.parentElement as HTMLElement | null)?.style.top ?? '');
      return tops.findIndex((t) => t !== tops[0]);
    }),
  );
  await expect(rowTwo).toHaveAccessibleName(/, 0 of \d, locked$/);

  // Fill the first row: click every talent in it until it is maxed (extra clicks are no-ops).
  const first = talents.first();
  for (let i = 0; i < 5; i++) await first.click();
  await expect(first).toHaveAccessibleName(/, (\d) of \1, maxed$/);
  const spentAfterFirst = Number((await first.getAttribute('aria-label'))!.match(/, (\d) of/)![1]);
  // Spend up to 5 in row 1 with the second talent, then the second row opens.
  const second = talents.nth(1);
  for (let i = spentAfterFirst; i < 5; i++) await second.click();
  await expect(elemental.getByLabel(/points in Elemental/)).toHaveText('5');
  await expect(rowTwo).toHaveAccessibleName(/, 0 of \d, available$/);
  await rowTwo.click();
  await expect(elemental.getByLabel(/points in Elemental/)).toHaveText('6');

  // Right-click takes a point back; a first-row point the second row depends on cannot go.
  await rowTwo.click({ button: 'right' });
  await expect(elemental.getByLabel(/points in Elemental/)).toHaveText('5');
  await rowTwo.click();
  await expect(first).toHaveAttribute('aria-disabled', 'true'); // maxed, and holding up the second row
  await first.click({ button: 'right', force: true });
  await expect(elemental.getByLabel(/points in Elemental/)).toHaveText('6');
  // The refusal says why, in a status line under the tree and in the talent's tooltip (which no longer offers removal).
  const refusal = "Can't remove: talents in tier 2 need 5 points above them";
  await expect(elemental.getByRole('status')).toHaveText(refusal);
  await first.hover();
  const tip = elemental.getByRole('tooltip').filter({ hasText: refusal });
  await expect(tip).toBeVisible();
  await expect(tip).not.toContainText('Right-click: remove');
  // The same for the keyboard: Backspace on the maxed first-row talent is refused with the reason.
  await page.mouse.move(0, 0);
  await expect(elemental.getByRole('status')).toHaveText('', { timeout: 10_000 });
  await first.focus();
  await page.keyboard.press('Backspace');
  await expect(elemental.getByRole('status')).toHaveText(refusal);
  await expect(elemental.getByLabel(/points in Elemental/)).toHaveText('6');

  // Keyboard: Backspace on the focused talent removes, Enter adds.
  await rowTwo.focus();
  await page.keyboard.press('Backspace');
  await expect(elemental.getByLabel(/points in Elemental/)).toHaveText('5');
  await page.keyboard.press('Enter');
  await expect(elemental.getByLabel(/points in Elemental/)).toHaveText('6');

  const built = await engineString(page).inputValue();
  expect(built).toMatch(/^\d+$/); // Elemental only
  await expect(panel.getByTestId('talent-total')).toHaveText('6/0/0 · 6/51');
  await expect(page.getByRole('region', { name: 'Pending changes' }).getByText(built)).toBeVisible();

  // Sim the draft, then share the run: the link's character carries exactly the clicked build.
  await simDraft(page, '0001');
  await page.getByRole('button', { name: 'Share', exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/s#.+/);
  await page.goto(await page.evaluate(() => navigator.clipboard.readText()));
  await expect(page.getByRole('definition').filter({ hasText: new RegExp(`^${built}$`) })).toBeVisible();
});
