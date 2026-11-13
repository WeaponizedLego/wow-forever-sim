import type { ItemSlotId, Severity } from '@fsim/contracts';
import { ResourceType } from '@fsim/proto/spell';
import type { ActionKey } from './actionId';
import type { ResourceWasteRow } from './auras';
import type { AuraLane, LogEvent } from './combatLog';
import { Z95 } from './stats';

/** One line in the Run analysis "Run notes" panel. */
export interface RunNote {
  /** Rule id, e.g. `HIT-01`. */
  id: string;
  severity: Severity;
  text: string;
  /** Label of the suggested follow-up button, or null. */
  action: string | null;
  /** The numbers behind the text, for the UI to format or link. */
  data: Record<string, number | string | boolean>;
}

export interface NoteRule {
  id: string;
  severity: Severity;
  /** Returns a note, or null when the rule has nothing to say or its input is absent. */
  evaluate(input: RunNotesInput): RunNote | null;
}

export interface HitInput {
  /** Current hit chance, in %. */
  current: number;
  /** Hit cap for the fight, in %. */
  cap: number;
  /** Metric gained per 1% hit, with its standard error (convert from the rating weight first). */
  weightPerPercent: { weight: number; stdev: number } | null;
  /** Display name, default "Hit". */
  label?: string;
}

export interface ResourceInput {
  rows: readonly ResourceWasteRow[];
  /** Overflow fraction (0–1) that triggers the note. Default 0.02. */
  threshold?: number;
  /** Resource types to check. Default rage, energy and focus (mana regen often overflows harmlessly). */
  types?: readonly ResourceType[];
}

export interface MissingItem {
  slot: ItemSlotId;
  itemId: number | null;
}

export interface MissingItemsInput {
  items: readonly MissingItem[];
  /** Game data build the sim ran with, if known. */
  dataBuild: string | null;
}

export interface CooldownInput {
  /** Aura lanes for iteration 1 (`auraLanes(parseCombatLog(result.logs), result.firstIterationDuration)`). */
  lanes: readonly AuraLane[];
  /** Auras that are major cooldowns. See `cooldownKeysFromLog`. */
  cooldownKeys: readonly ActionKey[];
  /** Display names per key; falls back to the key. */
  names?: Readonly<Record<ActionKey, string>>;
  /** Overlap (0–1, of the shorter aura's uptime) that triggers the note. Default 0.5. */
  minOverlap?: number;
}

/** Everything the rules read. Each part is optional; a rule whose part is missing returns null. */
export interface RunNotesInput {
  hit?: HitInput;
  resources?: ResourceInput;
  missingItems?: MissingItemsInput;
  cooldowns?: CooldownInput;
}

const f1 = (n: number) => n.toFixed(1);

/** HIT-01: hit below cap; uses the hit weight to say what the next point is worth. */
export const HIT_01: NoteRule = {
  id: 'HIT-01',
  severity: 'info',
  evaluate({ hit }) {
    if (!hit || !(hit.current < hit.cap - 1e-9)) return null;
    const label = hit.label ?? 'Hit';
    const gap = hit.cap - hit.current;
    const step = Math.min(1, gap);
    let text = `${label} is ${f1(hit.current)}%, ${f1(gap)}% under the ${f1(hit.cap)}% cap.`;
    const data: RunNote['data'] = { current: hit.current, cap: hit.cap, gap };
    if (hit.weightPerPercent) {
      const gain = step * hit.weightPerPercent.weight;
      const ci = Z95 * step * hit.weightPerPercent.stdev;
      text += ` The next ${f1(step)}% is worth ≈ ${gain >= 0 ? '+' : '−'}${f1(Math.abs(gain))} DPS (±${f1(ci)}).`;
      data.gain = gain;
      data.gainCi95 = ci;
    }
    return { id: 'HIT-01', severity: 'info', text, action: 'Find hit items', data };
  },
};

const RESOURCE_NAMES: Partial<Record<ResourceType, string>> = {
  [ResourceType.ResourceTypeMana]: 'Mana',
  [ResourceType.ResourceTypeEnergy]: 'Energy',
  [ResourceType.ResourceTypeRage]: 'Rage',
  [ResourceType.ResourceTypeFocus]: 'Focus',
  [ResourceType.ResourceTypeComboPoints]: 'Combo points',
};

/**
 * RES-02: resource overflowing its cap. APPROXIMATE: measured as the share of attempted gains lost to
 * the cap, not time at cap (the engine does not report time at cap).
 */
export const RES_02: NoteRule = {
  id: 'RES-02',
  severity: 'warning',
  evaluate({ resources }) {
    if (!resources) return null;
    const threshold = resources.threshold ?? 0.02;
    const types = resources.types ?? [
      ResourceType.ResourceTypeRage,
      ResourceType.ResourceTypeEnergy,
      ResourceType.ResourceTypeFocus,
    ];
    const worst = resources.rows
      .filter((r) => types.includes(r.type) && r.wastedFraction > threshold)
      .sort((a, b) => b.wastedFraction - a.wastedFraction)[0];
    if (!worst) return null;
    const name = RESOURCE_NAMES[worst.type] ?? 'Resource';
    const pct = f1(worst.wastedFraction * 100);
    return {
      id: 'RES-02',
      severity: 'warning',
      text:
        `${name} overflowed its cap: ${pct}% of ${name.toLowerCase()} gained (≈ ${f1(worst.wastedPerFight)} per fight) was lost. ` +
        `Approximate: counts gains over the cap, not time spent at cap.`,
      action: 'Adjust rotation',
      data: {
        type: worst.type,
        wastedFraction: worst.wastedFraction,
        wastedPerFight: worst.wastedPerFight,
        approximate: true,
      },
    };
  },
};

