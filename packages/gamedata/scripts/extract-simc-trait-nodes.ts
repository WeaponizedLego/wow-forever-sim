// Extracts each class's talent tree nodes from SimulationCraft's trait data (forever branch) into
// packages/importers/src/loadout-nodes.json, for reading the game client's talent loadout strings.
//
//   node packages/gamedata/scripts/extract-simc-trait-nodes.ts --trait-data <trait_data.inc> --commit <sha> \
//     [--repo simulationcraft/simc-forever]
//
// `trait_data.inc` is `engine/dbc/generated/trait_data.inc` in simulationcraft/simc-forever (the Forever fork, which
// tracks the client's builds; the default --repo) or simulationcraft/simc's forever branch (GPL-3.0; only ids and
// names are taken). A loadout string has one entry per node of the class's trait tree, in node id order, and the
// game's trees keep retired ("parked") talents as nodes; SimC's table lists those, the engine's trees do not. See
// packages/importers/README.md ("Client loadout strings") for how the importer joins the two and what is verified.
// Not part of engine-sync: SimC's data follows SimC's own releases. Rerun when simc-forever regenerates its data.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES } from '../../contracts/src/game.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../importers/src/loadout-nodes.json');

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const file = arg('trait-data');
const commit = arg('commit');
const repo = arg('repo') ?? 'simulationcraft/simc-forever';
if (!file || !commit || !/^[0-9a-f]{40}$/.test(commit)) {
  console.error(
    'Pass --trait-data <simc engine/dbc/generated/trait_data.inc> --commit <40-char simc commit>.',
  );
  process.exit(1);
}
const text = readFileSync(file, 'utf8');
const build = /wow build ([\d.]+)/.exec(text)?.[1] ?? null;

// { tree_index, class_id, id_trait_node_entry, id_node, max_ranks, req_points, id_trait_definition, id_spell,
//   id_replace_spell, id_override_spell, row, col, selection_index, name, … }
const ROW =
  /^\s*\{\s*(\d+),\s*(\d+),\s*\d+,\s*(\d+),\s*(\d+),\s*\d+,\s*(\d+),\s*\d+,\s*\d+,\s*\d+,\s*\d+,\s*\d+,\s*\d+,\s*"([^"]*)"/;
const byProto = new Map(Object.entries(CLASSES).map(([id, c]) => [c.proto as number, id]));
const classes: Record<string, [number, number, number, string][]> = {};
for (const line of text.split('\n')) {
  const m = ROW.exec(line);
  if (!m) continue;
  const [, tree, classId, node, maxRanks, def, name] = m;
  const cls = byProto.get(Number(classId));
  if (!cls || tree !== '1') continue;
  (classes[cls] ??= []).push([Number(node), Number(def), Number(maxRanks), name!]);
}
for (const list of Object.values(classes)) list.sort((a, b) => a[0] - b[0]);
const missing = Object.keys(CLASSES).filter((c) => !classes[c]?.length);
if (missing.length) {
  console.error(`no nodes for ${missing.join(', ')}`);
  process.exit(1);
}

writeFileSync(
  out,
  JSON.stringify(
    {
      source: {
        repo,
        commit,
        file: 'engine/dbc/generated/trait_data.inc',
        build,
      },
      /** Per class, every node of its trait tree in node id order: [node id, TraitDefinition id, max ranks, name]. */
      classes,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `wrote ${Object.values(classes).reduce((n, l) => n + l.length, 0)} nodes (build ${build}) to ${path.relative(process.cwd(), out)}`,
);
