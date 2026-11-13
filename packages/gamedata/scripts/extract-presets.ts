// Extracts every engine spec's presets from an upstream wowsims/forever checkout into data/presets/<spec>.json.
//
//   node packages/gamedata/scripts/extract-presets.ts --upstream <path to forever checkout> [--cli <wowsimcli>]
//
// For each spec it bundles upstream `ui/specs/<dir>/spec.ts` with esbuild, the way the site's build would, except:
// - `@generated/proto/*` resolves to our generated protos (packages/proto, same pinned commit);
// - `@app/preset_utils` resolves to upstream-shim/preset_utils.ts, which keeps the data and drops the UI;
// - `.siml` files load as the JSON `wowsimcli siml parse -json` prints (what upstream's Vite plugin does);
// - every other UI module (`@sim/*`, `@features/*`, i18n, CSS…) is an inert stub.
// The bundle runs upstream-shim/collect.ts over the spec config's `defaults` and `presets`.
// Needs Go (`GOTOOLCHAIN=auto` fetches the version upstream wants) unless --cli points at a built wowsimcli.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { ITEM_SLOTS, RACES, SPECS } from '../../contracts/src/game.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const repo = path.resolve(pkg, '../..');
const outDir = path.join(pkg, 'data/presets');

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const upstream = path.resolve(arg('upstream') ?? process.env['FOREVER_UPSTREAM'] ?? '');
if (!existsSync(path.join(upstream, 'ui/specs'))) {
  console.error('Pass --upstream <wowsims/forever checkout> (or FOREVER_UPSTREAM).');
  process.exit(1);
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim();
const lock = JSON.parse(readFileSync(path.join(repo, 'engine.lock.json'), 'utf8')) as {
  upstream: { commit: string };
};
if (lock.upstream.commit !== commit) {
  console.warn(`warning: upstream is at ${commit}, engine.lock.json pins ${lock.upstream.commit}`);
}

const work = mkdtempSync(path.join(tmpdir(), 'fsim-presets-'));
let cli = arg('cli') ?? process.env['WOWSIMCLI'];
if (!cli) {
  cli = path.join(work, 'wowsimcli');
  console.log('building wowsimcli (go build -tags with_db) …');
  execFileSync('go', ['build', '-tags', 'with_db', '-o', cli, './cmd/wowsimcli'], {
    cwd: upstream,
    stdio: 'inherit',
    env: { ...process.env, GOTOOLCHAIN: process.env['GOTOOLCHAIN'] ?? 'auto' },
  });
}

const simlCache = new Map<string, string>();
const simlJson = (file: string): string => {
  let out = simlCache.get(file);
  if (out === undefined) {
    out = execFileSync(cli, ['siml', 'parse', '-json', file], { cwd: upstream, encoding: 'utf8' });
    simlCache.set(file, out);
  }
  return out;
};

// A CommonJS module whose every export, call, construction and property is itself; `overrides` are real values.
const stubSource = (overrides = '{}') => `
const overrides = ${overrides};
const target = function () {};
const get = (k) => {
  if (k in overrides) return overrides[k];
  if (k === '__isStub') return true;
  if (k === 'then') return undefined;
  if (k === Symbol.toPrimitive) return () => '';
  if (k === Symbol.iterator) return function* () {};
  return stub;
};
// esbuild's CommonJS interop copies own keys onto an object whose prototype is the module's prototype, so named
// imports reach the stub through this prototype.
const proto = new Proxy({}, { get: (_t, k) => get(k) });
const stub = new Proxy(target, {
  get: (_t, k) => get(k),
  getPrototypeOf: () => proto,
  apply() { return stub; },
  construct() { return stub; },
});
module.exports = stub;`;

const STUB_OVERRIDES: Record<string, string> = {
  '@sim/spec_config': '{ defineSpec: (c) => c, registerSpecConfig: (_s, c) => c, __esModule: true }',
};

const generated = path.join(repo, 'packages/proto/src/generated');
const plugin: Plugin = {
  name: 'upstream',
  setup(b) {
    b.onResolve({ filter: /^@generated\/proto\/(.*)$/ }, (a) => ({
      path: path.join(generated, a.path.replace('@generated/proto/', '') + '.ts'),
    }));
    b.onResolve({ filter: /^@fsim\/proto\/(.*)$/ }, (a) => ({
      path: path.join(generated, a.path.replace('@fsim/proto/', '') + '.ts'),
    }));
    b.onResolve({ filter: /^@app\/preset_utils$/ }, () => ({
      path: path.join(here, 'upstream-shim/preset_utils.ts'),
    }));
    b.onResolve({ filter: /^@features\/settings\/model\/consumables_auto_gen$/ }, () => ({
      path: path.join(upstream, 'ui/features/settings/model/consumables_auto_gen.ts'),
    }));
    b.onResolve({ filter: /^@protobuf-ts\// }, (a) => ({
      path: createRequire(path.join(repo, 'packages/proto/package.json')).resolve(a.path),
    }));
    b.onResolve({ filter: /\.siml$/ }, (a) => ({
      path: path.resolve(a.resolveDir, a.path),
      namespace: 'siml',
    }));
    b.onLoad({ filter: /.*/, namespace: 'siml' }, (a) => ({ contents: simlJson(a.path), loader: 'json' }));
    // Anything else that is not a relative or absolute path, and any style or asset file, is a stub.
    b.onResolve({ filter: /^[^./]|\.(css|scss|svg|png)$/ }, (a) => {
      if (path.isAbsolute(a.path)) return undefined;
      return { path: a.path, namespace: 'stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
      contents: stubSource(STUB_OVERRIDES[a.path]),
      loader: 'js',
    }));
  },
};

