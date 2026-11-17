// The game client's talent loadout string (`C_Traits.GenerateImportString`, what the SimC addon writes as
// `talents=`) → the engine's talent string. See README.md, "SimC", point 2.
//
// Format (Blizzard_ClassTalentImportExport.lua, ExportUtil.lua): base64 (A–Z a–z 0–9 + /), each character 6 bits,
// least significant bit first, values read least significant bit first. Header: version (8 bits), spec id (16), tree
// hash (16 × 8). Then one entry per node of the class's trait tree, in node id order:
//   selected (1) — if set: purchased (1, version 2 only) — if purchased: partially ranked (1) [+ ranks (6)],
//   choice node (1) [+ choice index (2)].
// A fully ranked node is at the game's maximum rank, which we take from the engine's tree (same data build).
//
// The node list per class: SimC's trait data (loadout-nodes.json, from simulationcraft/simc-forever's client data)
// gives node and definition ids, including the "parked" retired talents the engine's trees leave out (hunter 2,
// priest 1). Should the engine ever have a talent the table lacks (newer than its build), it is slotted in by
// definition id, since node id order equals definition id order in every class (checked by a test, and against
// Wowhead's node ids in fixtures/import/real/wowhead-forever-trait-nodes.json). A class is `verified` only when the
// string's tree hash is one a real export has confirmed; otherwise the result is validated and returned as
// `unverified`.
import type { ClassId } from '@fsim/contracts';
import druid from '../../gamedata/data/talents/druid.json';
import hunter from '../../gamedata/data/talents/hunter.json';
import mage from '../../gamedata/data/talents/mage.json';
import paladin from '../../gamedata/data/talents/paladin.json';
import priest from '../../gamedata/data/talents/priest.json';
import rogue from '../../gamedata/data/talents/rogue.json';
import shaman from '../../gamedata/data/talents/shaman.json';
import warlock from '../../gamedata/data/talents/warlock.json';
import warrior from '../../gamedata/data/talents/warrior.json';
import simcNodes from './loadout-nodes.json';

/** What the importer needs of the engine's trees (packages/gamedata/data/talents). */
interface TreeTalent {
  name: string;
  row: number;
  maxPoints: number;
  definitionId: number;
  prereq?: number;
}
type Trees = { name: string; talents: TreeTalent[] }[];
export const ENGINE_TREES: Record<ClassId, Trees> = {
  warrior: warrior.trees,
  paladin: paladin.trees,
  hunter: hunter.trees,
  rogue: rogue.trees,
  priest: priest.trees,
  shaman: shaman.trees,
  mage: mage.trees,
  warlock: warlock.trees,
  druid: druid.trees,
};

/**
 * Trees whose node list a real export has confirmed: the client's tree hash, its spec id, and where it came from.
 * Add one per real export that decodes to a build the player recognises.
 */
