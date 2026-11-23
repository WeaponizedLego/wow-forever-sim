// What the engine says a rotation will not do for a character, sorted for a player to read.
//
// Before it sims, the engine sets the rotation up against the character and notes, per step, what will not
// work (`PlayerStats.rotationStats` of `computeStats` with the rotation set up). The notes are sentences
// with raw ids and the unit's label in them: " (#1) does not know spell {SpellID: 14183}". Upstream's
// rotations cover every build of a class, so one preset can return dozens of them, mostly the same few facts
// said once per step. Here they are named through the action names and sorted into a few kinds, each fact once.
//
// The sentences are matched as the engine writes them at the lock commit (sim/core/apl*.go). A sentence that
// matches nothing here is kept in `other` as the engine wrote it, so a new upstream message is never lost.
import type { APLStats } from '@fsim/proto/api';
import { OtherAction } from '@fsim/proto/common';
import { actionBaseName, actionName, type ActionNameSources, type ActionRef } from './action-names';

/** A sentence the engine wrote, with how many times the rotation's steps said it. */
export interface RotationNote {
  text: string;
  count: number;
}

export interface RotationCheck {
  /** Spells that are never cast, with the engine's reason: whole sentences. */
  neverCast: string[];
  /** What the rotation uses and the character does not have: spell and talent names, then items, each once. */
  missing: string[];
  /** Buffs and debuffs the rotation checks that are never on the character or the target: names, each once. */
  effects: string[];
  /** What the rotation expects to be set up and is not (a potion, a second gear set): whole sentences. */
  setup: string[];
  /** Cooldowns the rotation casts on its own. Information, not a problem. */
  autocast: string[];
  /** Everything else, as the engine wrote it. */
  other: RotationNote[];
  /** How many notes the engine returned, before they were sorted and merged. */
  total: number;
}

/** Every note in a rotation's stats, in the rotation's order: pre-pull, priority list, groups, then values. */
export function rotationMessages(stats: APLStats | undefined): string[] {
  if (!stats) return [];
  return [
    ...stats.prepullActions,
    ...stats.priorityList,
    ...stats.groups.flatMap((g) => g.actions),
    ...stats.uuidValidations,
  ].flatMap((a) => a.validations.map((v) => v.validation));
}

// The engine prints an id as `{SpellID: 27801}`, with `, Tag: 1` when it has a tag, and as `{}` for a step
// that names no spell at all (core.ActionID.String).
const ID = /\{(?:(SpellID|ItemID|OtherID): (-?\d+))?(?:, Tag: (-?\d+))?\}/;
const IDS = new RegExp(ID.source, 'g');
const KIND = { SpellID: 'spell', ItemID: 'item', OtherID: 'other' } as const;
/** What `{}` reads as. */
const UNSET = '(no spell set)';

/**
 * The potion a rotation step stands for: whichever one the consumables pick for that kind, if they pick one.
 * The kind is said every time: a Warrior with a rage potion chosen still has no offensive potion.
 */
const POTION: Partial<Record<OtherAction, string>> = {
  [OtherAction.OtherActionResourcePotion]: 'a resource potion',
  [OtherAction.OtherActionDefensivePotion]: 'a defensive potion',
  [OtherAction.OtherActionOffensivePotion]: 'an offensive potion',
};

/** The first id in a piece of engine text; null when it holds none, or an empty one. */
function refIn(text: string): ActionRef | null {
  const m = ID.exec(text);
  if (!m?.[1]) return null;
  return { kind: KIND[m[1] as keyof typeof KIND], id: Number(m[2]), tag: m[3] ? Number(m[3]) : 0 };
}

// A rotation names a spell by its id alone. What an untagged id says in a run's metrics ("Mutilate (cast)",
// "Power Infusion (self)") sets nothing apart here, so only a real tag is spelled out ("Battle Shout (external)").
function nameOf(ref: ActionRef, src: ActionNameSources): string {
  const potion = ref.kind === 'other' ? POTION[ref.id as OtherAction] : undefined;
  if (potion) return potion.replace(/^an? (.)/, (_, first: string) => first.toUpperCase());
  return (ref.tag ? null : actionBaseName(ref, src)) ?? actionName(ref, src);
}

/** The id in a piece of engine text, named; the text itself when it holds none. */
function nameIn(text: string, src: ActionNameSources): string {
  const ref = refIn(text);
  if (ref) return nameOf(ref, src);
  return ID.test(text) ? UNSET : text;
}

/** A sentence with every id in it named. */
const named = (text: string, src: ActionNameSources) => text.replace(IDS, (id) => nameIn(id, src));

/**
 * Whose rotation step it is, from the engine's unit label: '' for the character itself ("Kargath (#1)",
 * " (#1)" when it has no name), "the target" / "target 2" for an enemy, the pet's name for a pet
 * ("Kargath (#1) - Wolf"), and any other label as it is.
 */
