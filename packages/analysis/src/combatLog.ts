/*
 * Minimal parser for the engine's iteration-1 combat log (`RaidSimResult.logs`), enough to draw
 * aura lanes, a damage-over-time line and resource levels for that one fight.
 *
 * Line formats and patterns follow upstream wowsims/forever `ui/sim/proto/combat_log/parse.ts`
 * and `types.ts` (MIT License, Copyright (c) 2022 wowsims team), cut down to the events the
 * timeline needs.
 */
import { type ActionKey, type ParsedActionId, formatActionKey, parseLogActionId } from './actionId';

/** Who a log line is about, as printed in its bracket: `[Target 1]`, `[Name (#1)]`, `[Owner (#1) - Pet]`. */
export interface LogUnit {
  kind: 'target' | 'player' | 'pet';
  /** 0-based target or player index (the log prints it 1-based). */
  index: number;
  /** Player or pet name; may be empty (the fixture player has no name). Empty for targets. */
  name: string;
  /** The bracket text, for display and as a lane key. */
  label: string;
}

export type Outcome =
  'hit' | 'crit' | 'crush' | 'glance' | 'block' | 'blocked-crit' | 'miss' | 'dodge' | 'parry';

interface Base {
  /** Seconds from pull; negative for pre-pull actions. */
  t: number;
  /** Unit the line is printed for: the caster for casts and damage, the holder for auras. */
  unit: LogUnit;
}

export type LogEvent =
  | (Base & { type: 'cast'; key: ActionKey; id: ParsedActionId })
  | (Base & { type: 'major-cooldown'; key: ActionKey; id: ParsedActionId })
  | (Base & {
      type: 'damage';
      key: ActionKey;
      id: ParsedActionId;
      target: LogUnit | null;
      outcome: Outcome;
      tick: boolean;
      amount: number;
    })
  | (Base & { type: 'aura'; change: 'gained' | 'faded' | 'refreshed'; key: ActionKey; id: ParsedActionId })
  | (Base & { type: 'aura-stacks'; key: ActionKey; id: ParsedActionId; from: number; to: number })
  | (Base & {
      type: 'resource';
      resource: string;
      /** Signed: positive for a gain, negative for a spend. */
      amount: number;
      before: number;
      after: number;
      source: ActionKey;
    });

const PREFIX = /^\[(-?\d+(?:\.\d+)?)\] ((?:\[[^\]]*\] ?)+)(.*)$/;
const BRACKET = /\[([^\]]*)\]/g;
const OUTCOMES: Record<string, Outcome> = {
  Hit: 'hit',
  Crit: 'crit',
  Crush: 'crush',
  Glance: 'glance',
  Block: 'block',
  BlockedCrit: 'blocked-crit',
  Miss: 'miss',
  Dodge: 'dodge',
  Parry: 'parry',
};
const DAMAGE =
  /^(\{[^}]*\}) (tick )?(Miss|Hit|BlockedCrit|Crit|Crush|Glance|Dodge|Parry|Block)(?: \(\d+% Resist\))?(?: for (-?\d+(?:\.\d+)?) damage)?(?: |$|\.)/;
const AURA = /^Aura (gained|faded|refreshed): (\{[^}]*\})/;
const STACKS = /^(\{[^}]*\}) stacks: (\d+) --> (\d+)/;
const CAST = /^Completed cast (\{[^}]*\})/;
const MAJOR_CD = /^Major cooldown used: (\{[^}]*\})/;
const RESOURCE =
  /^(Gained|Spent) (\d+(?:\.\d+)?) (\S.*?\S) from (\{[^}]*\}) \((-?\d+(?:\.\d+)?) --> (-?\d+(?:\.\d+)?)\)/;

