// Droptimizer: every drop from the chosen dungeon or raid bosses that the character could wear, each simmed as
// a one-item swap on the draft with one shared seed and ranked by DPS gain over what is equipped.
//
// Candidates. Each candidate is the draft with one item in one slot:
// - rings and trinkets are tried in both slots (replacing ring 1, replacing ring 2); the ranking keeps the
//   better of the two, so "which ring does it replace" is answered by the sim, not guessed;
// - one-handers go in the main hand, and also in the off hand for specs that dual wield (same "better of");
// - a two-hander empties the off hand; off-hand items are skipped while a two-hander is equipped, and a
//   one-hander replacing a two-hander leaves the off hand empty (flagged);
// - the equipped enchant stays when it fits the new item, else the item goes in without one (flagged).
// Items already worn (in any slot, matched by id or name: the data has some items under two ids) are not
// candidates.
//
// Workload. A fast pass sims every candidate at low iterations, then (optionally) the best few items and the
// equipped set are re-simmed at 10k with the same seed, like top gear's "re-run top 5". State lives for the
// page load so leaving the screen keeps the batch.
import type { Character, ItemSlotId } from '@fsim/contracts';
import { HandType } from '@fsim/proto/common';
import type { UIItem } from '@fsim/proto/ui';
import {
  enchantAppliesToItem,
  instanceDrops,
  lootInstance,
  lootInstances,
  usableDrops,
  type DropSkipReason,
  type GameDatabase,
  type Instance,
} from '@fsim/gamedata';
import {
  applyChanges,
  batchRunner,
  newBatch,
  rankResults,
  simCombos,
  type Batch,
  type Combo,
  type RankedRow,
} from './topGear';

export type DropFlag = 'enchant-lost' | 'offhand-cleared' | 'offhand-empty';
export type DropSkip = DropSkipReason | 'equipped' | 'two-hander';

export interface DropCandidate extends Combo {
  itemId: number;
  slot: ItemSlotId;
  /** The two-hander also empties the off hand. */
  clearOffHand: boolean;
  flags: DropFlag[];
  /** Names of the loot sources that drop it, e.g. ["Ragnaros"]. */
  sources: string[];
}

export interface DropPlan {
  candidates: DropCandidate[];
  /** Distinct items behind the candidates. */
  items: number;
  skipped: { itemId: number; reason: DropSkip }[];
}

export const DROP_FLAG_LABELS: Record<DropFlag, string> = {
  'enchant-lost': 'enchant does not fit',
  'offhand-cleared': 'empties off hand',
  'offhand-empty': 'off hand left empty',
};
export const DROP_SKIP_LABELS: Record<DropSkip, string> = {
  class: 'not wearable by the class',
  level: 'level too high',
  stats: 'no stats the spec weighs',
  'random-suffix': 'random enchantment',
  equipped: 'already equipped',
  'two-hander': 'off hand while a two-hander is equipped',
};

/** Most candidate sims one batch runs (rings, trinkets and dual-wield weapons count once per slot). */
export const DROP_MAX_CANDIDATES = 250;
/** Above this many candidates the page warns that the batch takes a while. */
export const DROP_WARN_CANDIDATES = 100;
export const DROP_REFINE_TOP = 8;
export const DROP_REFINE_ITERATIONS = 10_000;

/**
 * The candidates for a character from the given loot sources (all sources when `sourceKeys` is omitted),
 * and the drops left out with the reason.
 */