function unitOf(label: string): string {
  const pet = /\(#\d+\) - (.+)$/.exec(label);
  if (pet) return pet[1]!;
  if (/\(#\d+\)$/.test(label)) return '';
  const target = /^Target (\d+)$/.exec(label);
  if (target) return target[1] === '1' ? 'the target' : `target ${target[1]}`;
  return label.trim();
}

/** A sentence without the "(#1)" of unit labels: the character's name stays, or "this character" without one. */
function withoutLabels(text: string): string {
  const out = text.replace(
    /(^|\s)([^\s{}()]*) ?\(#\d+\)/g,
    (_, lead: string, name: string) => lead + (name || 'this character'),
  );
  return out.startsWith('this character') ? `T${out.slice(1)}` : out;
}

const NOT_KNOWN = /^(.*) does not know (?:spell|talent) (\{[^}]*\})(?: \(Rank (\d+)\))?$/;
const NO_AURA = /^No aura found on (.*) for: (\{[^}]*\})$/;
const NO_AURA_ON_TARGETS = /^Could not find (?:an aura|a DoT) for (\{[^}]*\}) on Target\(s\)$/;
const NO_POTION = /^.* picks no potion for (\{[^}]*\})$/;
const WILL_CAST = /^.* will cast the following spells: (.*)$/;
const NEVER_CAST = /\bis never cast\b|\bfailed to cast\b/;

/** Setup sentences, said in this app's words: upstream's point at its own Settings tab. */
const SETUP: Record<string, string> = {
  'No swap set configured in Settings.':
    'The rotation swaps to a second set of gear, and this character has none.',
  'No potion selected': 'The rotation checks a potion, and none is chosen in the consumables.',
  'No conjured item selected': 'The rotation checks a conjured item, and none is chosen in the consumables.',
  'No pet to attack with.': 'The rotation sends a pet to attack, and this character has no pet.',
};

/**
 * Sorts the engine's rotation notes (`rotationMessages`) into what a player needs to know, most useful first.
 * Every note lands in exactly one list; the ones no rule knows go to `other` with their ids named.
 */
export function rotationCheck(messages: readonly string[], src: ActionNameSources): RotationCheck {
  const neverCast = new Set<string>();
  const effects = new Set<string>();
  const setup = new Set<string>();
  const autocast = new Set<string>();
  const other = new Map<string, number>();
  // Per spell, talent or item, in the order the rotation first asks for it: the lowest talent rank it lacks
  // (0 for a spell or an item). The rotation may ask for ranks 5 down to 1 of one talent.
  const missing = new Map<string, { id: string; unit: string; rank: number }>();

  for (const raw of messages) {
    const text = raw.trim();
    let m: RegExpExecArray | null;
    if (NEVER_CAST.test(text)) {
      neverCast.add(withoutLabels(named(text, src)));
    } else if ((m = NOT_KNOWN.exec(text))) {
      const unit = unitOf(m[1]!);
      const key = `${unit}\u0000${m[2]}`;
      const rank = Number(m[3] ?? 0);
      const seen = missing.get(key);
      if (seen) seen.rank = Math.min(seen.rank, rank);
      else missing.set(key, { id: m[2]!, unit, rank });
    } else if ((m = NO_AURA.exec(text))) {
      const unit = unitOf(m[1]!);
      effects.add(unit ? `${nameIn(m[2]!, src)} on ${unit}` : nameIn(m[2]!, src));
    } else if ((m = NO_AURA_ON_TARGETS.exec(text))) {
      effects.add(`${nameIn(m[1]!, src)} on the target`);
    } else if ((m = NO_POTION.exec(text))) {
      const ref = refIn(m[1]!);
      const potion = (ref?.kind === 'other' && POTION[ref.id as OtherAction]) || 'a potion';
      setup.add(`The rotation drinks ${potion}, and none is chosen in the consumables.`);
    } else if (SETUP[text]) {
      setup.add(SETUP[text]);
    } else if ((m = WILL_CAST.exec(text))) {
      for (const id of m[1]!.match(IDS) ?? []) autocast.add(nameIn(id, src));
    } else {
      const sentence = withoutLabels(named(text, src));
      other.set(sentence, (other.get(sentence) ?? 0) + 1);
    }
  }

  // Spells and talents first: they say what the build is not. Items (a trinket not worn, a bomb not carried)
  // follow. A talent the character holds at a lower rank says which rank the rotation wanted; one it does not
  // hold at all (rank 1 missing) is just its name, which then reads the same as the spell it teaches.
  const isItem = (x: { id: string }) => refIn(x.id)?.kind === 'item';
  const lacking = [...missing.values()];
  const missingNames = new Set(
    [...lacking.filter((x) => !isItem(x)), ...lacking.filter(isItem)].map(({ id, unit, rank }) => {
      const name = nameIn(id, src);
      const ranked = rank > 1 ? `${name} (rank ${rank})` : name;
      return unit ? `${ranked} (${unit})` : ranked;
    }),
  );

  return {
    neverCast: [...neverCast],
    missing: [...missingNames],
    // The buff of a spell the character does not have is the same fact as the spell.
    effects: [...effects].filter((name) => !missingNames.has(name)),
    setup: [...setup],
    autocast: [...autocast],
    other: [...other].map(([text, count]) => ({ text, count })),
    total: messages.length,
  };
}

/**
 * A list of names as one phrase: "Sweeping Strikes, Death Wish and Bloodrage", or with `max` names and the
 * rest counted: "Sweeping Strikes, Death Wish and 9 more". One name over `max` is shown, as "and 1 more"
 * takes the room the name would.
 */
export function nameList(names: readonly string[], max = Infinity): string {
  if (names.length > max + 1) return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
