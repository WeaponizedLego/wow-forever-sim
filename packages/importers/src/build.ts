// Shared steps every importer ends with: resolve spec and race, check gear ids against the data
// build, and fill the Character defaults (with DEFAULT-05 notes for what the preset will supply).
import { CharacterSchema, MAX_LEVEL } from '@fsim/contracts';
import type {
  Character,
  ClassId,
  Diagnostic,
  DiagnosticCode,
  Gear,
  GearItem,
  ImportContext,
  ItemSlotId,
  RaceId,
  Role,
  Severity,
  SpecId,
} from '@fsim/contracts';
import {
  DEFAULT_RACE,
  ENGINE_TALENTS,
  raceName,
  defaultSpec,
  lookupSpec,
  parseRace,
  specFromTalents,
  specName,
  specsOfClass,
} from './vocab';

/**
 * `ImportContext` plus what the Wowhead importer needs on top: Wowhead stores enchants by the
 * enchant's spell id, the engine by its effect id. Optional, so a plain `ImportContext` still
 * works (Wowhead enchants then come back as DATA-03 warnings).
 */
export interface WowheadImportContext extends ImportContext {
  /** Effect id (the engine's `ItemSpec.enchant`) for an enchant spell id, if the data build has it. */
  enchantIdForSpell?(spellId: number): number | undefined;
}

export class Diags {
  readonly list: Diagnostic[] = [];
  add(
    code: DiagnosticCode,
    severity: Severity,
    message: string,
    where: { line?: number | undefined; field?: string | undefined } = {},
  ): void {
    const d: Diagnostic = { code, severity, message };
    if (where.line !== undefined) d.line = where.line;
    if (where.field !== undefined) d.field = where.field;
    this.list.push(d);
  }
}

export interface Where {
  line?: number | undefined;
}

export interface SpecInput {
  cls: ClassId;
  /** Spec name from the export, if any. */
  specName?: string | undefined;
  specWhere?: Where | undefined;
  role?: { role: Role; style?: 'melee' | 'caster' } | undefined;
  /** Engine-format talents, used to infer the spec when the export names none. */
  talents?: string | undefined;
}

/** Picks the engine spec: named spec, else talents, else role, else the class's first DPS spec. */
export function resolveSpec(input: SpecInput, diags: Diags): SpecId {
  const { cls, role } = input;
  if (input.specName !== undefined) {
    const found = lookupSpec(cls, input.specName, role?.role);
    if (found.kind === 'spec') return found.spec;
    if (found.kind === 'unknown') {
      diags.add('SPEC-04', 'warning', `Spec "${input.specName}" is not a ${cls} spec the engine knows.`, {
        line: input.specWhere?.line,
        field: 'spec',
      });
    }
  }
  if (input.talents && ENGINE_TALENTS.test(input.talents)) {
    const inferred = specFromTalents(cls, input.talents, role?.role);
    if (inferred) {
      diags.add(
        'SPEC-04',
        'info',
        `Spec not in the export. ${specName(inferred.spec)} picked from talents (${inferred.points.join('/')}).`,
        { line: input.specWhere?.line, field: 'spec' },
      );
      return inferred.spec;
    }
  }
  const spec = defaultSpec(cls, role);
  const single = specsOfClass(cls).length === 1;
  diags.add(
    'SPEC-04',
    single ? 'info' : 'warning',
    single
      ? `Spec not in the export. ${specName(spec)} is the only ${cls} spec.`
      : `Spec not in the export. Picked ${specName(spec)}${role ? ` from role` : ''}; change it if that is wrong.`,
    { line: input.specWhere?.line, field: 'spec' },
  );
  return spec;
}

export function resolveRace(
  cls: ClassId,
  name: string | undefined,
  where: Where | undefined,
  diags: Diags,
): RaceId {
  if (name !== undefined && name.trim() !== '') {
    const race = parseRace(name);
    if (race) return race;
    const fallback = DEFAULT_RACE[cls];
    diags.add('SPEC-04', 'warning', `Race "${name}" is not a Forever race. Using ${raceName(fallback)}.`, {
      line: where?.line,
      field: 'race',
    });
    return fallback;
  }
  const fallback = DEFAULT_RACE[cls];
  diags.add('DEFAULT-05', 'info', `Race not in the export. Using ${raceName(fallback)}.`, {
    line: where?.line,
    field: 'race',
  });
  return fallback;
}

export interface RawItem {
  itemId: number;
  enchantId?: number | undefined;
  randomSuffix?: number | undefined;
}

