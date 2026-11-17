// Wowhead's current gear planner hash ("packed" format), as written by the WoW Forever planner
// (https://www.wowhead.com/forever/gear-planner/<class>/<race>/<hash>, hash version 5, so the hash
// starts with "F"). Read from Wowhead's planner code (react chunk 286, module 5094, function `Pp`),
// November 2026. Not a byte format: each character is one base64url digit (6 bits), and every number
// is a prefix varint over those digits:
//   leading 1-bits of the first digit (bit 5 down) = extra digits; the rest of it = high bits;
//   n digits encode values from Σ 2^(5k), k < n (so 1 digit: 0–31, 2 digits: 32–1055, …).
// Layout after the version digit (Forever's planner config: classic talent calc, versioned talent
// hash, legacy calculator):
//   dataEnv · gender+1 · level ·
//   talents: per tree (3): digit count, then chunks of ≤ 7 talent digits, 3 bits each, first digit high ·
//   talent extra: length, then that many raw characters ("<talent tree version>[_…]") ·
//   [dataEnv 16 only] legacy calculator: length, then that many raw characters ·
//   items: count, then per item: flags (bit 7 random suffix, 6 upgrade rank, 5 reforge,
//     bits 2–4 gem count, bits 0–1 enchant count) · slot · item id · [suffix, sign in bit 0] ·
//     [upgrade] · [reforge] · gem item ids · enchant spell ids ·
//   shapeshift form.
// Versions below 5 are the older byte format (readWowheadHash in wowhead.ts).

export const HASH_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** First hash version in the packed format; Wowhead's planners with a legacy format use this cut-off. */
export const PACKED_FROM_VERSION = 5;
/** Newest packed version this reader knows (Wowhead's HASH_VERSION for the Forever planner). */
export const PACKED_MAX_VERSION = 5;
/** Wowhead's data environment id for WoW Forever (its `dataEnv`; tbc is 5, mop-classic 15). */
export const FOREVER_DATA_ENV = 16;

export interface PackedItem {
  slotId: number;
  itemId: number;
  /** First enchant (Wowhead stores enchants by spell id). 0 or absent: none. */
  enchantSpellId?: number;
  randomSuffix?: number;
}

export interface PackedHash {
  version: number;
  dataEnv: number;
  level?: number;
  talents: string;
  /** Wowhead's talent tree version tag ("vkndmh" in November 2026), when the link carries one. */
  talentVersion?: string;
  items: PackedItem[];
}

/** Version of a planner hash: the index of its first character in the base64url alphabet. */
export const hashVersion = (hash: string): number => HASH_ALPHABET.indexOf(hash.charAt(0));

/** Decodes a packed (version ≥ 5) hash. Throws on characters outside base64url. */
export function readPackedHash(hash: string): PackedHash {
  const version = hashVersion(hash);
  const out: PackedHash = { version, dataEnv: 0, talents: '', items: [] };
  if (version > PACKED_MAX_VERSION) return out;

  const digits = Array.from(hash.slice(1), (c) => {
    const d = HASH_ALPHABET.indexOf(c);
    if (d < 0) throw new Error(`"${c}" is not a planner hash character`);
    return d;
  });
  let pos = 0;
  const num = (): number => {
    if (pos >= digits.length) return 0;
    const first = digits[pos++]!;
    let length = 1;
    for (let probe = first; probe & 32 && length < 6; probe <<= 1) length++;
    let value = first & (63 >> length);
    let offset = 0;
    for (let k = 1; k < length; k++) {
      offset += 1 << (5 * k);
      value = value * 64 + (digits[pos++] ?? 0);
    }
    return value + offset;
  };
  const chars = (n: number): string => {
    const s = digits
      .slice(pos, pos + n)
      .map((d) => HASH_ALPHABET[d])
      .join('');
    pos += n;
    return s;
  };

  out.dataEnv = num();
  num(); // gender + 1
  const level = num();
  if (level) out.level = level;

  const trees: string[] = [];
  for (let t = 0; t < 3; t++) {
    let left = num();
    let tree = '';
    while (left > 0 && pos < digits.length) {
      let packed = num();
      let chunk = '';
      while (left > 0 && chunk.length < 7) {
        chunk = String(packed & 7) + chunk;
        packed >>= 3;
        left--;
      }
      tree += chunk;
    }
    trees.push(tree);
  }
  out.talents = trees.join('-').replace(/-+$/, '');
  const talentVersion = chars(num()).split('_')[0];
  if (talentVersion) out.talentVersion = talentVersion;

  if (out.dataEnv === FOREVER_DATA_ENV) chars(num()); // legacy calculator build; the engine has no use for it

  let count = num();
  while (count-- > 0 && pos < digits.length) {
    const flags = num();
    const item: PackedItem = { slotId: num(), itemId: num() };
    if (flags & 128) {
      const raw = num();
      item.randomSuffix = raw & 1 ? -(raw >> 1) : raw >> 1;
    }
    if (flags & 64) num(); // upgrade rank
    if (flags & 32) num(); // reforge
    for (let g = (flags >> 2) & 7; g > 0; g--) num(); // gem item ids
    const enchants: number[] = [];
    for (let e = flags & 3; e > 0; e--) enchants.push(num());
    if (enchants[0]) item.enchantSpellId = enchants[0];
    out.items.push(item);
  }
  return out;
}

/**
 * Encodes a packed hash the way Wowhead's planner does (its `h`), for tests and fixtures: only what
 * readPackedHash reads back (no gender, gems, upgrades or reforges).
 */
export function writePackedHash(h: Omit<PackedHash, 'version'> & { legacy?: string }): string {
  const out: number[] = [PACKED_MAX_VERSION];
  const num = (value: number): void => {
    let prefix = 0;
    for (let length = 1; length <= 5; length++) {
      if (value < 1 << (5 * length)) {
        const ds: number[] = [];
        for (let v = value; ds.length < length; v = Math.floor(v / 64)) ds.unshift(v & 63);
        ds[0]! |= prefix;
        out.push(...ds);
        return;
      }
      value -= 1 << (5 * length);
      prefix = (64 | prefix) >> 1;
    }
    throw new Error('Value too large to encode.');
  };
  const chars = (s: string): void => {
    num(s.length);
    out.push(...Array.from(s, (c) => HASH_ALPHABET.indexOf(c)));
  };

  num(h.dataEnv);
  num(0);
  num(h.level ?? 0);
  const trees = h.talents.split('-');
  for (let t = 0; t < 3; t++) {
    const tree = trees[t] ?? '';
    num(tree.length);
    for (let i = 0; i < tree.length; i += 7) {
      num([...tree.slice(i, i + 7)].reduce((acc, d) => (acc << 3) | Number(d), 0));
    }
  }
  chars(h.talentVersion ?? '');
  if (h.dataEnv === FOREVER_DATA_ENV) chars(h.legacy ?? '');
  num(h.items.length);
  for (const item of [...h.items].sort((a, b) => a.slotId - b.slotId)) {
    const flags = (item.randomSuffix ? 128 : 0) | (item.enchantSpellId ? 1 : 0);
    num(flags);
    num(item.slotId);
    num(item.itemId);
    if (item.randomSuffix) {
      const s = item.randomSuffix;
      num((Math.abs(s) << 1) | (s < 0 ? 1 : 0));
    }
    if (item.enchantSpellId) num(item.enchantSpellId);
  }
  return out.map((d) => HASH_ALPHABET[d]).join('');
}
