import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The sim runs entirely in the browser (WASM in Web Workers), so the app is a
// client-rendered SPA served as static files. See docs/plan.md §0.
const publicDirForSpaFallback = join(import.meta.dirname, '.output/public');

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: false,
  devtools: { enabled: false },
  typescript: { strict: true },
  css: ['~/assets/css/tokens.css', '~/assets/css/base.css'],
  app: {
    head: {
      title: 'forever/sim',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'Browser-based combat simulator for WoW Forever.' },
        { name: 'color-scheme', content: 'dark' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
        },
      ],
    },
  },
  nitro: {
    preset: 'static',
    hooks: {
      // Fill in the service worker's precache list and version (public/sw.js) once the output is complete.
      compiled(nitro) {
        if (nitro.options.dev) return;
        writeServiceWorker(join(nitro.options.rootDir, 'public/sw.js'), nitro.options.output.publicDir);
      },
      // Cloudflare Pages serves a site as a single-page app only when there is no top-level 404.html;
      // with one, deep links such as /runs/0004 or /s#… come back as 404. Every route here renders
      // client-side from the shell, so drop it and let Pages fall back to index.html (status 200).
      'prerender:done'() {
        rmSync(join(publicDirForSpaFallback, '404.html'), { force: true });
      },
    },
  },
  vite: {
    // Workspace packages are TS source; pre-bundle their deps so dev doesn't reload on first visit.
    optimizeDeps: { include: ['zod', '@protobuf-ts/runtime'] },
  },
});

/**
 * Writes `<publicDir>/sw.js` from the public/sw.js template: the precache list is "/" plus every hashed file
 * directly in /_nuxt/ (not /_nuxt/builds/, which changes per deploy), and the version is a hash of that
 * list, so each deploy with new assets installs a new worker.
 */
function writeServiceWorker(templatePath: string, publicDir: string) {
  const nuxtDir = join(publicDir, '_nuxt');
  if (!existsSync(templatePath) || !existsSync(nuxtDir)) return;
  const assets = readdirSync(nuxtDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => `/_nuxt/${d.name}`)
    .sort();
  const precache = ['/', ...assets];
  const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
  const sw = readFileSync(templatePath, 'utf8')
    .replace("'__SW_VERSION__'", JSON.stringify(version))
    .replace('/* __SW_PRECACHE__ */ []', JSON.stringify(precache));
  if (sw.includes('__SW_')) throw new Error('writeServiceWorker: placeholders in public/sw.js not found');
  writeFileSync(join(publicDir, 'sw.js'), sw);
}
