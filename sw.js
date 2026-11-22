// Service worker: offline shell. Bump VERSION with every release so clients refresh.
const VERSION = '1.3.0';
const CACHE = `t2d-${VERSION}`;
const SHELL = [
  './', 'index.html', 'beheer.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/auth.js', 'js/beheer.js', 'js/config.js', 'js/game.js', 'js/player.js',
  'js/playlist.js', 'js/shuffle.js', 'js/songs.js', 'js/spotify-api.js', 'js/storage.js',
  'js/timer.js', 'js/ui.js', 'js/years.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('t2d-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Data files and the OAuth callback: always network first.
  if (url.pathname.includes('/data/') || url.search.includes('code=')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
