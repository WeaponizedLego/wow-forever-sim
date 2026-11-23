// What differs between two characters, as −/+ groups: the Workbench's pending changes (draft vs baseline)
// and the Compare screen's "what differs" (each variant vs the first). Pure: item, enchant, buff and rotation
// names come in through `names`, talent names from the committed talent trees (@fsim/gamedata), so this runs
// (and is tested) without db.bin or Nuxt. Spec option names come from the engine's own types (@fsim/gamedata).
import {
  ITEM_SLOTS,
  fightStyle,
  type BuffsPreset,
  type Character,
  type ClassId,
  type GearItem,
  type ItemSlotId,
} from '@fsim/contracts';
import {
  specOptionChangeText,
  specOptionChanges,
  talentChanges,
  type SpecOptionChange,
} from '@fsim/gamedata';
import type { DiffRow } from '~/composables/ui-types';

export interface ChangeGroup {
  key: string;
  kind: 'gear' | 'talents' | 'options' | 'buffs' | 'fight' | 'rotation' | 'other';
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
  /** Rotation preset name with its changed settings, or "Custom SIML". */
  rotation: (c: Character) => string;
  /** A numeric setting of the character's rotation with its unit ("12", "8s"), changed or not. */
  rotationValue: (c: Character, name: string) => string;
}

export const sameGear = (a: GearItem | undefined, b: GearItem | undefined) =>
  a?.itemId === b?.itemId &&
  (a?.randomSuffix ?? 0) === (b?.randomSuffix ?? 0) &&
  (a?.enchantId ?? 0) === (b?.enchantId ?? 0);

/**
 * Fight settings with their own row; any other encounter field that differs shows as "Fight settings". A change of
 * fight style is one "Fight" row (a preset fixes the other fields); for a Custom fight, each field that differs too.
 */
const FIGHT: [string, (e: Character['encounter']) => string][] = [
  ['Fight', (e) => fightStyle(e.style).label],
  ['Duration', (e) => `${e.durationSec} s ± ${e.durationVariationSec}`],
  ['Targets', (e) => String(e.targetCount)],
  ['Target level', (e) => String(e.targetLevel)],
  ['Execute phase', (e) => (e.executePhase ? 'on' : 'off')],
];
const FIGHT_KEYS = new Set([
  'style',
  'durationSec',
  'durationVariationSec',
  'targetCount',
  'targetLevel',
  'executePhase',
]);
/** Character fields with their own group above, or display-only. Every other field lands in "other". */
const OWN_GROUP = new Set(['gear', 'talents', 'buffs', 'encounter', 'rotation', 'name', 'realm', 'region']);
/** The same with spec options, which have rows of their own between two characters of one spec. */
const OWN_GROUP_AND_OPTIONS = new Set([...OWN_GROUP, 'specOptions']);

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

/** Most talent rows a change lists; the rest are counted in one "and N more" row. */
export const MAX_TALENT_ROWS = 6;

/**
 * Talents from `a` to `b`, one row per talent ("Booming Voice 3/5 → 2/5": − when points come out, + when they
 * go in), grouped by tree in tree order; each tree's first row carries its points ("Fury 21 → 26").
 */
function talentRows(cls: ClassId, a: string, b: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let more = 0;
  for (const tree of talentChanges(cls, a, b)) {
    tree.talents.forEach((t, i) => {
      if (rows.length >= MAX_TALENT_ROWS) {
        more++;
        return;
      }
      rows.push({
        op: t.after > t.before ? '+' : '-',
        label: `${t.name} ${t.before}/${t.maxPoints} → ${t.after}/${t.maxPoints}`,
        ...(i === 0 && { detail: `${tree.tree} ${tree.before} → ${tree.after}` }),
      });
    });
  }
  if (more) rows.push({ op: '+', label: `and ${more} more talent change${more > 1 ? 's' : ''}` });
  return rows;
}

/**
 * The same rotation preset with other settings: one row per on/off setting that differs ("Use Summon Hawk: on",
 * + when it goes on) and a −/+ pair per number ("Shoot spot: 12", "Shoot spot: 15"). Null when the rotations
 * themselves differ. Only changed settings are stored (contracts RotationSchema), so a switch one side does not
 * list is at the opposite of what the other side changed it to, and a number at what `names` says.
 */
