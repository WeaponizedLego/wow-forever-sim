import { readFileSync } from 'node:fs';
import { CLASS_IDS, SPECS } from '@fsim/contracts';
import type { ClassId } from '@fsim/contracts';
import { describe, expect, it } from 'vitest';
import realLoadouts from '../../../fixtures/import/real/loadouts.json';
import wowheadNodes from '../../../fixtures/import/real/wowhead-forever-trait-nodes.json';
import { importAny } from './index';
import { ENGINE_TREES, loadoutNodes, loadoutToTalents, talentsToLoadout, VERIFIED_TREES } from './loadout';
import simcNodes from './loadout-nodes.json';
import { readFixture, testContext } from './test-context';

const REAL_SHAMAN = 'CEdBzT2eoXLGqEykspPS/k8VfDGYAMzMuAzYGzHAAAA';
const SHAMAN_HASH = 'f3647be8b5182a21936cfa483fc957df';

/** Every preset talent string upstream ships, per class. */
const presetStrings = () => {
  const out: [(typeof SPECS)[number]['class'], string][] = [];
  for (const spec of SPECS) {
    const file = new URL(`../../gamedata/data/presets/${spec.id}.json`, import.meta.url);
    const presets = JSON.parse(readFileSync(file, 'utf8')) as { talents: { talents: string }[] };
    for (const t of presets.talents) out.push([spec.class, t.talents]);
  }
  return out;
};
const trim = (s: string) => s.replace(/0+(?=-|$)/g, '').replace(/-+$/, '');

describe('client loadout string → engine talents', () => {
  it('reads the real level 42 shaman export (golden): Enhancement 25, Restoration 8, verified', () => {
    const r = loadoutToTalents('shaman', REAL_SHAMAN);
    expect(r).toMatchObject({
      ok: true,
      talents: '-0530303100212122-053',
      verified: true,
      header: { version: 2, spec: 1489, hash: SHAMAN_HASH },
      notes: [],
    });
    // 42 - 9 = 33 talent points: the whole build, nothing left over.
    const pts = r.ok ? [...r.talents].filter((c) => /\d/.test(c)).reduce((a, c) => a + Number(c), 0) : 0;
    expect(pts).toBe(33);
  });

  it('encodes the real shaman build back to the exact string the client wrote', () => {
    expect(talentsToLoadout('shaman', '-0530303100212122-053', { spec: 1489, hash: SHAMAN_HASH })).toBe(
      REAL_SHAMAN,
    );
  });

  it('round-trips every upstream preset build through the loadout format, for every class', () => {
    const seen = new Set<string>();
    for (const [cls, talents] of presetStrings()) {
      seen.add(cls);
      const r = loadoutToTalents(cls, talentsToLoadout(cls, talents));
      // A preset upstream's own trees break (healer-priest/holy) is refused, not misread.
      if (!r.ok) {
        expect(r.reason, `${cls} ${talents}`).toMatch(/tree rules forbid/);
        continue;
      }
      expect(r.talents, `${cls} ${talents}`).toBe(trim(talents));
      expect(r.verified).toBe(false); // zero hash
    }
    expect([...seen].sort()).toEqual([...CLASS_IDS].sort());
  });

  it('reads the version 1 format (no purchased bit) and partial ranks', () => {
    const s = talentsToLoadout('shaman', '-0530303100212122-053', {
      version: 1,
      spec: 1489,
      hash: SHAMAN_HASH,
    });
    expect(loadoutToTalents('shaman', s)).toMatchObject({ ok: true, talents: '-0530303100212122-053' });
  });

  it('is verified only for a checked tree hash and spec', () => {
    const other = talentsToLoadout('shaman', '-0530303100212122-053', { spec: 1489, hash: 'ab'.repeat(16) });
    expect(loadoutToTalents('shaman', other)).toMatchObject({ ok: true, verified: false });
    const warrior = talentsToLoadout('warrior', '30303213132215201-55050000002-2', {
      spec: 1,
      hash: SHAMAN_HASH,
    });
    expect(loadoutToTalents('warrior', warrior)).toMatchObject({ ok: true, verified: false });
  });

  it('refuses instead of guessing', () => {
    expect(loadoutToTalents('shaman', 'C!AAAA')).toMatchObject({
      ok: false,
      reason: /not a loadout string character/,
    });
    expect(loadoutToTalents('shaman', 'CEdB')).toMatchObject({
      ok: false,
      reason: /shorter than its header/,
    });
    // Version 3.
    expect(loadoutToTalents('shaman', 'D' + 'A'.repeat(40))).toMatchObject({
      ok: false,
      reason: /version 3/,
    });
    // The real string read as another class: wrong node list, so the build breaks the rules or overruns.
    for (const cls of CLASS_IDS.filter((c) => c !== 'shaman'))
      expect(loadoutToTalents(cls, REAL_SHAMAN).ok, cls).toBe(false);
    // A bit set past the last node the table knows.
    const tail =
      talentsToLoadout('shaman', '-0530303100212122-053', { spec: 1489, hash: SHAMAN_HASH }) + 'AE';
    expect(loadoutToTalents('shaman', tail)).toMatchObject({ ok: false, reason: /past the end/ });
    // Trailing zero characters: more (unchosen) nodes than the table, converted but never verified.
    const zeros = loadoutToTalents('shaman', REAL_SHAMAN + 'AA');
    expect(zeros).toMatchObject({ ok: true, verified: false, talents: '-0530303100212122-053' });
  });

  it('refuses a selected node the engine trees lack (a retired, parked talent)', () => {
    const nodes = loadoutNodes('hunter');
    const parked = nodes.findIndex((n) => n.tree === undefined);
    expect(parked).toBeGreaterThanOrEqual(0);
    // Header (version 2, zero spec and hash), then only the parked node selected and fully ranked.
    const bits = [0, 1, 0, 0, 0, 0, 0, 0, ...Array(16 + 128).fill(0)];
    nodes.forEach((_, i) => bits.push(...(i === parked ? [1, 1, 0, 0] : [0])));
    while (bits.length % 6) bits.push(0);
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let s = '';
    for (let i = 0; i < bits.length; i += 6)
      s += A[bits.slice(i, i + 6).reduce((v, b, k) => v | (b << k), 0)];
    expect(loadoutToTalents('hunter', s)).toMatchObject({ ok: false, reason: /engine’s trees do not have/ });
  });
});

