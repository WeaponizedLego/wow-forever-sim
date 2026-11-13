// Workbench state on top of useSession(): game data and presets for the current spec, the engine's stat
// sheet for the draft and the baseline, stat-weight estimates (per item, per pending change, total), the
// pending changes themselves, and locally saved variants.
//
// Estimates are linear: Σ stat change × stat weight, from the most recent run of this spec that has stat
// weights (`linearEstimate`, ± assumes independent weight errors). Without weights every estimate is null
// and the screens say so; nothing is invented.
import {
  ITEM_SLOTS,
  SPECS,
  type BuffsPreset,
  type Character,
  type GearItem,
  type ItemSlotId,
  type SpecId,
} from '@fsim/contracts';
import { itemLevel, loadSpecPresets, type GameDatabase, type SpecPresets } from '@fsim/gamedata';
import {
  linearEstimate,
  statWeightRows,
  type LinearEstimate,
  type StatDelta,
  type StatRef,
  type StatWeightRow,
} from '@fsim/analysis';
import { ItemQuality, PseudoStat, Stat } from '@fsim/proto/common';
import type { PlayerStats, StatWeightsResult } from '@fsim/proto/api';
import type { UIItem } from '@fsim/proto/ui';
import type { DiffRow, Quality } from '~/composables/ui-types';

