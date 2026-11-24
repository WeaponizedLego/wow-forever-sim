// A spec's options as a form: a Hunter's pet, ammo and quiver, a Warlock's demon and armor, a Shaman's weapon
// imbue. They are the engine's `options` message of the spec, which `Character.specOptions` carries as protojson
// ({"classOptions":{"petType":"Raptor","petUptime":1}}). The fields are read from the generated protobuf types by
// reflection, so an option upstream adds shows up without a change here. Labels are the field and enum value
// names turned into words; only where that reads badly is one written by hand (LABELS, VALUE_LABELS).
import type { Character, SpecId } from '@fsim/contracts';
import { Player, ScalarType } from '@fsim/proto';
import { closestSetup, type PresetBuild, type PresetSetup, type SpecPresets } from './presets';
import { SPEC_ONEOF } from './specs';

type JsonObject = Record<string, unknown>;
type ProtoField = (typeof Player.fields)[number];
interface ProtoMessage {
  typeName: string;
  fields: readonly ProtoField[];
}

export interface SpecOptionChoice {
  /** The enum value's name, as protojson writes it ("Raptor"). */
  value: string;
  label: string;
}

interface FieldBase {
  /** Where the value sits in the options protojson: ["classOptions", "petType"]. */
  path: readonly string[];
  /** The path joined with dots ("classOptions.petType"): a key for lists. */
  key: string;
  label: string;
}
export interface SpecOptionEnum extends FieldBase {
  kind: 'enum';
  /** Every value in upstream's order, which starts with the zero value (none, or the first choice). */
  choices: SpecOptionChoice[];
}
export interface SpecOptionBool extends FieldBase {
  kind: 'bool';
}
export interface SpecOptionNumber extends FieldBase {
  kind: 'number';
  integer: boolean;
  /** "%" for a fraction the engine reads as 0 to 1 and people read as a percentage. */
  unit: '' | '%';
  /** The range of the stored value. */
  min: number;
  max: number;
}
export type SpecOptionField = SpecOptionEnum | SpecOptionBool | SpecOptionNumber;
/** An option's value: an enum value name, on/off, or a number as the engine reads it. */
export type SpecOptionValue = string | boolean | number;

/** The largest number an option takes, as for a rotation setting. */
export const MAX_OPTION_NUMBER = 100_000;

/**
 * Field labels the derived words get wrong, by "<message>.<field>" as the .proto names the message and protojson
 * the field. `percent`: the value is a fraction of 1.
 */
const LABELS: Record<string, { label?: string; percent?: boolean }> = {
  'HunterOptions.petUptime': { percent: true },
  'ShamanOptions.imbueMh': { label: 'Main-hand imbue' },
  'ShamanOptions.imbueMhSwap': { label: 'Main-hand imbue, swap weapon' },
  'ShamanOptions.shieldProcrate': { label: 'Shield proc rate' },
  'WarriorOptions.hasBsT2': { label: 'Has Battle Shout T2 bonus' },
};
/** Enum value labels the derived words get wrong, by "<enum>.<value>" as the .proto names them. */
const VALUE_LABELS: Record<string, string> = {
  // Upstream's spelling of the family, and an apostrophe a name cannot carry.
  'HunterOptions.PetType.Crocilisk': 'Crocolisk',
  'HunterOptions.QuiverBonus.RibblysQuiver': 'Ribbly’s Quiver',
  // The value's own comment in mage.proto: the armor is Ice Armor.
  'MageArmor.MageArmorFrostArmor': 'Ice Armor',
};
/**
 * Messages that are not flattened into fields: a reference to another raid member (an Innervate or Power
 * Infusion target) means nothing in a sim of one player.
 */
const SKIPPED_MESSAGES = new Set(['proto.UnitReference']);
/** `classOptions` only groups what the class's specs share; its fields read as the spec's own. */
const UNNAMED_GROUP = 'classOptions';

const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'the', 'to']);
/** "petAttackSpeed" → pet, Attack, Speed; "FasterAttackVII" → Faster, Attack, VII; "rank7" → rank, 7. */
const words = (name: string): string[] =>
  name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(' ')
    .filter(Boolean);
