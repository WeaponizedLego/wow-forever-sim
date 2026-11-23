import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  actionNameGaps,
  actionNameSources,
  buildSpellNames,
  characterFromPresets,
  buildRaidSimRequest,
  fillFromPreset,
  findRotation,
  loadDatabase,
  loadSpecPresets,
  loadSpellNames,
  toImportContext,
  type ActionRef,
  type SpecPresets,
} from '@fsim/gamedata';
import { importAny } from '@fsim/importers';
import type { RaidSimResult, UnitMetrics } from '@fsim/proto/api';
import type { ActionID } from '@fsim/proto/common';
import { SPECS, type Character } from '@fsim/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { withDatabases } from './database';
import { createNodeEngineClient } from './node';

// The action ids of real runs: every spec's preset builds on their own rotation, and a Wowhead-imported Hunter,
// simmed in the engine the app stages (apps/web/public/engine, `node apps/web/scripts/stage-engine.mjs`). Skipped
// when none is staged, as in CI's unit job. fixtures/engine/action-ids.json keeps the ids these runs report and
// the `gaps` in their names (an id with no name, two rows that read the same); the gamedata test holds the names
// to that file offline. UPDATE_ACTION_IDS=1 rewrites the file from these runs.
//
// Engine sync does that on every sync, so the file follows the presets: it sets ACTION_IDS_ENGINE_DIR to the
// folder of the build it is about to publish (lib.wasm.gz, wasm_exec.js), which nothing has staged yet. With that
// set the test never skips, so a missing build fails the sync instead of leaving the file as it was. A spec that
// cannot be simmed fails it too. A gap in the names does not: the sync records it and opens an issue, since an
// engine a day behind is worse for a player than one row called "Spell 12345".

