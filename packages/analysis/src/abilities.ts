import type { ActionMetrics, RaidSimResult, TargetedActionMetrics, UnitMetrics } from '@fsim/proto/api';
import { type ActionKey, type ParsedActionId, actionKey, parseActionId } from './actionId';

/** Shares (0–1) of an ability's outcomes. They sum to 1 (or are all 0 when nothing rolled). */
export interface OutcomeComposition {
  hit: number;
  crit: number;
  glance: number;
  /** Miss, dodge, parry, block and blocked crit together. */
  other: number;
}

export interface AbilityRow {
  key: ActionKey;
  id: ParsedActionId;
  /** Null for the player's own actions, else the pet's name. */
  petName: string | null;
  isMelee: boolean;
  isPassive: boolean;
  /** Damage on enemy targets per second of fight: total damage / (iterations · avg fight length). */
  dps: number;
  /** Fraction (0–1) of the rows' total damage. */
  share: number;
  /** Damage per fight. */
  damagePerFight: number;
  /** Casts per fight. Null for passive actions (procs, swings caused by others). */
  casts: number | null;
  /** Casts per minute. Null for passive actions or actions never cast. */
  castsPerMinute: number | null;
  /**
   * Average damage per landed event. For direct damage: (damage − tick damage) / landed hits.
   * For DoT-only rows (`basis: 'ticks'`): tick damage / landed ticks.
   */
  avgHit: number;
  /** Crit share of rolled outcomes; equals `outcomes.crit`. */
  critRate: number;
  outcomes: OutcomeComposition;
  /** Whether `outcomes`/`avgHit` describe direct hits or DoT ticks (when the direct part does no damage). */
  basis: 'direct' | 'ticks';
  // No per-ability error bars: the engine reports only totals over all iterations for actions, so
  // there is no per-iteration spread to compute one from.
}

export interface AbilityContext {
  iterations: number;
  /** Average fight length in seconds (`RaidSimResult.avgIterationDuration`). */
  duration: number;
  /** Unit indices of hostile targets. Damage on other units (self-damage, e.g. Demonic Rune) is ignored. */
  enemyUnitIndices: ReadonlySet<number>;
}

type Counts = Pick<
  TargetedActionMetrics,
  | 'casts'
  | 'hits'
  | 'crits'
  | 'ticks'
  | 'critTicks'
  | 'misses'
  | 'tickMisses'
  | 'dodges'
  | 'parries'
  | 'blocks'
  | 'blockedCrits'
  | 'glances'
  | 'glanceBlocks'
  | 'crushes'
  | 'damage'
  | 'tickDamage'
>;

const COUNT_FIELDS: (keyof Counts)[] = [
  'casts',
  'hits',
  'crits',
  'ticks',
  'critTicks',
  'misses',
  'tickMisses',
  'dodges',
  'parries',
  'blocks',
  'blockedCrits',
  'glances',
  'glanceBlocks',
  'crushes',
  'damage',
  'tickDamage',
];

function emptyCounts(): Counts {
  return Object.fromEntries(COUNT_FIELDS.map((f) => [f, 0])) as unknown as Counts;
}

function addCounts(into: Counts, t: Counts): void {
  for (const f of COUNT_FIELDS) into[f] += t[f];
}

function composition(c: Counts): { outcomes: OutcomeComposition; avgHit: number; basis: 'direct' | 'ticks' } {
  const directDamage = c.damage - c.tickDamage;
  const landedTicks = c.ticks + c.critTicks;
  const basis: 'direct' | 'ticks' = directDamage <= 0 && landedTicks > 0 ? 'ticks' : 'direct';
  let hit: number;
  let crit: number;
  let glance: number;
  let other: number;
  let avgHit: number;
  if (basis === 'ticks') {
    hit = c.ticks;
    crit = c.critTicks;
    glance = 0;
    other = c.tickMisses + c.misses + c.dodges + c.parries;
    avgHit = c.tickDamage / landedTicks;
  } else {
    hit = c.hits + c.crushes;
    crit = c.crits;
    glance = c.glances + c.glanceBlocks;
    other = c.misses + c.dodges + c.parries + c.blocks + c.blockedCrits;
    const landed = c.hits + c.crits + c.blocks + c.blockedCrits + c.glances + c.glanceBlocks + c.crushes;
    avgHit = landed > 0 ? directDamage / landed : 0;
  }
  const total = hit + crit + glance + other;
  const outcomes =
    total > 0
      ? { hit: hit / total, crit: crit / total, glance: glance / total, other: other / total }
      : { hit: 0, crit: 0, glance: 0, other: 0 };
  return { outcomes, avgHit, basis };
}

