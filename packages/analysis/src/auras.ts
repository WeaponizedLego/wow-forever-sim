import type { UnitMetrics } from '@fsim/proto/api';
import { ResourceType } from '@fsim/proto/spell';
import { type ActionKey, type ParsedActionId, actionKey, parseActionId } from './actionId';

export interface AuraUptimeRow {
  key: ActionKey;
  id: ParsedActionId;
  /** Average seconds active per fight. */
  uptimeSeconds: number;
  /** Stdev across iterations of the seconds active. */
  uptimeSecondsStdev: number;
  /** uptimeSeconds / fight length, clamped to [0, 1]. */
  uptime: number;
  /** Average activations per fight. */
  procsPerFight: number;
  procsPerMinute: number;
}

/**
 * Aura uptimes for a unit (a player, or an encounter target for debuffs), sorted by uptime.
 * `duration` is the average fight length (`RaidSimResult.avgIterationDuration`). Auras with no
 * uptime are dropped unless `includeZero`.
 */
export function auraUptimes(
  unit: UnitMetrics,
  duration: number,
  opts: { includeZero?: boolean } = {},
): AuraUptimeRow[] {
  return unit.auras
    .filter((a) => opts.includeZero || a.uptimeSecondsAvg > 0)
    .map((a) => ({
      key: actionKey(a.id),
      id: parseActionId(a.id),
      uptimeSeconds: a.uptimeSecondsAvg,
      uptimeSecondsStdev: a.uptimeSecondsStdev,
      uptime: duration > 0 ? Math.min(1, Math.max(0, a.uptimeSecondsAvg / duration)) : 0,
      procsPerFight: a.procsAvg,
      procsPerMinute: duration > 0 ? a.procsAvg / (duration / 60) : 0,
    }))
    .sort((x, y) => y.uptime - x.uptime);
}

/**
 * APPROXIMATE resource overflow per resource type.
 *
 * The engine records, per source, the resource it tried to grant (`gain`) and what actually landed
 * under the cap (`actualGain`). The difference is what overflowed. That is NOT time spent at cap: the
 * engine does not report how long a resource sat at its maximum, so the "capped for X% of the fight"
 * line in the design cannot be computed exactly. `wastedFraction` (overflow / attempted gain) is the
 * closest honest number.
 */
export interface ResourceWasteRow {
  type: ResourceType;
  /** Resource the unit tried to gain per fight (positive gains only). */
  gainedPerFight: number;
  /** Resource lost to the cap per fight. */
  wastedPerFight: number;
  /** wasted / attempted gain, 0–1. */
  wastedFraction: number;
  /** Per-source breakdown, largest overflow first. */
  sources: { key: ActionKey; id: ParsedActionId; wastedPerFight: number }[];
  approximate: true;
}

export function resourceWaste(unit: UnitMetrics, iterations: number): ResourceWasteRow[] {
  const byType = new Map<ResourceType, ResourceWasteRow>();
  for (const r of unit.resources) {
    if (r.gain <= 0 || r.type === ResourceType.ResourceTypeHealth) continue;
    let row = byType.get(r.type);
    if (!row) {
      row = {
        type: r.type,
        gainedPerFight: 0,
        wastedPerFight: 0,
        wastedFraction: 0,
        sources: [],
        approximate: true,
      };
      byType.set(r.type, row);
    }
    const wasted = Math.max(0, r.gain - r.actualGain) / iterations;
    row.gainedPerFight += r.gain / iterations;
    row.wastedPerFight += wasted;
    if (wasted > 0)
      row.sources.push({ key: actionKey(r.id), id: parseActionId(r.id), wastedPerFight: wasted });
  }
  for (const row of byType.values()) {
    row.wastedFraction = row.gainedPerFight > 0 ? row.wastedPerFight / row.gainedPerFight : 0;
    row.sources.sort((a, b) => b.wastedPerFight - a.wastedPerFight);
  }
  return [...byType.values()];
}