const SLOT_NAMES: Record<ItemSlotId, string> = {
  head: 'Head',
  neck: 'Neck',
  shoulder: 'Shoulder',
  back: 'Back',
  chest: 'Chest',
  wrist: 'Wrist',
  hands: 'Hands',
  waist: 'Waist',
  legs: 'Legs',
  feet: 'Feet',
  finger1: 'Ring 1',
  finger2: 'Ring 2',
  trinket1: 'Trinket 1',
  trinket2: 'Trinket 2',
  mainHand: 'Main hand',
  offHand: 'Off hand',
  ranged: 'Ranged',
};

/** DATA-03: equipped items missing from the game data, so left out of the sim. */
export const DATA_03: NoteRule = {
  id: 'DATA-03',
  severity: 'warning',
  evaluate({ missingItems }) {
    if (!missingItems || missingItems.items.length === 0) return null;
    const build = missingItems.dataBuild ? `data build ${missingItems.dataBuild}` : 'the game data';
    const describe = (m: MissingItem) =>
      `${SLOT_NAMES[m.slot]} item${m.itemId === null ? '' : ` ${m.itemId}`}`;
    const items = missingItems.items;
    const text =
      items.length === 1
        ? `${describe(items[0]!)} is not in ${build} and was left out of the sim. Results understate DPS.`
        : `${items.length} items are not in ${build} and were left out of the sim: ${items.map(describe).join(', ')}. Results understate DPS.`;
    return {
      id: 'DATA-03',
      severity: 'warning',
      text,
      action: 'Pick a substitute',
      data: { count: items.length, slots: items.map((m) => m.slot).join(',') },
    };
  },
};

function overlapSeconds(a: readonly [number, number][], b: readonly [number, number][]): number {
  let total = 0;
  for (const [a0, a1] of a)
    for (const [b0, b1] of b) total += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  return total;
}

/**
 * CD-04: major cooldowns overlapping. ITERATION 1 ONLY: the engine gives cooldown intervals only in
 * the iteration-1 combat log; `AuraMetrics` has uptime totals but not when, so overlap across all
 * iterations cannot be computed. The note says so.
 */
export const CD_04: NoteRule = {
  id: 'CD-04',
  severity: 'info',
  evaluate({ cooldowns }) {
    if (!cooldowns) return null;
    const minOverlap = cooldowns.minOverlap ?? 0.5;
    const wanted = new Set(cooldowns.cooldownKeys);
    const lanes = cooldowns.lanes.filter((l) => wanted.has(l.key) && l.uptimeSeconds > 0);
    const name = (k: ActionKey) => cooldowns.names?.[k] ?? k;
    const pairs: { a: ActionKey; b: ActionKey; seconds: number; fraction: number }[] = [];
    for (let i = 0; i < lanes.length; i++) {
      for (let j = i + 1; j < lanes.length; j++) {
        const a = lanes[i]!;
        const b = lanes[j]!;
        const seconds = overlapSeconds(a.intervals, b.intervals);
        const fraction = seconds / Math.min(a.uptimeSeconds, b.uptimeSeconds);
        if (fraction >= minOverlap) pairs.push({ a: a.key, b: b.key, seconds, fraction });
      }
    }
    if (pairs.length === 0) return null;
    pairs.sort((x, y) => y.fraction - x.fraction);
    const parts = pairs.map(
      (p) =>
        `${name(p.a)} and ${name(p.b)} overlap for ${Math.round(p.fraction * 100)}% of the shorter one (${f1(p.seconds)}s)`,
    );
    return {
      id: 'CD-04',
      severity: 'info',
      text: `In iteration 1, ${parts.join('; ')}.`,
      action: 'Edit rotation',
      data: { pairs: pairs.length, iterationOneOnly: true },
    };
  },
};

/** Keys of the actions the log reports as "Major cooldown used". */
export function cooldownKeysFromLog(events: readonly LogEvent[]): ActionKey[] {
  return [...new Set(events.filter((e) => e.type === 'major-cooldown').map((e) => e.key))];
}

export const DEFAULT_RULES: readonly NoteRule[] = [HIT_01, RES_02, DATA_03, CD_04];

/** Runs each rule and returns the notes that fired, in rule order. */
export function evaluateNotes(input: RunNotesInput, rules: readonly NoteRule[] = DEFAULT_RULES): RunNote[] {
  const out: RunNote[] = [];
  for (const r of rules) {
    const note = r.evaluate(input);
    if (note) out.push(note);
  }
  return out;
}
