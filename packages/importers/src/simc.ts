// SimulationCraft addon export, WoW Forever flavour.
//
// Format, as written by simulationcraft/simc-addon (core.lua `GetSimcProfile`, extras.lua slot
// tables, forever/*.lua) when running on the Forever client (WOW_PROJECT_CAMELOT):
//
//   # <name> - <date> - <region>/<realm>        header comments (no spec on Forever)
//   warrior="Name"                              class token = "name"
//   level= race= region= server= role= professions=a=300/b=275 spec=unknown
//   talents=<Blizzard C_Traits loadout string>  converted by ./loadout.ts (see README)
//   legacy_talents=entry:rank/...               Forever Legacy trees; not used by the engine
//   head=,id=123,enchant_id=456,bonus_id=1/2    one line per slot, preceded by "# Item (ilvl)"
//   bag1=,id=...  pet_creature_id=...           Forever extras; not used by the engine
//   pet_family=cat                              a hunter's pet: the engine's pet type (see `hunterPet`)
//   # pet_info=npc_id:1/level:9/family:boar/…   the same, as the real 12.1.5-02 export has it
//   # Checksum: <adler32 hex>
//
// Lines starting with "#" are comments (only `# pet_info=` is read). Everything is optional except the class line.
import type { ClassId, Gear, ImportContext, ImportResult, Importer, ItemSlotId } from '@fsim/contracts';
import { MAX_LEVEL } from '@fsim/contracts';
import { Diags, checkItem, finish, parseRegion, resolveRace, resolveSpec, slotLabel } from './build';
import { loadoutToTalents } from './loadout';
import type { RawItem } from './build';
import {
  ENGINE_TALENTS,
  SIMC_IGNORED_SLOTS,
  SIMC_SLOTS,
  isOtherGameClass,
  parseClass,
  parsePetFamily,
  parseProfession,
  parseRole,
} from './vocab';

const OPTION = /^([A-Za-z0-9_.]+)\s*=(.*)$/;
const CLASS_TOKENS = /^(warrior|paladin|hunter|rogue|priest|shaman|mage|warlock|druid)\s*=\s*"?/m;
const SLOT_LINE = /^(head|neck|shoulder|chest|main_hand|finger1|trinket1)\s*=[^\n]*\bid=\d+/m;

/** Keys the addon writes that the engine has no use for: skipped with an info note. */
const IGNORED_KEYS = new Set([
  'legacy_talents',
  'loot_spec',
  'pet_creature_id',
  'pet_level',
  'pet_happiness',
  'pet_abilities',
  'zandalari_loa',
  'omnium_talents',
  'offspec_talents',
  'position',
]);
const BAG_KEY = /^bag\d+$/;
/**
 * The pet line of the addon's commented "Additional Character Info" block, the only place a real export from
 * addon 12.1.5-02 names the pet: `# pet_info=npc_id:165189/level:9/name:bear/family:boar/type:beast/…`.
 */
const PET_INFO = /^#\s*pet_info\s*=(.*)$/i;

/** Item option keys the engine reads. Everything else on an item line is noted and skipped. */
const ITEM_KEYS = new Set(['id', 'enchant_id', 'suffix', 'bonus_id']);

/** Blizzard loadout export alphabet (ExportUtil.lua). A header alone is 152 bits = 26 characters. */
const LOADOUT_STRING = /^[A-Za-z0-9+/]{26,}$/;

export const simcImporter: Importer = {
  format: 'simc',
  detect(input: string): boolean {
    return /^#\s*SimC Addon/im.test(input) || CLASS_TOKENS.test(input) || SLOT_LINE.test(input);
  },
  parse(input: string, ctx: ImportContext): ImportResult {
    try {
      return parseSimc(input, ctx);
    } catch (e) {
      return {
        format: 'simc',
        character: null,
        diagnostics: [
          { code: 'FMT-01', severity: 'error', message: `SimC export could not be read: ${String(e)}` },
        ],
      };
    }
  },
};

interface Lined<T> {
  value: T;
  line: number;
}

