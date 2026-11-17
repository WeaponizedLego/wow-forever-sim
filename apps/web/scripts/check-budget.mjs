#!/usr/bin/env node
// Performance budget for the generated site (run after `nuxt generate`).
//
// For each page route it adds up what a first visit downloads before any engine file:
// the entry chunk and its static imports, the default layout and the route component
// with their static imports (taken from Vite's __vite__mapDeps preload lists in the entry),
// plus the CSS that comes with them. Sizes are gzip -9, close to what Cloudflare sends.
// Fails (exit 1) when any product route's JS is over the budget. /dev/* routes are listed but not enforced.
//
// Usage: node scripts/check-budget.mjs [--budget-kb 300] [--dir .output/public]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const root = new URL('..', import.meta.url).pathname;
const dir = join(root, arg('--dir', '.output/public'));
const budgetKb = Number(arg('--budget-kb', '300'));
const nuxtDir = join(dir, '_nuxt');

if (!existsSync(join(dir, 'index.html'))) {
  console.error(`check-budget: ${dir}/index.html not found. Run \`nuxt generate\` first.`);
  process.exit(2);
}

const sizeCache = new Map();
function gz(file) {
  if (!sizeCache.has(file))
    sizeCache.set(file, gzipSync(readFileSync(join(nuxtDir, file)), { level: 9 }).length);
  return sizeCache.get(file);
}
const read = (file) => readFileSync(join(nuxtDir, file), 'utf8');

// Entry: the importmap's #entry, plus every static import reachable from it.
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const entryFile = html.match(/"#entry":"\/_nuxt\/([^"]+)"/)?.[1];
if (!entryFile) {
  console.error('check-budget: could not find the #entry chunk in index.html');
  process.exit(2);
}
const htmlCss = [...html.matchAll(/<link rel="stylesheet" href="\/_nuxt\/([^"]+)"/g)].map((m) => m[1]);

function staticClosure(start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/(?:from|import)\s*["'`]\.\/([^"'`]+\.js)["'`]/g)) queue.push(m[1]);
  }
  return seen;
}
const entryJs = staticClosure(entryFile);

// Vite's preload table: __vite__mapDeps=(i,m=...,d=(m.f||(m.f=[...])))
const entrySrc = read(entryFile);
const depTable = JSON.parse(entrySrc.match(/m\.f=(\[[^\]]*\])/)?.[1].replaceAll("'", '"') ?? '[]').map((p) =>
  p.replace(/^\.\//, ''),
);
const depsAt = (list) =>
  list
    .split(',')
    .filter(Boolean)
    .map((i) => depTable[Number(i)]);

const layoutDeps = depsAt(
  entrySrc.match(/default:[^,]*?\(\(\)=>import\(`\.\/[^`]+`\)[^,]*?,__vite__mapDeps\(\[([\d,]*)\]\)/)?.[1] ??
    '',
);
const routes = [
  ...entrySrc.matchAll(
    /\{name:`([^`]*)`,path:`([^`]*)`,component:\(\)=>\w+\(\(\)=>import\(`\.\/([^`]+)`\),__vite__mapDeps\(\[([\d,]*)\]\)/g,
  ),
].map(([, name, path, file, deps]) => ({ name, path, file, deps: depsAt(deps) }));
if (!routes.length) {
  console.error('check-budget: no routes found in the entry chunk; the build output format changed.');
  process.exit(2);
}

const kb = (b) => (b / 1024).toFixed(1);
const sum = (files) => [...files].reduce((n, f) => n + gz(f), 0);
const entryKb = sum(entryJs);
const rows = routes
  .map((r) => {
    const all = new Set([...entryJs, ...layoutDeps, ...r.deps]);
    const js = [...all].filter((f) => f.endsWith('.js'));
    const css = new Set([...htmlCss, ...[...all].filter((f) => f.endsWith('.css'))]);
    const routeOnly = js.filter((f) => !entryJs.has(f));
    return {
      path: r.path,
      js: sum(js),
      routeJs: sum(routeOnly),
      css: sum(css),
      enforced: !r.path.startsWith('/dev'),
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

console.log(`Budget: ${budgetKb} KB gzip JS per route before the engine (WASM, db.bin).`);
console.log(
  `Entry JS (${entryJs.size} chunks): ${kb(entryKb)} KB gz; layout chunks are counted per route.\n`,
);
const head = ['route', 'total JS', 'route+layout JS', 'CSS', ''];
const table = rows.map((r) => [
  r.path,
  `${kb(r.js)} KB`,
  `${kb(r.routeJs)} KB`,
  `${kb(r.css)} KB`,
  !r.enforced ? '(not enforced)' : r.js > budgetKb * 1024 ? 'OVER' : 'ok',
]);
const widths = head.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
for (const row of [head, ...table]) console.log(row.map((c, i) => c.padEnd(widths[i])).join('  '));

const over = rows.filter((r) => r.enforced && r.js > budgetKb * 1024);
if (over.length) {
  console.error(
    `\ncheck-budget: ${over.length} route(s) over ${budgetKb} KB: ${over.map((r) => r.path).join(', ')}`,
  );
  process.exit(1);
}
console.log('\ncheck-budget: ok');