export const SLOT_LABELS: Record<ItemSlotId, string> = {
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

export const BUFF_PRESETS: { id: BuffsPreset; label: string; short: string; body: string }[] = [
  {
    id: 'full-raid',
    label: 'Full raid',
    short: 'raid',
    body: 'Every individual, party and raid buff and raid debuff from the spec preset, as in a 40-man raid with the usual classes.',
  },
  {
    id: 'five-man',
    label: 'Five-man',
    short: 'party',
    body: 'Your own buffs and party buffs only. No raid buffs and no debuffs on the target.',
  },
  {
    id: 'solo',
    label: 'Solo',
    short: 'solo',
    body: 'No buffs or debuffs from anyone else. Your consumables still apply.',
  },
  {
    id: 'none',
    label: 'None',
    short: 'none',
    body: 'Same request as Solo today: no external buffs or debuffs; consumables still apply.',
  },
];

export const specInfo = (id: SpecId) => SPECS.find((s) => s.id === id)!;

/** Talent tree names per class, in the engine's tree order. */
export const TALENT_TREES: Record<Character['class'], [string, string, string]> = {
  warrior: ['Arms', 'Fury', 'Protection'],
  paladin: ['Holy', 'Protection', 'Retribution'],
  hunter: ['Beast Mastery', 'Marksmanship', 'Survival'],
  rogue: ['Assassination', 'Combat', 'Subtlety'],
  priest: ['Discipline', 'Holy', 'Shadow'],
  shaman: ['Elemental', 'Enhancement', 'Restoration'],
  mage: ['Arcane', 'Fire', 'Frost'],
  warlock: ['Affliction', 'Demonology', 'Destruction'],
  druid: ['Balance', 'Feral Combat', 'Restoration'],
};

/** Points spent per tree of an engine talent string ("5500331023001351-05500001-053"). */
export function talentPoints(talents: string): [number, number, number] {
  const trees = talents.split('-');
  const sum = (s = '') => [...s].reduce((a, ch) => a + (Number(ch) || 0), 0);
  return [sum(trees[0]), sum(trees[1]), sum(trees[2])];
}

export function qualityOf(item: UIItem | undefined): Quality {
  switch (item?.quality) {
    case ItemQuality.ItemQualityUncommon:
      return 'uncommon';
    case ItemQuality.ItemQualityRare:
      return 'rare';
    case ItemQuality.ItemQualityEpic:
      return 'epic';
    case ItemQuality.ItemQualityLegendary:
    case ItemQuality.ItemQualityArtifact:
    case ItemQuality.ItemQualityHeirloom:
      return 'legendary';
    default:
      return 'common';
  }
}

/** "Captain's Circlet of the Boar"; "Item 99412" when the data build lacks the item. */
export function itemName(db: GameDatabase | null, g: GearItem): string {
  const item = db?.item(g.itemId);
  if (!item) return `Item ${g.itemId}`;
  const suffix = g.randomSuffix ? db!.randomSuffixes.get(g.randomSuffix)?.name : undefined;
  return suffix ? `${item.name} ${suffix}` : item.name;
}

/** "Enchant Bracer - Greater Spellpower" → "Greater Spellpower": the slot is already on screen. */
export const shortEnchant = (name: string) => name.replace(/^Enchant [^-]+ - /, '');

export function enchantName(db: GameDatabase | null, g: GearItem | undefined): string | null {
  if (!g?.enchantId) return null;
  const e = db?.findEnchant(g.enchantId, db.item(g.itemId));
  return e ? shortEnchant(e.name) : `Enchant ${g.enchantId}`;
}

/** What to weigh for a spec, and the metric the estimates use. */
export function weightPlan(spec: SpecId): { stats: Stat[]; reference: Stat; metric: 'dps' | 'hps' } {
  const info = specInfo(spec);
  if (info.role === 'healer') {
    return {
      stats: [Stat.StatIntellect, Stat.StatSpirit, Stat.StatHealingPower, Stat.StatCritRating, Stat.StatMP5],
      reference: Stat.StatHealingPower,
      metric: 'hps',
    };
  }
  if (spec === 'hunter') {
    return {
      stats: [
        Stat.StatAgility,
        Stat.StatAttackPower,
        Stat.StatRangedAttackPower,
        Stat.StatHitRating,
        Stat.StatCritRating,
      ],
      reference: Stat.StatRangedAttackPower,
      metric: 'dps',
    };
  }
  const casters: SpecId[] = ['balance-druid', 'mage', 'dps-priest', 'elemental-shaman', 'warlock'];
  if (casters.includes(spec)) {
    return {
      stats: [
        Stat.StatIntellect,
        Stat.StatSpirit,
        Stat.StatSpellDamage,
        Stat.StatHitRating,
        Stat.StatCritRating,
      ],
      reference: Stat.StatSpellDamage,
      metric: 'dps',
    };
  }
  return {
    stats: [
      Stat.StatStrength,
      Stat.StatAgility,
      Stat.StatAttackPower,
      Stat.StatHitRating,
      Stat.StatCritRating,
    ],
    reference: Stat.StatAttackPower,
    metric: 'dps',
  };
}

export interface ChangeGroup {
  key: string;
  kind: 'gear' | 'talents' | 'buffs' | 'fight' | 'rotation' | 'other';
  slot?: ItemSlotId;
  rows: DiffRow[];
}

/** A draft kept for later. S3 (Top gear) may list these as candidates. */
export interface WorkbenchVariant {
  id: string;
  name: string;
  createdAt: string;
  /** Run the draft was edited from; null when it came straight from an import. */
  fromRunId: string | null;
  character: Character;
  /** Number of pending-change groups vs that run when saved. */
  changes: number;
  /** Linear estimate vs that run when saved; null without stat weights. */
  estimate: { delta: number; ci95: number } | null;
}

const ALL_REFS: StatRef[] = [
  ...Array.from({ length: Stat.StatArmorNoMods + 1 }, (_, i) => ({ kind: 'stat', stat: i }) as StatRef),
  { kind: 'pseudo', stat: PseudoStat.PseudoStatMainHandDps },
  { kind: 'pseudo', stat: PseudoStat.PseudoStatOffHandDps },
  { kind: 'pseudo', stat: PseudoStat.PseudoStatRangedDps },
];

const sameGear = (a: GearItem | undefined, b: GearItem | undefined) =>
  a?.itemId === b?.itemId &&
  (a?.randomSuffix ?? 0) === (b?.randomSuffix ?? 0) &&
  (a?.enchantId ?? 0) === (b?.enchantId ?? 0);

// ---------------------------------------------------------------- module state (one per page load)
const db = shallowRef<GameDatabase | null>(null);
const presets = shallowRef<SpecPresets | null>(null);
const draftSheet = shallowRef<PlayerStats | null>(null);
const baseSheet = shallowRef<PlayerStats | null>(null);
/** True when the sheets came from the full setup (rotation + attack tables), so caps are available. */
const sheetsFull = ref(false);
const sheetError = ref<string | null>(null);
const slotValues = shallowRef<Partial<Record<ItemSlotId, LinearEstimate>>>({});
const changeEstimates = shallowRef<Record<string, LinearEstimate>>({});
const gearTotal = shallowRef<LinearEstimate | null>(null);
const variants = ref<WorkbenchVariant[]>([]);
let state: ReturnType<typeof createWorkbench> | null = null;
let variantCounter = 0;

function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/** The Workbench state, created once per page load in its own effect scope (it outlives screens). */
export function useWorkbench() {
  state ??= effectScope(true).run(createWorkbench)!;
  return state;
}

function createWorkbench() {
  const session = useSession();
  // Raw objects: the session replaces the character on every edit, so tracking the ref is enough.
  const draft = computed(() => (toRaw(session.character.value) as Character | null) ?? null);
  const baseline = computed(() => (toRaw(session.baseline.value) as Character | null) ?? null);

  /** Stat weights from the newest run of this spec that has them. */
  const weights = computed<{ runId: string; rows: StatWeightRow[] } | null>(() => {
    const c = draft.value;
    if (!c) return null;
    const entry = session.runs.value.find((r) => r.statWeights && r.record.character.spec === c.spec);
    if (!entry?.statWeights) return null;
    const rows = statWeightRows(
      entry.statWeights as StatWeightsResult,
      ALL_REFS,
      weightPlan(c.spec).metric,
      entry.record.iterations,
    ).filter((r) => r.weight !== 0 || r.stdev !== 0);
    return rows.length ? { runId: entry.record.id, rows } : null;
  });

  const changes = computed<ChangeGroup[]>(() => {
    const a = baseline.value;
    const b = draft.value;
    if (!a || !b) return [];
    const d = db.value;
    const out: ChangeGroup[] = [];
    for (const slot of ITEM_SLOTS) {
      const x = a.gear[slot];
      const y = b.gear[slot];
      if (sameGear(x, y)) continue;
      const rows: DiffRow[] = [];
      if (x?.itemId === y?.itemId && (x?.randomSuffix ?? 0) === (y?.randomSuffix ?? 0)) {
        // Only the enchant changed.
        rows.push({ op: '-', label: `${SLOT_LABELS[slot]}: ${enchantName(d, x) ?? 'no enchant'}` });
        rows.push({ op: '+', label: `${SLOT_LABELS[slot]}: ${enchantName(d, y) ?? 'no enchant'}` });
      } else {
        const label = (g: GearItem) => {
          const e = enchantName(d, g);
          return e ? `${itemName(d, g)} · ${e}` : itemName(d, g);
        };
        rows.push({ op: '-', label: x ? label(x) : `${SLOT_LABELS[slot]}: empty` });
        rows.push({ op: '+', label: y ? label(y) : `${SLOT_LABELS[slot]}: empty` });
      }
      rows[0]!.detail = SLOT_LABELS[slot].toLowerCase();
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
      const name = (id: BuffsPreset) => BUFF_PRESETS.find((p) => p.id === id)?.label ?? id;
      out.push({
        key: 'buffs',
        kind: 'buffs',
        rows: [
          { op: '-', label: `Buffs: ${name(a.buffs)}`, detail: 'buffs' },
          { op: '+', label: `Buffs: ${name(b.buffs)}` },
        ],
      });
    }
    const ea = a.encounter;
    const eb = b.encounter;
    const fight: [string, (e: Character['encounter']) => string][] = [
      ['Duration', (e) => `${e.durationSec} s ± ${e.durationVariationSec}`],
      ['Targets', (e) => String(e.targetCount)],
      ['Target level', (e) => String(e.targetLevel)],
      ['Execute phase', (e) => (e.executePhase ? 'on' : 'off')],
    ];
    for (const [label, f] of fight) {
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
    const rot = (c: Character) =>
      c.rotation.kind === 'preset'
        ? (presets.value?.rotations.find((r) => r.id === (c.rotation as { presetId: string }).presetId)
            ?.name ?? c.rotation.presetId)
        : 'custom SIML';
    if (JSON.stringify(a.rotation) !== JSON.stringify(b.rotation)) {
      out.push({
        key: 'rotation',
        kind: 'rotation',
        rows: [
          { op: '-', label: `Rotation: ${rot(a)}`, detail: 'rotation' },
          { op: '+', label: `Rotation: ${rot(b)}` },
        ],
      });
    }
    const rest = (c: Character) =>
      JSON.stringify([c.race, c.professions, c.consumables, c.specOptions, c.playerOptions, c.spec]);
    if (rest(a) !== rest(b)) {
      out.push({
        key: 'other',
        kind: 'other',
        rows: [{ op: '+', label: 'Race, professions, consumables or spec options', detail: 'other' }],
      });
    }
    return out;
  });

  /** Changes a gear-stat estimate cannot price (talents, buffs, fight, rotation …). */
  const unpriced = computed(() => changes.value.filter((c) => c.kind !== 'gear'));

  const lastRun = computed(() => session.latest.value?.record ?? null);
  /** "#0004", or null before the first run. */
  const baseRunId = computed(() => lastRun.value?.id ?? null);

  const avgIlvl = computed(() => {
    const c = draft.value;
    const d = db.value;
    if (!c || !d) return null;
    const lv = Object.values(c.gear)
      .map((g) => d.item(g!.itemId))
      .filter((i): i is UIItem => !!i)
      .map(itemLevel);
    return lv.length ? lv.reduce((x, y) => x + y, 0) / lv.length : null;
  });

  /** Estimate of the draft's DPS: last run + priced gear changes; null when it cannot be priced. */
  const draftEstimate = computed(() => {
    const run = lastRun.value;
    if (!run || !weights.value || unpriced.value.length) return null;
    if (!changes.value.length) return { value: run.summary.dpsMean, ci95: 0 };
    if (!gearTotal.value) return null;
    return { value: run.summary.dpsMean + gearTotal.value.delta, ci95: gearTotal.value.ci95 };
  });

  function saveVariant(name?: string): WorkbenchVariant | null {
    const c = draft.value;
    if (!c) return null;
    const v: WorkbenchVariant = {
      id: `v${++variantCounter}`,
      name: name || `Variant ${variantCounter}`,
      createdAt: new Date().toISOString(),
      fromRunId: baseRunId.value,
      character: structuredClone(toRaw(c)),
      changes: changes.value.length,
      estimate:
        gearTotal.value && !unpriced.value.length
          ? { delta: gearTotal.value.delta, ci95: gearTotal.value.ci95 }
          : null,
    };
    variants.value = [v, ...variants.value];
    return v;
  }

  function loadVariant(id: string) {
    const v = variants.value.find((x) => x.id === id);
    if (!v) return;
    const next = structuredClone(toRaw(v.character)) as Character;
    session.updateCharacter((c) => Object.assign(c, next));
  }

  function removeVariant(id: string) {
    variants.value = variants.value.filter((v) => v.id !== id);
  }

  startWatchers(draft, baseline, weights, changes);

  return {
    db,
    presets,
    draft,
    baseline,
    draftSheet,
    baseSheet,
    sheetsFull,
    sheetError,
    weights,
    slotValues,
    changes,
    changeEstimates,
    gearTotal,
    unpriced,
    lastRun,
    baseRunId,
    avgIlvl,
    draftEstimate,
    variants,
    saveVariant,
    loadVariant,
    removeVariant,
  };
}

/** Estimate from stat deltas, or null without weights. */
export function estimateOf(
  deltas: StatDelta[],
  weights: { rows: StatWeightRow[] } | null,
): LinearEstimate | null {
  return weights ? linearEstimate(deltas, weights.rows) : null;
}

function startWatchers(
  draft: Ref<Character | null>,
  baseline: Ref<Character | null>,
  weights: Ref<{ runId: string; rows: StatWeightRow[] } | null>,
  changes: Ref<ChangeGroup[]>,
) {
  const engine = useEngine();
  void engine
    .gameDatabase()
    .then((d) => (db.value = d))
    .catch((e: unknown) => (sheetError.value = e instanceof Error ? e.message : String(e)));

  watch(
    () => draft.value?.spec,
    async (spec) => {
      presets.value = spec ? await loadSpecPresets(spec) : null;
    },
    { immediate: true },
  );

  // Stat sheets (cheap: a few ms each once the engine is up).
  let sheetGen = 0;
  const refreshSheets = debounce(async () => {
    const gen = ++sheetGen;
    const a = baseline.value;
    const b = draft.value;
    if (!a || !b) return;
    try {
      let full = true;
      const sheet = (c: Character) =>
        characterSheet(c, true).catch(() => {
          full = false;
          return characterSheet(c, false);
        });
      const [sa, sb] = await Promise.all([sheet(a), sheet(b)]);
      if (gen !== sheetGen) return;
      baseSheet.value = sa;
      draftSheet.value = sb;
      sheetsFull.value = full;
      sheetError.value = null;
    } catch (e) {
      if (gen === sheetGen) sheetError.value = e instanceof Error ? e.message : String(e);
    }
  }, 120);
  watch([draft, baseline], refreshSheets, { immediate: true });

  // Estimates: per equipped item, per pending gear change, and the gear total. Only with weights.
  let estGen = 0;
  const refreshEstimates = debounce(async () => {
    const gen = ++estGen;
    const w = weights.value;
    const d = db.value;
    const a = baseline.value;
    const b = draft.value;
    if (!w || !d || !a || !b) {
      slotValues.value = {};
      changeEstimates.value = {};
      gearTotal.value = null;
      return;
    }
    try {
      const slots = ITEM_SLOTS.filter((s) => b.gear[s]);
      const contribs = await Promise.all(slots.map((s) => slotContribution(d, b, s)));
      const gearChanges = changes.value.filter((c) => c.kind === 'gear');
      const swaps = await Promise.all(gearChanges.map((c) => slotSwap(d, a, c.slot!, b.gear[c.slot!])));
      // Total: the baseline wearing the draft's gear, so non-gear changes stay out of it.
      const wearing = { ...structuredClone(a), gear: structuredClone(b.gear) };
      const [sa, sw] = await Promise.all([characterSheet(a), characterSheet(wearing)]);
      const raw = (c: Character) =>
        ITEM_SLOTS.reduce<number[]>((acc, s) => {
          rawItemStats(d, c.gear[s]).forEach((v, i) => (acc[i] = (acc[i] ?? 0) + (v ?? 0)));
          return acc;
        }, []);
      const total = gearStatDeltas(sa.gearStats, sw.gearStats, raw(a), raw(wearing));
      if (gen !== estGen) return;
      slotValues.value = Object.fromEntries(slots.map((s, i) => [s, linearEstimate(contribs[i]!, w.rows)]));
      changeEstimates.value = Object.fromEntries(
        gearChanges.map((c, i) => [c.key, linearEstimate(swaps[i]!, w.rows)]),
      );
      gearTotal.value = gearChanges.length ? linearEstimate(total, w.rows) : null;
    } catch (e) {
      if (gen === estGen) sheetError.value = e instanceof Error ? e.message : String(e);
    }
  }, 150);
  watch([draft, baseline, weights, db], refreshEstimates, { immediate: true });
}
