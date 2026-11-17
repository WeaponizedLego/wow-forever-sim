import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  actionName,
  actionNameSources,
  buildSpellNames,
  characterFromPresets,
  buildRaidSimRequest,
  distinctActionNames,
  fillFromPreset,
  loadDatabase,
  loadSpecPresets,
  loadSpellNames,
  toImportContext,
  type ActionRef,
} from '@fsim/gamedata';
import { importAny } from '@fsim/importers';
import type { RaidSimResult, UnitMetrics } from '@fsim/proto/api';
import type { ActionID } from '@fsim/proto/common';
import type { Character } from '@fsim/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { withDatabases } from './database';
import { createNodeEngineClient } from './node';

// Names every action of real runs: the Warrior presets and a Wowhead-imported Hunter, simmed in the engine the
// app stages (apps/web/public/engine, `node apps/web/scripts/stage-engine.mjs`). Skipped when none is staged, as
// in CI's unit job; fixtures/engine/action-ids.json keeps the ids these runs report, and the gamedata test names
// those offline. UPDATE_ACTION_IDS=1 rewrites that file from these runs.

const root = new URL('../../../', import.meta.url);
const read = (p: string) => new Uint8Array(readFileSync(new URL(p, root)));
const staged = new URL('apps/web/public/engine/current.json', root);
const current = existsSync(staged)
  ? (JSON.parse(readFileSync(staged, 'utf8')) as { engineId: string; commit: string })
  : null;
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
  return { abilities, auras: [...auras].sort(), all: [...all].sort() };
}

describe.skipIf(!current)('action names in real runs', () => {
  const dir = `apps/web/public/engine/${current?.engineId}/`;
  const client = current
    ? createNodeEngineClient({
        concurrency: 2,
        sources: {
          wasm: new URL(`${dir}lib.wasm.gz`, root).pathname,
          wasmExec: new URL(`${dir}wasm_exec.js`, root).pathname,
        },
        version: { engineId: current.engineId, commit: current.commit, dataBuild: null },
      })
    : undefined;
  afterAll(() => client?.dispose());
  const db = loadDatabase(read('fixtures/gamedata/db.bin'), read('fixtures/gamedata/leftover_db.bin'));

  it('names every action of the Warrior presets and an imported Hunter', async () => {
    const src = actionNameSources(db, buildSpellNames(db.raw.spellIcons, await loadSpellNames()));
    const warrior = await loadSpecPresets('dps-warrior');
    const runs: [string, Character, typeof warrior][] = warrior.builds.map((b) => [
      `warrior-${b.id}`,
      characterFromPresets(warrior, b.id),
      warrior,
    ]);
    const url = readFileSync(
      new URL('fixtures/import/real/wowhead-forever-sv-hunter.url', root),
      'utf8',
    ).trim();
    const imported = importAny(url, toImportContext(db, 'fixture')).character!;
    const hunter = await loadSpecPresets(imported.spec);
    runs.push(['hunter-wowhead', fillFromPreset(imported, hunter), hunter]);

    const out: Record<string, ReturnType<typeof runActionIds>> = {};
    for (const [name, character, presets] of runs) {
      const req = withDatabases(
        buildRaidSimRequest(character, presets, db, { iterations: 20, seed: 1 }),
        db.raw,
      );
      req.simOptions!.debugFirstIteration = true;
      const res = await client!.raidSim(req);
      expect(res.error).toBeUndefined();
      out[name] = runActionIds(res);
    }
    const parse = (k: string): ActionRef => {
      const m = /^(spell|item|other):(-?\d+)(?:#(-?\d+))?$/.exec(k)!;
      return { kind: m[1] as ActionRef['kind'], id: Number(m[2]), tag: m[3] ? Number(m[3]) : 0 };
    };
    for (const [name, ids] of Object.entries(out)) {
      const labels = ids.all.map((k) => actionName(parse(k), src));
      for (const [i, l] of labels.entries())
        expect(l, `${name} ${ids.all[i]}`).not.toMatch(
          /tag |^(Item|Spell|Other action) \d+$|\((Item|Spell) \d+\)/,
        );
      const abilities = distinctActionNames(
        ids.abilities.map(([k]) => parse(k)),
        src,
        ids.abilities.map(([, o]) => o),
      );
      expect(new Set(abilities.map((n, i) => `${ids.abilities[i]![1]}|${n}`)).size, name).toBe(
        abilities.length,
      );
      console.info(`${name}: ${ids.all.length} actions named; damage rows: ${abilities.join(', ')}`);
    }

    if (process.env.UPDATE_ACTION_IDS) {
      const body = { engine: current!.engineId, runs: out };
      writeFileSync(FIXTURE, `${JSON.stringify(body, null, 2)}\n`);
    } else {
      // The offline fixture must hold every id these runs report, so the gamedata test covers them.
      const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
        runs: Record<string, { all: string[] }>;
      };
      for (const [name, ids] of Object.entries(out))
        expect(
          ids.all.filter((k) => !fixture.runs[name]?.all.includes(k)),
          `${name}: run UPDATE_ACTION_IDS=1`,
        ).toEqual([]);
    }
  });
});