export function planDrops(
  c: Character,
  db: GameDatabase,
  zoneId: number,
  sourceKeys?: readonly string[],
): DropPlan {
  const drops = instanceDrops(db, zoneId, sourceKeys);
  const sourcesOf = new Map(drops.map((d) => [d.item.id, d.sources.map((s) => s.name)]));
  const { usable, skipped: unusable } = usableDrops(
    drops.map((d) => d.item),
    { class: c.class, spec: c.spec, level: c.level },
  );
  const skipped: DropPlan['skipped'] = unusable.map((s) => ({ itemId: s.item.id, reason: s.reason }));
  const worn = new Set<number | string>();
  for (const g of Object.values(c.gear)) {
    if (!g) continue;
    worn.add(g.itemId);
    const name = db.item(g.itemId)?.name;
    if (name) worn.add(name);
  }
  const main = c.gear.mainHand ? db.item(c.gear.mainHand.itemId) : undefined;
  const twoHanderOn = main?.handType === HandType.HandTypeTwoHand;
  const candidates: DropCandidate[] = [];
  let items = 0;
  for (const { item, slots } of usable) {
    if (worn.has(item.id) || worn.has(item.name)) {
      skipped.push({ itemId: item.id, reason: 'equipped' });
      continue;
    }
    const before = candidates.length;
    for (const slot of slots) {
      if (slot === 'offHand' && twoHanderOn) continue;
      const flags: DropFlag[] = [];
      const twoHand = item.handType === HandType.HandTypeTwoHand;
      const clearOffHand = slot === 'mainHand' && twoHand && !!c.gear.offHand;
      if (clearOffHand) flags.push('offhand-cleared');
      if (slot === 'mainHand' && !twoHand && twoHanderOn) flags.push('offhand-empty');
      if (enchantLost(db, c.gear[slot]?.enchantId, item)) flags.push('enchant-lost');
      candidates.push({
        key: `${slot}:${item.id}`,
        changes: [{ slot, itemId: item.id }],
        itemId: item.id,
        slot,
        clearOffHand,
        flags,
        sources: sourcesOf.get(item.id) ?? [],
      });
    }
    if (candidates.length > before) items++;
    else skipped.push({ itemId: item.id, reason: 'two-hander' });
  }
  return { candidates, items, skipped };
}

function enchantLost(db: GameDatabase, enchantId: number | undefined, item: UIItem): boolean {
  if (!enchantId) return false;
  const e = db.findEnchant(enchantId, item);
  return !(e && enchantAppliesToItem(e, item));
}

/** The character with a candidate's item in place (and the off hand emptied for a two-hander). */
export function candidateCharacter(base: Character, cand: Combo, db: GameDatabase): Character {
  const next = applyChanges(base, cand.changes, db);
  if ((cand as Partial<DropCandidate>).clearOffHand) delete next.gear.offHand;
  return next;
}

const zoneId = ref<number | null>(null);
/** Loot source keys to include; null = every source of the zone. */
const sourceKeys = ref<string[] | null>(null);
/** Slots switched off before a run. */
const slotsOff = ref<Partial<Record<ItemSlotId, boolean>>>({});
const batch = ref<Batch | null>(null);
/** The candidates of the current batch, by combo key. */
const batchCandidates = shallowRef<Map<string, DropCandidate>>(new Map());
const batchZone = ref<{ zoneId: number; name: string; sources: string[] } | null>(null);
const pass = ref<{ kind: 'fast' | 'refine'; startWallMs: number; refineAfter: boolean } | null>(null);
const runner = batchRunner();

