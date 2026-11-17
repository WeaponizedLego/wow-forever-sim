import { ArmorType, HandType, ItemType, Stat, WeaponType } from '@fsim/proto/common';
import type { UIItem } from '@fsim/proto/ui';
import { describe, expect, it } from 'vitest';
import { maxScaling } from './database';
import { instanceDrops, lootInstance, lootInstances, usableDrops, valuedBySpec } from './drops';
import { ItemSearchIndex, requiredLevel } from './search';
import { RAID_ZONES } from './sources';
import { fixtureDb } from './test-db';

const db = fixtureDb();
const MC = RAID_ZONES.MC;
const SCHOLOMANCE = 2057;
const TIRISFAL = 85;

describe('lootInstances', () => {
  const all = lootInstances(db);

  it('lists raids, then dungeons, and no open-world zones', () => {
    const kinds = all.map((i) => i.kind);
    expect(kinds.indexOf('dungeon')).toBeGreaterThan(0);
    expect(kinds.lastIndexOf('raid')).toBeLessThan(kinds.indexOf('dungeon'));
    // The fixture predates Onyxia's loot; the other raids are there.
    for (const id of [RAID_ZONES.MC, RAID_ZONES.BWL, RAID_ZONES.AQ40, RAID_ZONES.Naxx])
      expect(lootInstance(db, id)?.kind).toBe('raid');
    expect(lootInstance(db, SCHOLOMANCE)?.kind).toBe('dungeon');
    expect(lootInstance(db, TIRISFAL)).toBeUndefined();
    expect(lootInstances(db)).toBe(all); // cached
  });

  it('names bosses from the NPC table and puts trash after them', () => {
    const scholo = lootInstance(db, SCHOLOMANCE)!;
    const bosses = scholo.sources.filter((s) => s.kind === 'boss');
    expect(bosses.length).toBeGreaterThan(5);
    for (const b of bosses) expect(b.name).toBe(db.npcs.get(b.npcId!)!.name.trim());
    expect(bosses.map((b) => b.name)).toEqual(
      [...bosses.map((b) => b.name)].sort((a, b) => a.localeCompare(b)),
    );
    const last = scholo.sources.at(-1)!;
    expect(last).toMatchObject({ key: 'other:Trash', kind: 'trash', npcId: null });
  });

  it('counts a boss row with category "Trash" as the zone\'s trash (AQ20)', () => {
    const aq20 = lootInstance(db, RAID_ZONES.AQ20)!;
    expect(aq20.sources.find((s) => s.kind === 'trash')?.itemIds.length).toBeGreaterThan(0);
  });

  it('keeps named non-NPC sources apart from trash', () => {
    const gnomer = lootInstance(db, 721)!;
    expect(gnomer.sources.find((s) => s.key === 'other:Multiple NPCs')?.kind).toBe('other');
  });

  it('agrees with the item search boss filter', () => {
    const index = new ItemSearchIndex(db);
    const mc = lootInstance(db, MC)!;
    for (const boss of mc.sources.filter((s) => s.npcId)) {
      const found = index.search({ npcId: boss.npcId!, limit: 10_000 }).map((i) => i.id);
      expect(new Set(found)).toEqual(new Set(boss.itemIds));
    }
  });
});

describe('instanceDrops', () => {
  it('unions the chosen sources without duplicates', () => {
    const inst = lootInstance(db, SCHOLOMANCE)!;
    const all = instanceDrops(db, SCHOLOMANCE);
    const ids = all.map((d) => d.item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const two = inst.sources.slice(0, 2);
    const some = instanceDrops(
      db,
      SCHOLOMANCE,
      two.map((s) => s.key),
    );
    expect(some.length).toBe(new Set(two.flatMap((s) => s.itemIds)).size);
    expect(some.every((d) => d.sources.every((s) => two.includes(s)))).toBe(true);
    expect(instanceDrops(db, TIRISFAL)).toEqual([]);
  });
});

describe('usableDrops', () => {
  const scholo = instanceDrops(db, SCHOLOMANCE).map((d) => d.item);

  it('keeps what a mage can wear and values, with the reason for the rest', () => {
    const { usable, skipped } = usableDrops(scholo, { class: 'mage', spec: 'mage', level: 60 });
    expect(usable.length).toBeGreaterThan(5);
    expect(usable.length + skipped.length).toBe(scholo.length);
    for (const { item } of usable) {
      expect(item.armorType).toBeLessThanOrEqual(ArmorType.ArmorTypeCloth);
      expect(valuedBySpec(item, 'mage')).toBe(true);
    }
    const plate = skipped.find((s) => s.item.armorType === ArmorType.ArmorTypePlate);
    expect(plate?.reason).toBe('class');
  });

  it('offers rings and trinkets in both slots', () => {
    const { usable } = usableDrops(scholo, { class: 'mage', spec: 'mage', level: 60 });
    const ring = usable.find((u) => u.item.type === ItemType.ItemTypeFinger);
    expect(ring?.slots).toEqual(['finger1', 'finger2']);
  });

  it('offers one-handers in the off hand only to dual wielders', () => {
    const items = lootInstances(db)
      .flatMap((i) => instanceDrops(db, i.zoneId))
      .map((d) => d.item);
    const sword = (u: { item: { weaponType: WeaponType; handType: HandType } }) =>
      u.item.weaponType === WeaponType.WeaponTypeSword && u.item.handType === HandType.HandTypeOneHand;
    const warrior = usableDrops(items, { class: 'warrior', spec: 'dps-warrior', level: 60 }).usable.find(
      sword,
    );
    expect(warrior?.slots).toEqual(['mainHand', 'offHand']);
    const paladin = usableDrops(items, {
      class: 'paladin',
      spec: 'retribution-paladin',
      level: 60,
    }).usable.find(sword);
    expect(paladin?.slots).toEqual(['mainHand']);
  });

  it('skips drops above the character level', () => {
    const { usable, skipped } = usableDrops(scholo, { class: 'mage', spec: 'mage', level: 40 });
    expect(usable.every((u) => requiredLevel(u.item) <= 40)).toBe(true);
    expect(skipped.some((s) => s.reason === 'level')).toBe(true);
  });

  it('skips stats the spec does not weigh', () => {
    const stat = (i: UIItem, s: Stat) => (maxScaling(i)?.stats[s] ?? 0) || (i.stats[s] ?? 0);
    const strengthOnly = scholo.find(
      (i) =>
        stat(i, Stat.StatStrength) > 0 &&
        !stat(i, Stat.StatIntellect) &&
        !stat(i, Stat.StatSpellDamage) &&
        !stat(i, Stat.StatCritRating) &&
        !stat(i, Stat.StatHitRating) &&
        i.itemEffects.length === 0 &&
        !i.setId &&
        i.armorType <= ArmorType.ArmorTypeCloth &&
        i.type !== ItemType.ItemTypeWeapon,
    );
    expect(strengthOnly).toBeDefined();
    expect(valuedBySpec(strengthOnly!, 'mage')).toBe(false);
    const caster = scholo.find((i) => stat(i, Stat.StatSpellDamage) > 0)!;
    expect(valuedBySpec(caster, 'mage')).toBe(true);
  });
});
