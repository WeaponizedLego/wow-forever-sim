import { expect, openShamanInWorkbench, pasteShaman, simDraft, test, type Page } from './helpers';

// Phone width (375 × 812, touch): the main nav sits behind a Menu button, and no page scrolls sideways
// (wide tables scroll inside their panel, or stack as cards).
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

/** The page is no wider than the screen. */
async function expectNoSidewaysScroll(page: Page, where: string) {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(
    scrollWidth,
    `${where}: page is ${scrollWidth}px wide on a ${innerWidth}px screen`,
  ).toBeLessThanOrEqual(innerWidth);
}

test('the Menu button opens every page, marks the current one, and closes with Esc', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: 'Workbench' })).toBeHidden();
  // The palette's search button stays in the bar.
  await expect(page.getByRole('button', { name: 'Search or run a command' })).toBeVisible();

  // Opening focuses the current page's link; Esc closes and gives focus back to the button.
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  const here = nav.getByRole('link', { name: 'New run' });
  await expect(here).toHaveAttribute('aria-current', 'page');
  await expect(here).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
  await expect(here).toBeHidden();

  const pages: [string, RegExp][] = [
    ['Runs', /\/runs$/],
    ['Workbench', /\/workbench$/],
    ['Top gear', /\/top-gear$/],
    ['Droptimizer', /\/droptimizer$/],
    ['Compare', /\/compare$/],
    ['New run', /\/$/],
  ];
  for (const [label, url] of pages) {
    await menu.click();
    await nav.getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
    // A tap outside the list closes it too.
    await page.mouse.click(2, 600); // the page gutter
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  }
});

test('no page scrolls sideways, and the gear table shows every column', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await expectNoSidewaysScroll(page, 'start');
  await pasteShaman(page);
  await expectNoSidewaysScroll(page, 'start with a parse report');

  await openShamanInWorkbench(page);
  await expectNoSidewaysScroll(page, 'workbench gear');
  // The gear table stacks into cards: every cell, Enchant and Value included, is on screen.
  const gear = page.getByRole('table', { name: 'Equipped gear' });
  const right = await gear.evaluate((t) =>
    Math.max(...[...t.querySelectorAll('td')].map((td) => td.getBoundingClientRect().right)),
  );
  expect(right).toBeLessThanOrEqual(375);
  await expect(gear.getByRole('cell', { name: /^Enchant/ }).first()).toBeVisible();
  await expect(gear.getByRole('cell', { name: /^Value/ }).first()).toBeVisible();

  // Every workbench tab is in view (the tabs wrap rather than scroll).
  const tabs = page.getByRole('navigation', { name: 'Workbench' }).getByRole('link');
  for (const tab of await tabs.all()) {
    const box = (await tab.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  }
  for (const tab of ['Talents', 'Buffs', 'Fight', 'Rotation']) {
    await page
      .getByRole('navigation', { name: 'Workbench' })
      .getByRole('link', { name: new RegExp(`^${tab}`) })
      .click();
    await expectNoSidewaysScroll(page, `workbench ${tab}`);
  }
  await page.getByRole('navigation', { name: 'Workbench' }).getByRole('link', { name: /^Gear/ }).click();
  // A saved variant, so Compare has something to compare.
  const pending = page.getByRole('region', { name: 'Pending changes' });
  await pending.getByRole('button', { name: 'Save as variant' }).click();
  await expect(pending.getByRole('status')).toHaveText(/^Saved Variant 1/);

  await simDraft(page, '0001');
  await expect(page.getByRole('table').first()).toBeVisible();
  await expectNoSidewaysScroll(page, 'run');

  await page.goto('/compare');
  await expect(page.getByRole('heading', { level: 1, name: /Compare/ })).toBeVisible();
  await expectNoSidewaysScroll(page, 'compare');
  const picker = page.getByRole('list', { name: 'Variants to compare' });
  await picker.getByRole('checkbox', { name: 'Variant 1' }).check();
  await picker.getByRole('checkbox', { name: 'Current draft' }).check();
  await page.getByRole('group', { name: 'Iterations' }).getByRole('button', { name: '1k' }).click();
  await page.getByRole('button', { name: 'Compare 2 variants' }).click();
  await expect(page.getByRole('table', { name: 'DPS by variant', exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expectNoSidewaysScroll(page, 'compare results');

  await page.goto('/droptimizer');
  await page.getByLabel('Dungeon or raid').selectOption({ label: 'Scarlet Monastery' });
  await expect(page.getByRole('table', { name: 'Drops to sim' })).toBeVisible();
  await expectNoSidewaysScroll(page, 'droptimizer');

  await page.goto('/top-gear');
  await expect(page.getByRole('heading', { level: 1, name: /Top gear/ })).toBeVisible();
  await expectNoSidewaysScroll(page, 'top gear');
});
