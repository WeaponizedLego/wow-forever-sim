// Wowhead gear planner link: https://www.wowhead.com/forever/gear-planner/<class>/<race>/<hash>
//
// The hash decoder is ported from wowsims/forever ui/features/import-export/importers/
// wowhead_gear_planner.ts (MIT, © wowsims contributors), which in turn notes it is "taken from
// Wowhead". Hash layout (all bytes, base64url):
//   version (0–3) · level (v≥1) · talent byte count + talent nibbles (v≥2, 15 = tree separator) ·
//   then per item: slot byte (bit 7 = has enchant, bit 6 = has random suffix) ·
//   [v≥3: gem count (top 3 bits) | item id bits 16–20] · item id bits 8–15 · bits 0–7 ·
//   [enchant spell id, 2 bytes] · [random suffix, 2 bytes, signed] · gems, 3 bytes each (skipped)
// Wowhead stores enchants by spell id; the engine wants the enchant effect id, so the context's
// `enchantIdForSpell` resolves them (see WowheadImportContext).
import type { Gear, ImportContext, ImportResult, Importer, ItemSlotId } from '@fsim/contracts';
import { Diags, checkItem, finish, resolveRace, resolveSpec, slotLabel } from './build';
import type { WowheadImportContext } from './build';
import { ENGINE_TALENTS, isOtherGameClass, parseClass } from './vocab';

const URL_RE =
  /wowhead\.com\/(?:[a-z]{2}\/)?([a-z-]+)\/gear-planner\/([a-z-]+)\/([a-z-]+)(?:\/([A-Za-z0-9_-]*))?/i;

/** Wowhead slot ids (inventory slot ids) → engine slots. Upstream WOWHEAD_SLOT_IDS. */
const WOWHEAD_SLOTS: Record<number, ItemSlotId> = {
  1: 'head',
  2: 'neck',
  3: 'shoulder',
  15: 'back',
  5: 'chest',
  9: 'wrist',
  10: 'hands',
  6: 'waist',
  7: 'legs',
  8: 'feet',
  11: 'finger1',
  12: 'finger2',
  13: 'trinket1',
  14: 'trinket2',
  16: 'mainHand',
  17: 'offHand',
  18: 'ranged',
};

export interface WowheadHash {
  version: number;
  level?: number;
  talents: string;
  items: { slotId: number; itemId: number; enchantSpellId?: number; randomSuffix?: number }[];
}

