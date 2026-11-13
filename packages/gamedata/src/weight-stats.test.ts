import { SPECS, type SpecId } from '@fsim/contracts';
import { PseudoStat, Stat } from '@fsim/proto/common';
import { describe, expect, it } from 'vitest';
import { weightStatsFor } from './weight-stats';

const WEAPON_DPS: readonly PseudoStat[] = [
  PseudoStat.PseudoStatMainHandDps,
  PseudoStat.PseudoStatOffHandDps,
  PseudoStat.PseudoStatRangedDps,
];
const weaponDps = (id: SpecId) => weightStatsFor(id).pseudoStats.filter((p) => WEAPON_DPS.includes(p));

describe('weightStatsFor', () => {
  it('weighs its reference stat, without duplicates, for every spec', () => {
    for (const { id } of SPECS) {
      const w = weightStatsFor(id);
      expect(w.stats, id).toContain(w.reference);
      expect(new Set(w.stats).size, id).toBe(w.stats.length);
      expect(new Set(w.pseudoStats).size, id).toBe(w.pseudoStats.length);
    }
  });

  it('reads healers for healing and everyone else for damage', () => {
    for (const s of SPECS) expect(weightStatsFor(s.id).metric).toBe(s.role === 'healer' ? 'hps' : 'dps');
  });

  it("weighs weapon DPS for weapon users (upstream's epPseudoStats), not for casters or healers", () => {
    const mhOh = [PseudoStat.PseudoStatMainHandDps, PseudoStat.PseudoStatOffHandDps];
    expect(weaponDps('dps-warrior')).toEqual(mhOh);
    expect(weaponDps('rogue')).toEqual(mhOh);
    expect(weaponDps('enhancement-shaman')).toEqual([PseudoStat.PseudoStatMainHandDps]);
    expect(weaponDps('retribution-paladin')).toEqual([PseudoStat.PseudoStatMainHandDps]);
    expect(weaponDps('hunter')).toEqual([PseudoStat.PseudoStatRangedDps]);
    for (const id of ['elemental-shaman', 'mage', 'warlock', 'balance-druid', 'dps-priest'] as const)
      expect(weaponDps(id), id).toEqual([]);
    for (const s of SPECS.filter((x) => x.role === 'healer')) expect(weaponDps(s.id), s.id).toEqual([]);
  });

  it("matches upstream's elemental shaman list", () => {
    expect(weightStatsFor('elemental-shaman')).toEqual({
      stats: [
        Stat.StatIntellect,
        Stat.StatSpirit,
        Stat.StatSpellDamage,
        Stat.StatFireDamage,
        Stat.StatNatureDamage,
        Stat.StatSpellPiercing,
        Stat.StatHitRating,
        Stat.StatCritRating,
        Stat.StatHasteRating,
        Stat.StatMP5,
      ],
      pseudoStats: [],
      reference: Stat.StatSpellDamage,
      metric: 'dps',
    });
  });
});
