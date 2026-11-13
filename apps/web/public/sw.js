// Service worker: lets the app load and sim offline after one online visit. Hand-written, no dependency.
//
// The build (hook in nuxt.config.ts) fills in VERSION and PRECACHE in .output/public/sw.js. This source copy
// keeps the placeholders and is never registered in dev (see app/plugins/sw.client.ts).
//
// Caches:
//   shell-<VERSION>  the app shell: "/" plus every /_nuxt/ file of this build, precached on install.
//   engine-<id>      /engine/<id>/* (WASM, wasm_exec.js, db.bin, leftover_db.bin). Immutable per id, so
//                    cache-first; filled as the page fetches them. Dropped when current.json names a new id.
//   runtime          /engine/current.json, /_nuxt/builds/*, Google Fonts: network-first (fonts: cache-first).
//
// Updates: install + skipWaiting + clients.claim, i.e. a new deploy takes over silently. Navigations are
// network-first, so an online reload always gets the newest HTML; offline gets the last cached build.
const VERSION = '__SW_VERSION__';
const PRECACHE = /* __SW_PRECACHE__ */ [];

const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime';
const ENGINE_PREFIX = 'engine-';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Hashed /_nuxt/ files may come from the HTTP cache; the HTML must be fresh.
      await cache.addAll(
        PRECACHE.map((url) => new Request(url, { cache: url.startsWith('/_nuxt/') ? 'default' : 'reload' })),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') return event.respondWith(navigate(req));
    const engine = url.pathname.match(/^\/engine\/([^/]+)\/.+/);
    if (engine) return event.respondWith(cacheFirst(req, ENGINE_PREFIX + engine[1]));
    if (url.pathname === '/engine/current.json') return event.respondWith(currentJson(req));
    if (url.pathname.startsWith('/_nuxt/builds/')) return event.respondWith(networkFirst(req, RUNTIME));
    if (url.pathname.startsWith('/_nuxt/')) return event.respondWith(cacheFirst(req, SHELL));
    return;
  }
  if (url.hostname === 'fonts.gstatic.com') return event.respondWith(cacheFirst(req, RUNTIME));
  if (url.hostname === 'fonts.googleapis.com') return event.respondWith(networkFirst(req, RUNTIME));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // Only whole responses: a 206 (range) or an error must not stick. Opaque (no-cors fonts) is fine.
  if (res.status === 200 || res.type === 'opaque') await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') await cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw e;
  }
}

/** current.json, network-first. When it names a new engine id, older engine caches are dropped. */
async function currentJson(req) {
  const res = await networkFirst(req, RUNTIME);
  if (res.ok) {
    res
      .clone()
      .json()
      .then(async ({ engineId }) => {
        if (!engineId) return;
        for (const key of await caches.keys())
          if (key.startsWith(ENGINE_PREFIX) && key !== ENGINE_PREFIX + engineId) await caches.delete(key);
      })
      .catch(() => {});
  }
  return res;
}

/** Network-first HTML; offline, every route gets the cached SPA shell ("/"), whose router renders it. */
async function navigate(req) {
  try {
    return await fetch(req);
  } catch (e) {
    const shell = await caches.open(SHELL);
    const hit = (await shell.match('/')) ?? (await caches.match('/'));
    if (hit) return hit;
    throw e;
  }
}
