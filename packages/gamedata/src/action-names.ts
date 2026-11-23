// Display names for the engine's ActionIDs: `{spellId | itemId | otherId, tag}`.
//
// The tag tells apart actions that share an id. Its meaning is mirrored from upstream's UI at the engine
// lock commit (ui/sim/proto/action_id/index.ts, ActionId constructor and fill()):
// - a weapon hand's item slot (14 main hand, 15 off hand): the hand that swung or whose weapon procced,
//   on auto attacks, on strikes made with each hand (Whirlwind) and on weapon procs. A weapon proc that is
//   the aura of exactly one enchant also names the enchant: "Holy Strength (Crusader, main hand)";
// - on an auto attack, any other tag is the spell that granted an extra attack ("Melee (Hand of Justice)");
// - -1: a buff or debuff provided from outside the player (raid buffs, external debuffs);
// - on an item (a consumable): 1 is its damage to the user, 2 its damage over time;
// - for a few named spells, a small number with a fixed meaning (Heroic Strike 1 = the queued swing, ...);
// - a tag that is itself a known spell id names the spell that caused the action.
// Anything else stays unlabelled; `distinctActionNames` then tells same-named rows apart.
import { OtherAction } from '@fsim/proto/common';
import type { SpellName } from './spell-names';

/** An action id as `@fsim/analysis` parses it. */
export interface ActionRef {
  kind: 'spell' | 'item' | 'other';
  id: number;
  tag: number;
}

/** Where names come from. `item` should look in the items and then in the consumables (`itemIcons`). */
export interface ActionNameSources {
  spell(id: number): SpellName | undefined;
  item(id: number): string | undefined;
  /** The enchant whose proc aura this spell is ("Crusader" for Holy Strength), when exactly one enchant has it. */
  enchantProc?(spellId: number): string | undefined;
}

const OTHER: Partial<Record<OtherAction, string>> = {
  [OtherAction.OtherActionWait]: 'Wait',
  [OtherAction.OtherActionManaRegen]: 'Mana regen',
  [OtherAction.OtherActionEnergyRegen]: 'Energy regen',
  [OtherAction.OtherActionFocusRegen]: 'Focus regen',
  [OtherAction.OtherActionManaGain]: 'Mana gain',
  [OtherAction.OtherActionRageGain]: 'Rage gain',
  [OtherAction.OtherActionAttack]: 'Melee',
  [OtherAction.OtherActionShoot]: 'Shoot',
  [OtherAction.OtherActionPet]: 'Pet',
  [OtherAction.OtherActionRefund]: 'Refund',
  [OtherAction.OtherActionDamageTaken]: 'Damage taken',
  [OtherAction.OtherActionHealingModel]: 'Incoming healing',
  [OtherAction.OtherActionMove]: 'Moving',
  [OtherAction.OtherActionPrepull]: 'Pre-pull',
  [OtherAction.OtherActionEncounterStart]: 'Encounter start',
};

/** ItemSlot values the engine uses as hand tags. */
const HAND: Record<number, string> = { 14: 'main hand', 15: 'off hand', 16: 'ranged' };

/** Boss and add swing tags (upstream: core/target.go). */
const UNIT_ATTACK: Record<number, string> = { 99999: 'boss', 99998: 'add', 100000: 'custom boss' };

type TagRule = (tag: number, spellId: number) => string | undefined;
const fixed =
  (labels: Record<number, string>): TagRule =>
  (tag) =>
    labels[tag];
