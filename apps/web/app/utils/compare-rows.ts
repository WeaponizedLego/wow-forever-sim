// Pure parts of the Compare screen (composables/compare.ts): each variant against the baseline (Welch with
// the Top gear noise floor), stat sheet rows that differ, and a compact ability table across variants.
import {
  noiseFloor,
  welchTTest,
  type AbilityRow,
  type ParsedActionId,
  type SampleStats,
  type Verdict as WelchVerdict,
} from '@fsim/analysis';
import { PseudoStat, Stat, type UnitStats } from '@fsim/proto/common';
import type { Verdict } from '~/composables/ui-types';

export interface VsBaseline {
  /** mean − baseline mean. */
  delta: number;
  /** 1.96 · √(se² + se_ref²): |Δ| below it is within noise. */
  noise: number;
  /** Welch two-sided p; null for the baseline itself or too few iterations. */
  p: number | null;
  verdict: Verdict;
}

const VERDICT: Record<WelchVerdict, Verdict> = { better: 'up', worse: 'down', noise: 'noise' };

/** A run against the baseline, as Top gear ranks combinations against the equipped set. */
export function vsBaseline(r: SampleStats, ref: SampleStats, isBaseline: boolean): VsBaseline {
  const delta = r.mean - ref.mean;
  const noise = noiseFloor(r, ref);
  if (isBaseline || r.n < 2 || ref.n < 2)
    return { delta, noise, p: null, verdict: isBaseline ? 'reference' : 'noise' };
  const w = welchTTest(r, ref, { minDelta: noise });
  return { delta, noise, p: w.p, verdict: VERDICT[w.verdict] };
}

export interface CompareStatDef {
  label: string;
  src: { stat: Stat } | { pseudo: PseudoStat };
  digits: number;
  /** Shown with a % sign. */
  pct?: boolean;
}

const S = (label: string, stat: Stat): CompareStatDef => ({ label, src: { stat }, digits: 0 });
const P = (label: string, pseudo: PseudoStat): CompareStatDef => ({
  label,
  src: { pseudo },
  digits: 2,
  pct: true,
});

/** Every stat the Workbench sheet shows for any role; Compare lists the ones that differ. */
export const COMPARE_STATS: CompareStatDef[] = [
  S('Strength', Stat.StatStrength),
  S('Agility', Stat.StatAgility),
  S('Stamina', Stat.StatStamina),
  S('Intellect', Stat.StatIntellect),
  S('Spirit', Stat.StatSpirit),
  S('Attack power', Stat.StatAttackPower),
  S('Ranged attack power', Stat.StatRangedAttackPower),
  S('Spell damage', Stat.StatSpellDamage),
  S('Healing power', Stat.StatHealingPower),
  P('Melee hit', PseudoStat.PseudoStatMeleeHitPercent),
  P('Melee crit', PseudoStat.PseudoStatMeleeCritPercent),
  P('Ranged hit', PseudoStat.PseudoStatRangedHitPercent),
  P('Ranged crit', PseudoStat.PseudoStatRangedCritPercent),
  P('Spell hit', PseudoStat.PseudoStatSpellHitPercent),
  P('Spell crit', PseudoStat.PseudoStatSpellCritPercent),
  S('MP5', Stat.StatMP5),
  S('Mana', Stat.StatMana),
  S('Health', Stat.StatHealth),
  S('Armor', Stat.StatArmor),
];

export interface CompareStatRow {
  label: string;
  digits: number;
  pct: boolean;
  /** One per variant, in variant order; null where the sheet is missing. */
  values: (number | null)[];
}

const readStat = (u: UnitStats, src: CompareStatDef['src']) =>
  'stat' in src ? (u.stats[src.stat] ?? 0) : (u.pseudoStats[src.pseudo] ?? 0);

/** Stats where some variant differs from the first at the shown precision, in COMPARE_STATS order. */
export function statDiffRows(
  sheets: readonly (UnitStats | null | undefined)[],
  defs: readonly CompareStatDef[] = COMPARE_STATS,
): CompareStatRow[] {
  const base = sheets[0];
  if (!base) return [];
  const out: CompareStatRow[] = [];
  for (const d of defs) {
    const values = sheets.map((s) => (s ? readStat(s, d.src) : null));
    const half = 10 ** -d.digits / 2;
    const differs = values.some((v, i) => i > 0 && v !== null && Math.abs(v - values[0]!) >= half);
    if (differs) out.push({ label: d.label, digits: d.digits, pct: !!d.pct, values });
  }
  return out;
}

export interface CompareAbilityRow {
  key: string;
  id: ParsedActionId;
  /** DPS per variant, in variant order; 0 when the variant never used it, null without a result. */
  dps: (number | null)[];
}

/**
 * Abilities across variants: the `limit` biggest by their largest DPS in any variant, biggest first.
 * Sorting by the largest (not the baseline's) keeps an ability only one variant uses.
 */
export function abilityCompareRows(
  breakdowns: readonly (readonly AbilityRow[] | null | undefined)[],
  limit = 10,
): CompareAbilityRow[] {
  const byKey = new Map<string, CompareAbilityRow>();
  breakdowns.forEach((rows, i) => {
    for (const r of rows ?? []) {
      let row = byKey.get(r.key);
      if (!row) {
        row = { key: r.key, id: r.id, dps: breakdowns.map((b) => (b ? 0 : null)) };
        byKey.set(r.key, row);
      }
      row.dps[i] = (row.dps[i] ?? 0) + r.dps;
    }
  });
  const peak = (r: CompareAbilityRow) => Math.max(...r.dps.map((v) => v ?? 0));
  return [...byKey.values()].sort((a, b) => peak(b) - peak(a)).slice(0, limit);
}
