// Tiny static server for the e2e tests: serves `nuxt generate` output (.output/public) the way a static
// host does: the file itself, then <path>/index.html, then the SPA fallback 200.html.
// Usage: node e2e/serve.mjs [port]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../.output/public/', import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

if (!existsSync(join(root, '200.html'))) {
  console.error(`serve: ${root} has no 200.html. Run \`nuxt generate\` first.`);
  process.exit(1);
}

const isFile = (p) => existsSync(p) && statSync(p).isFile();

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  const target = join(root, path);
  if (!(target + sep).startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  let file = isFile(target) ? target : isFile(join(target, 'index.html')) ? join(target, 'index.html') : null;
  if (!file) {
    // A missing asset is a real 404; anything else is a client-side route.
    if (/\.[a-z0-9]+$/i.test(path)) {
      res.writeHead(404).end();
      return;
    }
    file = join(root, '200.html');
  }
  // .gz files go out as opaque bytes (the engine loader gunzips them itself), never with Content-Encoding.
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serve: http://127.0.0.1:${port}`));