const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const isAcronym = (w: string) => w.length > 1 && w === w.toUpperCase();

/** A field name as a label: "petAttackSpeed" → "Pet attack speed", "earthShieldPPM" → "Earth shield PPM". */
export function optionLabel(fieldName: string): string {
  return words(fieldName)
    .map((w, i) => (isAcronym(w) ? w : i === 0 ? capital(w) : w.toLowerCase()))
    .join(' ');
}

/** An enum value name as a name: "AncientSinewWrappedLamina" → "Ancient Sinew Wrapped Lamina", "BirdOfPrey" → "Bird of Prey". */
export function optionValueLabel(valueName: string): string {
  return words(valueName)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : capital(w)))
    .join(' ');
}

const shortName = (typeName: string) => typeName.replace(/^proto\./, '');
/** A zero value that stands for nothing chosen: QuiverNone, NoArmor, AuraUnknown. Not Elements or FullParty. */
const NOTHING = /^No[A-Z]|None$|Unknown/;

function enumChoices(info: readonly [string, Record<string | number, string | number>, string?]): {
  choices: SpecOptionChoice[];
  numbers: Map<number, string>;
} {
  const [typeName, values, prefix = ''] = info;
  const enumName = shortName(typeName);
  const own = enumName.split('.').at(-1)!;
  const choices: SpecOptionChoice[] = [];
  const numbers = new Map<number, string>();
  // A TypeScript enum object also maps numbers back to names; the name keys keep the .proto's order.
  for (const [key, number] of Object.entries(values)) {
    if (typeof number !== 'number') continue;
    const value = prefix + key;
    numbers.set(number, value);
    // "WarriorStanceBerserker" of WarriorStance is Berserker.
    const bare = value.startsWith(own) && value.length > own.length ? value.slice(own.length) : value;
    const label =
      VALUE_LABELS[`${enumName}.${value}`] ??
      (number === 0 && NOTHING.test(value) ? 'None' : optionValueLabel(bare));
    choices.push({ value, label });
  }
  // The zero value first, whatever the order of the names.
  choices.sort((a, b) => Number(numbers.get(0) === b.value) - Number(numbers.get(0) === a.value));
  return { choices, numbers };
}

const DECIMAL = new Set<number>([ScalarType.DOUBLE, ScalarType.FLOAT]);
const WHOLE = new Set<number>([
  ScalarType.INT32,
  ScalarType.INT64,
  ScalarType.UINT32,
  ScalarType.UINT64,
  ScalarType.SINT32,
  ScalarType.SINT64,
  ScalarType.FIXED32,
  ScalarType.FIXED64,
  ScalarType.SFIXED32,
  ScalarType.SFIXED64,
]);

/** Enum fields also read a value stored as its number, which protojson allows. */
const enumNumbers = new WeakMap<SpecOptionEnum, Map<number, string>>();

function fieldsOf(message: ProtoMessage, path: readonly string[], group: string): SpecOptionField[] {
  const out: SpecOptionField[] = [];
  for (const f of message.fields) {
    // A list, a map or one arm of a oneof has no single control; it stays as it is (see `specOptionChanges`).
    if (f.kind === 'map' || f.repeat || f.oneof) continue;
    const at = [...path, f.jsonName];
    const set = LABELS[`${shortName(message.typeName)}.${f.jsonName}`];
    const name = set?.label ?? optionLabel(f.localName);
    const base = { path: at, key: at.join('.'), label: group ? `${group}: ${name.toLowerCase()}` : name };
    if (f.kind === 'message') {
      const inner = f.T() as ProtoMessage;
      if (SKIPPED_MESSAGES.has(inner.typeName)) continue;
      out.push(...fieldsOf(inner, at, f.jsonName === UNNAMED_GROUP ? group : base.label));
    } else if (f.kind === 'enum') {
      const { choices, numbers } = enumChoices(f.T());
      const field: SpecOptionEnum = { ...base, kind: 'enum', choices };
      enumNumbers.set(field, numbers);
      out.push(field);
    } else if (f.T === ScalarType.BOOL) {
      out.push({ ...base, kind: 'bool' });
    } else if (DECIMAL.has(f.T) || WHOLE.has(f.T)) {
      out.push({
        ...base,
        kind: 'number',
        integer: WHOLE.has(f.T),
        unit: set?.percent ? '%' : '',
        min: 0,
        max: set?.percent ? 1 : MAX_OPTION_NUMBER,
      });
    }
  }
  return out;
}

