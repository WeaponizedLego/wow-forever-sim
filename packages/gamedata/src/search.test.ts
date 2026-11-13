import { ArmorType, ItemQuality, ItemType } from '@fsim/proto/common';
import { describe, expect, it } from 'vitest';
import { itemLevel } from './database';
import { ItemSearchIndex } from './search';
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
});