export function parseLogUnit(label: string): LogUnit | null {
  let m = /^Target (\d+)$/.exec(label);
  if (m) return { kind: 'target', index: Number(m[1]) - 1, name: '', label };
  m = /^(.*?) \(#(\d+)\) - (.+)$/.exec(label);
  if (m) return { kind: 'pet', index: Number(m[2]) - 1, name: m[3]!, label };
  m = /^(.*?) ?\(#(\d+)\)$/.exec(label);
  if (m) return { kind: 'player', index: Number(m[2]) - 1, name: m[1]!.trim(), label };
  return null;
}

function idOf(text: string): { key: ActionKey; id: ParsedActionId } | null {
  const id = parseLogActionId(text);
  return id ? { key: formatActionKey(id), id } : null;
}

/** Parses log text into events. Lines the timeline does not need are skipped. */
export function parseCombatLog(logs: string): LogEvent[] {
  const out: LogEvent[] = [];
  for (const line of logs.split('\n')) {
    const pre = PREFIX.exec(line);
    if (!pre) continue;
    const t = Number(pre[1]);
    const labels = [...pre[2]!.matchAll(BRACKET)].map((m) => m[1]!);
    const units = labels.map(parseLogUnit);
    const unit = units[0];
    if (!unit) continue;
    const rest = pre[3]!;

    let m: RegExpExecArray | null;
    if ((m = AURA.exec(rest))) {
      const a = idOf(m[2]!);
      if (a) out.push({ t, unit, type: 'aura', change: m[1] as 'gained' | 'faded' | 'refreshed', ...a });
    } else if ((m = DAMAGE.exec(rest))) {
      const a = idOf(m[1]!);
      if (a)
        out.push({
          t,
          unit,
          type: 'damage',
          ...a,
          target: units[1] ?? null,
          outcome: OUTCOMES[m[3]!]!,
          tick: !!m[2],
          amount: m[4] ? Number(m[4]) : 0,
        });
    } else if ((m = STACKS.exec(rest))) {
      const a = idOf(m[1]!);
      if (a) out.push({ t, unit, type: 'aura-stacks', ...a, from: Number(m[2]), to: Number(m[3]) });
    } else if ((m = CAST.exec(rest))) {
      const a = idOf(m[1]!);
      if (a) out.push({ t, unit, type: 'cast', ...a });
    } else if ((m = MAJOR_CD.exec(rest))) {
      const a = idOf(m[1]!);
      if (a) out.push({ t, unit, type: 'major-cooldown', ...a });
    } else if ((m = RESOURCE.exec(rest))) {
      const src = idOf(m[4]!);
      const amount = Number(m[2]);
      out.push({
        t,
        unit,
        type: 'resource',
        resource: m[3]!,
        amount: m[1] === 'Gained' ? amount : -amount,
        before: Number(m[5]),
        after: Number(m[6]),
        source: src?.key ?? '',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Timeline derivations
// ---------------------------------------------------------------------------------------------

export interface AuraLane {
  key: ActionKey;
  id: ParsedActionId;
  unit: LogUnit;
  /** Active intervals [start, end) in seconds, clipped to [0, duration]. */
  intervals: [number, number][];
  /** Seconds active within [0, duration]. */
  uptimeSeconds: number;
}

/**
 * Aura lanes for one fight. An aura still active at the end is closed at `duration`
 * (`RaidSimResult.firstIterationDuration`); pre-pull time is clipped to 0.
 */
export function auraLanes(events: readonly LogEvent[], duration: number): AuraLane[] {
  const lanes = new Map<string, AuraLane & { open: number | null }>();
  for (const e of events) {
    if (e.type !== 'aura') continue;
    const laneKey = `${e.unit.label}|${e.key}`;
    let lane = lanes.get(laneKey);
    if (!lane) {
      lane = { key: e.key, id: e.id, unit: e.unit, intervals: [], uptimeSeconds: 0, open: null };
      lanes.set(laneKey, lane);
    }
    if (e.change === 'gained' && lane.open === null) lane.open = e.t;
    else if (e.change === 'faded' && lane.open !== null) {
      lane.intervals.push([lane.open, e.t]);
      lane.open = null;
    }
  }
  const result: AuraLane[] = [];
  for (const lane of lanes.values()) {
    if (lane.open !== null) lane.intervals.push([lane.open, duration]);
    const clipped: [number, number][] = [];
    for (const [a, b] of lane.intervals) {
      const s = Math.max(0, a);
      const e = Math.min(duration, b);
      if (e > s) clipped.push([s, e]);
    }
    result.push({
      key: lane.key,
      id: lane.id,
      unit: lane.unit,
      intervals: clipped,
      uptimeSeconds: clipped.reduce((s, [a, b]) => s + (b - a), 0),
    });
  }
  return result;
}

export interface DamageSeriesPoint {
  /** Bucket start, seconds. */
  t: number;
  /** Damage dealt in the bucket divided by the bucket length. */
  dps: number;
  /** Cumulative damage / elapsed time up to the end of the bucket. */
  cumulativeDps: number;
}

/**
 * Damage-over-time line for the fight: damage events from units of `kind` (default: player and
 * pets) into enemy targets, bucketed by `bucketSeconds` over [0, duration].
 */
export function damageSeries(
  events: readonly LogEvent[],
  duration: number,
  opts: { bucketSeconds?: number; playerIndex?: number } = {},
): DamageSeriesPoint[] {
  const w = opts.bucketSeconds ?? 5;
  const n = Math.max(1, Math.ceil(duration / w));
  const sums = new Array<number>(n).fill(0);
  for (const e of events) {
    if (e.type !== 'damage' || e.t < 0 || e.t > duration) continue;
    if (e.unit.kind === 'target' || e.target?.kind !== 'target') continue;
    if (opts.playerIndex !== undefined && e.unit.index !== opts.playerIndex) continue;
    sums[Math.min(n - 1, Math.floor(e.t / w))]! += e.amount;
  }
  let cum = 0;
  return sums.map((s, i) => {
    const start = i * w;
    const end = Math.min(duration, start + w);
    cum += s;
    return { t: start, dps: s / (end - start), cumulativeDps: cum / end };
  });
}

/** Resource level steps for one unit and resource ("mana", "rage", …): [time, level after]. */
export function resourceSeries(
  events: readonly LogEvent[],
  resource: string,
  unitLabel?: string,
): [number, number][] {
  const out: [number, number][] = [];
  for (const e of events) {
    if (e.type !== 'resource' || e.resource !== resource) continue;
    if (unitLabel !== undefined && e.unit.label !== unitLabel) continue;
    out.push([e.t, e.after]);
  }
  return out;
}