const cache = new Map<SpecId, SpecOptionField[]>();

/** The options of a spec, in upstream's order, nested messages flattened. Empty for a spec without any. */
export function specOptionFields(spec: SpecId): SpecOptionField[] {
  let fields = cache.get(spec);
  if (!fields) {
    const arm = Player.fields.find((f) => f.localName === SPEC_ONEOF[spec]);
    const specMessage = arm?.kind === 'message' ? (arm.T() as ProtoMessage) : undefined;
    const options = specMessage?.fields.find((f) => f.localName === 'options');
    fields = options?.kind === 'message' ? fieldsOf(options.T() as ProtoMessage, [], '') : [];
    cache.set(spec, fields);
  }
  return fields;
}

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

function rawAt(options: JsonObject, path: readonly string[]): unknown {
  let v: unknown = options;
  for (const key of path) v = isObject(v) ? v[key] : undefined;
  return v;
}

/**
 * An option's value in `options`. One that is not written is at the engine's default (the first choice, off, 0),
 * as is one the engine would not read: an enum value it does not have (any more), a number that is not one.
 */
export function specOptionValue(options: JsonObject, field: SpecOptionField): SpecOptionValue {
  const raw = rawAt(options, field.path);
  if (field.kind === 'bool') return raw === true;
  if (field.kind === 'enum') {
    const name = typeof raw === 'number' ? enumNumbers.get(field)?.get(raw) : raw;
    return field.choices.some((c) => c.value === name) ? (name as string) : field.choices[0]!.value;
  }
  // protojson may write a number as a string.
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** Whether a number can be the option's value: in its range, and whole where the engine wants an integer. */
export const specOptionFits = (field: SpecOptionNumber, n: unknown): n is number =>
  typeof n === 'number' && n >= field.min && n <= field.max && (!field.integer || Number.isInteger(n));

const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** A number option as shown: the stored value, or a fraction as its percentage (0.8 → 80). */
export const specOptionShown = (field: SpecOptionNumber, stored: number): number =>
  round3(field.unit === '%' ? stored * 100 : stored);
/** The stored value for a number as shown (80 % → 0.8). */
export const specOptionStored = (field: SpecOptionNumber, shown: number): number =>
  field.unit === '%' ? shown / 100 : shown;

/** A value as text: "Cat", "None", "on", "off", "100%", "32". */
export function specOptionText(field: SpecOptionField, value: SpecOptionValue): string {
  if (field.kind === 'bool') return value ? 'on' : 'off';
  if (field.kind === 'enum') return field.choices.find((c) => c.value === value)?.label ?? String(value);
  return `${specOptionShown(field, Number(value))}${field.unit}`;
}

function writeAt(options: JsonObject, path: readonly string[], value: unknown): JsonObject {
  const [key, ...rest] = path;
  if (key === undefined) return options;
  const inner = options[key];
  return { ...options, [key]: rest.length ? writeAt(isObject(inner) ? inner : {}, rest, value) : value };
}

/**
 * `options` with one option set (a copy). The value is always written, also when it is the engine's default:
 * an option that is not written is one the preset fills in (`mergeSpecOptions`), and "no pet" is a choice.
 */
export function setSpecOption(
  options: JsonObject,
  field: SpecOptionField,
  value: SpecOptionValue,
): JsonObject {
  return writeAt(options, field.path, value);
}

/**
 * `options` with every option of the spec written out, the ones it lacks at the engine's default. Nothing the
 * engine sims changes; what changes is that a later fill from a preset has nothing left to fill, so the options
 * stay what they are when the talents move closer to another preset build.
 */
export function completeSpecOptions(spec: SpecId, options: JsonObject): JsonObject {
  return specOptionFields(spec).reduce((o, f) => writeAt(o, f.path, specOptionValue(options, f)), options);
}

/** `base` with `over` laid on top: objects (`classOptions`) merge key by key, any other value replaces. */
export function mergeSpecOptions(base: JsonObject, over: JsonObject): JsonObject {
  const out: JsonObject = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const under = out[key];
    out[key] = isObject(value) && isObject(under) ? mergeSpecOptions(under, value) : value;
  }
  return out;
}