/** Decodes the part after class/race. Throws on input that is not base64url. */
export function readWowheadHash(hash: string): WowheadHash {
  const out: WowheadHash = { version: 0, talents: '', items: [] };
  if (hash === '') return out;
  const binary = atob(hash.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Array.from(binary, (c) => c.charCodeAt(0));
  let pos = 0;
  const next = (): number => bytes[pos++] ?? 0;

  const version = next();
  out.version = version;
  if (version >= 4) return out;
  if (version > 0) out.level = next();
  if (version > 1) {
    const count = next();
    const nibbles: number[] = [];
    for (let i = 0; i < count; i++) {
      const b = next();
      nibbles.push(b >> 4, b & 15);
    }
    let talents = '';
    let separators = 0;
    for (const n of nibbles) {
      if (separators >= 3) break;
      if (n === 15) {
        talents += '-';
        separators++;
      } else {
        talents += String(n);
      }
    }
    out.talents = talents.replace(/-+$/, '');
  }
  while (bytes.length - pos >= 3) {
    let slotByte = next();
    let gems = 0;
    let itemId = 0;
    if (version >= 3) {
      const b = next();
      gems = (b & 224) >> 5;
      itemId |= (b & 31) << 16;
    }
    itemId |= next() << 8;
    itemId |= next();
    const hasEnchant = (slotByte & 128) > 0;
    const hasSuffix = (slotByte & 64) > 0;
    slotByte &= ~(128 | 64);
    const item: WowheadHash['items'][number] = { slotId: slotByte, itemId };
    if (hasEnchant) item.enchantSpellId = (next() << 8) | next();
    if (hasSuffix) {
      let suffix = (next() << 8) | next();
      if ((suffix & 32768) > 0) suffix -= 65536;
      item.randomSuffix = suffix;
    }
    pos += 3 * gems;
    out.items.push(item);
  }
  return out;
}

export const wowheadImporter: Importer = {
  format: 'wowhead-url',
  detect(input: string): boolean {
    return /wowhead\.com\/(?:[a-z]{2}\/)?[a-z-]+\/gear-planner\//i.test(input);
  },
  parse(input: string, ctx: ImportContext): ImportResult {
    try {
      return parseWowhead(input, ctx as WowheadImportContext);
    } catch (e) {
      return fail(`Wowhead link could not be read: ${String(e)}`);
    }
  },
};

const fail = (message: string): ImportResult => ({
  format: 'wowhead-url',
  character: null,
  diagnostics: [{ code: 'FMT-01', severity: 'error', message }],
});

function parseWowhead(input: string, ctx: WowheadImportContext): ImportResult {
  const m = URL_RE.exec(input.trim());
  if (!m) return fail('Not a Wowhead gear planner link (…/gear-planner/<class>/<race>/<hash>).');
  const [, , className = '', raceName = '', hash = ''] = m;

  const diags = new Diags();
  const classWord = className.replace(/-/g, '');
  const cls = parseClass(classWord);
  if (!cls) {
    diags.add(
      'SPEC-04',
      'error',
      isOtherGameClass(classWord)
        ? `Class "${className}" does not exist in WoW Forever.`
        : `Class "${className}" not recognised.`,
      { field: 'class' },
    );
    return { format: 'wowhead-url', character: null, diagnostics: diags.list };
  }

  let decoded: WowheadHash;
  try {
    decoded = readWowheadHash(hash);
  } catch {
    diags.add(
      'PARSE-02',
      'warning',
      'The gear part of the link could not be decoded; gear and talents skipped.',
      {
        field: 'gear',
      },
    );
    decoded = { version: 0, talents: '', items: [] };
  }
  if (decoded.version >= 4) {
    diags.add(
      'PARSE-02',
      'warning',
      `Link format version ${decoded.version} is newer than this importer knows.`,
      {
        field: 'gear',
      },
    );
  }

  let talents = '';
  if (decoded.talents === '') {
    diags.add('DEFAULT-05', 'info', 'Talents not in the link. The spec preset will be used.', {
      field: 'talents',
    });
  } else if (ENGINE_TALENTS.test(decoded.talents)) {
    talents = decoded.talents;
  } else {
    diags.add('PARSE-02', 'warning', 'Talents in the link could not be read. The spec preset will be used.', {
      field: 'talents',
    });
  }

  const spec = resolveSpec({ cls, talents }, diags);
  const race = resolveRace(cls, raceName.replace(/-/g, ' '), undefined, diags);

  const gear: Gear = {};
  for (const raw of decoded.items) {
    const slot = WOWHEAD_SLOTS[raw.slotId];
    if (!slot) {
      diags.add(
        'PARSE-02',
        'info',
        `Wowhead slot ${raw.slotId} (item ${raw.itemId}) is not an engine slot; skipped.`,
        {
          field: 'gear',
        },
      );
      continue;
    }
    let enchantId: number | undefined;
    if (raw.enchantSpellId) {
      enchantId = ctx.enchantIdForSpell?.(raw.enchantSpellId);
      if (enchantId === undefined && ctx.hasItem(raw.itemId)) {
        diags.add(
          'DATA-03',
          'warning',
          `${slotLabel(slot)} enchant (spell ${raw.enchantSpellId}) is not in data build ${ctx.dataBuild}. The item is kept without it.`,
          { field: slot },
        );
      }
    }
    const item = checkItem(
      ctx,
      slot,
      { itemId: raw.itemId, enchantId, randomSuffix: raw.randomSuffix },
      undefined,
      diags,
    );
    if (item) gear[slot] = item;
  }
  if (decoded.items.length === 0) {
    diags.add('DEFAULT-05', 'info', 'Gear not in the link. The spec preset will be used.', { field: 'gear' });
  }

  const character = finish({ cls, spec, race, level: decoded.level, gear, talents, professions: [] }, diags);
  return { format: 'wowhead-url', character, diagnostics: diags.list };
}
