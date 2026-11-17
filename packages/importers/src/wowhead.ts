// Wowhead gear planner link: https://www.wowhead.com/forever/gear-planner/<class>/<race>/<hash>
//
// Shapes accepted (checked against wowhead.com in November 2026):
//   www.wowhead.com/forever/gear-planner/…      the WoW Forever planner: what Forever players share
//   www.wowhead.com/forever/de/gear-planner/…   localized (de fr es ru pt it ko cn): locale after the game
//   www.wowhead.com/classic/gear-planner/…      the Classic Era planner: read, with a note
//   classic.wowhead.com/gear-planner/…          old subdomain form (redirects to the one above)
//   www.wowhead.com/de/forever/gear-planner/…   locale first: Wowhead 404s it, accepted anyway
//   …/gear-planner/<class>[/<race>]             no gear: the preset fills it
// Other games' planners (tbc, wotlk, cata, mop-classic) are read with a warning; retail's gear is skipped.
//
// Hash formats. The Forever planner writes the packed format (version 5, the hash starts with "F";
// wowhead-packed.ts). The Classic Era planner writes byte format version 4 (readV4Items). Older
// links use byte versions 0–3, whose decoder is ported from
// wowsims/forever ui/features/import-export/importers/wowhead_gear_planner.ts (MIT, © wowsims
// contributors), which in turn notes it is "taken from Wowhead". Byte layout (base64url):
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
import {
  FOREVER_DATA_ENV,
  PACKED_FROM_VERSION,
  PACKED_MAX_VERSION,
  hashVersion,
  readPackedHash,
} from './wowhead-packed';

// Optional subdomains · up to two path segments (game, locale) · gear-planner/<class>[/<race>][/<hash>]
const URL_RE =
  /(?:([a-z.-]+)\.)?wowhead\.com\/((?:[a-z-]+\/){0,2})gear-planner\/([a-z-]+)(?:\/([a-z-]+))?(?:\/([A-Za-z0-9_-]*))?/i;

/** Wowhead's locale segments (path or subdomain), and `www`. */
const NOT_A_GAME = new Set(['www', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'ko', 'cn', 'tw', 'mx']);

/** Planner games by path segment, for messages. */
const GAME_NAMES: Record<string, string> = {
  forever: 'WoW Forever',
  classic: 'Classic Era',
  tbc: 'Burning Crusade Classic',
  wotlk: 'Wrath Classic',
  cata: 'Cataclysm Classic',
  'mop-classic': 'Mists of Pandaria Classic',
  retail: 'retail WoW',
};

export interface WowheadLink {
  /** Planner game from the path or subdomain: "forever", "classic", "tbc", …; "retail" when none. */
  game: string;
  className: string;
  /** Empty when the link names only a class. */
  raceName: string;
  hash: string;
}

/** The parts of the first planner link in the text, or null when there is none. */
export function parseWowheadLink(input: string): WowheadLink | null {
  const m = URL_RE.exec(input);
  if (!m) return null;
  const [, host = '', path = '', className = '', raceName = '', hash = ''] = m;
  const game = [...host.split('.'), ...path.split('/')]
    .map((s) => s.toLowerCase())
    .find((s) => s !== '' && !NOT_A_GAME.has(s));
  return { game: game ?? 'retail', className, raceName, hash };
}

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
  /** Wowhead data environment the link was made in (packed format only; 16 = WoW Forever). */
  dataEnv?: number;
  level?: number;
  talents: string;
  items: { slotId: number; itemId: number; enchantSpellId?: number; randomSuffix?: number }[];
}

/** True for the hash versions readWowheadHash understands: byte format 0–4, packed format 5. */
export const knownHashVersion = (v: number): boolean =>
  v <= 4 || (v >= PACKED_FROM_VERSION && v <= PACKED_MAX_VERSION);

