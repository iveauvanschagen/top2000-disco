// Service worker: network first, cache only as offline fallback.
// Bump VERSION with every release.
const VERSION = '1.6.0';
const CACHE = `t2d-${VERSION}`;
const SHELL = [
  './', 'index.html', 'beheer.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/auth.js', 'js/beheer.js', 'js/config.js', 'js/game.js', 'js/player.js',
  'js/playlist.js', 'js/shuffle.js', 'js/songs.js', 'js/spotify-api.js', 'js/storage.js',
  'js/sounds.js', 'js/timer.js', 'js/ui.js', 'js/years.js', 'data/top2000-2025.json', 'data/songs.json'
];

// Cache files one by one: a single missing file must never block an update.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(async url => {
      const res = await fetch(url, { cache: 'reload' });
      if (res.ok) await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok && !url.search.includes('code=')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    }
  })());
});
