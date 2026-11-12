// SimulationCraft addon export, WoW Forever flavour.
//
// Format, as written by simulationcraft/simc-addon (core.lua `GetSimcProfile`, extras.lua slot
// tables, forever/*.lua) when running on the Forever client (WOW_PROJECT_CAMELOT):
//
//   # <name> - <date> - <region>/<realm>        header comments (no spec on Forever)
//   warrior="Name"                              class token = "name"
//   level= race= region= server= role= professions=a=300/b=275 spec=unknown
//   talents=<Blizzard C_Traits loadout string>  NOT the engine's digit string (see README)
//   legacy_talents=entry:rank/...               Forever Legacy trees; not used by the engine
//   head=,id=123,enchant_id=456,bonus_id=1/2    one line per slot, preceded by "# Item (ilvl)"
//   bag1=,id=...  pet_family=...                Forever extras; not used by the engine
//   # Checksum: <adler32 hex>
//
// Lines starting with "#" are comments. Everything is optional except the class line.
import type { ClassId, Gear, ImportContext, ImportResult, Importer, ItemSlotId } from '@fsim/contracts';
import { Diags, checkItem, finish, parseRegion, resolveRace, resolveSpec, slotLabel } from './build';
import type { RawItem } from './build';
import {
  ENGINE_TALENTS,
  SIMC_IGNORED_SLOTS,
  SIMC_SLOTS,
  isOtherGameClass,
  parseClass,
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
  'pet_family',
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

/** Item option keys the engine reads. Everything else on an item line is noted and skipped. */
const ITEM_KEYS = new Set(['id', 'enchant_id', 'suffix']);

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

  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
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
    diags.add(
      'DEFAULT-05',
      'warning',
      'Talents are a WoW client loadout string, which cannot be converted yet. The spec preset will be used; set talents in the workbench.',
      { line: talentsOpt.line, field: 'talents' },
    );
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
    },
    diags,
  );
  return { format: 'simc', character, diagnostics: sortByLine(diags.list) };
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
