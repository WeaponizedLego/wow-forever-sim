// What to weigh for each spec: the one definition the Workbench (sim bar, item values) and the run page's
// stat weights button share.
//
// The stat lists mirror upstream's default EP stats: `epStats`, `epPseudoStats` and `epReferenceStat` in
// wowsims/forever ui/specs/<class>/<spec>/spec.ts at the commit in engine.lock.json (80ef867). Keep them in
// step with upstream on an engine sync rather than editing them by hand. Some listed stats do nothing in the
// engine for a given character (haste rating for a level-42 elemental shaman comes back exactly 0 ± 0);
// the stat weights panel hides those instead of the list being trimmed here.
import { SPECS, type SpecId } from '@fsim/contracts';
import { PseudoStat as P, Stat as S } from '@fsim/proto/common';

export interface WeightStats {
  stats: S[];
  /** Weapon DPS and the like; weapon DPS lets the Workbench value weapon swaps. */
  pseudoStats: P[];
  /** EP reference stat (EP = 1). Always one of `stats`. */
  reference: S;
  /** The metric the weights are read for: healing for healers, damage for everyone else. */
  metric: 'dps' | 'hps';
}

interface Upstream {
  stats: readonly S[];
  pseudoStats: readonly P[];
  reference: S;
}

const HEALER: Upstream = {
  stats: [S.StatIntellect, S.StatSpirit, S.StatHealingPower, S.StatCritRating, S.StatHasteRating, S.StatMP5],
  pseudoStats: [],
  reference: S.StatHealingPower,
};

const TANK_STATS = (extra: readonly S[]): S[] => [
  S.StatStamina,
  S.StatStrength,
  ...extra,
  S.StatAgility,
  S.StatAttackPower,
  S.StatHitRating,
  S.StatHasteRating,
  S.StatCritRating,
  S.StatArmorPenetration,
  S.StatExpertiseRating,
  S.StatDefenseRating,
  S.StatBlockRating,
  S.StatBlockValue,
  S.StatDodgeRating,
  S.StatParryRating,
  S.StatArmor,
  S.StatBonusArmor,
  S.StatArmorNoMods,
];

