// Sims that are not runs: hit scaling points and top-gear combinations. They build the same request
// as `useSession().runSim`, but are not recorded in the run list and do not move the baseline.
// (Proposed for session.ts: a `simVariant(character, opts)` that does this, so screens never build requests.)
import type { Character } from '@fsim/contracts';
import type { RaidSimResult } from '@fsim/proto';
import { ComputeStatsRequest } from '@fsim/proto/api';
import { PseudoStat, Stat, UnitStats } from '@fsim/proto/common';
import { buildRaidSimRequest, loadSpecPresets } from '@fsim/gamedata';
import { withDatabases } from '@fsim/engine';

export interface VariantOptions {
  iterations: number;
  seed: number;
  /** Extra stats on the player, by `Stat` (e.g. hit rating for hit scaling). */
  bonusStats?: Partial<Record<Stat, number>>;
  /** Per-iteration values; off for batches that only need mean and stdev. */
  saveAllValues?: boolean;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

const STAT_COUNT = Math.max(...Object.values(Stat).filter((v): v is number => typeof v === 'number')) + 1;

async function buildRequest(c: Character, opts: VariantOptions) {
  const engine = useEngine();
  const [db, presets] = await Promise.all([engine.gameDatabase(), loadSpecPresets(c.spec)]);
  const req = buildRaidSimRequest(c, presets, db, {
    iterations: opts.iterations,
    seed: opts.seed,
    saveAllValues: opts.saveAllValues ?? false,
    debugFirstIteration: false,
  });
  if (opts.bonusStats) {
    const player = req.raid!.parties[0]!.players[0]!;
    const stats = [...(player.bonusStats?.stats ?? [])];
    while (stats.length < STAT_COUNT) stats.push(0);
    for (const [k, v] of Object.entries(opts.bonusStats)) stats[Number(k)]! += v ?? 0;
    player.bonusStats = UnitStats.create({ ...player.bonusStats, stats });
  }
  return withDatabases(req, db.raw);
}

/** One sim of `c`, not recorded as a run. */
export async function simVariant(c: Character, opts: VariantOptions): Promise<RaidSimResult> {
  const [client, req] = await Promise.all([useEngine().client(), buildRequest(c, opts)]);
  const result = await client.raidSim(req, {
    ...(opts.signal && { signal: opts.signal }),
    onProgress: (p) => {
      if (p.totalIterations > 0) opts.onProgress?.(p.completedIterations / p.totalIterations);
    },
  });
  if (result.error) throw new Error(result.error.message.split('\n')[0]);
  return result;
}

/** The player's final (buffed) stats from the engine's character sheet. */
export async function computeFinalStats(
  c: Character,
  opts: Pick<VariantOptions, 'bonusStats' | 'signal'> = {},
): Promise<UnitStats | undefined> {
  const req = await buildRequest(c, { iterations: 1, seed: 1, ...opts });
  const client = await useEngine().client();
  const res = await client.computeStats(
    ComputeStatsRequest.create({ raid: req.raid, encounter: req.encounter, skipRotation: true }),
    opts.signal ? { signal: opts.signal } : {},
  );
  return res.raidStats?.parties[0]?.players[0]?.finalStats;
}

/** Specs whose damage is mostly spells: their hit scaling reads spell hit. */
const CASTER_SPECS = new Set(['balance-druid', 'mage', 'dps-priest', 'elemental-shaman', 'warlock']);

export function hitPseudoStat(spec: string): { stat: PseudoStat; label: string } {
  if (CASTER_SPECS.has(spec)) return { stat: PseudoStat.PseudoStatSpellHitPercent, label: 'Spell hit' };
  if (spec === 'hunter') return { stat: PseudoStat.PseudoStatRangedHitPercent, label: 'Ranged hit' };
  return { stat: PseudoStat.PseudoStatMeleeHitPercent, label: 'Melee hit' };
}
