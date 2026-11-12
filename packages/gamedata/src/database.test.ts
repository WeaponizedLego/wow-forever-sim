import { ItemSlot, ItemType } from '@fsim/proto/common';
import { describe, expect, it } from 'vitest';
import { itemLevel, loadDatabase } from './database';
import { toImportContext } from './import-context';
import { CLASS_COLORS, ITEM_QUALITY_COLORS } from './colors';
import { primarySourceLabel } from './sources';
import { fixtureBytes, fixtureDb } from './test-db';

describe('loadDatabase', () => {
  const db = fixtureDb();

  it('decodes db.bin and appends leftovers like upstream proto.Merge', () => {
    const main = loadDatabase(fixtureBytes('db.bin'));
    expect(main.raw.items).toHaveLength(7212);
    expect(db.raw.items).toHaveLength(7212 + 3730);
    expect(db.items.size).toBe(7212 + 3730);
    expect(db.raw.enchants).toHaveLength(248 + 20);
    expect(db.consumables.size).toBe(431);
    expect(db.spellEffects.size).toBe(71);
    expect(db.zones.size).toBeGreaterThan(100);
    expect(db.npcs.size).toBeGreaterThan(600);
    expect(db.itemEffectRandPropPoints.size).toBeGreaterThan(200);
  });

  it('looks up items, item levels, suffixes and enchants', () => {
    const helm = db.item(16677)!; // Beaststalker's Cap, in the Survival Hunter fixture
    expect(helm.type).toBe(ItemType.ItemTypeHead);
    expect(itemLevel(helm)).toBeGreaterThan(50);
    expect(db.randomSuffixes.get(12728)).toBeDefined();
    const enchant = db.findEnchant(1891, db.item(16674))!; // chest enchant from the fixture
    expect(enchant.effectId).toBe(1891);
    expect(db.enchantsByEffectId(1891).length).toBeGreaterThan(0);
    expect(db.enchantsForSlot(ItemSlot.ItemSlotWrist).length).toBeGreaterThan(0);
    expect(db.enchantsForItem(db.item(16681)!).some((e) => e.effectId === 7656)).toBe(true);
  });

  it('labels sources for the gear table', () => {
    const labels = [...db.items.values()].slice(0, 2000).map((i) => primarySourceLabel(db, i.sources));
    expect(labels.some((l) => /^Crafted · /.test(l))).toBe(true);
    expect(labels.some((l) => / · /.test(l) && !/^(Crafted|Quest|Vendor)/.test(l))).toBe(true);
  });
});

describe('toImportContext', () => {
  it('answers item and enchant questions by effect, item or spell id', () => {
    const db = fixtureDb();
    const ctx = toImportContext(db, 'b2047bf');
    expect(ctx.dataBuild).toBe('b2047bf');
    expect(ctx.hasItem(16677)).toBe(true);
    expect(ctx.hasItem(1)).toBe(false);
    const e = db.raw.enchants.find((x) => x.spellId && x.itemId)!;
    expect(ctx.hasEnchant(e.effectId)).toBe(true);
    expect(ctx.hasEnchant(e.spellId)).toBe(true);
    expect(ctx.hasEnchant(e.itemId)).toBe(true);
    expect(ctx.hasEnchant(999_999_999)).toBe(false);
    // Enchant Chest - Major Stamina: spell 20026 applies effect 1892.
    expect(ctx.enchantIdForSpell(20026)).toBe(1892);
    expect(ctx.enchantIdForSpell(e.spellId)).toBe(e.effectId);
    expect(ctx.enchantIdForSpell(999_999_999)).toBeUndefined();
  });
});

describe('colors', () => {
  it('match tokens.css', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../../../apps/web/app/assets/css/tokens.css', import.meta.url), 'utf8');
    for (const [cls, hex] of Object.entries(CLASS_COLORS)) expect(css).toContain(`--class-${cls}: ${hex};`);
    for (const [name, q] of [
      ['common', 1],
      ['uncommon', 2],
      ['rare', 3],
      ['epic', 4],
      ['legendary', 5],
    ] as const) {
      expect(css).toContain(`--quality-${name}: ${ITEM_QUALITY_COLORS[q]};`);
    }
  });
});