function settingRows(a: Character, b: Character, names: DiffNames): DiffRow[] | null {
  const ra = a.rotation;
  const rb = b.rotation;
  if (ra.kind !== 'preset' || rb.kind !== 'preset' || ra.presetId !== rb.presetId) return null;
  const differing = <T>(x: Record<string, T> = {}, y: Record<string, T> = {}) =>
    [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((name) => x[name] !== y[name]);
  const rows: DiffRow[] = [
    ...differing(ra.switches, rb.switches).map((name): DiffRow => {
      const on = rb.switches?.[name] ?? !ra.switches?.[name];
      return { op: on ? '+' : '-', label: `${name}: ${on ? 'on' : 'off'}` };
    }),
    ...differing(ra.values, rb.values).flatMap((name): DiffRow[] => [
      { op: '-', label: `${name}: ${names.rotationValue(a, name)}` },
      { op: '+', label: `${name}: ${names.rotationValue(b, name)}` },
    ]),
  ];
  if (rows[0]) rows[0].detail = 'rotation';
  return rows;
}

/** A change that takes something away: an option set to none or off, a number lowered. */
function lowers({ field, before, after }: SpecOptionChange): boolean {
  if (field.kind === 'bool') return after === false;
  if (field.kind === 'number') return Number(after) < Number(before);
  const none = field.choices[0]!;
  return none.label === 'None' && after === none.value;
}

/**
 * Spec options from `a` to `b`, two characters of one spec: one row per option that differs, by name with what it
 * was and is ("Pet type: Raptor → Cat", "Cobra reflexes: on"; − when it takes something away), then one row when
 * something the options form has no field for differs. The options are compared by value, so one that is written
 * out at the engine's default equals one that is left out. A row wraps rather than being cut short: what the
 * option changed to is at its end ("Quiver bonus: Ancient Sinew Wrapped Lamina → Quickdraw Quiver").
 */
function optionRows(a: Character, b: Character): DiffRow[] {
  const { changes, rest } = specOptionChanges(a.spec, a.specOptions, b.specOptions);
  const rows = changes.map((c): DiffRow => ({
    op: lowers(c) ? '-' : '+',
    label: specOptionChangeText(c),
    wrap: true,
  }));
  if (rest) rows.push({ op: '+', label: 'Other spec options' });
  if (rows[0]) rows[0].detail = 'options';
  return rows;
}

/** `b` against `a`: one group per changed slot, then talents, spec options, buffs, fight, rotation and the rest. */
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
    const rows = a.class === b.class ? talentRows(a.class, a.talents, b.talents) : null;
    if (rows?.length !== 0) {
      out.push({
        key: 'talents',
        kind: 'talents',
        rows: rows ?? [
          { op: '-', label: a.talents || 'no talents', detail: 'talents' },
          { op: '+', label: b.talents || 'no talents' },
        ],
      });
    }
  }
  // Another spec has other options: nothing to tell apart option by option, so they count under "other".
  const sameSpec = a.spec === b.spec;
  if (sameSpec) {
    const rows = optionRows(a, b);
    if (rows.length) out.push({ key: 'options', kind: 'options', rows });
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
    if (f(ea) === f(eb) || (label !== 'Fight' && eb.style !== 'custom')) continue;
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
    const rows = settingRows(a, b, names) ?? [
      { op: '-', label: `Rotation: ${names.rotation(a)}`, detail: 'rotation' },
      { op: '+', label: `Rotation: ${names.rotation(b)}` },
    ];
    if (rows.length) out.push({ key: 'rotation', kind: 'rotation', rows });
  }
  const own = sameSpec ? OWN_GROUP_AND_OPTIONS : OWN_GROUP;
  if (stable(without(a, own)) !== stable(without(b, own))) {
    const what = sameSpec ? 'race, professions, consumables' : 'race, professions, consumables, spec options';
    out.push({
      key: 'other',
      kind: 'other',
      rows: [{ op: '+', label: `Other settings: ${what}`, detail: 'other' }],
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