const ticks: TagRule = (tag) => (tag >= 1 && tag <= 5 ? `${tag} tick${tag > 1 ? 's' : ''}` : undefined);
const comboPoints: TagRule = (tag) => (tag > 0 && tag <= 5 ? `${tag} combo points` : undefined);
const dot = fixed({ 1: 'DoT' });
const anyDot: TagRule = (tag) => (tag ? 'DoT' : undefined);
const queue = fixed({ 1: 'queued' });
const damageShield = fixed({ 1: 'hit', 2: 'hit', [-1]: 'external' });
const shock = fixed({ 1: 'DoT', 7: 'echo' });
/** Shaman bolts: what cast the copy, or the Maelstrom Weapon stacks the cast spent. */
const BOLT: Record<number, string> = {
  6: 'overload',
  7: 'echo',
  8: 'echo overload',
  9: 'mastery',
  10: 'haste',
  11: 'crit',
  12: 'agility',
};
const bolt: TagRule = (tag) => BOLT[tag] ?? (tag > 0 ? `${tag} Maelstrom Weapon` : undefined);
/** A targeted buff is tagged with its caster's raid index, or -1 for one from outside the raid. */
const caster: TagRule = (tag) => (tag === -1 ? 'raid' : 'self');
/** The Holy Shield hit a Shieldsworn Holy Strike casts is a spell of its own, and Shield Specialization's tag. */
const SHIELDSWORN_STRIKE = 456544;
const SHIELDSWORN_TAG = 1328544;

/**
 * Spell-specific tags, by base name, ported from upstream's fill() for the classes WoW Forever has.
 * Rules run before the generic ones, which still apply when a rule returns nothing.
 */
const SPELL_TAGS: Record<string, TagRule> = {
  'Arcane Blast': (t) =>
    t === 1 ? 'no stacks' : t === 2 ? '1 stack' : t > 2 ? `${t - 1} stacks` : undefined,
  'Hot Streak': (t) => (t ? 'crits' : undefined),
  Fireball: anyDot,
  Flamestrike: anyDot,
  'Frostfire Bolt': anyDot,
  Pyroblast: anyDot,
  // Two auras: 11129 counts the crits left, 28682 carries the crit chance (sim/mage/combustion.go).
  Combustion: (t, id) => (t ? 'DoT' : id === 28682 ? 'crit chance' : undefined),
  Evocation: ticks,
  'Mind Flay': ticks,
  'Mind Sear': ticks,
  Shoot: fixed({ 1: 'shot' }),
  Envenom: comboPoints,
  Eviscerate: comboPoints,
  Rupture: comboPoints,
  'Slice and Dice': comboPoints,
  'Expose Armor': comboPoints,
  'Death Mark': comboPoints,
  'Crimson Tempest': (t, id) => (t === 7 ? 'DoT' : comboPoints(t, id)),
  'Wound Poison': fixed({ 1: 'Shiv' }),
  Mutilate: (t) => (t === 0 ? 'cast' : undefined),
  // The buff the strike leaves is a spell of its own (sim/rogue/talents_subtlety.go, GhostlyStrikeTriggered).
  'Ghostly Strike': (_t, id) => (id === 1329326 ? 'triggered' : undefined),
  'Chain Lightning': bolt,
  'Lightning Bolt': bolt,
  'Lava Burst': bolt,
  'Flame Shock': shock,
  'Earth Shock': shock,
  'Frost Shock': shock,
  Fulmination: (t) => `${t + 2} charges`,
  Moonfire: dot,
  Sunfire: dot,
  // Every rank casts the same weapon hit, a spell of its own; the rank's row is the bleed (sim/druid/lacerate.go).
  Lacerate: (_t, id) => (id === 414647 ? 'hit' : undefined),
  'Feral Charge (Bear)': fixed({ 1: 'moving' }),
  Immolate: dot,
  'Unstable Affliction': fixed({ 1: 'Malefic' }),
  Corruption: fixed({ 1: 'Malefic' }),
  // Demonic Sacrifice's effects, each named with the demon sacrificed for it.
  'Burning Shadow': () => 'imp sacrificed',
  'Touch of Fire': () => 'succubus sacrificed',
  'Fel Energy': () => 'voidwalker sacrificed',
  'Fel Stamina': () => 'felhunter sacrificed',
  'Raptor Strike': fixed({ 1: 'queued', 2: 'cooldown' }),
  // A damage shield's proc is tagged 1 (a copy from outside) or 2 (the player's own); the outside aura is -1.
  'Retribution Aura': damageShield,
  'Holy Shield': (t, id) => damageShield(t, id) ?? (id === SHIELDSWORN_STRIKE ? 'Shieldsworn' : undefined),
  Thorns: damageShield,
  Brambles: damageShield,
  Bristlecone: damageShield,
  'Heart of the Scale': damageShield,
  Immolation: damageShield,
  'Fiery Aura': damageShield,
  'Chitinous Spikes': damageShield,
  'Shield Specialization': fixed({ [SHIELDSWORN_TAG]: 'Shieldsworn' }),
  'Searing Totem': fixed({ 1: 'attack', [-1]: 'external' }),
  'Magma Totem': fixed({ 1: 'attack', [-1]: 'external' }),
  'Flametongue Totem': fixed({ 1: 'attack', [-1]: 'external' }),
  'Fire Nova': fixed({ 1: 'damage' }),
  'Lightning Shield': fixed({ 1: 'wasted' }),
  'Power Word: Shield': fixed({ 1: 'shield' }),
  Penance: fixed({ 1: 'heal' }),
  'Read Leyline': fixed({ 1: 'attuned' }),
  Skysight: fixed({ 1: 'charged' }),
  'Curse of Weakness': fixed({ 1: 'amplified', [-1]: 'external' }),
  Innervate: caster,
  'Power Infusion': caster,
  'Mana Tide Totem': caster,
  'Unholy Frenzy': caster,
  Berserking: (t) => (t > 0 ? `${10 + (t - 1) * 5}%` : undefined),
  'Heroic Strike': queue,
  Cleave: queue,
  Maul: queue,
  'Sweeping Strikes': fixed({ 1: 'normalized' }),
  'Sunder Armor': fixed({ 1: 'Devastate' }),
  Thunderfury: fixed({ 1: 'single target', 2: 'multi-target' }),
  'Devouring Plague': fixed({ 1: 'DoT', 2: 'heal' }),
  'Shadow Word: Death': fixed({ 1: 'no orb' }),
  Shadowfiend: fixed({ 1: 'mana restore' }),
  'Hack and Slash': fixed({ 1: 'axe/sword', 2: 'fist/dagger', 3: 'mace' }),
  Weaponmaster: fixed({ 1: 'axe/polearm', 2: 'mace/staff', 3: 'sword' }),
  'Seal of Fury': fixed({ 1: 'shield' }),
  'Master Demonologist': fixed({ 1: 'imp', 2: 'voidwalker', 3: 'succubus', 4: 'felhunter' }),
  'Bane of Havoc': fixed({ 1: 'damage' }),
  Vindication: fixed({ [-1]: 'external' }),
  // The totem, its raid aura and the strike its proc lands (10610) share one name.
  'Windfury Totem': (t, id) => (id === 10610 ? 'attack' : t === -1 ? 'external' : undefined),
  'Judgement of Fury': (_t, id) => (id === 20232 ? 'taunt' : undefined),
};