interface Extracted {
  gearSets: { id: string; name?: string; unlisted?: boolean; gear?: unknown }[];
  talents: unknown[];
  rotations: { id: string; kind: string }[];
  defaults: Record<string, unknown>;
  builds: { id: string; name: string; group?: string; setup: Record<string, unknown> }[];
  notes: string[];
  missing: string[];
}

const extract = async (spec: (typeof SPECS)[number]): Promise<Extracted> => {
  const specTs = path.join(upstream, 'ui/specs', spec.upstreamDir, 'spec.ts');
  const entry = `
import config from ${JSON.stringify(specTs)};
import { collect } from ${JSON.stringify(path.join(here, 'upstream-shim/collect.ts'))};
import { SPEC_ONEOF } from ${JSON.stringify(path.join(pkg, 'src/specs.ts'))};
import { CLASS_RACES } from ${JSON.stringify(path.join(pkg, 'src/classes.ts'))};
export default collect(config, {
  id: ${JSON.stringify(spec.id)},
  oneofKind: SPEC_ONEOF[${JSON.stringify(spec.id)}],
  slots: ${JSON.stringify(ITEM_SLOTS)},
  races: ${JSON.stringify(Object.fromEntries(Object.entries(RACES).map(([k, v]) => [k, v.proto])))},
  firstRace: CLASS_RACES[${JSON.stringify(spec.class)}][0],
});`;
  const outfile = path.join(work, `${spec.id}.mjs`);
  await build({
    stdin: { contents: entry, resolveDir: path.dirname(specTs), loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    plugins: [plugin],
    logLevel: 'error',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  });
  return ((await import(pathToFileURL(outfile).href)) as { default: Extracted }).default;
};

const upstreamFiles = (dir: string): string[] => {
  const root = path.join(upstream, 'ui/specs', dir);
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(root, path.join(d, e.name))],
    );
  return walk(root)
    .filter((f) => /\.(json|siml)$/.test(f) || f === 'presets.ts')
    .sort();
};

// Gear files in the spec's gear_sets folder that no preset lists (warlock has two): kept, marked unlisted.
const addUnlistedGear = (dir: string, data: Extracted) => {
  const folder = path.join(upstream, 'ui/specs', dir, 'gear_sets');
  if (!existsSync(folder)) return;
  for (const file of readdirSync(folder).sort()) {
    const full = path.join(folder, file);
    const raw = file.endsWith('.gear.json')
      ? readFileSync(full, 'utf8')
      : file.endsWith('.gear.siml')
        ? simlJson(full)
        : null;
    if (raw === null) continue;
    const items = (JSON.parse(raw) as { items?: { id?: number; enchant?: number; randomSuffix?: number }[] })
      .items;
    const gear: Record<string, unknown> = {};
    (items ?? []).forEach((it, i) => {
      const slot = ITEM_SLOTS[i];
      if (!it?.id || !slot) return;
      gear[slot] = {
        itemId: it.id,
        ...(it.enchant ? { enchantId: it.enchant } : {}),
        ...(it.randomSuffix ? { randomSuffix: it.randomSuffix } : {}),
      };
    });
    if (data.gearSets.some((g) => JSON.stringify(g.gear) === JSON.stringify(gear))) continue;
    const id = `file-${file
      .replace(/\.gear\.(json|siml)$/, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()}`;
    data.gearSets.push({ id, name: file, unlisted: true, gear });
    data.notes.push(`Gear file ${file} is listed by no preset upstream; kept as gear set "${id}".`);
  }
};

