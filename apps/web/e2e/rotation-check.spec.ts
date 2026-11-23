import { expect, RAW_LABEL, test } from './helpers';

// The Rotation tab's check: what the engine says the draft's rotation will not do for this character, read from
// the same computeStats call that fills the caps panel. Which spells a preset rotation asks for, and the engine's
// wording, are upstream's and move with engine syncs, so this holds the page to what is ours: the kind a note
// is filed under, a spell's name where the engine printed its id, and a check that follows the rotation picked.

/** An id or unit label as the engine prints them: "{SpellID: 27801}", " (#1)". */
const ENGINE_RAW = /\{|\(#\d+\)/;

test('the rotation check names the spell a Smite priest never casts, and follows the rotation picked', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Start from a spec' })
    .getByRole('button', { name: 'Smite Testing', exact: true })
    .click();
  await expect(page).toHaveURL(/\/workbench$/);
  await page
    .getByRole('navigation', { name: 'Workbench' })
    .getByRole('link', { name: /^Rotation/ })
    .click();

  const rotations = page.getByRole('group', { name: 'Rotation preset' });
  await expect(rotations.getByRole('radio', { name: /^Smite/ })).toBeChecked();
  const check = page.getByRole('region', { name: 'Rotation check' });
  await expect(check).toContainText('What the engine says this rotation will not do for this character.');

  // Upstream's Smite preset stands 20 yd from the target with a 10 yd spell in its rotation. The engine's
  // sentence says so with the spell's id; here it is filed under "Never cast" and starts with the spell's name.
  const range = /Never cast\s*[A-Z][A-Za-z' ]+ reaches \d+ yd/;
  await expect(check).toContainText(range);
  await expect(check).not.toContainText(ENGINE_RAW);
  await expect(check).not.toContainText(RAW_LABEL);
  const smite = await check.innerText();

  // The Shadow rotation on the same Smite character: another check, about what this build does not have.
  // The Smite rotation's note is not left standing while the engine works on the new one.
  await rotations.getByRole('radio', { name: /^Default/ }).check();
  await expect(check).not.toContainText(range);
  await expect(check).toContainText(/Does not have\s*\d+\s*[A-Z]/);
  await expect(check).not.toContainText(ENGINE_RAW);
  await expect(check).not.toContainText(RAW_LABEL);
  expect(await check.innerText()).not.toBe(smite);

  // And back: the same check as before.
  await rotations.getByRole('radio', { name: /^Smite/ }).check();
  await expect(check).toContainText(range);
  expect(await check.innerText()).toBe(smite);
});

test('without an engine the rotation check says so and lists nothing', async ({ page }) => {
  // A build without a staged engine has no /engine/current.json (as in engine-unavailable.spec.ts).
  await page.route('**/engine/current.json', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Start from a spec' })
    .getByRole('button', { name: 'Smite Testing', exact: true })
    .click();
  await expect(page).toHaveURL(/\/workbench$/);
  await page
    .getByRole('navigation', { name: 'Workbench' })
    .getByRole('link', { name: /^Rotation/ })
    .click();

  const check = page.getByRole('region', { name: 'Rotation check' });
  await expect(check).toContainText('The engine is not available, so this rotation is not checked.');
  await expect(check.getByRole('term')).toHaveCount(0);
});