/**
 * Auras another aura already shows, by action key (`spell:10614#-1`): a timeline drops the first when the
 * second is there. Upstream's timeline does the same (ui/features/results/model/timeline/rotation/buckets.ts).
 */
export const AURA_SHOWN_BY: ReadonlyMap<string, string> = new Map([
  // The raid's Windfury Totem standing (10614), shown by its raid aura (10612), which rolls the proc.
  ['spell:10614#-1', 'spell:10612#-1'],
]);

/** The aura keys to show: `keys` without those that another key in the list already shows. */
export function shownAuraKeys(keys: readonly string[]): Set<string> {
  const all = new Set(keys);
  return new Set(keys.filter((k) => !all.has(AURA_SHOWN_BY.get(k) ?? '')));
}

/** The name of the id itself, without anything its tag adds; null when the data does not know it. */
export function actionBaseName(a: ActionRef, src: ActionNameSources): string | null {
  if (a.kind === 'other') return OTHER[a.id as OtherAction] ?? null;
  if (a.kind === 'item') return src.item(a.id) || null;
  return src.spell(a.id)?.name || null;
}

/** A spell id used as a tag, when the data knows it: extra attacks, echoes, procs named by their cause. */
function spellTag(tag: number, src: ActionNameSources): string | undefined {
  return tag > 100 ? src.spell(tag)?.name || undefined : undefined;
}