/** Upstream's lists, per spec (ui/specs/<upstreamDir>/spec.ts). */
const UPSTREAM: Record<SpecId, Upstream> = {
  'balance-druid': {
    stats: [
      S.StatIntellect,
      S.StatSpellDamage,
      S.StatArcaneDamage,
      S.StatNatureDamage,
      S.StatSpellPiercing,
      S.StatHitRating,
      S.StatCritRating,
      S.StatHasteRating,
      S.StatMP5,
      S.StatSpirit,
    ],
    pseudoStats: [],
    reference: S.StatSpellDamage,
  },
  'feral-cat-druid': {
    stats: [
      S.StatStrength,
      S.StatAgility,
      S.StatAttackPower,
      S.StatFeralAttackPower,
      S.StatPhysicalDamage,
      S.StatHitRating,
      S.StatExpertiseRating,
      S.StatCritRating,
      S.StatHasteRating,
      S.StatArmorPenetration,
    ],
    pseudoStats: [P.PseudoStatMainHandDps],
    reference: S.StatAgility,
  },
  'feral-bear-druid': {
    stats: [
      S.StatStamina,
      S.StatAgility,
      S.StatStrength,
      S.StatAttackPower,
      S.StatFeralAttackPower,
      S.StatArmor,
      S.StatBonusArmor,
      S.StatArmorNoMods,
      S.StatDodgeRating,
      S.StatDefenseRating,
      S.StatHitRating,
      S.StatCritRating,
      S.StatHasteRating,
      S.StatExpertiseRating,
      S.StatPhysicalDamage,
      S.StatArmorPenetration,
    ],
    pseudoStats: [P.PseudoStatMainHandDps],
    reference: S.StatAgility,
  },
  'restoration-druid': HEALER,
  hunter: {
    stats: [
      S.StatAgility,
      S.StatStrength,
      S.StatIntellect,
      S.StatMP5,
      S.StatAttackPower,
      S.StatRangedAttackPower,
      S.StatArmorPenetration,
      S.StatHitRating,
      S.StatHasteRating,
      S.StatCritRating,
      S.StatExpertiseRating,
      S.StatPhysicalDamage,
    ],
    pseudoStats: [P.PseudoStatRangedHitPercent, P.PseudoStatRangedCritPercent, P.PseudoStatRangedDps],
    reference: S.StatAgility,
  },
  mage: {
    stats: [
      S.StatIntellect,
      S.StatSpirit,
      S.StatSpellDamage,
      S.StatArcaneDamage,
      S.StatFrostDamage,
      S.StatFireDamage,
      S.StatSpellPiercing,
      S.StatHitRating,
      S.StatCritRating,
      S.StatHasteRating,
      S.StatMana,
      S.StatMP5,
    ],
    pseudoStats: [
      P.PseudoStatSchoolHitPercentArcane,
      P.PseudoStatSchoolHitPercentFire,
      P.PseudoStatSchoolHitPercentFrost,
    ],
    reference: S.StatSpellDamage,
  },
  'holy-paladin': HEALER,
  'protection-paladin': {
    stats: TANK_STATS([S.StatSpellDamage]),
    pseudoStats: [P.PseudoStatMainHandDps],
    reference: S.StatStrength,
  },
  'retribution-paladin': {
    stats: [
      S.StatStrength,
      S.StatAgility,
      S.StatIntellect,
      S.StatSpellDamage,
      S.StatSpellPiercing,
      S.StatAttackPower,
      S.StatArmorPenetration,
      S.StatHitRating,
      S.StatHasteRating,
      S.StatCritRating,
      S.StatExpertiseRating,
      S.StatMP5,
    ],
    pseudoStats: [P.PseudoStatMainHandDps, P.PseudoStatSchoolHitPercentHoly],
    reference: S.StatAttackPower,
  },
  'dps-priest': {
    stats: [
      S.StatIntellect,
      S.StatSpellDamage,
      S.StatShadowDamage,
      S.StatHolyDamage,
      S.StatSpellPiercing,
      S.StatHitRating,
      S.StatCritRating,
      S.StatHasteRating,
      S.StatMana,
      S.StatMP5,
      S.StatSpirit,
    ],
    pseudoStats: [P.PseudoStatSchoolHitPercentShadow, P.PseudoStatSchoolHitPercentHoly],
    reference: S.StatSpellDamage,
  },
  'healer-priest': { ...HEALER, stats: [...HEALER.stats, S.StatMana] },
  rogue: {
    stats: [
      S.StatStamina,
      S.StatAgility,
      S.StatStrength,
      S.StatCritRating,
      S.StatHasteRating,
      S.StatHitRating,
      S.StatExpertiseRating,
      S.StatArmorPenetration,
      S.StatSpellPiercing,
      S.StatAttackPower,
      S.StatPhysicalDamage,
    ],
    pseudoStats: [P.PseudoStatMainHandDps, P.PseudoStatOffHandDps],
    reference: S.StatAttackPower,
  },
  'elemental-shaman': {
    stats: [
      S.StatIntellect,
      S.StatSpirit,
      S.StatSpellDamage,
      S.StatFireDamage,
      S.StatNatureDamage,
      S.StatSpellPiercing,
      S.StatHitRating,
      S.StatCritRating,
      S.StatHasteRating,
      S.StatMP5,
    ],
    pseudoStats: [],
    reference: S.StatSpellDamage,
  },
  'enhancement-shaman': {
    stats: [
      S.StatStrength,
      S.StatAgility,
      S.StatIntellect,
      S.StatAttackPower,
      S.StatHitRating,
      S.StatCritRating,
      S.StatHasteRating,
      S.StatExpertiseRating,
      S.StatArmorPenetration,
      S.StatSpellDamage,
      S.StatNatureDamage,
      S.StatSpellPiercing,
    ],
    pseudoStats: [P.PseudoStatMainHandDps],
    reference: S.StatAttackPower,
  },
  'restoration-shaman': HEALER,
  warlock: {
    stats: [
      S.StatStamina,
      S.StatIntellect,
      S.StatSpirit,
      S.StatSpellDamage,
      S.StatShadowDamage,
      S.StatFireDamage,
      S.StatHitRating,
      S.StatCritRating,
      S.StatHasteRating,
      S.StatSpellPiercing,
      S.StatMP5,
    ],
    pseudoStats: [],
    reference: S.StatSpellDamage,
  },
  'dps-warrior': {
    stats: [
      S.StatStrength,
      S.StatAgility,
      S.StatAttackPower,
      S.StatArmorPenetration,
      S.StatHitRating,
      S.StatHasteRating,
      S.StatCritRating,
      S.StatExpertiseRating,
    ],
    pseudoStats: [P.PseudoStatMainHandDps, P.PseudoStatOffHandDps],
    reference: S.StatStrength,
  },
  'protection-warrior': {
    stats: TANK_STATS([]),
    pseudoStats: [P.PseudoStatMainHandDps],
    reference: S.StatStrength,
  },
};

/** What to weigh for a spec, its EP reference stat and the metric to read the weights for (fresh arrays). */
export function weightStatsFor(spec: SpecId): WeightStats {
  const u = UPSTREAM[spec];
  const role = SPECS.find((s) => s.id === spec)?.role;
  return {
    stats: [...u.stats],
    pseudoStats: [...u.pseudoStats],
    reference: u.reference,
    metric: role === 'healer' ? 'hps' : 'dps',
  };
}
