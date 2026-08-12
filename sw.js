const CACHE_NAME = 'asistencia-app-v48';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=34',
  './app.js?v=25',
  './manifest.json',
  './icon.svg',
  './logo-empresa.png',
  'https://unpkg.com/@phosphor-icons/web',
  'https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/plugin/localeData.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/locale/es.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.all(
          ASSETS_TO_CACHE.map((url) => {
            return fetch(url, { cache: 'no-store' }).then((response) => {
              if (!response.ok) throw new Error('Fetch failed for ' + url);
              return cache.put(url, response);
            });
          })
        );
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