/** Decodes the part after class/race, in either format. Throws on input that is not base64url. */
export function readWowheadHash(hash: string): WowheadHash {
  const out: WowheadHash = { version: 0, talents: '', items: [] };
  if (hash === '') return out;
  if (hashVersion(hash) >= PACKED_FROM_VERSION) {
    const { version, dataEnv, level, talents, items } = readPackedHash(hash);
    return { version, dataEnv, ...(level !== undefined && { level }), talents, items };
  }
  const binary = atob(hash.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Array.from(binary, (c) => c.charCodeAt(0));
  let pos = 0;
  const next = (): number => bytes[pos++] ?? 0;

  const version = next();
  out.version = version;
  if (version > 4) return out;
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
  if (version === 4) {
    readV4Items(next, () => bytes.length - pos, out.items);
    return out;
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

/**
 * Byte format version 4, what Wowhead's Classic Era planner writes (November 2026; read from its
 * planner code and checked against links it rewrote). After the talents: a count byte and that many
 * talent-version characters (skipped); then per item: slot byte (bit 7 enchant, bit 6 random suffix,
 * bit 5 second enchant) · item id in 3 bytes · each present value in 3 bytes; no gems.
 */
function readV4Items(next: () => number, left: () => number, items: WowheadHash['items']): void {
  for (let n = next(); n > 0; n--) next();
  const three = (): number => (next() << 16) | (next() << 8) | next();
  while (left() >= 3) {
    const slotByte = next();
    const item: WowheadHash['items'][number] = { slotId: slotByte & 31, itemId: three() };
    if (slotByte & 128) item.enchantSpellId = three();
    if (slotByte & 64) item.randomSuffix = three();
    if (slotByte & 32) three(); // second enchant
    items.push(item);
  }
}

export const wowheadImporter: Importer = {
  format: 'wowhead-url',
  detect(input: string): boolean {
    // A planner link anywhere in the text, or a lone Wowhead link of another kind (answered with an error
    // that says to use the planner, rather than "format not recognised").
    return (
      /wowhead\.com\/(?:[a-z-]+\/){0,2}gear-planner\/[a-z]/i.test(input) ||
      /^\S*wowhead\.com\/\S*$/i.test(input.trim())
    );
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
  const link = parseWowheadLink(input);
  if (!link)
    return fail(
      'This Wowhead link is not a gear planner link. Open your build in the planner (https://www.wowhead.com/forever/gear-planner) and copy the address from there: …/gear-planner/<class>/<race>/<code>.',
    );
  const { game, className, raceName } = link;
  let { hash } = link;

  const diags = new Diags();
  const gameName = GAME_NAMES[game] ?? `"${game}"`;
  if (game === 'classic') {
    diags.add(
      'PARSE-02',
      'info',
      'Link is from the Classic Era planner, not the WoW Forever one. Items are read by id; Forever changed some of them, so check the gear.',
      { field: 'gear' },
    );
  } else if (game === 'retail') {
    diags.add(
      'PARSE-02',
      'warning',
      'Link is from the retail WoW planner, whose gear code cannot be read here. Gear and talents skipped; use the WoW Forever planner (wowhead.com/forever/gear-planner).',
      { field: 'gear' },
    );
    hash = '';
  } else if (game !== 'forever') {
    diags.add(
      'PARSE-02',
      'warning',
      `Link is from the ${gameName} planner, not the WoW Forever one. Items that Forever does not have are skipped.`,
      { field: 'gear' },
    );
  }
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
  if (!knownHashVersion(decoded.version)) {
    diags.add(
      'PARSE-02',
      'warning',
      `Link format version ${decoded.version} is newer than this importer knows; gear and talents skipped.`,
      {
        field: 'gear',
      },
    );
  } else if (game === 'forever' && decoded.dataEnv !== undefined && decoded.dataEnv !== FOREVER_DATA_ENV) {
    diags.add(
      'PARSE-02',
      'info',
      `Link was made in Wowhead data set ${decoded.dataEnv}, not WoW Forever's (${FOREVER_DATA_ENV}). Check the gear.`,
      { field: 'gear' },
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
