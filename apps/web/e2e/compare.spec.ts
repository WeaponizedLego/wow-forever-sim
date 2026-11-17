import { expect, openShamanInWorkbench, test, type Page } from './helpers';

/** Rows written straight into the variants database, as an older (or broken) build might have left them. */
async function seedVariantRows(page: Page, rows: unknown[]) {
  await page.evaluate(
    (rows) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('fsim-variants', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('variants', { keyPath: 'id' });
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction('variants', 'readwrite');
          for (const row of rows) tx.objectStore('variants').put(row);
          tx.oncomplete = () => (r.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    rows,
  );
}

async function saveVariantAs(page: Page, name: string) {
  const pending = page.getByRole('region', { name: 'Pending changes' });
  await pending.getByRole('button', { name: 'Save as variant' }).click();
  const status = pending.getByRole('status');
  await expect(status).toHaveText(/^Saved (Variant \d+)/);
  const saved = /Saved (Variant \d+)/.exec(await status.innerText())![1]!;
  const list = pending.getByRole('region', { name: 'Saved variants' });
  await list.getByRole('button', { name: `Rename ${saved}` }).click();
  await list.getByRole('textbox', { name: `New name for ${saved}` }).fill(name);
  await list.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(list.getByText(name, { exact: true })).toBeVisible();
}

async function equipHead(page: Page, from: RegExp, item: string) {
  await page.getByRole('button', { name: from }).click();
  const picker = page.getByRole('dialog', { name: 'Pick head item' });
  await picker.getByRole('searchbox', { name: /Search items/ }).fill(item);
  await picker
    .getByRole('list', { name: 'Items' })
    .getByRole('button', { name: new RegExp(`^${item}`) })
    .click();
  await picker.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(picker).toBeHidden();
}

test('compare: two saved variants that differ in one item, simmed side by side with a delta', async ({
  page,
}) => {
  await openShamanInWorkbench(page);
  await saveVariantAs(page, 'Circlet');
  await equipHead(page, /^Head: Captain's Circlet of the Boar/, "Cassandra's Grace");
  await saveVariantAs(page, 'Cassandra');

  // Delete and undo: the variant comes back.
  const list = page.getByRole('region', { name: 'Saved variants' });
  await list.getByRole('button', { name: 'Delete Circlet' }).click();
  await expect(list.getByText('Circlet', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(list.getByText('Circlet', { exact: true })).toBeVisible();

  // Variants are kept in IndexedDB: still there after a reload. So is the draft (localStorage).
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Compare' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Compare/ })).toBeVisible();
  // Writes go to IndexedDB in the background (in order); wait for the last (the undo) to land.
  await expect.poll(() => storedVariantCount(page)).toBe(2);
  await page.reload();
  const picker = page.getByRole('list', { name: 'Variants to compare' });
  await expect(picker.getByRole('checkbox', { name: 'Circlet' })).toBeVisible();
  await expect(picker.getByRole('checkbox', { name: 'Cassandra' })).toBeVisible();
  await expect(picker.getByRole('checkbox', { name: 'Current draft' })).toBeVisible();

  // The first ticked is the baseline (A).
  await picker.getByRole('checkbox', { name: 'Circlet' }).check();
  await picker.getByRole('checkbox', { name: 'Cassandra' }).check();
  await page.getByRole('group', { name: 'Iterations' }).getByRole('button', { name: '1k' }).click();
  await page.getByRole('button', { name: 'Compare 2 variants' }).click();

  const table = page.getByRole('table', { name: 'DPS by variant', exact: true });
  await expect(table.getByRole('row').filter({ hasText: /Better|Worse|Within noise/ })).toHaveCount(1, {
    timeout: 60_000,
  });
  await expect(table.getByRole('row')).toHaveCount(3);
  const base = table.getByRole('row').filter({ hasText: 'Circlet' });
  await expect(base).toContainText('Baseline');
  const b = table.getByRole('row').filter({ hasText: 'Cassandra' });
  // Mean DPS and a signed delta vs A.
  await expect(b).toContainText(/\d{3}\.\d/);
  await expect(b).toContainText(/[+−]\d+\.\d/);

  // What differs: exactly the head slot.
  const differs = page.getByRole('region', { name: 'B Cassandra vs A' });
  await expect(differs).toContainText('Head');
  await expect(differs.getByText(/Cassandra's Grace/)).toBeVisible();
  await expect(differs.getByText(/Captain's Circlet of the Boar/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Ability DPS by variant' })).toBeVisible();

  // Open B in the workbench: it becomes the draft.
  await page.getByRole('button', { name: 'Open B Cassandra in workbench' }).click();
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.getByRole('button', { name: /^Head: Cassandra's Grace/ })).toBeVisible();
});

test('compare: variants saved by an older build still load; an unreadable one is listed for deletion', async ({
  page,
}) => {
  await page.goto('/');
  // A character as an early build stored it: no level, buffs, encounter, consumables or options.
  const stale = (id: string, name: string, createdAt: string) => ({
    id,
    name,
    createdAt,
    character: {
      class: 'shaman',
      spec: 'elemental-shaman',
      race: 'orc',
      gear: { head: { itemId: 10504 } },
      talents: '',
      rotation: { kind: 'preset', presetId: 'default' },
    },
  });
  await seedVariantRows(page, [
    stale('old-1', 'Old one', '2026-11-01T00:00:00.000Z'),
    stale('old-2', 'Old two', '2026-11-02T00:00:00.000Z'),
    { id: 'broken', name: 'From the future', character: { spec: 'not-a-spec' } },
  ]);

  await page.goto('/compare');
  const picker = page.getByRole('list', { name: 'Variants to compare' });
  await expect(picker.getByRole('checkbox', { name: 'Old one' })).toBeVisible();
  await expect(picker.getByRole('checkbox', { name: 'Old two' })).toBeVisible();
  await expect(picker.getByText('From the future')).toHaveCount(0);

  // The workbench lists the unreadable row so it can be deleted; deleting removes it from storage.
  await openShamanInWorkbench(page);
  const list = page.getByRole('region', { name: 'Saved variants' });
  await expect(list.getByText(/cannot be read/)).toBeVisible();
  await list.getByRole('button', { name: 'Delete From the future' }).click();
  await expect(list.getByText('From the future')).toHaveCount(0);
  // The delete is written in the background; once it lands, a reload no longer sees the row.
  await expect.poll(() => storedVariantCount(page)).toBe(2);
  await page.goto('/compare');
  // The two old variants, plus the current draft (kept across the reload).
  const after = page.getByRole('list', { name: 'Variants to compare' });
  await expect(after.getByRole('checkbox')).toHaveCount(3);
  await expect(after.getByRole('checkbox', { name: 'Current draft' })).toBeVisible();
});

function storedVariantCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const r = indexedDB.open('fsim-variants', 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const q = r.result.transaction('variants').objectStore('variants').count();
          q.onsuccess = () => (r.result.close(), resolve(q.result));
        };
      }),
  );
}