interface Acc {
  key: ActionKey;
  action: ActionMetrics;
  petName: string | null;
  counts: Counts;
}

/**
 * Per-ability rows from a unit's `actions` (and its pets'). Rows for the same ActionID are merged
 * across targets. Only actions that did damage to an enemy are returned, sorted by DPS.
 */
export function abilityRows(
  unit: UnitMetrics,
  ctx: AbilityContext,
  opts: { includePets?: boolean } = {},
): AbilityRow[] {
  const sources: [UnitMetrics, string | null][] = [[unit, null]];
  if (opts.includePets ?? true) for (const pet of unit.pets) sources.push([pet, pet.name]);

  const acc = new Map<string, Acc>();
  for (const [src, petName] of sources) {
    for (const action of src.actions) {
      const key = actionKey(action.id);
      const mapKey = `${petName ?? ''}|${key}`;
      let a = acc.get(mapKey);
      if (!a) {
        a = { key, action, petName, counts: emptyCounts() };
        acc.set(mapKey, a);
      }
      for (const t of action.targets) if (ctx.enemyUnitIndices.has(t.unitIndex)) addCounts(a.counts, t);
    }
  }

  const fights = ctx.iterations;
  const seconds = fights * ctx.duration;
  const damaging = [...acc.values()].filter((a) => a.counts.damage > 0);
  const totalDamage = damaging.reduce((s, a) => s + a.counts.damage, 0);

  return damaging
    .map((a): AbilityRow => {
      const c = a.counts;
      const passive = a.action.isPassive;
      const casts = passive ? null : c.casts / fights;
      const comp = composition(c);
      return {
        key: a.key,
        id: parseActionId(a.action.id),
        petName: a.petName,
        isMelee: a.action.isMelee,
        isPassive: passive,
        dps: c.damage / seconds,
        share: totalDamage > 0 ? c.damage / totalDamage : 0,
        damagePerFight: c.damage / fights,
        casts,
        castsPerMinute: casts ? casts / (ctx.duration / 60) : null,
        avgHit: comp.avgHit,
        critRate: comp.outcomes.crit,
        outcomes: comp.outcomes,
        basis: comp.basis,
      };
    })
    .sort((x, y) => y.dps - x.dps);
}

/** The player with `unitIndex` (default: the first player in the raid). */
export function findPlayer(result: RaidSimResult, unitIndex?: number): UnitMetrics | undefined {
  const players = result.raidMetrics?.parties.flatMap((p) => p.players) ?? [];
  return unitIndex === undefined ? players[0] : players.find((p) => p.unitIndex === unitIndex);
}

/** Iterations, average fight length and enemy unit indices of a result. */
export function abilityContext(result: RaidSimResult): AbilityContext {
  return {
    iterations: result.iterationsDone,
    duration: result.avgIterationDuration,
    enemyUnitIndices: new Set(result.encounterMetrics?.targets.map((t) => t.unitIndex) ?? []),
  };
}

/** Ability breakdown for one player of a raid-sim result. */
export function abilityBreakdown(
  result: RaidSimResult,
  opts: { unitIndex?: number; includePets?: boolean } = {},
): AbilityRow[] {
  const player = findPlayer(result, opts.unitIndex);
  if (!player) return [];
  return abilityRows(
    player,
    abilityContext(result),
    opts.includePets === undefined ? {} : { includePets: opts.includePets },
  );
}
