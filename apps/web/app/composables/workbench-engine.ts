// Engine reads the Workbench needs that are not runs: the character sheet (`computeStats`) for a
// character, and what one slot's item contributes to the gear stats. Requests are built exactly as
// session.runSim builds a sim request (buildRaidSimRequest + withDatabases), so the sheet matches what
// the sim will see.
import type { Character, GearItem, ItemSlotId } from '@fsim/contracts';
import { buildRaidSimRequest, loadSpecPresets, maxScaling, type GameDatabase } from '@fsim/gamedata';
import { indexUIDatabase, withDatabases, type UIDatabaseIndex } from '@fsim/engine';
import { ComputeStatsRequest, type PlayerStats } from '@fsim/proto/api';
import { PseudoStat, Stat, type UnitStats } from '@fsim/proto/common';
import type { StatDelta } from '@fsim/analysis';

let index: Promise<UIDatabaseIndex> | null = null;
/** The engine's per-request database index, built once (withDatabases would rebuild it per call). */
function dbIndex(): Promise<UIDatabaseIndex> {
  index ??= useEngine()
    .gameDatabase()
    .then((db) => indexUIDatabase(db.raw));
  return index;
}

const cache = new Map<string, Promise<PlayerStats>>();
const CACHE_MAX = 400;

/**
 * The engine's stat sheet for a character. `full` also sets up the rotation and attack tables, which the
 * caps need (melee crit cap, remaining hit); without it the call is cheaper and gives stats only.
 */
export function characterSheet(c: Character, full = false): Promise<PlayerStats> {
  const key = `${full ? 'F' : 'S'}${JSON.stringify(c)}`;
  let hit = cache.get(key);
  if (hit) return hit;
  hit = (async () => {
    const engine = useEngine();
    const [client, db, presets, idx] = await Promise.all([
      engine.client(),
      engine.gameDatabase(),
      loadSpecPresets(c.spec),
      dbIndex(),
    ]);
    const raid = withDatabases(
      buildRaidSimRequest(c, presets, db, {
        iterations: 1,
        seed: 1,
        saveAllValues: false,
        debugFirstIteration: false,
      }),
      idx,
    );
    const res = await client.computeStats(
      ComputeStatsRequest.create({ raid: raid.raid, encounter: raid.encounter, skipRotation: !full }),
    );
    const player = res.raidStats?.parties[0]?.players[0];
    if (!player) throw new Error('The engine returned no stats for this character.');
    return player;
  })();
  hit.catch(() => cache.delete(key));
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, hit);
  return hit;
}

/**
 * Stats the engine's gear sheet derives from other stats (attack power from strength, armor from agility,
 * health from stamina, mana from intellect). A stat weight for strength already includes the attack power
 * strength gives, so for these the item's own value (from the item data) is used instead of the sheet's.
 */
const DERIVED: readonly Stat[] = [
  Stat.StatAttackPower,
  Stat.StatRangedAttackPower,
  Stat.StatArmor,
  Stat.StatHealth,
  Stat.StatMana,
];
/** Weapon damage per second, which the gear sheet carries as pseudo stats. */
const WEAPON_DPS: readonly PseudoStat[] = [
  PseudoStat.PseudoStatMainHandDps,
  PseudoStat.PseudoStatOffHandDps,
  PseudoStat.PseudoStatRangedDps,
];

/** An item's own stats from the item data: base, random suffix (scaled by its points) and enchant. */
export function rawItemStats(db: GameDatabase, g: GearItem | undefined): number[] {
  const out: number[] = [];
  if (!g) return out;
  const add = (i: number, v: number) => (out[i] = (out[i] ?? 0) + v);
  const item = db.item(g.itemId);
  if (!item) return out;
  const scaling = item.scalingOptions[0] ?? maxScaling(item);
  const base = scaling?.stats ?? {};
  for (const [k, v] of Object.entries(base)) add(Number(k), v);
  item.stats.forEach((v, i) => v && !scaling && add(i, v));
  if (g.randomSuffix) {
    const suffix = db.randomSuffixes.get(g.randomSuffix);
    const points = scaling?.randPropPoints || item.randPropPoints;
    suffix?.stats.forEach((v, i) => v && add(i, Math.round((points * v) / 10000)));
  }
  if (g.enchantId) db.findEnchant(g.enchantId, item)?.stats.forEach((v, i) => v && add(i, v));
  return out;
}

/**
 * The stat change from sheet `a` to sheet `b` in stat-weight terms: the engine's gear stats (which include
 * equip effects the item data does not list), with derived stats replaced by the items' own values, plus
 * weapon DPS.
 */
export function gearStatDeltas(
  a: UnitStats | undefined,
  b: UnitStats | undefined,
  rawA: number[] = [],
  rawB: number[] = [],
): StatDelta[] {
  const out: StatDelta[] = [];
  const n = Math.max(a?.stats.length ?? 0, b?.stats.length ?? 0);
  for (let i = 0; i < n; i++) {
    const d = DERIVED.includes(i) ? (rawB[i] ?? 0) - (rawA[i] ?? 0) : (b?.stats[i] ?? 0) - (a?.stats[i] ?? 0);
    if (Math.abs(d) > 1e-9) out.push({ ref: { kind: 'stat', stat: i }, amount: d });
  }
  for (const p of WEAPON_DPS) {
    const d = (b?.pseudoStats[p] ?? 0) - (a?.pseudoStats[p] ?? 0);
    if (Math.abs(d) > 1e-9) out.push({ ref: { kind: 'pseudo', stat: p }, amount: d });
  }
  return out;
}

/** A copy of the character with one slot changed (undefined empties it). */
export function characterWithSlot(
  c: Character,
  slot: ItemSlotId,
  gear: Character['gear'][ItemSlotId],
): Character {
  const next = structuredClone(toRaw(c));
  if (gear) next.gear[slot] = gear;
  else delete next.gear[slot];
  return next;
}

/**
 * The stat change of putting `gear` in `slot` (undefined: emptying it), measured on character `c`.
 * slotSwap(c, s, undefined) negated is what the item in the slot contributes.
 */
export async function slotSwap(
  db: GameDatabase,
  c: Character,
  slot: ItemSlotId,
  gear: GearItem | undefined,
): Promise<StatDelta[]> {
  const [a, b] = await Promise.all([characterSheet(c), characterSheet(characterWithSlot(c, slot, gear))]);
  return gearStatDeltas(a.gearStats, b.gearStats, rawItemStats(db, c.gear[slot]), rawItemStats(db, gear));
}

/** What the item in `slot` adds: the stat change from an empty slot to the item. */
export async function slotContribution(
  db: GameDatabase,
  c: Character,
  slot: ItemSlotId,
): Promise<StatDelta[]> {
  if (!c.gear[slot]) return [];
  const [full, without] = await Promise.all([
    characterSheet(c),
    characterSheet(characterWithSlot(c, slot, undefined)),
  ]);
  return gearStatDeltas(without.gearStats, full.gearStats, [], rawItemStats(db, c.gear[slot]));
}