const root = new URL('../../../', import.meta.url);
const read = (p: string) => new Uint8Array(readFileSync(new URL(p, root)));
const json = <T>(p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8')) as T;
const STAGED = 'apps/web/public/engine/';
const built = process.env.ACTION_IDS_ENGINE_DIR;

/** Which engine to sim in: its id and commit, and the folder holding its files. */
function findEngine(): { engineId: string; commit: string; dir: string } | null {
  if (built) {
    const lock = json<{ engineId: string; upstream: { commit: string } }>('engine.lock.json');
    return { engineId: lock.engineId, commit: lock.upstream.commit, dir: built };
  }
  if (!existsSync(new URL(`${STAGED}current.json`, root))) return null;
  const { engineId, commit } = json<{ engineId: string; commit: string }>(`${STAGED}current.json`);
  return { engineId, commit, dir: fileURLToPath(new URL(`${STAGED}${engineId}/`, root)) };
}
const current = findEngine();
const FIXTURE = new URL('fixtures/engine/action-ids.json', root);

function ref(id: ActionID | undefined): ActionRef {
  const raw = id?.rawId;
  const tag = id?.tag ?? 0;
  if (raw?.oneofKind === 'spellId') return { kind: 'spell', id: raw.spellId, tag };
  if (raw?.oneofKind === 'itemId') return { kind: 'item', id: raw.itemId, tag };
  if (raw?.oneofKind === 'otherId') return { kind: 'other', id: raw.otherId, tag };
  return { kind: 'other', id: 0, tag };
}
const key = (a: ActionRef) => `${a.kind}:${a.id}${a.tag ? `#${a.tag}` : ''}`;
const LOG_ID = /\{(SpellID|ItemID|OtherID): (-?\d+)(?:, Tag: (-?\d+))?\}/;
const PLAYER_AURA = /^\[-?[\d.]+\] \[[^\]]*\(#1\)\] Aura (?:gained|faded|refreshed): (\{[^}]*\})/;

/** What the run page names: damage rows (with their owner), the player's aura lanes, and everything else. */
function runActionIds(res: RaidSimResult) {
  const player = res.raidMetrics!.parties[0]!.players[0]!;
  const enemies = new Set(res.encounterMetrics?.targets.map((t) => t.unitIndex) ?? []);
  const abilities: [string, string | null][] = [];
  const all = new Set<string>();
  const units: [UnitMetrics, string | null][] = [
    [player, null],
    ...player.pets.map((p) => [p, p.name] as [UnitMetrics, string]),
  ];
  for (const [unit, owner] of units) {
    for (const a of unit.actions) {
      all.add(key(ref(a.id)));
      if (a.targets.some((t) => enemies.has(t.unitIndex) && t.damage > 0))
        abilities.push([key(ref(a.id)), owner]);
    }
    for (const a of unit.auras) all.add(key(ref(a.id)));
  }
  const auras = new Set<string>();
  for (const line of res.logs.split('\n')) {
    const m = PLAYER_AURA.exec(line);
    const id = m && LOG_ID.exec(m[1]!);
    if (!id) continue;
    const kind = id[1] === 'SpellID' ? 'spell' : id[1] === 'ItemID' ? 'item' : 'other';
    auras.add(key({ kind, id: Number(id[2]), tag: id[3] ? Number(id[3]) : 0 }));
  }
  for (const a of auras) all.add(a);
  // The engine lists a unit's actions in no fixed order; sorted, the file changes only when the ids do.
  abilities.sort((a, b) => `${a[1] ?? ''}|${a[0]}`.localeCompare(`${b[1] ?? ''}|${b[0]}`));
  return { abilities, auras: [...auras].sort(), all: [...all].sort() };
}

describe.skipIf(!current)('action names in real runs', () => {
  const client = current
    ? createNodeEngineClient({
        concurrency: 2,
        sources: { wasm: join(current.dir, 'lib.wasm.gz'), wasmExec: join(current.dir, 'wasm_exec.js') },
        version: { engineId: current.engineId, commit: current.commit, dataBuild: null },
      })
    : undefined;
  afterAll(() => client?.dispose());
  const db = loadDatabase(read('fixtures/gamedata/db.bin'), read('fixtures/gamedata/leftover_db.bin'));

  it('reports the ids the fixture holds, with no gap in their names the fixture does not list', async () => {
    const src = actionNameSources(db, buildSpellNames(db.raw.spellIcons, await loadSpellNames()));
    const runs: [string, Character, SpecPresets][] = [];
    for (const spec of SPECS) {
      const presets = await loadSpecPresets(spec.id);
      for (const build of presets.builds.length ? presets.builds.map((b) => b.id) : [null]) {
        const character = characterFromPresets(presets, build ?? presets.defaultBuildId);
        // Healers have no rotation upstream, so there is nothing to sim.
        const rotation = character.rotation.kind === 'preset' ? character.rotation.presetId : '';
        if (findRotation(presets, rotation)?.kind !== 'apl') continue;
        runs.push([`${spec.id}/${build ?? 'default'}`, character, presets]);
      }
    }
    const url = readFileSync(
      new URL('fixtures/import/real/wowhead-forever-sv-hunter.url', root),
      'utf8',
    ).trim();
    const imported = importAny(url, toImportContext(db, 'fixture')).character!;
    const hunter = await loadSpecPresets(imported.spec);
    runs.push(['import/wowhead-hunter', fillFromPreset(imported, hunter), hunter]);

    const out: Record<string, ReturnType<typeof runActionIds>> = {};
    const gaps: string[] = [];
    for (const [name, character, presets] of runs) {
      const req = withDatabases(
        buildRaidSimRequest(character, presets, db, { iterations: 20, seed: 1 }),
        db.raw,
      );
      req.simOptions!.debugFirstIteration = true;
      const res = await client!.raidSim(req);
      expect(res.error, name).toBeUndefined();
      expect(res.raidMetrics!.dps!.avg, `${name} DPS`).toBeGreaterThan(0);
      out[name] = runActionIds(res);
      gaps.push(...actionNameGaps(out[name], src).map((gap) => `${name}: ${gap}`));
    }
    console.info(
      `${runs.length} runs, ${gaps.length} gaps in their names${gaps.map((g) => `\n  ${g}`).join('')}`,
    );

    if (process.env.UPDATE_ACTION_IDS) {
      const body = { engine: current!.engineId, gaps, runs: out };
      writeFileSync(FIXTURE, `${JSON.stringify(body, null, 2)}\n`);
    } else {
      const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
        gaps: string[];
        runs: Record<string, { all: string[] }>;
      };
      // The offline fixture must hold every id these runs report, so the gamedata test covers them.
      for (const [name, ids] of Object.entries(out))
        expect(
          ids.all.filter((k) => !fixture.runs[name]?.all.includes(k)),
          `${name}: run UPDATE_ACTION_IDS=1`,
        ).toEqual([]);
      expect(
        gaps.filter((g) => !fixture.gaps.includes(g)),
        'gaps the fixture does not list: name them in packages/gamedata/src (action-names.ts, spell-names.ts)',
      ).toEqual([]);
    }
  });
});