export const VERIFIED_TREES: Partial<Record<ClassId, { hash: string; spec: number; source: string }[]>> = {
  warrior: [
    {
      hash: 'f6417747ed078fbcc4249206e22f07b8',
      spec: 1491,
      source:
        'fixtures/import/real/simc-warrior-lvl11.simc (client 1.60.1.70338, the 52-node tree before 70790)',
    },
  ],
  hunter: [
    {
      hash: '1977b07a281e41b90b6c7a876fe4df91',
      spec: 1485,
      source: 'fixtures/import/real/simc-hunter-lvl11.simc (client 1.60.1.70450)',
    },
  ],
  shaman: [
    {
      hash: 'f3647be8b5182a21936cfa483fc957df',
      spec: 1489,
      source:
        'fixtures/import/real/simc-shaman-lvl42.simc (client 1.60.1.70888) and simc-shaman-lvl20.simc (1.60.1.70374)',
    },
  ],
  warlock: [
    {
      hash: '1aadfcfa379630fa406798e1f713b714',
      spec: 1490,
      source: 'fixtures/import/real/simc-warlock-lvl10.simc (client 1.60.1.70291)',
    },
  ],
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const MAX_POINTS = 51;
const POINTS_PER_ROW = 5;

export interface LoadoutNode {
  node: number | null;
  definitionId: number;
  name: string;
  /** Where the talent sits in the engine's trees; absent for a node the engine does not have (retired talents). */
  tree?: number;
  index?: number;
}

/** The class's trait tree nodes in loadout order. */
export function loadoutNodes(cls: ClassId): LoadoutNode[] {
  const byDef = new Map<number, LoadoutNode>();
  for (const [node, def, , name] of (
    simcNodes.classes as unknown as Record<string, [number, number, number, string][]>
  )[cls] ?? [])
    byDef.set(def, { node, definitionId: def, name });
  ENGINE_TREES[cls].forEach((tree, t) =>
    tree.talents.forEach((talent, i) => {
      const known = byDef.get(talent.definitionId);
      byDef.set(talent.definitionId, {
        node: known?.node ?? null,
        definitionId: talent.definitionId,
        name: talent.name,
        tree: t,
        index: i,
      });
    }),
  );
  return [...byDef.values()].sort((a, b) => a.definitionId - b.definitionId);
}

export interface LoadoutHeader {
  version: number;
  spec: number;
  /** 32 hex digits; all zeros when the exporter left it out. */
  hash: string;
}

export type LoadoutResult =
  | { ok: true; talents: string; verified: boolean; header: LoadoutHeader; notes: string[] }
  | { ok: false; reason: string; header?: LoadoutHeader };

/** Reads a loadout string for the class. Never throws. */
export function loadoutToTalents(cls: ClassId, loadout: string): LoadoutResult {
  const bits: number[] = [];
  for (const ch of loadout.trim()) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return { ok: false, reason: `"${ch}" is not a loadout string character.` };
    for (let i = 0; i < 6; i++) bits.push((v >> i) & 1);
  }
  let pos = 0;
  const take = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v |= (bits[pos++] ?? 0) << i;
    return v;
  };
  if (bits.length < 152) return { ok: false, reason: 'The loadout string is shorter than its header.' };
  const version = take(8);
  const spec = take(16);
  let hash = '';
  for (let i = 0; i < 16; i++) hash += take(8).toString(16).padStart(2, '0');
  const header = { version, spec, hash };
  if (version !== 1 && version !== 2)
    return { ok: false, header, reason: `Loadout format version ${version} is not one this importer reads.` };

  const trees = ENGINE_TREES[cls];
  const points = trees.map((t) => t.talents.map(() => 0));
  const notes: string[] = [];
  for (const n of loadoutNodes(cls)) {
    if (pos >= bits.length)
      return { ok: false, header, reason: 'The loadout string ends before the class’s talent tree does.' };
    if (!take(1)) continue;
    const purchased = version < 2 || take(1) === 1;
    if (!purchased) continue; // granted for free: not a talent point
    const partial = take(1) === 1 ? take(6) : null;
    if (take(1)) {
      take(2);
      return { ok: false, header, reason: `${n.name} is read as a choice node, which no classic tree has.` };
    }
    if (n.tree === undefined || n.index === undefined)
      return {
        ok: false,
        header,
        reason: `It selects ${n.name}, a talent the engine’s trees do not have (retired, or a different tree).`,
      };
    const max = trees[n.tree]!.talents[n.index]!.maxPoints;
    const ranks = partial ?? max;
    if (ranks < 1 || ranks > max)
      return { ok: false, header, reason: `${n.name} at rank ${ranks}; the engine’s tree has ${max}.` };
    points[n.tree]![n.index] = ranks;
  }
  if (pos > bits.length)
    return { ok: false, header, reason: 'The loadout string ends before the class’s talent tree does.' };
  const rest = bits.slice(pos);
  if (rest.includes(1))
    return {
      ok: false,
      header,
      reason:
        'It selects talents past the end of the tree this importer knows (the game’s tree has newer nodes).',
    };
  if (rest.length >= 6)
    notes.push(`The client’s tree has ${rest.length - 5}+ more nodes than the table; none chosen.`);

  const total = points.flat().reduce((a, b) => a + b, 0);
  if (total > MAX_POINTS)
    return { ok: false, header, reason: `It reads as ${total} points; the most is ${MAX_POINTS}.` };
  const verified =
    hash !== '0'.repeat(32) &&
    rest.length < 6 &&
    (VERIFIED_TREES[cls] ?? []).some((v) => v.hash === hash && v.spec === spec);
  const broken = brokenTalentNames(trees, points);
  if (broken.length)
    return {
      ok: false,
      header,
      reason: verified
        ? // The layout is right (a checked tree), so the build is one the client allowed when it was exported but
          // the current tree forbids: a talent moved rows since (shaman Improved Ghost Wolf, 70374 → 70938).
          `It reads as a build the current tree rules forbid (${broken.join(', ')}); talents have moved since this export.`
        : `It reads as a build the tree rules forbid (${broken.join(', ')}), so the node table does not match this client.`,
    };

  const talents = points
    .map((tree) => tree.join('').replace(/0+$/, ''))
    .join('-')
    .replace(/-+$/, '');
  return { ok: true, talents, verified, header, notes };
}

