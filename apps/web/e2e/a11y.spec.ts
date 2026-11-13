import AxeBuilder from '@axe-core/playwright';
import { expect, openShamanInWorkbench, simDraft, test, type Page } from './helpers';

// axe-core smoke on each main page: only serious and critical violations count.
//
// KNOWN lists violations found when this suite was written. They are app bugs, reported to the lead, and are
// left unfixed here (this lane does not edit components). A known violation is skipped so the smoke still
// catches new ones; when it is fixed, the test fails until its entry is deleted, so the list cannot go stale.
const KNOWN: Record<string, { id: string; why: string }[]> = {
  // Histogram/LineBand `.hit` and AuraLanes `.lane__track`: focusable <div tabindex=0 aria-label=…> with no
  // role, so the label is not exposed. Needs a role (e.g. role="img" or "group") on those elements.
  '/runs/0001': [{ id: 'aria-prohibited-attr', why: 'aria-label on role-less chart hit areas / aura lanes' }],
  // GearTable: the "Empty" text inside an empty slot's button uses --text-disabled, below 4.5:1 contrast.
  '/workbench': [{ id: 'color-contrast', why: 'GearTable "Empty" slot label (--text-disabled)' }],
};

async function check(page: Page, path: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const known = KNOWN[path] ?? [];
  for (const k of known) {
    test.info().annotations.push({ type: 'known a11y bug', description: `${path} ${k.id}: ${k.why}` });
  }
  const ids = serious.map((v) => v.id);
  const unexpected = serious
    .filter((v) => !known.some((k) => k.id === v.id))
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.target.join(' ')),
    }));
  expect.soft(unexpected, `new serious/critical axe violations on ${path}`).toEqual([]);
  for (const k of known) {
    expect.soft(ids, `${path}: known violation ${k.id} is gone; delete it from KNOWN`).toContain(k.id);
  }
}

test('a11y: start, workbench, run and top gear pages have no new serious violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'New run', level: 1 })).toBeVisible();
  await check(page, '/');

  await openShamanInWorkbench(page);
  await check(page, '/workbench');

  await simDraft(page, '0001');
  await expect(page.getByRole('region', { name: 'Run notes' })).toBeVisible();
  await check(page, '/runs/0001');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Top gear' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Top gear/ })).toBeVisible();
  await check(page, '/top-gear');
});