function parseSimc(input: string, ctx: ImportContext): ImportResult {
  const diags = new Diags();
  const lines = String(input).split(/\r\n|\r|\n/);

  let cls: Lined<ClassId> | undefined;
  let name: string | undefined;
  const opts = new Map<string, Lined<string>>();
  const items = new Map<ItemSlotId, Lined<RawItem>>();
  // The pet's family: the `pet_family` option, else the commented `pet_info` line.
  let petFamily: Lined<string> | undefined;
  let petInfoFamily: Lined<string> | undefined;

  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    const info = PET_INFO.exec(text);
    if (info) {
      const family = info[1]!
        .split('/')
        .map((part) => part.split(':'))
        .find(([k]) => k?.trim().toLowerCase() === 'family')?.[1];
      if (family?.trim()) petInfoFamily ??= { value: family.trim(), line };
      return;
    }
    if (text === '' || text.startsWith('#')) return;

    const m = OPTION.exec(text);
    if (!m) {
      diags.add('PARSE-02', 'warning', `Line ${line} could not be read and was skipped.`, { line });
      return;
    }
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();

    const asClass = parseClass(key);
    if (asClass) {
      if (cls) {
        diags.add('PARSE-02', 'warning', `Second character line (${key}) skipped; only one is read.`, {
          line,
        });
        return;
      }
      cls = { value: asClass, line };
      name = unquote(value);
      return;
    }
    if (isOtherGameClass(key)) {
      diags.add('SPEC-04', 'error', `Class "${key}" does not exist in WoW Forever.`, {
        line,
        field: 'class',
      });
      return;
    }

    const slot = SIMC_SLOTS[key];
    if (slot) {
      const item = parseItem(value, slot, line, diags);
      if (item) items.set(slot, { value: item, line });
      return;
    }
    if (SIMC_IGNORED_SLOTS.has(key)) {
      diags.add('PARSE-02', 'info', `${key} slot skipped; the engine does not use it.`, { line, field: key });
      return;
    }
    if (IGNORED_KEYS.has(key) || BAG_KEY.test(key)) {
      diags.add('PARSE-02', 'info', `${key} skipped; the engine does not use it.`, { line, field: key });
      return;
    }
    if (key === 'pet_family') {
      petFamily ??= { value, line };
      return;
    }
    if (['level', 'race', 'region', 'server', 'role', 'spec', 'talents', 'professions'].includes(key)) {
      opts.set(key, { value, line });
      return;
    }
    diags.add('PARSE-02', 'info', `Unknown option "${key}" skipped.`, { line, field: key });
  });

  if (!cls) {
    diags.add('SPEC-04', 'error', 'No character line (e.g. warrior="Name") found, so the class is unknown.', {
      field: 'class',
    });
    return { format: 'simc', character: null, diagnostics: diags.list };
  }

  // Talents: only the engine's digit format can be used as is.
  const talentsOpt = opts.get('talents');
  let talents = '';
  if (!talentsOpt || talentsOpt.value === '') {
    diags.add('DEFAULT-05', 'info', 'Talents not in the export. The spec preset will be used.', {
      field: 'talents',
    });
  } else if (ENGINE_TALENTS.test(talentsOpt.value)) {
    talents = talentsOpt.value;
  } else if (LOADOUT_STRING.test(talentsOpt.value)) {
    const r = loadoutToTalents(cls.value, talentsOpt.value);
    const where = { line: talentsOpt.line, field: 'talents' };
    if (!r.ok) {
      diags.add(
        'DEFAULT-05',
        'warning',
        `Talents are a WoW client loadout string that could not be converted safely: ${r.reason} The spec preset will be used; set talents in the workbench.`,
        where,
      );
    } else {
      talents = r.talents;
      if (!r.verified)
        diags.add(
          'TALENT-08',
          'warning',
          `Talents converted from the WoW client loadout string (${r.talents || 'no points'}), but this ${cls.value} tree layout has not been checked against a real export yet, so a talent may be misread. Check them in the workbench's Talents tab.`,
          where,
        );
      for (const note of r.notes) diags.add('PARSE-02', 'info', note, where);
    }
  } else {
    diags.add('PARSE-02', 'warning', 'Talents could not be read. The spec preset will be used.', {
      line: talentsOpt.line,
      field: 'talents',
    });
  }

  const roleOpt = opts.get('role');
  const role = roleOpt ? parseRole(roleOpt.value) : undefined;
  const specOpt = opts.get('spec');
  const spec = resolveSpec(
    {
      cls: cls.value,
      specName: specOpt?.value,
      specWhere: { line: specOpt?.line ?? cls.line },
      role,
      talents,
    },
    diags,
  );

  const raceOpt = opts.get('race');
  const race = resolveRace(cls.value, raceOpt?.value, { line: raceOpt?.line ?? cls.line }, diags);

  let level: number | undefined;
  const levelOpt = opts.get('level');
  if (levelOpt) {
    level = Number(levelOpt.value);
    if (!/^\d+$/.test(levelOpt.value)) {
      diags.add('PARSE-02', 'warning', `Level "${levelOpt.value}" is not a number.`, {
        line: levelOpt.line,
        field: 'level',
      });
      level = undefined;
    }
    if (level !== undefined && level < MAX_LEVEL) {
      diags.add(
        'LEVEL-07',
        'warning',
        `Level ${level} character. The engine always sims level ${MAX_LEVEL}, so the result shows this gear on a level ${MAX_LEVEL} ${cls.value}, not this character as played today.`,
        { line: levelOpt.line, field: 'level' },
      );
    }
  }

  const professions: string[] = [];
  const profOpt = opts.get('professions');
  if (profOpt && profOpt.value !== '') {
    for (const part of profOpt.value.split('/')) {
      const profName = part.split('=')[0] ?? '';
      const prof = parseProfession(profName);
      if (prof) professions.push(prof);
      else
        diags.add('PARSE-02', 'info', `Profession "${profName}" not recognised; skipped.`, {
          line: profOpt.line,
          field: 'professions',
        });
    }
  }

  const gear: Gear = {};
  for (const [slot, { value, line }] of items) {
    const item = checkItem(ctx, slot, value, { line }, diags);
    if (item) gear[slot] = item;
  }

  // The pet: a hunter's is a spec option of the engine. Any other class's pet line stays unused, as before.
  let specOptions: Record<string, unknown> | undefined;
  const pet = petFamily ?? petInfoFamily;
  if (cls.value === 'hunter' && pet && pet.value !== '') specOptions = hunterPet(pet, ctx, diags);
  else if (petFamily)
    diags.add('PARSE-02', 'info', 'pet_family skipped; the engine does not use it.', {
      line: petFamily.line,
      field: 'pet_family',
    });

  const regionOpt = opts.get('region');
  const character = finish(
    {
      name,
      realm: opts.get('server')?.value || undefined,
      region: regionOpt ? parseRegion(regionOpt.value) : undefined,
      cls: cls.value,
      spec,
      race,
      level,
      gear,
      talents,
      professions,
      specOptions,
    },
    diags,
  );
  return { format: 'simc', character, diagnostics: sortByLine(diags.list) };
}