/** Talents whose row or prerequisite the points do not meet (the game's rules, as packages/gamedata applies them). */
function brokenTalentNames(trees: Trees, points: number[][]): string[] {
  return trees.flatMap((tree, t) => {
    const pts = points[t]!;
    let above = 0;
    let row = 0;
    let inRow = 0;
    const broken: boolean[] = [];
    tree.talents.forEach((talent, i) => {
      if (talent.row !== row) {
        above += inRow;
        inRow = 0;
        row = talent.row;
      }
      const pre = talent.prereq;
      broken[i] =
        pts[i]! > 0 &&
        (above < talent.row * POINTS_PER_ROW ||
          (pre !== undefined && (broken[pre] || pts[pre]! < tree.talents[pre]!.maxPoints)));
      if (!broken[i]) inRow += pts[i]!;
    });
    return tree.talents.filter((_, i) => broken[i]).map((x) => x.name);
  });
}

/**
 * The loadout string the game would write for an engine talent string, for tests: every node in `loadoutNodes`
 * order, maximum ranks as "fully ranked". `hash` is 32 hex digits.
 */
export function talentsToLoadout(
  cls: ClassId,
  talents: string,
  { version = 2, spec = 0, hash = '0'.repeat(32) }: { version?: number; spec?: number; hash?: string } = {},
): string {
  const bits: number[] = [];
  const put = (v: number, n: number) => {
    for (let i = 0; i < n; i++) bits.push((v >> i) & 1);
  };
  put(version, 8);
  put(spec, 16);
  for (let i = 0; i < 16; i++) put(parseInt(hash.slice(i * 2, i * 2 + 2), 16), 8);
  const parts = talents.split('-');
  for (const n of loadoutNodes(cls)) {
    const rank = n.tree === undefined ? 0 : Number(parts[n.tree]?.charAt(n.index!) || 0);
    if (!rank) {
      put(0, 1);
      continue;
    }
    put(1, 1);
    if (version >= 2) put(1, 1);
    const max = ENGINE_TREES[cls][n.tree!]!.talents[n.index!]!.maxPoints;
    if (rank < max) {
      put(1, 1);
      put(rank, 6);
    } else put(0, 1);
    put(0, 1);
  }
  while (bits.length % 6) bits.push(0);
  let out = '';
  for (let i = 0; i < bits.length; i += 6) {
    let v = 0;
    for (let k = 0; k < 6; k++) v |= bits[i + k]! << k;
    out += ALPHABET[v];
  }
  return out;
}