/** What the tag adds to the name ("main hand", "queued", ...), or null when it adds nothing. */
export function actionTagLabel(a: ActionRef, src: ActionNameSources, base?: string | null): string | null {
  const tag = a.tag;
  if (a.kind === 'other') {
    switch (a.id as OtherAction) {
      case OtherAction.OtherActionAttack:
        if (!tag) return null;
        if (tag === 100001) return 'custom boss, thrash';
        return HAND[tag] ?? UNIT_ATTACK[tag] ?? spellTag(tag, src) ?? 'extra attack';
      case OtherAction.OtherActionManaRegen:
        return tag === 1 ? 'casting' : tag === 2 ? 'not casting' : null;
      case OtherAction.OtherActionMove:
        return tag === 1 ? 'from a spell' : null;
      default:
        return null;
    }
  }
  const special = a.kind === 'spell' && base ? SPELL_TAGS[base]?.(tag, a.id) : undefined;
  if (special) return special;
  if (!tag) return null;
  if (tag === -1) return 'external';
  if (HAND[tag]) {
    const enchant = a.kind === 'spell' ? src.enchantProc?.(a.id) : undefined;
    return enchant ? `${enchant}, ${HAND[tag]}` : HAND[tag];
  }
  if (a.kind === 'item') {
    // A consumable's damage to its user is tagged 1 and its cloud's ticks 2 (sim/common/shared/consumable_explosives.go).
    if (tag === 1) return 'self';
    if (tag === 2) return 'DoT';
  }
  return spellTag(tag, src) ?? null;
}

/** The fallback when the data has no name: never a bare tag, always the kind and id. */
function unknownName(a: ActionRef): string {
  return a.kind === 'other' ? `Other action ${a.id}` : `${a.kind === 'item' ? 'Item' : 'Spell'} ${a.id}`;
}

/** "Melee (main hand)", "Heroic Strike (queued)", "Goblin Sapper Charge (self)", "Arcane Intellect (external)". */
export function actionName(a: ActionRef, src: ActionNameSources): string {
  const base = actionBaseName(a, src);
  const label = actionTagLabel(a, src, base);
  const name = base ?? unknownName(a);
  return label ? `${name} (${label})` : name;
}

/**
 * Names for a list of ids, with rows that would read the same told apart: first by spell rank where the
 * ranks differ ("Lightning Bolt (rank 9)"), then, for ids whose tag means nothing to the UI, by counting
 * them in list order ("Whirlwind", "Whirlwind (2)"). The raw tag is never shown. `owners` (a pet's name, or
 * null for the player) keeps rows of different units apart: those never clash, as the caller adds the owner.
 */
export function distinctActionNames(
  ids: readonly ActionRef[],
  src: ActionNameSources,
  owners?: readonly (string | null)[],
): string[] {
  return distinct(ids, src, owners).map((d) => d.name);
}

/** `distinctActionNames`, with whether a name only differs from another by the count at its end. */
function distinct(
  ids: readonly ActionRef[],
  src: ActionNameSources,
  owners?: readonly (string | null)[],
): { name: string; counted: boolean }[] {
  const names = ids.map((a) => actionName(a, src));
  const key = (n: string, i: number) => `${owners?.[i] ?? ''}\u0000${n}`;
  const rankOf = (a: ActionRef) => (a.kind === 'spell' ? src.spell(a.id)?.rank || 0 : 0);
  const groups = new Map<string, number[]>();
  names.forEach((n, i) => groups.set(key(n, i), [...(groups.get(key(n, i)) ?? []), i]));
  const ranked = names.map((n, i) => {
    const group = groups.get(key(n, i))!;
    if (group.length < 2) return n;
    const rank = rankOf(ids[i]!);
    if (!rank || new Set(group.map((j) => rankOf(ids[j]!))).size < 2) return n;
    // One pair of brackets: "Lightning Bolt (overload, rank 8)".
    return n.endsWith(')') ? `${n.slice(0, -1)}, rank ${rank})` : `${n} (rank ${rank})`;
  });
  const total = new Map<string, number>();
  ranked.forEach((n, i) => total.set(key(n, i), (total.get(key(n, i)) ?? 0) + 1));
  const seen = new Map<string, number>();
  return ranked.map((n, i) => {
    const k = (seen.get(key(n, i)) ?? 0) + 1;
    seen.set(key(n, i), k);
    return { name: k > 1 ? `${n} (${k})` : n, counted: total.get(key(n, i))! > 1 };
  });
}