interface RealExport {
  file: string;
  class: ClassId;
  level: number;
  loadout: string;
  spec: number;
  hash: string;
  /** What it converts to; null when the importer refuses it, with `decoded` the build the string holds. */
  talents: string | null;
  decoded?: string;
}
const REAL = realLoadouts.exports as RealExport[];

describe('real client exports (fixtures/import/real/loadouts.json)', () => {
  it.each(REAL)('$file: the export’s talents= is the listed string', ({ file, loadout }) => {
    const line = readFixture(`real/${file}`).match(/^talents=(.*)$/m)?.[1];
    expect(line).toBe(loadout);
  });

  it.each(REAL.filter((x) => x.talents !== null))(
    '$file decodes to $talents, verified, and encodes back to the exact string',
    ({ class: cls, loadout, spec, hash, talents }) => {
      expect(loadoutToTalents(cls, loadout)).toEqual({
        ok: true,
        talents,
        verified: true,
        header: { version: 2, spec, hash },
        notes: [],
      });
      expect(talentsToLoadout(cls, talents!, { spec, hash })).toBe(loadout);
    },
  );

  it.each(REAL.filter((x) => x.talents === null))(
    '$file holds $decoded, which today’s tree forbids: refused, and the reason says why',
    ({ class: cls, loadout, spec, hash, decoded }) => {
      expect(talentsToLoadout(cls, decoded!, { spec, hash })).toBe(loadout);
      expect(loadoutToTalents(cls, loadout)).toMatchObject({
        ok: false,
        header: { spec, hash },
        reason: /current tree rules forbid .*moved since this export/,
      });
    },
  );

  it.each(REAL.filter((x) => x.talents !== null))(
    '$file imports through SimC without TALENT-08',
    ({ file, class: cls, talents }) => {
      const r = importAny(readFixture(`real/${file}`), testContext());
      expect(r.character).toMatchObject({ class: cls, talents });
      expect(r.diagnostics.filter((d) => d.field === 'talents')).toEqual([]);
    },
  );

  it('pins one tree per class with a real export, and only those', () => {
    const pinned = Object.entries(VERIFIED_TREES).flatMap(([cls, trees]) =>
      trees.map((t) => `${cls} ${t.spec} ${t.hash}`),
    );
    const seen = [...new Set(REAL.map((x) => `${x.class} ${x.spec} ${x.hash}`))];
    expect(pinned.sort()).toEqual(seen.sort());
  });
});

describe('node table', () => {
  const table = simcNodes.classes as unknown as Record<string, [number, number, number, string][]>;

  it('has node id order equal to definition id order in every class (what lets newer talents slot in)', () => {
    for (const cls of CLASS_IDS) {
      const rows = table[cls]!;
      const defs = rows.map((r) => r[1]);
      expect(defs, cls).toEqual([...defs].sort((a, b) => a - b));
    }
  });

  it('places every engine talent exactly once', () => {
    for (const cls of CLASS_IDS) {
      const placed = loadoutNodes(cls).filter((n) => n.tree !== undefined);
      expect(placed.length, cls).toBe(ENGINE_TREES[cls].reduce((n, t) => n + t.talents.length, 0));
    }
  });

  it('has a node id for every engine talent; the only parked nodes are hunter 2 and priest 1', () => {
    for (const cls of CLASS_IDS) {
      const nodes = loadoutNodes(cls);
      expect(
        nodes.filter((n) => n.node === null).map((n) => n.name),
        cls,
      ).toEqual([]);
      const parked = nodes.filter((n) => n.tree === undefined).map((n) => n.name);
      expect(parked, cls).toEqual(
        { hunter: ['Lightning Reflexes', 'Improved Serpent Sting'], priest: ['Holy Specialization'] }[
          cls as string
        ] ?? [],
      );
    }
  });

  it('agrees with the node ids in Wowhead’s Forever talent calculator, for every class', () => {
    const wh = wowheadNodes.classes as Record<string, number[][]>;
    for (const cls of CLASS_IDS) {
      const ours = loadoutNodes(cls)
        .filter((n) => n.tree !== undefined)
        .map((n) => [n.node, n.definitionId]);
      expect(ours, cls).toEqual(wh[cls]);
    }
  });
});
