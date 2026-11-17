// What differs between two characters, as −/+ groups: the Workbench's pending changes (draft vs baseline)
// and the Compare screen's "what differs" (each variant vs the first). Pure: every display name comes in
// through `names`, so this runs (and is tested) without game data or Nuxt.
import {
  ITEM_SLOTS,
  type BuffsPreset,
  type Character,
  type GearItem,
  type ItemSlotId,
} from '@fsim/contracts';
import type { DiffRow } from '~/composables/ui-types';

export interface ChangeGroup {
  key: string;
  kind: 'gear' | 'talents' | 'buffs' | 'fight' | 'rotation' | 'other';
  slot?: ItemSlotId;
  rows: DiffRow[];
}

export interface DiffNames {
  /** "Head", "Ring 1". */
  slot: (slot: ItemSlotId) => string;
  /** Item name with its random suffix. */
  item: (g: GearItem) => string;
  /** Short enchant name, or null when the item has none. */
  enchant: (g: GearItem | undefined) => string | null;
  buffs: (preset: BuffsPreset) => string;
  /** Rotation preset name, or "custom SIML". */
  rotation: (c: Character) => string;
}

export const sameGear = (a: GearItem | undefined, b: GearItem | undefined) =>
  a?.itemId === b?.itemId &&
  (a?.randomSuffix ?? 0) === (b?.randomSuffix ?? 0) &&
  (a?.enchantId ?? 0) === (b?.enchantId ?? 0);

/** Fight settings with their own row; any other encounter field that differs shows as "Fight settings". */
const FIGHT: [string, (e: Character['encounter']) => string][] = [
  ['Duration', (e) => `${e.durationSec} s ± ${e.durationVariationSec}`],
  ['Targets', (e) => String(e.targetCount)],
  ['Target level', (e) => String(e.targetLevel)],
  ['Execute phase', (e) => (e.executePhase ? 'on' : 'off')],
];
const FIGHT_KEYS = new Set([
  'durationSec',
  'durationVariationSec',
  'targetCount',
  'targetLevel',
  'executePhase',
]);
/** Character fields with their own group above, or display-only. Every other field lands in "other". */
const OWN_GROUP = new Set(['gear', 'talents', 'buffs', 'encounter', 'rotation', 'name', 'realm', 'region']);

/** Stable JSON (sorted keys), so field order never reads as a change. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([p], [q]) => (p < q ? -1 : 1)))
      : x,
  );
}
const without = (o: Record<string, unknown>, skip: Set<string>) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !skip.has(k)));

/** `b` against `a`: one group per changed slot, then talents, buffs, fight, rotation and the rest. */
export function diffCharacters(a: Character, b: Character, names: DiffNames): ChangeGroup[] {
  const out: ChangeGroup[] = [];
  for (const slot of ITEM_SLOTS) {
    const x = a.gear[slot];
    const y = b.gear[slot];
    if (sameGear(x, y)) continue;
    const rows: DiffRow[] = [];
    if (x?.itemId === y?.itemId && (x?.randomSuffix ?? 0) === (y?.randomSuffix ?? 0)) {
      // Only the enchant changed.
      rows.push({ op: '-', label: `${names.slot(slot)}: ${names.enchant(x) ?? 'no enchant'}` });
      rows.push({ op: '+', label: `${names.slot(slot)}: ${names.enchant(y) ?? 'no enchant'}` });
    } else {
      const label = (g: GearItem) => {
        const e = names.enchant(g);
        return e ? `${names.item(g)} · ${e}` : names.item(g);
      };
      rows.push({ op: '-', label: x ? label(x) : `${names.slot(slot)}: empty` });
      rows.push({ op: '+', label: y ? label(y) : `${names.slot(slot)}: empty` });
    }
    rows[0]!.detail = names.slot(slot).toLowerCase();
    out.push({ key: `gear:${slot}`, kind: 'gear', slot, rows });
  }
  if (a.talents !== b.talents) {
    out.push({
      key: 'talents',
      kind: 'talents',
      rows: [
        { op: '-', label: a.talents || 'no talents', detail: 'talents' },
        { op: '+', label: b.talents || 'no talents' },
      ],
    });
  }
  if (a.buffs !== b.buffs) {
    out.push({
      key: 'buffs',
      kind: 'buffs',
      rows: [
        { op: '-', label: `Buffs: ${names.buffs(a.buffs)}`, detail: 'buffs' },
        { op: '+', label: `Buffs: ${names.buffs(b.buffs)}` },
      ],
    });
  }
  const ea = a.encounter;
  const eb = b.encounter;
  for (const [label, f] of FIGHT) {
    if (f(ea) === f(eb)) continue;
    out.push({
      key: `fight:${label}`,
      kind: 'fight',
      rows: [
        { op: '-', label: `${label}: ${f(ea)}`, detail: 'fight' },
        { op: '+', label: `${label}: ${f(eb)}` },
      ],
    });
  }
  if (stable(without(ea, FIGHT_KEYS)) !== stable(without(eb, FIGHT_KEYS))) {
    out.push({
      key: 'fight:other',
      kind: 'fight',
      rows: [{ op: '+', label: 'Fight settings', detail: 'fight' }],
    });
  }
  if (stable(a.rotation) !== stable(b.rotation)) {
    out.push({
      key: 'rotation',
      kind: 'rotation',
      rows: [
        { op: '-', label: `Rotation: ${names.rotation(a)}`, detail: 'rotation' },
        { op: '+', label: `Rotation: ${names.rotation(b)}` },
      ],
    });
  }
  if (stable(without(a, OWN_GROUP)) !== stable(without(b, OWN_GROUP))) {
    out.push({
      key: 'other',
      kind: 'other',
      rows: [
        { op: '+', label: 'Other settings: race, professions, consumables, spec options', detail: 'other' },
      ],
    });
  }
  return out;
}

/** One line for a list of changes: "Head, Ring 1 · talents · buffs", or "no differences". */
export function changeSummary(groups: readonly ChangeGroup[], slotName: (s: ItemSlotId) => string): string {
  if (!groups.length) return 'no differences';
  const slots = groups.filter((g) => g.kind === 'gear').map((g) => slotName(g.slot!));
  const kinds = [...new Set(groups.filter((g) => g.kind !== 'gear').map((g) => g.kind))].map((k) =>
    k === 'other' ? 'other settings' : k,
  );
  return [...(slots.length ? [slots.join(', ')] : []), ...kinds].join(' · ');
}
