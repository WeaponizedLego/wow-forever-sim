// Offline support and early engine download (docs/dev-setup.md, "Offline and performance").
//
// Production: registers /sw.js, then, once the page is idle, fetches the current engine's files
// (lib.wasm.gz, wasm_exec.js, db.bin, leftover_db.bin) at low priority so they download in parallel with the
// user reading the start page. Through the service worker they land in its engine cache; without one, in the
// HTTP cache (/engine/<id>/* is served immutable). useEngine() then reads them from cache.
// Dev: never registers, and removes a worker left over from a `.output/public` preview on the same origin.
const ENGINE_FILES = ['lib.wasm.gz', 'wasm_exec.js', 'db.bin', 'leftover_db.bin'];

function whenIdle(fn: () => void) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 3000 });
  else setTimeout(fn, 1500);
}

/** Resolves once the service worker controls the page, or after `ms` (first visit, or no SW at all). */
function controlled(ms: number): Promise<void> {
  if (!('serviceWorker' in navigator) || navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    setTimeout(resolve, ms);
  });
}

async function warmEngine() {
  const res = await fetch('/engine/current.json');
  if (!res.ok) return;
  const { base } = (await res.json()) as { base?: string };
  if (!base) return;
  await Promise.all(
    ENGINE_FILES.map((f) =>
      fetch(`${base}${f}`, { priority: 'low' } as RequestInit)
        .then((r) => r.arrayBuffer())
        .catch(() => {}),
    ),
  );
}

export default defineNuxtPlugin({
  name: 'sw',
  parallel: true,
  setup(nuxtApp) {
    if (import.meta.dev) {
      void navigator.serviceWorker
        ?.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }
    nuxtApp.hook('app:mounted', () => {
      whenIdle(() => {
        const registered =
          'serviceWorker' in navigator
            ? navigator.serviceWorker
                .register('/sw.js')
                .catch((e: unknown) => console.warn('sw: register failed', e))
            : Promise.resolve();
        // Wait (briefly) for the SW to take control so the engine files go into its cache, not only the HTTP cache.
        void registered
          .then(() => controlled(5000))
          .then(warmEngine)
          .catch(() => {});
      });
    });
  },
});