/** Checks one item against the data build. Unknown item → slot left empty; unknown enchant → enchant dropped. */
export function checkItem(
  ctx: ImportContext,
  slot: ItemSlotId,
  raw: RawItem,
  where: Where | undefined,
  diags: Diags,
): GearItem | undefined {
  if (!Number.isInteger(raw.itemId) || raw.itemId <= 0) {
    diags.add('PARSE-02', 'warning', `${slotLabel(slot)}: item id ${raw.itemId} is not a valid id.`, {
      line: where?.line,
      field: slot,
    });
    return undefined;
  }
  if (!ctx.hasItem(raw.itemId)) {
    diags.add(
      'DATA-03',
      'warning',
      `${slotLabel(slot)} ${raw.itemId} is not in data build ${ctx.dataBuild}. It will be left empty.`,
      { line: where?.line, field: slot },
    );
    return undefined;
  }
  const item: GearItem = { itemId: raw.itemId };
  if (raw.enchantId !== undefined && raw.enchantId !== 0) {
    if (Number.isInteger(raw.enchantId) && raw.enchantId > 0 && ctx.hasEnchant(raw.enchantId)) {
      item.enchantId = raw.enchantId;
    } else {
      diags.add(
        'DATA-03',
        'warning',
        `${slotLabel(slot)} enchant ${raw.enchantId} is not in data build ${ctx.dataBuild}. The item is kept without it.`,
        { line: where?.line, field: slot },
      );
    }
  }
  if (raw.randomSuffix !== undefined && raw.randomSuffix !== 0 && Number.isInteger(raw.randomSuffix)) {
    item.randomSuffix = raw.randomSuffix;
  }
  return item;
}

const SLOT_LABELS: Partial<Record<ItemSlotId, string>> = {
  finger1: 'Ring 1',
  finger2: 'Ring 2',
  trinket1: 'Trinket 1',
  trinket2: 'Trinket 2',
  mainHand: 'Main hand',
  offHand: 'Off hand',
};
export const slotLabel = (slot: ItemSlotId): string =>
  SLOT_LABELS[slot] ?? slot.charAt(0).toUpperCase() + slot.slice(1);

export interface Draft {
  name?: string | undefined;
  realm?: string | undefined;
  region?: Character['region'] | undefined;
  cls: ClassId;
  spec: SpecId;
  race: RaceId;
  level?: number | undefined;
  gear: Gear;
  talents: string;
  professions: string[];
}

/**
 * Fills the parts no import format carries (rotation, consumables) with preset markers plus a
 * DEFAULT-05 note each, then validates against the contract schema.
 */
export function finish(draft: Draft, diags: Diags): Character | null {
  const label = specName(draft.spec);
  diags.add('DEFAULT-05', 'info', `Rotation not in the export. Using the upstream default for ${label}.`, {
    field: 'rotation',
  });
  diags.add('DEFAULT-05', 'info', `Consumables not in the export. The spec preset will be applied.`, {
    field: 'consumables',
  });
  const candidate: Record<string, unknown> = {
    class: draft.cls,
    spec: draft.spec,
    race: draft.race,
    level: clampLevel(draft.level, diags),
    gear: draft.gear,
    talents: draft.talents,
    professions: draft.professions.slice(0, 2),
    consumables: {},
    specOptions: {},
    rotation: { kind: 'preset', presetId: 'default' },
  };
  if (draft.name) candidate.name = draft.name;
  if (draft.realm) candidate.realm = draft.realm;
  if (draft.region) candidate.region = draft.region;
  const parsed = CharacterSchema.safeParse(candidate);
  if (!parsed.success) {
    diags.add(
      'PARSE-02',
      'error',
      `Imported character is not valid: ${parsed.error.issues[0]?.message ?? ''}`,
    );
    return null;
  }
  return parsed.data;
}

function clampLevel(level: number | undefined, diags: Diags): number {
  if (level === undefined || !Number.isFinite(level)) return MAX_LEVEL;
  const n = Math.trunc(level);
  if (n < 1 || n > MAX_LEVEL) {
    diags.add('PARSE-02', 'warning', `Level ${level} is out of range. Using ${MAX_LEVEL}.`, {
      field: 'level',
    });
    return MAX_LEVEL;
  }
  return n;
}

const REGIONS = new Set(['us', 'eu', 'kr', 'tw', 'cn']);
export function parseRegion(value: string): Character['region'] | undefined {
  const s = value.trim().toLowerCase();
  return REGIONS.has(s) ? (s as Character['region']) : undefined;
}