mkdirSync(outDir, { recursive: true });
const summary: {
  id: string;
  name: string;
  status: string;
  counts: string;
  missing: string[];
  notes: string[];
}[] = [];
const index: Record<string, unknown>[] = [];
for (const spec of SPECS) {
  process.stdout.write(`${spec.id} … `);
  const data = await extract(spec);
  addUnlistedGear(spec.upstreamDir, data);
  const aplCount = data.rotations.filter((r) => r.kind === 'apl').length;
  // Complete: the defaults, or else one build, give gear, talents and an APL rotation to sim, plus consumables and
  // spec options. defaultCharacter() starts from the first that does.
  const simmable = (s: Record<string, unknown>) => !!(s['gearSetId'] && s['talents'] && s['rotationId']);
  const start = simmable(data.defaults) ? null : (data.builds.find((b) => simmable(b.setup))?.id ?? null);
  const hasBasics = !data.missing.includes('consumables') && !data.missing.includes('specOptions');
  const status =
    (simmable(data.defaults) || start) && hasBasics
      ? 'complete'
      : data.gearSets.length || data.talents.length
        ? 'partial'
        : 'none';
  const file = {
    specId: spec.id,
    upstream: {
      repo: 'wowsims/forever',
      commit,
      dir: `ui/specs/${spec.upstreamDir}`,
      files: upstreamFiles(spec.upstreamDir),
    },
    status,
    /** The build defaultCharacter() starts from when the defaults alone cannot sim; null for the defaults. */
    defaultBuildId: start,
    missing: data.missing,
    notes: data.notes,
    defaults: data.defaults,
    builds: data.builds,
    gearSets: data.gearSets,
    talents: data.talents,
    rotations: data.rotations,
  };
  writeFileSync(path.join(outDir, `${spec.id}.json`), JSON.stringify(file, null, 2) + '\n');
  summary.push({
    id: spec.id,
    name: spec.name,
    status,
    counts: `${data.builds.length} / ${data.gearSets.length} / ${data.talents.length} / ${aplCount}`,
    missing: data.missing,
    notes: data.notes,
  });
  index.push({
    specId: spec.id,
    status,
    defaultBuildId: start,
    builds: data.builds.map((b) => ({ id: b.id, name: b.name, ...(b.group ? { group: b.group } : {}) })),
    missing: data.missing,
  });
  console.log(`${status} (${data.missing.join(', ') || 'nothing missing'})`);
}

const readme = `# Spec presets

Generated by \`scripts/extract-presets.ts\` from [wowsims/forever](https://github.com/wowsims/forever) (MIT) at
\`${commit}\`. Do not edit by hand; rerun the script:

\`\`\`sh
node packages/gamedata/scripts/extract-presets.ts --upstream <forever checkout>
corepack pnpm@12.18.0 exec prettier --write packages/gamedata/data
\`\`\`

Each \`<spec>.json\` holds the spec's upstream defaults (\`defaults\`), its preset builds resolved over those defaults
(\`builds\`), and the gear sets, talent strings and rotations they point at. Engine messages (consumables, spec
options, buffs, APL rotations, encounters) are protojson, as \`toJson\` of the generated types writes them.

**complete** means upstream gives default gear, talents, an APL rotation, consumables and spec options, so
\`defaultCharacter(spec)\` sims as is. **partial** means something in that list is missing upstream.
**none** means upstream has no presets for the spec yet.

| Spec | Status | Builds / gear sets / talents / APL rotations | Missing upstream |
| ---- | ------ | -------------------------------------------- | ---------------- |
${summary.map((s) => `| ${s.name} (\`${s.id}\`) | ${s.status} | ${s.counts} | ${s.missing.join(', ') || '—'} |`).join('\n')}

## Notes per spec

${summary
  .filter((s) => s.notes.length)
  .map((s) => `- **${s.name}**: ${s.notes.join(' ')}`)
  .join('\n')}

Missing keys: \`gear\`, \`talents\`, \`rotation\` (no APL to sim), \`consumables\`, \`specOptions\` are upstream
defaults the spec lacks; \`builds\` means no preset builds; \`apl-rotation\` means no APL rotation preset (upstream
relies on its in-browser simple/auto rotation, which we do not port).
`;
writeFileSync(path.join(outDir, 'README.md'), readme);
writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ commit, specs: index }, null, 2) + '\n');
console.log(`wrote ${summary.length} specs to ${path.relative(repo, outDir)}`);
