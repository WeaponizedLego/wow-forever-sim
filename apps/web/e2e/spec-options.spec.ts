import { expect, expectNamedAbilities, simDraft, test } from './helpers';

// Upstream's Survival build plays without a pet. Give it one on the Workbench's Options tab: the form marks it
// against the preset, the pending changes name it, and the next sim has the pet's damage.
test('give the SV hunter preset a pet in the options, see the change named, and sim it', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  const specs = page.getByRole('region', { name: 'Start from a spec' });
  await specs.getByRole('button', { name: 'SV', exact: true }).click();
  await expect(page).toHaveURL(/\/workbench$/);

  // The pet's rows on the run page are named after the pet: "<ability> (Cat)".
  const petRows = (names: string[]) => names.filter((n) => / \(Cat\)$/.test(n));
  await simDraft(page, '0001');
  expect(petRows(await expectNamedAbilities(page))).toEqual([]);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workbench' }).click();
  const tabs = page.getByRole('navigation', { name: 'Workbench' });
  await tabs.getByRole('link', { name: /^Options/ }).click();
  await expect(page).toHaveURL(/tab=options$/);

  const options = page.getByRole('region', { name: 'Options' });
  const pending = page.getByRole('region', { name: 'Pending changes' });
  const pet = options.getByLabel('Pet type');
  // As the preset has it: no pet, nothing marked, nothing pending.
  await expect(pet).toHaveValue('PetNone');
  await expect(options.getByText(/^preset:/)).toHaveCount(0);
  await expect(options.getByRole('button', { name: /^Reset to/ })).toHaveCount(0);
  await expect(pending.getByText('No changes since run #0001.')).toBeVisible();

  await pet.selectOption({ label: 'Cat' });
  await expect(options.getByText('preset: None')).toBeVisible();
  await expect(tabs.getByRole('link', { name: /^Options/ })).toContainText('1 changed');
  await expect(pending.getByText('Pet type: None → Cat')).toBeVisible();

  await simDraft(page, '0002');
  expect(petRows(await expectNamedAbilities(page)).length).toBeGreaterThan(0);
  // The summary names the kind of change since the previous run of this character.
  await expect(page.getByTestId('run-summary')).toContainText(/vs run #0001, .*Changed: options\./);

  // Back on the tab the pet is still marked against the preset; Reset puts the preset's options back, which is
  // now a pending change against the run that had the pet.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workbench' }).click();
  await tabs.getByRole('link', { name: /^Options/ }).click();
  await expect(pet).toHaveValue('Cat');
  await expect(pending.getByText('No changes since run #0002.')).toBeVisible();
  await options.getByRole('button', { name: 'Reset to the SV preset’s' }).click();
  await expect(pet).toHaveValue('PetNone');
  await expect(options.getByText(/^preset:/)).toHaveCount(0);
  await expect(pending.getByText('Pet type: Cat → None')).toBeVisible();
});
