import { ArmorType, ItemQuality, ItemType } from '@fsim/proto/common';
import { describe, expect, it } from 'vitest';
import { itemLevel } from './database';
import { ItemSearchIndex, requiredLevel } from './search';
import { sourceKind } from './sources';
import { fixtureDb } from './test-db';

const db = fixtureDb();
const index = new ItemSearchIndex(db);

describe('ItemSearchIndex', () => {
  it('finds warrior-usable bracers in < 5 ms', () => {
    const query = { text: 'bracers', slot: 'wrist', class: 'warrior' } as const;
    const hits = index.search(query);
    expect(hits.length).toBeGreaterThan(10);
    for (const item of hits) {
      expect(item.name.toLowerCase()).toContain('bracers');
      expect(item.type).toBe(ItemType.ItemTypeWrist);
    }
    // Micro-benchmark: median of many runs, after warm-up.
    for (let i = 0; i < 20; i++) index.search(query);
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t = performance.now();
      index.search(query);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const median = times[50]!;
    console.log(`search "bracers" wrist+warrior: median ${median.toFixed(3)} ms over ${index.size} items`);
    expect(median).toBeLessThan(5);
  });

  it('filters by class armor type', () => {
    const mage = index.search({ slot: 'wrist', class: 'mage', limit: 10_000 });
    expect(mage.every((i) => i.armorType <= ArmorType.ArmorTypeCloth)).toBe(true);
    const warrior = index.search({ slot: 'wrist', class: 'warrior', limit: 10_000 });
    expect(warrior.some((i) => i.armorType === ArmorType.ArmorTypePlate)).toBe(true);
    expect(warrior.length).toBeGreaterThan(mage.length);
  });

  it('keeps off-hand weapons to specs that dual wield', () => {
    const one = (spec: 'dps-warrior' | 'protection-paladin') =>
      index.search({
        slot: 'offHand',
        class: spec === 'dps-warrior' ? 'warrior' : 'paladin',
        spec,
        limit: 10_000,
      });
    const warriorOh = one('dps-warrior');
    const paladinOh = one('protection-paladin');
    expect(warriorOh.length).toBeGreaterThan(paladinOh.length);
    // A paladin's off hand holds only shields and held-in-off-hand items.
    expect(paladinOh.every((i) => i.weaponType === 7 || i.weaponType === 5)).toBe(true);
  });

  it('filters by quality, item level and source', () => {
    const hits = index.search({
      qualities: [ItemQuality.ItemQualityEpic],
      minIlvl: 66,
      maxIlvl: 80,
      sources: ['raid'],
      limit: 10_000,
    });
    expect(hits.length).toBeGreaterThan(50);
    for (const item of hits) {
      expect(item.quality).toBe(ItemQuality.ItemQualityEpic);
      expect(itemLevel(item)).toBeGreaterThanOrEqual(66);
      expect(item.sources.some((s) => sourceKind(s) === 'raid')).toBe(true);
    }
    const crafted = index.search({ sources: ['crafted'], limit: 5 });
    expect(crafted.every((i) => i.sources.some((s) => s.source.oneofKind === 'crafted'))).toBe(true);
  });

  it('filters by zone and boss', () => {
    const mc = index.search({ zoneId: 2717, limit: 10_000 });
    expect(mc.length).toBeGreaterThan(5);
    const npc = mc
      .flatMap((i) => i.sources)
      .find((s) => s.source.oneofKind === 'drop' && s.source.drop.npcId > 0);
    expect(npc).toBeDefined();
    if (npc?.source.oneofKind !== 'drop') return;
    const boss = index.search({ npcId: npc.source.drop.npcId, limit: 1000 });
    expect(boss.length).toBeGreaterThan(0);
    expect(boss.length).toBeLessThan(mc.length);
  });

  it('matches every word of the text, any order', () => {
    const hits = index.search({ text: 'cap beaststalker' });
    expect(hits.some((i) => i.id === 16677)).toBe(true);
    expect(index.search({ text: 'zzzz-no-such-item' })).toHaveLength(0);
  });

  describe('required level', () => {
    // Seal of Ascension: a level-60 quest reward (ilvl 61) whose reqLvl is 0 in the data.
    const SEAL_OF_ASCENSION = 12344;

    it('estimates a missing reqLvl from the item level', () => {
      const seal = db.item(SEAL_OF_ASCENSION)!;
      expect(seal.reqLvl).toBe(0);
      expect(requiredLevel(seal)).toBe(56);
      const listed = [...db.items.values()].find((i) => i.reqLvl === 42)!;
      expect(requiredLevel(listed)).toBe(42);
      // Crystal-Infused Cleaver: one of Forever's own ilvl 62 items, with reqLvl 1 in the data.
      expect(requiredLevel(db.item(279908)!)).toBe(57);
    });

    it('matches the listed reqLvl for nearly every item that has one', () => {
      const listed = [...db.items.values()].filter((i) => i.reqLvl > 1 && i.reqLvl < 60);
      const estimate = (i: (typeof listed)[number]) => requiredLevel({ ...i, reqLvl: 0 });
      const exact = listed.filter((i) => estimate(i) === i.reqLvl).length;
      const tooHigh = listed.filter((i) => estimate(i) > i.reqLvl + 2).length;
      expect(exact / listed.length).toBeGreaterThan(0.95);
      expect(tooHigh / listed.length).toBeLessThan(0.005);
    });

    it('keeps high-level items away from a level-42 character', () => {
      const hits = index.search({
        class: 'shaman',
        spec: 'elemental-shaman',
        maxRequiredLevel: 42,
        limit: 100_000,
      });
      expect(hits.length).toBeGreaterThan(1000);
      expect(hits.some((i) => i.id === SEAL_OF_ASCENSION)).toBe(false);
      for (const i of hits) expect(requiredLevel(i)).toBeLessThanOrEqual(42);
      // Listed items at reqLvl 42 go up to ilvl 47; nothing far above that should show.
      expect(Math.max(...hits.map(itemLevel))).toBeLessThanOrEqual(50);
      const at60 = index.search({
        class: 'shaman',
        spec: 'elemental-shaman',
        maxRequiredLevel: 60,
        limit: 100_000,
      });
      expect(at60.some((i) => i.id === SEAL_OF_ASCENSION)).toBe(true);
    });
  });

  describe('duplicate items', () => {
    const ids = (name: string) =>
      index
        .search({ text: name, limit: 1000 })
        .filter((i) => i.name.toLowerCase() === name)
        .map((i) => i.id);

    it('lists an item that the data has under several ids once', () => {
      // Sergeant's Cloak: 16341 (vendor + PvP) and Forever's re-add 272451 (PvP), otherwise identical.
      expect(ids("sergeant's cloak")).toContain(16341);
      expect(ids("sergeant's cloak")).not.toContain(272451);
      // Insignia of the Horde: 8 class versions, each also re-added by Forever (16 ids).
      expect(ids('insignia of the horde')).toHaveLength(8);
      // The kept row carries the duplicates' sources too.
      const pvp = index.search({ text: "sergeant's cloak", sources: ['pvp'] });
      expect(pvp.filter((i) => i.name === "Sergeant's Cloak").map((i) => i.id)).toContain(16341);
    });

    it('keeps quality tiers and faction variants apart', () => {
      expect(ids('vision of voodress').sort()).toEqual([19606, 19607, 19608]);
      expect(ids('ironbark staff').sort()).toEqual([20069, 20220]);
    });

    it('returns no two results that are the same item', () => {
      const all = index.search({ limit: 100_000 });
      expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
      expect(all.length).toBeLessThan(db.items.size);
    });
  });
});
