// The sim runs entirely in the browser (WASM in Web Workers), so the app is a
// client-rendered SPA served as static files. See docs/plan.md §0.
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
  },
  vite: {
    // Workspace packages are TS source; pre-bundle their deps so dev doesn't reload on first visit.
    optimizeDeps: { include: ['zod', '@protobuf-ts/runtime'] },
  },
});
