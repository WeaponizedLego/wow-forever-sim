// Top gear: candidate items per slot, every combination simmed with one shared seed, ranked against the
// equipped set. State lives for the page load (like the run list) so leaving the screen keeps the batch.
import { ITEM_SLOTS, type Character, type ItemSlotId } from '@fsim/contracts';
import { noiseFloor, welchTTest, summarize, type Verdict as WelchVerdict } from '@fsim/analysis';
import { enchantAppliesToItem, type GameDatabase } from '@fsim/gamedata';
import type { Verdict } from './ui-types';

export interface GearChange {
  slot: ItemSlotId;
  itemId: number;
}

export interface Combo {
  /** "" for the equipped set, else "slot:item|slot:item". */
  key: string;
  changes: GearChange[];
}

export interface ComboResult extends Combo {
  mean: number;
  stdev: number;
  n: number;
  ci95: number;
}

export interface RankedRow extends ComboResult {
  rank: number;
  equipped: boolean;
  delta: number;
  /** z·√(se² + se_ref²): |Δ| below this is within noise. */
  noise: number;
  p: number | null;
  verdict: Verdict;
}

export const TOP_GEAR_SLOT_LABELS: Record<ItemSlotId, string> = {
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

/** Most combinations one batch runs. */
export const TOP_GEAR_MAX_COMBOS = 200;
export const TOP_GEAR_RERUN_ITERATIONS = 25_000;

interface Batch {
  character: Character;
  seed: number;
  iterations: number;
  combos: Combo[];
  results: Record<string, ComboResult>;
  status: 'running' | 'done' | 'cancelled' | 'error';
  /** Combinations finished in the current pass, and how many the pass has. */
  done: number;
  total: number;
  /** 0–1 across the current pass. */
  progress: number;
  wallMs: number;
  /** Iterations summed over every sim in the batch. */
  fights: number;
  error: string | null;
}

const candidates = ref<Partial<Record<ItemSlotId, number[]>>>({});
const batch = ref<Batch | null>(null);
let abort: AbortController | null = null;

const comboKey = (changes: GearChange[]) => changes.map((c) => `${c.slot}:${c.itemId}`).join('|');

/** Every mix of equipped-or-candidate per slot that has candidates, in slot order. */
export function cartesian(cands: Partial<Record<ItemSlotId, number[]>>): Combo[] {
  let combos: GearChange[][] = [[]];
  for (const slot of ITEM_SLOTS) {
    const ids = cands[slot] ?? [];
    if (!ids.length) continue;
    const next: GearChange[][] = [];
    for (const c of combos) {
      next.push(c);
      for (const itemId of ids) next.push([...c, { slot, itemId }]);
    }
    combos = next;
    if (combos.length > TOP_GEAR_MAX_COMBOS * 4) break; // the count below is exact; no need to build more
  }
  return combos.map((changes) => ({ key: comboKey(changes), changes }));
}

export function comboCount(cands: Partial<Record<ItemSlotId, number[]>>): number {
  return ITEM_SLOTS.reduce((n, s) => n * (1 + (cands[s]?.length ?? 0)), 1);
}

/** The character with a combination's items in place. Enchants stay where they still fit the new item. */
export function applyChanges(
  c: Character,
  changes: readonly GearChange[],
  db: GameDatabase | null,
): Character {
  const next = structuredClone(toRaw(c));
  for (const { slot, itemId } of changes) {
    const old = next.gear[slot];
    const item = db?.item(itemId);
    const enchant = old?.enchantId && item ? db?.findEnchant(old.enchantId, item) : undefined;
    next.gear[slot] = {
      itemId,
      ...(enchant && item && enchantAppliesToItem(enchant, item) && { enchantId: old!.enchantId }),
    };
  }
  return next;
}

export function useTopGear() {
  const session = useSession();
  const engine = useEngine();

  const count = computed(() => comboCount(candidates.value));
  const candidateCount = computed(() =>
    Object.values(candidates.value).reduce((n, l) => n + (l?.length ?? 0), 0),
  );
  const slotsWithCandidates = computed(() => ITEM_SLOTS.filter((s) => candidates.value[s]?.length));

  function addCandidate(slot: ItemSlotId, itemId: number) {
    const list = candidates.value[slot] ?? [];
    if (list.includes(itemId) || session.character.value?.gear[slot]?.itemId === itemId) return;
    candidates.value = { ...candidates.value, [slot]: [...list, itemId] };
  }
  function removeCandidate(slot: ItemSlotId, itemId: number) {
    candidates.value = {
      ...candidates.value,
      [slot]: (candidates.value[slot] ?? []).filter((i) => i !== itemId),
    };
  }
  function clearCandidates() {
    candidates.value = {};
  }

  async function simCombos(b: Batch, combos: Combo[], iterations: number, signal: AbortSignal) {
    const db = await engine.gameDatabase();
    b.done = 0;
    b.total = combos.length;
    b.progress = 0;
    // Wall time is elapsed time across passes (first run plus any re-runs), overhead included.
    const before = b.wallMs;
    const t0 = performance.now();
    const tick = () => (b.wallMs = before + performance.now() - t0);
    for (const [i, combo] of combos.entries()) {
      const result = await simVariant(applyChanges(b.character, combo.changes, db), {
        iterations,
        seed: b.seed,
        signal,
        onProgress: (f) => {
          b.progress = (i + f) / combos.length;
          tick();
        },
      });
      tick();
      const s = summarize(result.raidMetrics!.dps!, result.iterationsDone);
      b.results[combo.key] = { ...combo, mean: s.mean, stdev: s.stdev, n: s.n, ci95: s.ci95 };
      b.fights += result.iterationsDone;
      b.done = i + 1;
      b.progress = (i + 1) / combos.length;
    }
  }

  async function guarded(b: Batch, work: (signal: AbortSignal) => Promise<void>) {
    abort?.abort();
    const ctl = new AbortController();
    abort = ctl;
    b.status = 'running';
    b.error = null;
    try {
      await work(ctl.signal);
      b.status = 'done';
    } catch (e) {
      if (ctl.signal.aborted) b.status = 'cancelled';
      else {
        b.status = 'error';
        b.error = e instanceof Error ? e.message : String(e);
      }
    } finally {
      if (abort === ctl) abort = null;
    }
  }

  /** Sim every combination (equipped set included) at `iterations`, one shared seed. */
  async function run(iterations: number) {
    const c = session.character.value;
    if (!c) throw new Error('No character');
    const combos = cartesian(candidates.value);
    if (combos.length > TOP_GEAR_MAX_COMBOS) throw new Error(`More than ${TOP_GEAR_MAX_COMBOS} combinations`);
    batch.value = {
      character: structuredClone(toRaw(c)) as Character,
      seed: Math.floor(Math.random() * 2 ** 31),
      iterations,
      combos,
      results: {},
      status: 'running',
      done: 0,
      total: combos.length,
      progress: 0,
      wallMs: 0,
      fights: 0,
      error: null,
    };
    const b = batch.value;
    await guarded(b, (signal) => simCombos(b, combos, iterations, signal));
  }

  /** Re-sim the five best combinations and the equipped set at 25k, same seed. */
  async function rerunTop() {
    const b = batch.value;
    if (!b) return;
    const top = ranking.value.filter((r) => !r.equipped).slice(0, 5);
    const ref = b.combos.find((x) => x.key === '');
    const combos = [...(ref ? [ref] : []), ...top.map((r) => ({ key: r.key, changes: r.changes }))];
    await guarded(b, (signal) => simCombos(b, combos, TOP_GEAR_RERUN_ITERATIONS, signal));
  }

  function cancel() {
    abort?.abort();
  }

  const reference = computed(() => batch.value?.results[''] ?? null);

  /** Results sorted by mean, each tested against the equipped set (Welch, with the noise floor). */
  const ranking = computed<RankedRow[]>(() => {
    const b = batch.value;
    const ref = reference.value;
    if (!b || !ref) return [];
    return Object.values(b.results)
      .sort((x, y) => y.mean - x.mean)
      .map((r, i) => {
        const equipped = r.key === '';
        const noise = noiseFloor(r, ref);
        let verdict: Verdict = 'reference';
        let p: number | null = null;
        if (!equipped && r.n >= 2 && ref.n >= 2) {
          const w = welchTTest(r, ref, { minDelta: noise });
          p = w.p;
          verdict = ({ better: 'up', worse: 'down', noise: 'noise' } as Record<WelchVerdict, Verdict>)[
            w.verdict
          ];
        }
        return { ...r, rank: i + 1, equipped, delta: r.mean - ref.mean, noise, p, verdict };
      });
  });

  /** How often each item appears among the significant wins. */
  const inWins = computed(() => {
    const wins = ranking.value.filter((r) => r.verdict === 'up');
    const counts = new Map<number, number>();
    for (const r of wins) for (const c of r.changes) counts.set(c.itemId, (counts.get(c.itemId) ?? 0) + 1);
    const items = Object.values(candidates.value).flatMap((l) => l ?? []);
    return {
      total: wins.length,
      items: [...new Set(items)]
        .map((itemId) => ({ itemId, n: counts.get(itemId) ?? 0 }))
        .sort((a, b) => b.n - a.n),
    };
  });

  /** Per slot, the best single-item change on its own. */
  const bestPerSlot = computed(() => {
    const out: { slot: ItemSlotId; row: RankedRow }[] = [];
    for (const slot of ITEM_SLOTS) {
      const alone = ranking.value.filter((r) => r.changes.length === 1 && r.changes[0]!.slot === slot);
      if (alone.length) out.push({ slot, row: alone.reduce((a, b) => (b.delta > a.delta ? b : a)) });
    }
    return out;
  });

  /** Put a combination's items on the draft. */
  async function equip(changes: readonly GearChange[]) {
    const db = await engine.gameDatabase();
    const base = session.character.value;
    if (!base) return;
    const next = applyChanges(base as Character, changes, db);
    session.updateCharacter((c) => {
      for (const { slot } of changes) c.gear[slot] = next.gear[slot];
    });
  }

  return {
    candidates,
    batch,
    count,
    candidateCount,
    slotsWithCandidates,
    addCandidate,
    removeCandidate,
    clearCandidates,
    run,
    rerunTop,
    cancel,
    reference,
    ranking,
    inWins,
    bestPerSlot,
    equip,
  };
}
