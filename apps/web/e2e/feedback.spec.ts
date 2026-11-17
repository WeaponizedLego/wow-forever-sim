import { expect, openShamanInWorkbench, pasteShaman, test, type Page } from './helpers';

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const combobox = (page: Page) => palette(page).getByRole('combobox');
async function paletteOption(page: Page, query: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(combobox(page)).toBeFocused();
  await combobox(page).fill(query);
  const id = await combobox(page).getAttribute('aria-activedescendant');
  return page.locator(`[id="${id}"]`);
}

test('sharing confirms with a toast, or shows the link to copy when the clipboard is blocked', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openShamanInWorkbench(page);
  const toast = page.getByTestId('toast');
  await expect(toast).toHaveRole('status');

  // Share draft: the link lands on the clipboard and a polite status says so, then hides.
  const shareDraft = page.getByRole('region', { name: 'Sim' }).getByRole('button', { name: 'Share draft' });
  await shareDraft.click();
  await expect(toast).toHaveText('Link copied');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/s#.+/);
  await expect(toast).toHaveText('', { timeout: 10_000 });

  // The palette's command closes the palette and confirms the same way.
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.keyboard.press('ControlOrMeta+k');
  await combobox(page).fill('copy share link');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
  await expect(toast).toHaveText('Link copied');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/s#.+/);

  // Clipboard blocked: the link shows in a selectable field with a Copy button; Esc closes it, focus goes back.
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'));
  });
  await shareDraft.click();
  const panel = page.getByRole('group', { name: 'Copy this share link' });
  await expect(panel).toBeVisible();
  const field = panel.getByRole('textbox', { name: 'Copy this share link' });
  await expect(field).toHaveValue(/\/s#.+/);
  await expect(field).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Copy' })).toBeVisible();
  // Copy still blocked: says how to copy by hand.
  await panel.getByRole('button', { name: 'Copy' }).click();
  await expect(panel.getByRole('alert')).toContainText('press ⌘C or Ctrl+C');
  await field.press('Escape');
  await expect(panel).toBeHidden();
  await expect(shareDraft).toBeFocused();
});

test('the iterations choice is remembered and used by every sim start', async ({ page }) => {
  await openShamanInWorkbench(page);
  const bar = page.getByRole('region', { name: 'Sim' });
  await bar.getByRole('button', { name: '1k' }).click();
  await page.reload();
  await expect(bar.getByRole('button', { name: '1k' })).toHaveAttribute('aria-pressed', 'true');

  // The palette's Run sim says what it will run, stat weights included when the box is ticked.
  await expect(bar.getByRole('checkbox', { name: 'Stat weights' })).toBeChecked();
  let option = await paletteOption(page, 'run sim');
  await expect(option).toContainText('Run sim + stat weights');
  await expect(option).toContainText('1k iterations');
  await page.keyboard.press('Escape');
  await bar.getByRole('checkbox', { name: 'Stat weights' }).uncheck();
  option = await paletteOption(page, 'run sim');
  await expect(option).not.toContainText('stat weights');
  await expect(option).toContainText('1k iterations');
  await page.keyboard.press('Escape');

  // The start screen's Sim as-is uses (and sets) the same choice.
  const parsed = await pasteShaman(page);
  const iterations = parsed.getByRole('group', { name: 'Iterations' });
  await expect(iterations.getByRole('button', { name: '1k' })).toHaveAttribute('aria-pressed', 'true');
  await expect(parsed.getByText('Sim as-is runs 1,000 iterations')).toBeVisible();
  await iterations.getByRole('button', { name: '25k' }).click();
  await expect(parsed.getByText('Sim as-is runs 25,000 iterations')).toBeVisible();
  await parsed.getByRole('button', { name: 'Open in workbench' }).click();
  await expect(bar.getByRole('button', { name: '25k' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bar.getByRole('checkbox', { name: 'Stat weights' })).not.toBeChecked();
});