export interface SpecOptionChange {
  field: SpecOptionField;
  before: SpecOptionValue;
  after: SpecOptionValue;
}

/** What is left of `options` without the listed fields and without empty objects: what the form does not show. */
function rest(options: JsonObject, fields: readonly SpecOptionField[]): JsonObject {
  const strip = (o: JsonObject, path: readonly string[]): JsonObject =>
    Object.fromEntries(
      Object.entries(o).flatMap(([key, value]): [string, unknown][] => {
        const at = [...path, key].join('.');
        if (fields.some((f) => f.key === at)) return [];
        if (!isObject(value)) return [[key, value]];
        const inner = strip(value, [...path, key]);
        return Object.keys(inner).length ? [[key, inner]] : [];
      }),
    );
  return strip(options, []);
}

/** Stable JSON (sorted keys), so key order never reads as a difference. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    isObject(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x,
  );

/**
 * The options that differ between two sets of one spec's options, by value: an option one side does not write
 * equals the engine's default written out on the other. `rest` says that something without a field differs
 * (a target reference, an option of a newer or older engine).
 */
export function specOptionChanges(
  spec: SpecId,
  a: JsonObject,
  b: JsonObject,
): { changes: SpecOptionChange[]; rest: boolean } {
  const fields = specOptionFields(spec);
  const changes = fields.flatMap((field): SpecOptionChange[] => {
    const before = specOptionValue(a, field);
    const after = specOptionValue(b, field);
    return before === after ? [] : [{ field, before, after }];
  });
  return { changes, rest: stable(rest(a, fields)) !== stable(rest(b, fields)) };
}

/** A change as one line: "Pet type: Raptor → Cat", "Pet uptime: 100% → 80%", "Cobra reflexes: on". */
export function specOptionChangeText(change: SpecOptionChange): string {
  const { field, before, after } = change;
  return field.kind === 'bool'
    ? `${field.label}: ${specOptionText(field, after)}`
    : `${field.label}: ${specOptionText(field, before)} → ${specOptionText(field, after)}`;
}

export interface SpecOptionRow {
  field: SpecOptionField;
  value: SpecOptionValue;
  /** The option's value in the preset build the character is compared with. */
  preset: SpecOptionValue;
}

/**
 * A character's options, each next to its value in the preset build closest to the character's talents
 * (`closestSetup`). That is the build an import's options were filled from, and the build a character started
 * from a preset is on until its talents move closer to another one. `build` is null when the spec's own setup
 * is the reference (no builds, no talents).
 */
export function specOptionRows(
  character: Pick<Character, 'spec' | 'talents' | 'specOptions'>,
  presets: SpecPresets,
): { build: PresetBuild | null; setup: PresetSetup; rows: SpecOptionRow[] } {
  const { build, setup } = closestSetup(presets, character.talents);
  const rows = specOptionFields(character.spec).map((field) => ({
    field,
    value: specOptionValue(character.specOptions, field),
    preset: specOptionValue(setup.specOptions, field),
  }));
  return { build, setup, rows };
}

/** The engine's hunter pet families by enum value name ("Cat", "WindSerpent"), without the value for no pet. */
export function hunterPetTypes(): string[] {
  const pet = specOptionFields('hunter').find((f) => f.key === 'classOptions.petType');
  return pet?.kind === 'enum' ? pet.choices.slice(1).map((c) => c.value) : [];
}