/**
 * A hunter's spec options for the pet family the export names: the engine's pet type of that family, the only
 * option set, so the preset fills in the rest (ammo, quiver, the pet's attack speed). A family the engine has no
 * pet for sets nothing and is noted: the preset's pet is simmed.
 */
function hunterPet(family: Lined<string>, ctx: ImportContext, diags: Diags): Record<string, unknown> {
  const where = { line: family.line, field: 'pet_family' };
  if (!ctx.hunterPetTypes) {
    diags.add(
      'PARSE-02',
      'info',
      `Pet family "${family.value}" not checked (no engine pet list); the spec preset’s pet is used.`,
      where,
    );
    return {};
  }
  const petType = parsePetFamily(family.value, ctx.hunterPetTypes);
  if (!petType) {
    diags.add(
      'DEFAULT-05',
      'info',
      `Pet family "${family.value}" is not one the engine sims. The spec preset’s pet is used instead.`,
      where,
    );
    return {};
  }
  return { classOptions: { petType } };
}

function parseItem(value: string, slot: ItemSlotId, line: number, diags: Diags): RawItem | undefined {
  const fields = new Map<string, string>();
  const parts = value.split(',');
  parts.forEach((part, i) => {
    const eq = part.indexOf('=');
    // The first field is the optional item name (`head=lionheart_helm,id=...`); the addon leaves it empty.
    if (eq < 0) {
      if (i === 0 || part.trim() === '') return;
      fields.set(part.trim(), '');
      return;
    }
    fields.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
  });

  const id = fields.get('id');
  if (id === undefined || !/^\d+$/.test(id) || Number(id) <= 0) {
    diags.add('PARSE-02', 'warning', `${slotLabel(slot)}: no valid item id on this line; slot left empty.`, {
      line,
      field: slot,
    });
    return undefined;
  }
  const item: RawItem = { itemId: Number(id) };

  const enchant = fields.get('enchant_id');
  if (enchant !== undefined) {
    if (/^\d+$/.test(enchant)) item.enchantId = Number(enchant);
    else
      diags.add('PARSE-02', 'warning', `${slotLabel(slot)}: enchant_id "${enchant}" is not a number.`, {
        line,
        field: slot,
      });
  }
  const suffix = fields.get('suffix');
  if (suffix !== undefined) {
    if (/^-?\d+$/.test(suffix)) item.randomSuffix = Number(suffix);
    else
      diags.add('PARSE-02', 'warning', `${slotLabel(slot)}: suffix "${suffix}" is not a number.`, {
        line,
        field: slot,
      });
  }

  const bonus = fields.get('bonus_id');
  if (bonus !== undefined && bonus !== '') {
    const ids = bonus.split(/[/:]/).map(Number);
    if (ids.every((n) => Number.isInteger(n) && n > 0)) item.bonusIds = ids;
    else
      diags.add('PARSE-02', 'warning', `${slotLabel(slot)}: bonus_id "${bonus}" is not a list of numbers.`, {
        line,
        field: slot,
      });
  }

  const ignored = [...fields.keys()].filter((k) => !ITEM_KEYS.has(k));
  if (ignored.length > 0) {
    diags.add(
      'PARSE-02',
      'info',
      `${slotLabel(slot)}: ${ignored.join(', ')} skipped; the engine does not use it.`,
      {
        line,
        field: slot,
      },
    );
  }
  return item;
}

function unquote(s: string): string {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

/** Line-anchored findings first, in line order; the rest keep their order after them. */
function sortByLine<T extends { line?: number }>(list: T[]): T[] {
  return list
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (a.d.line ?? Infinity) - (b.d.line ?? Infinity) || a.i - b.i)
    .map((x) => x.d);
}
