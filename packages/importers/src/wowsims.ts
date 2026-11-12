// WoWSims exporter addon JSON (github.com/wowsims/exporter, `/wse` in game).
//
// Ported from wowsims/forever ui/features/import-export/importers/addon.ts (MIT, © wowsims
// contributors). Differences from upstream: it builds a fresh Character instead of patching the
// open sim, reports problems as diagnostics instead of throwing, keeps `gear.items` positional
// (upstream drops null entries, which shifts every later slot), and reads the exporter's `spec`
// field to pick the engine spec. No network check of the addon version.
//
// Shape (exporter ExportStructures/Character.lua, snapshot tools/test/snapshots/forever.txt):
//   { version, flavor: "forever", unit, id, name, realm, race: "NightElf", class: "mage",
//     level, talents: "2-5-2", professions: [{ name, level }], spec: "fire",
//     gear: { items: [ {id, enchant?, random_suffix?} | null, ... ] }  // ItemSlot order
//     rotation?: APLRotation JSON }
import { ITEM_SLOTS } from '@fsim/contracts';
import type { Gear, ImportContext, ImportResult, Importer } from '@fsim/contracts';
import { Diags, checkItem, finish, resolveRace, resolveSpec } from './build';
import { ENGINE_TALENTS, isOtherGameClass, parseClass, parseProfession } from './vocab';

export const wowsimsImporter: Importer = {
  format: 'wowsims-json',
  detect(input: string): boolean {
    const t = input.trimStart();
    return t.startsWith('{') && /"class"\s*:/.test(t);
  },
  parse(input: string, ctx: ImportContext): ImportResult {
    try {
      return parseWowsims(input, ctx);
    } catch (e) {
      return fail(`WoWSims export could not be read: ${String(e)}`);
    }
  },
};

const fail = (message: string): ImportResult => ({
  format: 'wowsims-json',
  character: null,
  diagnostics: [{ code: 'FMT-01', severity: 'error', message }],
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const int = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v)
    ? v
    : typeof v === 'string' && /^-?\d+$/.test(v)
      ? Number(v)
      : undefined;

function parseWowsims(input: string, ctx: ImportContext): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(input);
  } catch {
    return fail('Not valid JSON, so not a WoWSims addon export.');
  }
  if (!isRecord(json)) return fail('Not a WoWSims addon export (expected a JSON object).');

  const diags = new Diags();
  const className = str(json.class) ?? '';
  const cls = parseClass(className);
  if (!cls) {
    diags.add(
      'SPEC-04',
      'error',
      isOtherGameClass(className)
        ? `Class "${className}" does not exist in WoW Forever.`
        : `Class "${className}" not recognised.`,
      { field: 'class' },
    );
    return { format: 'wowsims-json', character: null, diagnostics: diags.list };
  }

  // Only an export from the Forever client builds its talent string from the Forever trees.
  const flavor = str(json.flavor);
  const rawTalents = str(json.talents) ?? '';
  let talents = '';
  if (rawTalents === '' || /^-*$/.test(rawTalents)) {
    diags.add('DEFAULT-05', 'info', 'Talents not in the export. The spec preset will be used.', {
      field: 'talents',
    });
  } else if (flavor !== 'forever') {
    diags.add(
      'DEFAULT-05',
      'warning',
      `Export is from the "${flavor ?? 'unknown'}" client, whose talent trees differ. The spec preset will be used.`,
      { field: 'talents' },
    );
  } else if (!ENGINE_TALENTS.test(rawTalents)) {
    diags.add('PARSE-02', 'warning', 'Talents could not be read. The spec preset will be used.', {
      field: 'talents',
    });
  } else {
    talents = rawTalents;
  }

  const spec = resolveSpec({ cls, specName: str(json.spec), talents }, diags);
  const race = resolveRace(cls, str(json.race), undefined, diags);

  const professions: string[] = [];
  if (Array.isArray(json.professions)) {
    for (const p of json.professions) {
      const profName = isRecord(p) ? str(p.name) : undefined;
      const prof = profName ? parseProfession(profName) : undefined;
      if (prof) professions.push(prof);
      else
        diags.add('PARSE-02', 'info', `Profession ${JSON.stringify(p)} not recognised; skipped.`, {
          field: 'professions',
        });
    }
  }

  const gear: Gear = {};
  const gearJson = json.gear;
  if (isRecord(gearJson) && Array.isArray(gearJson.items)) {
    gearJson.items.forEach((entry, index) => {
      const slot = ITEM_SLOTS[index];
      if (entry === null || entry === undefined) return;
      if (!slot) {
        diags.add('PARSE-02', 'info', `Gear entry ${index + 1} is past the last slot; skipped.`, {
          field: 'gear',
        });
        return;
      }
      if (!isRecord(entry)) {
        diags.add('PARSE-02', 'warning', `Gear entry for ${slot} could not be read; slot left empty.`, {
          field: slot,
        });
        return;
      }
      const item = checkItem(
        ctx,
        slot,
        {
          itemId: int(entry.id) ?? NaN,
          enchantId: int(entry.enchant),
          randomSuffix: int(entry.random_suffix ?? entry.randomSuffix),
        },
        undefined,
        diags,
      );
      if (item) gear[slot] = item;
    });
  } else {
    diags.add('DEFAULT-05', 'info', 'Gear not in the export. The spec preset will be used.', {
      field: 'gear',
    });
  }

  if (json.rotation !== undefined) {
    diags.add(
      'PARSE-02',
      'info',
      'Rotation in the export is an APL, which is not imported. The upstream default is used instead.',
      { field: 'rotation' },
    );
  }

  const character = finish(
    {
      name: str(json.name),
      realm: str(json.realm),
      cls,
      spec,
      race,
      level: typeof json.level === 'number' ? json.level : undefined,
      gear,
      talents,
      professions,
    },
    diags,
  );
  return { format: 'wowsims-json', character, diagnostics: diags.list };
}
