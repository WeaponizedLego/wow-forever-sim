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
import {
  itemLevel,
  loadSpecPresets,
  weightStatsFor,
  type GameDatabase,
  type SpecPresets,
  type WeightStats,
} from '@fsim/gamedata';
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
import type { Quality } from '~/composables/ui-types';
import { diffCharacters, type ChangeGroup, type DiffNames } from '~/utils/character-diff';
import {
  cleanVariantName,
  newVariantId,
  nextVariantName,
  type UnreadableVariant,
  type WorkbenchVariant,
} from '~/utils/variant-record';

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

/**
 * What to weigh for a spec, and the metric the estimates use: the same list as the run page's stat
 * weights button (@fsim/gamedata `weightStatsFor`, upstream's default EP stats). Weapon users weigh weapon
 * DPS, so weapon swaps get a value.
 */
export const weightPlan = (spec: SpecId): WeightStats => weightStatsFor(spec);

/** Display names for `diffCharacters`: items and enchants from the game data, rotations from the presets. */
export function diffNames(d: GameDatabase | null, p: SpecPresets | null): DiffNames {
  return {
    slot: (s) => SLOT_LABELS[s],
    item: (g) => itemName(d, g),
    enchant: (g) => enchantName(d, g),
    buffs: (id) => BUFF_PRESETS.find((b) => b.id === id)?.label ?? id,
    rotation: (c) =>
      c.rotation.kind === 'preset'
        ? (p?.rotations.find((r) => r.id === (c.rotation as { presetId: string }).presetId)?.name ??
          c.rotation.presetId)
        : 'custom SIML',
  };
}

const ALL_REFS: StatRef[] = [
  ...Array.from({ length: Stat.StatArmorNoMods + 1 }, (_, i) => ({ kind: 'stat', stat: i }) as StatRef),
  { kind: 'pseudo', stat: PseudoStat.PseudoStatMainHandDps },
  { kind: 'pseudo', stat: PseudoStat.PseudoStatOffHandDps },
  { kind: 'pseudo', stat: PseudoStat.PseudoStatRangedDps },
];

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
/** Saved variants, newest first; stored in IndexedDB (useVariantStore) and loaded on first use. */
const variants = ref<WorkbenchVariant[]>([]);
/** Stored variants that no longer parse; listed so they can be deleted. */
const unreadableVariants = ref<UnreadableVariant[]>([]);
const variantsLoaded = ref(false);
let variantsHydrating: Promise<void> | null = null;
let state: ReturnType<typeof createWorkbench> | null = null;

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
    return a && b ? diffCharacters(a, b, diffNames(db.value, presets.value)) : [];
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

  // ---- saved variants
  const variantStore = useVariantStore();
  variantsHydrating ??= variantStore.load().then((stored) => {
    // Variants saved in this tab before the load finished stay on top.
    const here = new Set(variants.value.map((v) => v.id));
    variants.value = [...variants.value, ...stored.variants.filter((v) => !here.has(v.id))];
    unreadableVariants.value = stored.unreadable;
    variantsLoaded.value = true;
  });

  /** Save the draft as a variant (stored in IndexedDB). Works with or without pending changes. */
  function saveVariant(name?: string): WorkbenchVariant | null {
    const c = draft.value;
    if (!c) return null;
    const v: WorkbenchVariant = {
      id: newVariantId(),
      name: cleanVariantName(name ?? '') || nextVariantName(variants.value.map((x) => x.name)),
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
    void variantStore.put(v);
    return v;
  }

  /** Rename a variant; an empty name is ignored. */
  function renameVariant(id: string, name: string) {
    const clean = cleanVariantName(name);
    const v = variants.value.find((x) => x.id === id);
    if (!v || !clean || clean === v.name) return;
    const next = { ...toRaw(v), name: clean };
    variants.value = variants.value.map((x) => (x.id === id ? next : x));
    void variantStore.put(next);
  }

  /**
   * Make a character the draft. Same spec: it replaces the draft and the baseline stays, so the pending
   * changes show it against the last run. No draft yet, or another spec: it becomes draft and baseline.
   */
  async function openCharacter(character: Character) {
    const next = structuredClone(toRaw(character)) as Character;
    const current = draft.value;
    if (!current || current.spec !== next.spec) {
      await session.setCharacter(next);
      return;
    }
    session.updateCharacter((c) => {
      for (const k of Object.keys(c)) delete (c as Record<string, unknown>)[k];
      Object.assign(c, next);
    });
  }

  /** Load a saved variant into the draft. */
  async function loadVariant(id: string) {
    const v = variants.value.find((x) => x.id === id);
    if (v) await openCharacter(v.character);
  }

  /** Delete a saved variant; returns it so the caller can offer Undo (restoreVariant). */
  function removeVariant(id: string): WorkbenchVariant | null {
    const v = variants.value.find((x) => x.id === id) ?? null;
    variants.value = variants.value.filter((x) => x.id !== id);
    unreadableVariants.value = unreadableVariants.value.filter((x) => x.id !== id);
    void variantStore.remove(id);
    return v;
  }

  /** Put a deleted variant back, in date order. */
  function restoreVariant(v: WorkbenchVariant) {
    if (variants.value.some((x) => x.id === v.id)) return;
    variants.value = [...variants.value, v].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    void variantStore.put(v);
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
    unreadableVariants,
    variantsLoaded: readonly(variantsLoaded),
    variantStorage: variantStore.status,
    saveVariant,
    renameVariant,
    loadVariant,
    openCharacter,
    removeVariant,
    restoreVariant,
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
