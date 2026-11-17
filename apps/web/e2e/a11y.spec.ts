import AxeBuilder from '@axe-core/playwright';
import { expect, openShamanInWorkbench, simDraft, test, type Page } from './helpers';

// axe-core smoke on each main page: only serious and critical violations count.
//
// KNOWN lists violations found when this suite was written. They are app bugs, reported to the lead, and are
// left unfixed here (this lane does not edit components). A known violation is skipped so the smoke still
// catches new ones; when it is fixed, the test fails until its entry is deleted, so the list cannot go stale.
const KNOWN: Record<string, { id: string; why: string }[]> = {
  // Empty: the two found when this suite was written (role-less chart hit areas, the GearTable "Empty"
  // label's contrast) are fixed. Add an entry here only for a violation that is reported and tracked.
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