export function useDroptimizer() {
  const session = useSession();
  const engine = useEngine();
  const db = shallowRef<GameDatabase | null>(null);
  void engine
    .gameDatabase()
    .then((d) => (db.value = d))
    .catch(() => {});

  const instances = computed<Instance[]>(() => (db.value ? lootInstances(db.value) : []));
  const instance = computed(() =>
    db.value && zoneId.value !== null ? lootInstance(db.value, zoneId.value) : undefined,
  );
  const selectedKeys = computed(() => sourceKeys.value ?? instance.value?.sources.map((s) => s.key) ?? []);

  function setZone(id: number | null) {
    zoneId.value = id;
    sourceKeys.value = null;
    slotsOff.value = {};
  }
  function setSources(keys: string[] | null) {
    sourceKeys.value = keys;
  }

  /** Candidates from the chosen sources, before the slot filter. */
  const fullPlan = computed<DropPlan | null>(() => {
    const c = session.character.value;
    if (!c || !db.value || zoneId.value === null) return null;
    return planDrops(c as Character, db.value, zoneId.value, selectedKeys.value);
  });
  /** Usable items per loot source for the chips (all sources, independent of the selection). */
  const usablePerSource = computed(() => {
    const c = session.character.value;
    const out = new Map<string, number>();
    if (!c || !db.value || zoneId.value === null) return out;
    for (const s of instance.value?.sources ?? []) {
      out.set(
        s.key,
        new Set(planDrops(c as Character, db.value, zoneId.value, [s.key]).candidates.map((x) => x.itemId))
          .size,
      );
    }
    return out;
  });
  const plan = computed<DropPlan | null>(() => {
    const p = fullPlan.value;
    if (!p) return null;
    const candidates = p.candidates.filter((x) => !slotsOff.value[x.slot]);
    return { ...p, candidates, items: new Set(candidates.map((x) => x.itemId)).size };
  });

  async function run(iterations: number, refine: boolean) {
    const c = session.character.value;
    const p = plan.value;
    const inst = instance.value;
    if (!c || !p || !inst) throw new Error('Pick an instance first');
    if (!p.candidates.length) throw new Error('No drops to sim');
    if (p.candidates.length > DROP_MAX_CANDIDATES)
      throw new Error(`More than ${DROP_MAX_CANDIDATES} candidates; pick fewer bosses or slots`);
    const combos: Combo[] = [{ key: '', changes: [] }, ...p.candidates];
    batchCandidates.value = new Map(p.candidates.map((x) => [x.key, x]));
    batchZone.value = {
      zoneId: inst.zoneId,
      name: inst.name,
      // By name: two NPCs can share one (Sunken Temple's two Hazzas).
      sources: [
        ...new Set(inst.sources.filter((s) => selectedKeys.value.includes(s.key)).map((s) => s.name)),
      ],
    };
    batch.value = newBatch(c as Character, combos, iterations);
    const b = batch.value;
    pass.value = { kind: 'fast', startWallMs: 0, refineAfter: refine };
    await runner.guarded(b, async (signal) => {
      await simCombos(b, combos, iterations, signal, candidateCharacter);
      if (refine) await refinePass(b, signal);
    });
  }

  async function refinePass(b: Batch, signal: AbortSignal) {
    const top = ranking.value.filter((r) => !r.equipped).slice(0, DROP_REFINE_TOP);
    const combos: Combo[] = [
      { key: '', changes: [] },
      ...top.map((r) => batchCandidates.value.get(r.key)!).filter(Boolean),
    ];
    pass.value = { kind: 'refine', startWallMs: b.wallMs, refineAfter: false };
    await simCombos(b, combos, DROP_REFINE_ITERATIONS, signal, candidateCharacter);
  }

  /** Re-sim the best items and the equipped set at 10k, same seed. */
  async function rerunTop() {
    const b = batch.value;
    if (!b) return;
    await runner.guarded(b, (signal) => refinePass(b, signal));
  }

  function cancel() {
    runner.cancel();
  }

  const reference = computed(() => batch.value?.results[''] ?? null);

  /** Every simmed candidate against the equipped set. */
  const allRows = computed<RankedRow[]>(() => {
    const b = batch.value;
    const ref = reference.value;
    return b && ref ? rankResults(b.results, ref) : [];
  });

  /**
   * One row per item: its best slot (ring 1 or 2, main or off hand). A slot simmed at more iterations wins over
   * a fast-pass one, so a re-run result is never displaced by a noisier alternative.
   */
  const ranking = computed<RankedRow[]>(() => {
    const best = new Map<number, RankedRow>();
    let equipped: RankedRow | undefined;
    for (const r of allRows.value) {
      if (r.equipped) {
        equipped = r;
        continue;
      }
      const cand = batchCandidates.value.get(r.key);
      if (!cand) continue;
      const kept = best.get(cand.itemId);
      if (!kept || r.n > kept.n || (r.n === kept.n && r.mean > kept.mean)) best.set(cand.itemId, r);
    }
    return [...best.values(), ...(equipped ? [equipped] : [])]
      .sort((a, b) => b.mean - a.mean)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  });

  /** The other slots an item was simmed in, with their gain. */
  function alternatives(
    row: RankedRow,
  ): { slot: ItemSlotId; delta: number; verdict: RankedRow['verdict'] }[] {
    const cand = batchCandidates.value.get(row.key);
    if (!cand) return [];
    return allRows.value
      .filter((r) => r.key !== row.key && batchCandidates.value.get(r.key)?.itemId === cand.itemId)
      .map((r) => ({ slot: batchCandidates.value.get(r.key)!.slot, delta: r.delta, verdict: r.verdict }));
  }

  /** Per slot (rings and trinkets as one), the best drop. */
  const bestPerSlot = computed(() => {
    const out = new Map<ItemSlotId, RankedRow>();
    for (const r of ranking.value) {
      const cand = batchCandidates.value.get(r.key);
      if (!cand) continue;
      const slot = PAIRED[cand.slot] ?? cand.slot;
      const kept = out.get(slot);
      if (!kept || r.delta > kept.delta) out.set(slot, r);
    }
    return [...out].map(([slot, row]) => ({ slot, row }));
  });

  /** Per loot source with simmed drops: how many are significant upgrades and the best one; most upgrades first. */
  const bySource = computed(() => {
    const sources = batchZone.value?.sources ?? [];
    const rows = sources.map((name) => {
      const rows = ranking.value.filter((r) => batchCandidates.value.get(r.key)?.sources.includes(name));
      const best = rows.reduce<RankedRow | undefined>((a, r) => (!a || r.delta > a.delta ? r : a), undefined);
      return {
        name,
        items: rows.length,
        upgrades: rows.filter((r) => r.verdict === 'up').length,
        best: best && { itemId: batchCandidates.value.get(best.key)!.itemId, row: best },
      };
    });
    return rows
      .filter((r) => r.items > 0)
      .sort((a, b) => b.upgrades - a.upgrades || (b.best?.row.delta ?? 0) - (a.best?.row.delta ?? 0));
  });

  /** Milliseconds left in the batch (current pass plus a scaled estimate of the re-run), or null early on. */
  const etaMs = computed(() => {
    const b = batch.value;
    const p = pass.value;
    if (!b || !p || b.status !== 'running' || b.progress <= 0.01) return null;
    const spent = b.wallMs - p.startWallMs;
    const passTotal = spent / b.progress;
    let left = passTotal - spent;
    if (p.refineAfter) {
      const refineSims = Math.min(DROP_REFINE_TOP, b.total - 1) + 1;
      left += (passTotal * (refineSims * DROP_REFINE_ITERATIONS)) / (b.total * b.iterations);
    }
    return left;
  });

  /** Put a candidate's item on the draft (with the same enchant and off-hand rules as the sim). */
  async function equip(key: string) {
    const cand = batchCandidates.value.get(key);
    const d = await engine.gameDatabase();
    if (!cand || !session.character.value) return;
    session.updateCharacter((c) => {
      c.gear = candidateCharacter(c, cand, d).gear;
    });
  }

  return {
    instances,
    instance,
    zoneId: computed(() => zoneId.value),
    selectedKeys,
    slotsOff,
    setZone,
    setSources,
    fullPlan,
    plan,
    usablePerSource,
    batch,
    batchZone,
    batchCandidates: computed(() => batchCandidates.value),
    pass,
    run,
    rerunTop,
    cancel,
    reference,
    ranking,
    alternatives,
    bestPerSlot,
    bySource,
    etaMs,
    equip,
  };
}

const PAIRED: Partial<Record<ItemSlotId, ItemSlotId>> = { finger2: 'finger1', trinket2: 'trinket1' };
