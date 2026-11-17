import { expect, openShamanInWorkbench, test, type Page } from './helpers';

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const combobox = (page: Page) => palette(page).getByRole('combobox');

async function openWithKeyboard(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await expect(combobox(page)).toBeFocused();
}

/** The option the combobox points at with aria-activedescendant. */
async function activeOption(page: Page) {
  const id = await combobox(page).getAttribute('aria-activedescendant');
  expect(id).toBeTruthy();
  return page.locator(`[id="${id}"]`);
}

test('the palette opens with the keyboard, moves with the arrows and navigates', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'New run', level: 1 })).toBeVisible();
  const trigger = page.getByRole('button', { name: /Search or run a command/ });

  // Opened from the page body; Esc closes it and focus goes back.
  await trigger.focus();
  await openWithKeyboard(page);
  const listbox = palette(page).getByRole('listbox', { name: 'Results' });
  await expect(listbox.getByRole('group', { name: 'Navigation' })).toBeVisible();
  await expect(await activeOption(page)).toHaveAttribute('aria-selected', 'true');
  const first = await combobox(page).getAttribute('aria-activedescendant');
  await page.keyboard.press('ArrowDown');
  expect(await combobox(page).getAttribute('aria-activedescendant')).not.toBe(first);
  await page.keyboard.press('Tab'); // focus stays in the dialog
  await expect(combobox(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
  await expect(trigger).toBeFocused();

  // Fuzzy: "tpgr" finds Top gear.
  await openWithKeyboard(page);
  await combobox(page).fill('tpgr');
  await expect(await activeOption(page)).toContainText('Top gear');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/top-gear$/);
  await expect(palette(page)).toBeHidden();

  // The top bar button opens it too.
  await trigger.click();
  await expect(combobox(page)).toBeFocused();
  await combobox(page).fill('new run');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
});

test('find an item in the palette and land in the item picker with it selected', async ({ page }) => {
  await openShamanInWorkbench(page);
  // From another page: the palette takes you to the workbench. (In-app navigation keeps the character.)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Top gear' }).click();
  await expect(page).toHaveURL(/\/top-gear$/);
  await openWithKeyboard(page);
  await combobox(page).fill("cassandra's grace");
  const option = palette(page)
    .getByRole('group', { name: 'Items' })
    .getByRole('option', { name: /Cassandra's Grace/ });
  await expect(option).toBeVisible(); // the item index loads on the first item search
  await expect(option).toContainText('Head');
  await option.click();

  await expect(page).toHaveURL(/\/workbench$/);
  const picker = page.getByRole('dialog', { name: 'Pick head item' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('searchbox', { name: /Search items/ })).toHaveValue("Cassandra's Grace");
  await expect(picker.getByRole('button', { name: /^Cassandra's Grace/, pressed: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByRole('button', { name: /^Head: Cassandra's Grace/ })).toBeVisible();
});

test('run a sim from the palette', async ({ page }) => {
  await openShamanInWorkbench(page);
  // The palette runs the sim bar's sim, with its settings: keep it short.
  const bar = page.getByRole('region', { name: 'Sim' });
  await bar.getByRole('button', { name: '1k' }).click();
  await bar.getByRole('checkbox', { name: 'Stat weights' }).uncheck();

  await openWithKeyboard(page);
  await combobox(page).fill('run sim');
  const option = await activeOption(page);
  await expect(option).toContainText('Run sim');
  await expect(option).toContainText('1k iterations');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/runs\/0001$/, { timeout: 60_000 });

  // Recent runs are listed, and choosing one opens it.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'New run' }).click();
  await expect(page).toHaveURL(/\/$/);
  await openWithKeyboard(page);
  await combobox(page).fill('#0001');
  await expect(palette(page).getByRole('group', { name: 'Recent runs' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/runs\/0001$/);
});
