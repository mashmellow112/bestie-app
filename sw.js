const CACHE_NAME = 'bestie-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/chat.html',
  '/pricing.html',
  '/payment.html',
  '/login.html',
  '/splash.html',
  '/about.html',
  '/contact.html',
  '/privacy.html',
  '/terms.html',
  '/assets/js/script.js',
  '/api-config.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});