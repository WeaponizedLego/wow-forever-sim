import { readFileSync } from 'node:fs';
import { CharacterSchema, DUNGEON_SLICE_SEGMENTS, type FightStyleId, type SpecId } from '@fsim/contracts';
import {
  buildRaidSimRequest,
  characterFromPresets,
  loadDatabase,
  loadSpecPresets,
  sliceRanAsScheduled,
} from '@fsim/gamedata';
import { afterAll, describe, expect, it } from 'vitest';
import { withDatabases } from './database';
import { createVendorEngineClient, hasVendorEngine } from './node';

// Fight styles in the real engine (packages/engine/vendor, built by scripts/build-local.mjs, which applies our
// engine patch tools/engine-build/patches/fsim_slice_mob.go.txt). Skipped without a local engine, as in CI.

const root = new URL('../../../', import.meta.url);
const read = (p: string) => new Uint8Array(readFileSync(new URL(p, root)));

// "[12.34] [Name (#1)] [Target 3] {SpellID: 1680} Hit for 812.5 damage …" (the player or one of its pets).
const DAMAGE =
  /^\[(-?[\d.]+)\] \[[^\]]*\(#1\)[^\]]*\] \[Target (\d+)\] \{(\w+: \d+)[^}]*\} (?:tick )?\w+ for ([\d.]+) damage/;
const TARGET_EVENT = /^\[([\d.]+)\] \[Target (\d+)\] (fsim slice: spawned|Died)/;

// Fury/Arms Warrior: Whirlwind hits up to 4 targets, and Execute (rank 5, spell 20662) only lands in execute range.
const EXECUTE = 'SpellID: 20662';

/** Each slice mob's window, by 0-based target index, in encounter order. */
const WINDOWS = DUNGEON_SLICE_SEGMENTS.flatMap((seg, s) =>
  Array.from({ length: seg.mobs }, () => ({ seg: s, start: seg.startSec, end: seg.endSec })),
);

describe.skipIf(!hasVendorEngine())('fight styles in the engine', () => {
  const client = hasVendorEngine() ? createVendorEngineClient({ concurrency: 4 }) : undefined;
  afterAll(() => client?.dispose());
  const db = loadDatabase(read('fixtures/gamedata/db.bin'), read('fixtures/gamedata/leftover_db.bin'));

  async function sim(style: FightStyleId, iterations = 20, spec: SpecId = 'dps-warrior') {
    const presets = await loadSpecPresets(spec);
    const base = characterFromPresets(presets, presets.defaultBuildId);
    const character = CharacterSchema.parse({ ...base, encounter: { style } });
    const req = withDatabases(buildRaidSimRequest(character, presets, db, { iterations, seed: 7 }), db.raw);
    const res = await client!.raidSim(req);
    expect(res.error).toBeUndefined();
    return { character, res };
  }

  it('runs a dungeon slice as one fight: mobs live only in their windows', async () => {
    const { character, res } = await sim('dungeon-slice-5m');
    expect(res.encounterMetrics!.targets).toHaveLength(WINDOWS.length);
    expect(sliceRanAsScheduled(character.encounter, res)).toBe(true);

    const lines = res.logs.split('\n');
    // Spawns and deaths at exactly the scheduled times (iteration 1).
    const spawned = new Map<number, number>();
    const died = new Map<number, number>();
    for (const line of lines) {
      const m = TARGET_EVENT.exec(line);
      if (!m) continue;
      (m[3] === 'Died' ? died : spawned).set(Number(m[2]) - 1, Number(m[1]));
    }
    WINDOWS.forEach((w, i) => {
      if (w.start > 0) expect(spawned.get(i), `target ${i + 1} spawn`).toBe(w.start);
      else expect(spawned.has(i)).toBe(false);
      expect(died.get(i), `target ${i + 1} death`).toBe(w.end);
    });

    // Every hit lands on a mob inside its window, so nothing in the downtime between pulls.
    const hits = lines.flatMap((line) => {
      const m = DAMAGE.exec(line);
      return m ? [{ t: Number(m[1]), target: Number(m[2]) - 1, spell: m[3]!, amount: Number(m[4]) }] : [];
    });
    expect(hits.length).toBeGreaterThan(100);
    for (const h of hits) {
      const w = WINDOWS[h.target]!;
      expect(h.t, `hit on target ${h.target + 1}`).toBeGreaterThanOrEqual(w.start || -Infinity); // the first pull also takes pre-pull hits
      expect(h.t, `hit on target ${h.target + 1}`).toBeLessThanOrEqual(w.end);
    }

    const summary: string[] = [];
    DUNGEON_SLICE_SEGMENTS.forEach((seg, s) => {
      const inSeg = hits.filter((h) => WINDOWS[h.target]!.seg === s);
      const mobsHit = new Set(inSeg.map((h) => h.target)).size;
      // AoE: the most mobs of the pull one ability hit at one instant.
      const perCast = new Map<string, Set<number>>();
      for (const h of inSeg) {
        const k = `${h.t}|${h.spell}`;
        perCast.set(k, (perCast.get(k) ?? new Set()).add(h.target));
      }
      const widest = Math.max(...[...perCast.values()].map((v) => v.size));
      const dps = inSeg.reduce((a, h) => a + h.amount, 0) / (seg.endSec - seg.startSec);
      // Execute only in the last 20% of the mob's own life.
      const executes = inSeg.filter((h) => h.spell === EXECUTE);
      for (const h of executes)
        expect(h.t).toBeGreaterThanOrEqual(seg.endSec - 0.2 * (seg.endSec - seg.startSec));
      summary.push(
        `${seg.label.padEnd(6)} ${String(seg.startSec).padStart(3)}–${String(seg.endSec).padEnd(3)} s  ${seg.mobs} mob(s): ` +
          `${mobsHit} hit, widest AoE ${widest}, ${executes.length} Executes, ${dps.toFixed(0)} DPS in window`,
      );
      expect(mobsHit).toBeGreaterThanOrEqual(Math.min(seg.mobs, 3));
      expect(widest).toBeGreaterThanOrEqual(Math.min(seg.mobs, 3));
      if (seg.kind === 'boss') expect(mobsHit).toBe(1);
      expect(executes.length).toBeGreaterThan(0);
    });
    console.info(
      `dungeon slice, Warrior, iteration 1 (${res.raidMetrics!.dps!.avg.toFixed(1)} DPS over ${res.iterationsDone} iterations):\n${summary.join('\n')}`,
    );
  }, 120_000);

  it('runs Patchwerk on one boss for the whole fight', async () => {
    for (const style of ['patchwerk-3m', 'patchwerk-5m'] as const) {
      const { res } = await sim(style, 10);
      expect(res.encounterMetrics!.targets).toHaveLength(1);
      const hits = res.logs.split('\n').filter((l) => DAMAGE.test(l));
      const last = Math.max(...hits.map((l) => Number(DAMAGE.exec(l)![1])));
      expect(last).toBeGreaterThan(style === 'patchwerk-3m' ? 170 : 290);
    }
  }, 120_000);

  // The slice is not "Patchwerk with breaks": its mobs are level 62 (Patchwerk's boss is 63) and packs of 2–5
  // take cleave and AoE. Single-target specs lose DPS to the 40 s of downtime; cleave specs gain from the extra
  // mobs. QA saw Fury go 950 → 1,117 DPS and read it as a gear gain, so this pins down where the gap comes from.
  it('slice vs Patchwerk: single-target specs drop, cleave gains come from extra mobs, DPS is over 300 s', async () => {
    const lines: string[] = [];
    for (const spec of ['dps-warrior', 'mage', 'warlock', 'hunter'] as const) {
      const pw = (await sim('patchwerk-3m', 60, spec)).res;
      const slice = (await sim('dungeon-slice-5m', 60, spec)).res;
      const player = slice.raidMetrics!.parties[0]!.players[0]!;
      // Damage per target unit index, the player's and its pets'.
      const byTarget = new Map<number, number>();
      for (const unit of [player, ...player.pets])
        for (const a of unit.actions)
          for (const t of a.targets) byTarget.set(t.unitIndex, (byTarget.get(t.unitIndex) ?? 0) + t.damage);
      const total = [...byTarget.values()].reduce((a, b) => a + b, 0) / slice.iterationsDone;
      // Each pull's first mob takes the single-target damage; the rest is cleave, AoE and spread DoTs.
      const units = slice.encounterMetrics!.targets.map((t) => t.unitIndex);
      let first = 0;
      let primary = 0;
      for (const seg of DUNGEON_SLICE_SEGMENTS) {
        primary += byTarget.get(units[first]!) ?? 0;
        first += seg.mobs;
      }
      const extraShare = 1 - primary / slice.iterationsDone / total;
      const pwDps = pw.raidMetrics!.dps!.avg;
      const sliceDps = slice.raidMetrics!.dps!.avg;

      // The whole 300 s, downtime included, is the denominator.
      expect(slice.avgIterationDuration).toBe(300);
      expect(sliceDps * 300).toBeGreaterThan(total * 0.97);
      expect(sliceDps * 300).toBeLessThan(total * 1.03);

      if (spec === 'mage') expect(extraShare).toBeLessThan(0.01);
      if (spec === 'mage' || spec === 'warlock') expect(sliceDps).toBeLessThan(pwDps);
      if (spec === 'dps-warrior') {
        expect(extraShare).toBeGreaterThan(0.15);
        expect(sliceDps).toBeGreaterThan(pwDps);
        // Without the extra mobs it would be below Patchwerk.
        expect(sliceDps * (1 - extraShare)).toBeLessThan(pwDps);
      }
      lines.push(
        `${spec.padEnd(12)} PW 3m ${pwDps.toFixed(0).padStart(5)}  slice ${sliceDps.toFixed(0).padStart(5)}  ` +
          `${(100 * extraShare).toFixed(0)}% of slice damage on extra mobs`,
      );
    }
    console.info(`slice vs Patchwerk (60 iterations):\n${lines.join('\n')}`);
  }, 120_000);
});
