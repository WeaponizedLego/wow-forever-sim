// Run analysis: everything the /runs/[id] panels show, derived from one run (and its baseline) with
// @fsim/analysis. Components only format what comes out of here.
import type { Ref } from 'vue';
import {
  abilityBreakdown,
  auraLanes,
  convergence,
  cooldownKeysFromLog,
  damageSeries,
  distributionHistogram,
  evaluateNotes,
  findPlayer,
  parseCombatLog,
  resourceSeries,
  resourceWaste,
  sharedRange,
  statWeightRows,
  summarize,
  welchTTest,
  type ActionKey,
  type RunNote,
  type StatRef,
} from '@fsim/analysis';
import type { SpecId } from '@fsim/contracts';
import { weightStatsFor as sharedWeightStats, type WeightStats } from '@fsim/gamedata';
import { PseudoStat, Stat } from '@fsim/proto/common';
import type { StatWeightsResult } from '@fsim/proto/api';
import type { RunEntry } from './session';

/** "Nice" round tick values covering [lo, hi], about `count` of them. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** "#0004" → "0004", for URLs. */
export const runSlug = (id: string) => id.replace(/^#/, '');

// ------------------------------------------------------------------------------------ stat weights

const S = Stat;

/**
 * What the stat weights button weighs for a spec: upstream's default EP stats (shared with the Workbench,
 * see @fsim/gamedata weight-stats.ts).
 */
export function weightStatsFor(spec: SpecId): WeightStats {
  return sharedWeightStats(spec);
}

const STAT_LABELS: Partial<Record<Stat, string>> = {
  [S.StatStrength]: 'Strength',
  [S.StatAgility]: 'Agility',
  [S.StatStamina]: 'Stamina',
  [S.StatIntellect]: 'Intellect',
  [S.StatSpirit]: 'Spirit',
  [S.StatSpellDamage]: 'Spell damage',
  [S.StatHealingPower]: 'Healing power',
  [S.StatAttackPower]: 'Attack power',
  [S.StatRangedAttackPower]: 'Ranged AP',
  [S.StatHitRating]: 'Hit rating',
  [S.StatCritRating]: 'Crit rating',
  [S.StatHasteRating]: 'Haste rating',
  [S.StatExpertiseRating]: 'Expertise rating',
  [S.StatDefenseRating]: 'Defense rating',
  [S.StatDodgeRating]: 'Dodge rating',
  [S.StatArmor]: 'Armor',
  [S.StatMP5]: 'MP5',
  [S.StatSpellPiercing]: 'Spell penetration',
};
/** "StatFireDamage" → "Fire damage", "PseudoStatSchoolHitPercentFire" → "School hit percent fire". */
const enumLabel = (name: string, prefix: string) => {
  const words = name.replace(prefix, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return words.charAt(0) + words.slice(1).toLowerCase();
};
export const statLabel = (s: Stat) => STAT_LABELS[s] ?? (Stat[s] ? enumLabel(Stat[s], 'Stat') : `Stat ${s}`);

const PSEUDO_LABELS: Partial<Record<PseudoStat, string>> = {
  [PseudoStat.PseudoStatMainHandDps]: 'Main-hand DPS',
  [PseudoStat.PseudoStatOffHandDps]: 'Off-hand DPS',
  [PseudoStat.PseudoStatRangedDps]: 'Ranged weapon DPS',
};
export const pseudoStatLabel = (p: PseudoStat) =>
  PSEUDO_LABELS[p] ?? (PseudoStat[p] ? enumLabel(PseudoStat[p], 'PseudoStat') : `Pseudo stat ${p}`);
export const statRefLabel = (r: StatRef) => (r.kind === 'stat' ? statLabel(r.stat) : pseudoStatLabel(r.stat));

// ------------------------------------------------------------------------------------ the analysis

export interface TimelineLane {
  key: ActionKey;
  name: string;
  uptime: number;
  segments: [number, number][];
  cooldown: boolean;
}

/** Most lanes the timeline shows; cooldowns first, then by fight-1 uptime. */
const MAX_LANES = 8;
/** Share of fight 1 from which an aura counts as always on. */
const ALWAYS_ON = 0.99;
const RESOURCE_PREFERENCE = ['rage', 'energy', 'focus', 'mana'];

/**
 * `statWeights` is passed on its own: the session attaches weights to the existing run entry, so a
 * computed over the entry would not see them arrive.
 */
export function useRunAnalysis(
  entry: Ref<RunEntry | null>,
  base: Ref<RunEntry | null>,
  statWeights: Ref<StatWeightsResult | null>,
) {
  const names = useActionNames();

  const dps = computed(() => entry.value?.result.raidMetrics?.dps ?? null);
  const baseDps = computed(() => base.value?.result.raidMetrics?.dps ?? null);

  const summary = computed(() =>
    dps.value ? summarize(dps.value, entry.value!.result.iterationsDone) : null,
  );
  const baseSummary = computed(() =>
    baseDps.value ? summarize(baseDps.value, base.value!.result.iterationsDone) : null,
  );

  const welch = computed(() => {
    const a = summary.value;
    const b = baseSummary.value;
    if (!a || !b || a.n < 2 || b.n < 2) return null;
    return welchTTest(a, b);
  });

  const histogram = computed(() => {
    const d = dps.value;
    if (!d) return null;
    const runValues = d.allValues;
    const baseValues = baseDps.value?.allValues ?? [];
    const withBase = runValues.length > 0 && baseValues.length > 0;
    const range =
      runValues.length > 0 ? sharedRange(withBase ? [runValues, baseValues] : [runValues]) : undefined;
    const h = distributionHistogram(d, { bins: 40, ...(range && { range }) });
    const bh = withBase ? distributionHistogram(baseDps.value!, { bins: 40, range: range! }) : null;
    return {
      bins: h.counts.map((count, i) => ({
        lo: h.lo + i * h.binWidth,
        hi: h.lo + (i + 1) * h.binWidth,
        count,
      })),
      total: h.total,
      baseline: bh?.counts,
      baselineTotal: bh?.total,
      binWidth: h.binWidth,
      source: h.source,
      xTicks: niceTicks(h.lo, h.hi, 6).filter((v) => v >= h.lo && v <= h.hi),
    };
  });

  const conv = computed(() => {
    const values = dps.value?.allValues ?? [];
    if (values.length < 2) return null;
    const c = convergence(values);
    const points = c.points.map((p) => ({ x: p.n, y: p.mean, lo: p.mean - p.ci95, hi: p.mean + p.ci95 }));
    // Leave out the first, widest checkpoints from the y range so the settled part stays readable.
    const tail = points.slice(Math.floor(points.length / 4));
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of tail) {
      lo = Math.min(lo, p.lo);
      hi = Math.max(hi, p.hi);
    }
    const pad = (hi - lo) * 0.1 || 1;
    return { ...c, points, yDomain: [lo - pad, hi + pad] as [number, number] };
  });

  // ---- fight 1 (combat log)
  const events = computed(() => (entry.value?.result.logs ? parseCombatLog(entry.value.result.logs) : []));
  const fight1Duration = computed(() => entry.value?.result.firstIterationDuration ?? 0);
  const playerLabel = computed(
    () => events.value.find((e) => e.unit.kind === 'player' && e.unit.index === 0)?.unit.label,
  );
  const cooldownKeys = computed(() => cooldownKeysFromLog(events.value));

  const playerLanes = computed(() =>
    fight1Duration.value
      ? auraLanes(events.value, fight1Duration.value).filter(
          (l) => l.unit.kind === 'player' && l.unit.index === 0,
        )
      : [],
  );
  /** Auras up the whole of fight 1 (raid buffs, forms): no timing to show, so counted, not drawn. */
  const alwaysOn = computed(
    () => playerLanes.value.filter((l) => l.uptimeSeconds >= fight1Duration.value * ALWAYS_ON).length,
  );

  const lanes = computed<TimelineLane[]>(() => {
    const d = fight1Duration.value;
    if (!d) return [];
    const cds = new Set(cooldownKeys.value);
    const raw = playerLanes.value.filter((l) => l.uptimeSeconds > 0 && l.uptimeSeconds < d * ALWAYS_ON);
    const labels = names.distinctNames(raw.map((l) => l.id));
    return raw
      .map((l, i) => ({
        key: l.key,
        name: labels[i]!,
        uptime: l.uptimeSeconds / d,
        segments: l.intervals,
        cooldown: cds.has(l.key),
      }))
      .sort((a, b) => Number(b.cooldown) - Number(a.cooldown) || b.uptime - a.uptime)
      .slice(0, MAX_LANES);
  });

  const timeline = computed(() => {
    const d = fight1Duration.value;
    if (!d || events.value.length === 0) return null;
    const series = damageSeries(events.value, d, { bucketSeconds: 5, playerIndex: 0 });
    const points = series.map((p) => ({ x: p.t, y: p.dps }));
    // The line ends at the fight's end, not at the last bucket's start.
    if (points.length) points.push({ x: d, y: points.at(-1)!.y });
    const max = Math.max(...points.map((p) => p.y), summary.value?.mean ?? 0);
    const char = entry.value!.record.character;
    return {
      duration: d,
      points,
      yDomain: [0, niceCeil(max * 1.05)] as [number, number],
      execute: char.encounter.executePhase ? { from: d * 0.8, to: d } : null,
      xTicks: niceTicks(0, d, 7).filter((t) => t <= d),
    };
  });

  const resource = computed(() => {
    const evs = events.value;
    const label = playerLabel.value;
    if (!label) return null;
    const seen = new Set<string>();
    for (const e of evs) if (e.type === 'resource' && e.unit.label === label) seen.add(e.resource);
    const name = RESOURCE_PREFERENCE.find((r) => seen.has(r)) ?? [...seen][0];
    if (!name) return null;
    const steps = resourceSeries(evs, name, label).filter(([t]) => t >= 0 && t <= fight1Duration.value);
    if (steps.length < 2) return null;
    const max = Math.max(...steps.map(([, v]) => v));
    // One point per second (the level after the last change in it); regen ticks would add thousands.
    const perSecond = new Map<number, number>();
    for (const [t, v] of steps) perSecond.set(Math.floor(t), v);
    return {
      name: name[0]!.toUpperCase() + name.slice(1),
      points: [...perSecond].map(([x, y]) => ({ x, y })),
      yDomain: [0, niceCeil(max)] as [number, number],
    };
  });

  // ---- all iterations
  const abilities = computed(() => {
    if (!entry.value) return [];
    const rows = abilityBreakdown(entry.value.result);
    const labels = names.distinctNames(rows.map((r) => r.id));
    return rows.map((r, i) => ({ ...r, name: r.petName ? `${labels[i]} (${r.petName})` : labels[i]! }));
  });

  const player = computed(() => (entry.value ? findPlayer(entry.value.result) : undefined));
  const waste = computed(() =>
    player.value ? resourceWaste(player.value, entry.value!.result.iterationsDone) : [],
  );

  const missingItems = computed(() => {
    const db = names.db.value;
    if (!db || !entry.value) return null;
    return Object.entries(entry.value.record.character.gear)
      .filter(([, g]) => g && !db.item(g.itemId))
      .map(([slot, g]) => ({ slot: slot as never, itemId: g!.itemId }));
  });

  const notes = computed<RunNote[]>(() => {
    if (!entry.value) return [];
    const nameMap: Record<ActionKey, string> = {};
    for (const l of auraLanes(events.value, fight1Duration.value)) nameMap[l.key] = names.actionName(l.id);
    return evaluateNotes({
      resources: { rows: waste.value },
      cooldowns: {
        lanes: auraLanes(events.value, fight1Duration.value),
        cooldownKeys: cooldownKeys.value,
        names: nameMap,
      },
      ...(missingItems.value && {
        missingItems: { items: missingItems.value, dataBuild: entry.value.record.engine.dataBuild },
      }),
      // HIT-01 needs the hit cap, which the engine does not report: left out rather than guessed.
    });
  });

  // Every stat the spec weighs. The engine skips a stat that has no effect for this character (sampleCounts
  // 0, weight 0 ± 0); those rows stay and the panel lists them as having no effect. A pseudo stat with no
  // samples is dropped instead: the request may simply not have asked for it (weapon DPS from a caller
  // that only passes the stats).
  const weights = computed(() => {
    const sw = statWeights.value;
    if (!sw || !entry.value) return null;
    const { stats, pseudoStats, reference, metric } = weightStatsFor(entry.value.record.character.spec);
    const refs: StatRef[] = [
      ...stats.map((stat) => ({ kind: 'stat', stat }) as const),
      ...pseudoStats.map((stat) => ({ kind: 'pseudo', stat }) as const),
    ];
    const counted = (r: StatRef) =>
      r.kind === 'stat' || !sw.sampleCounts || (sw.sampleCounts.pseudoStats[r.stat] ?? 0) > 0;
    return statWeightRows(sw, refs.filter(counted), metric, entry.value.record.iterations).map((r) => ({
      ...r,
      label: statRefLabel(r.ref),
      isReference: r.ref.kind === 'stat' && r.ref.stat === reference,
    }));
  });

  return {
    summary,
    baseSummary,
    welch,
    histogram,
    convergence: conv,
    timeline,
    lanes,
    alwaysOn,
    resource,
    abilities,
    waste,
    notes,
    weights,
    names,
  };
}

function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = mag / 2;
  return Math.ceil(v / step) * step;
}
