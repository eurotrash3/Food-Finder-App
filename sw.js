// Offline support: network first for our own files (so updates show up straight away),
// falling back to the cached copy when offline. Other sites (TheMealDB, Supabase) are left alone.

const CACHE = 'food-finder-v2';
const SHELL = [
  './', 'css/styles.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/data.js', 'js/recipes.js', 'js/recipes-index.js', 'js/store.js',
  'js/list.js', 'js/mealdb.js', 'js/sync.js', 'js/config.js', 'js/prices.js', 'js/shops.js',
];

self.addEventListener('install', (e) => {
  // Add files one by one so a single failure (or a duplicate) doesn't stop the install.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((url) => c.add(url).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