/** The action ids one run reports, as fixtures/engine/action-ids.json keeps them (`spell:1680#14`). */
export interface RunActionIds {
  /** Damage rows: [id, the pet that owns the row or null for the player]. */
  abilities: readonly (readonly [string, string | null])[];
  /** The player's auras in the first fight's log. */
  auras: readonly string[];
  /** Every action and aura id of the player and its pets. */
  all: readonly string[];
}

const parseKey = (k: string): ActionRef => {
  const m = /^(spell|item|other):(-?\d+)(?:#(-?\d+))?$/.exec(k);
  if (!m) throw new Error(`not an action id: ${k}`);
  return { kind: m[1] as ActionRef['kind'], id: Number(m[2]), tag: m[3] ? Number(m[3]) : 0 };
};

/**
 * What the names cannot do for a run: ids with no name at all (the page would show "Spell 12345"), and damage
 * rows or shown auras that read the same and are only told apart by a count ("Combustion", "Combustion (2)").
 * Empty when every row has a name of its own.
 */
export function actionNameGaps(run: RunActionIds, src: ActionNameSources): string[] {
  const gaps = run.all
    .filter((k) => actionBaseName(parseKey(k), src) === null)
    .map((k) => `${k} has no name`);
  const shared = (kind: string, keys: readonly string[], owners?: readonly (string | null)[]) =>
    distinct(keys.map(parseKey), src, owners).forEach((d, i) => {
      if (d.counted) gaps.push(`${kind} ${keys[i]} shares the name "${actionName(parseKey(keys[i]!), src)}"`);
    });
  shared(
    'row',
    run.abilities.map(([k]) => k),
    run.abilities.map(([, owner]) => owner),
  );
  const shown = shownAuraKeys(run.auras);
  shared(
    'aura',
    run.auras.filter((k) => shown.has(k)),
  );
  return gaps.sort();
}

/** "Enchant Weapon - Crusader" → "Crusader". */
const enchantShortName = (name: string) => name.replace(/^Enchant [^-]*- /, '');

/**
 * Proc aura id → the one enchant that grants it (from each enchant's `enchantEffects[].buffId`). An aura two
 * enchants share is left out, so a proc is only ever credited to an enchant when the data says which.
 */
export function enchantProcNames(
  enchants: readonly { name: string; enchantEffects: readonly { buffId: number }[] }[],
): Map<number, string> {
  const names = new Map<number, string | null>();
  for (const e of enchants)
    for (const id of new Set(e.enchantEffects.map((fx) => fx.buffId).filter(Boolean))) {
      const name = enchantShortName(e.name);
      names.set(id, names.has(id) && names.get(id) !== name ? null : name);
    }
  return new Map([...names].filter((x): x is [number, string] => x[1] !== null));
}

/**
 * Items the engine reports as an aura that are neither gear nor a consumable in the database: the warlock's
 * Soul Shards are the stacks of an aura with the shard's item id (sim/warlock/soul_shards.go).
 */
const UNLISTED_ITEMS: Record<number, string> = { 6265: 'Soul Shards' };

/** Name sources over a game database and the spell-name table (`buildSpellNames`). */
export function actionNameSources(
  db: {
    item(id: number): { name: string } | undefined;
    consumables: ReadonlyMap<number, { name: string }>;
    raw?: { enchants: readonly { name: string; enchantEffects: readonly { buffId: number }[] }[] };
  } | null,
  spells: ReadonlyMap<number, SpellName> | null,
): ActionNameSources {
  const procs = db?.raw ? enchantProcNames(db.raw.enchants) : undefined;
  return {
    enchantProc: (id) => procs?.get(id),
    spell: (id) => spells?.get(id),
    // Consumables (bombs, potions, runes) are not in the item table. Item and spell ids are separate
    // number spaces (item 13442 Mighty Rage Potion, spell 13442 Firebolt), so an item never takes a spell's name.
    item: (id) => db?.item(id)?.name || db?.consumables.get(id)?.name || UNLISTED_ITEMS[id],
  };
}
