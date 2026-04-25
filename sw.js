// sw.js
const SW_VERSION = 'gesper-pwa-v2.0.0';
const CACHE = [
  '/', '/index.html', '/app.js',
  '/css/tokens.css', '/css/base.css', '/css/components.css',
  '/core/config.js', '/core/db.js', '/core/auth.js',
  '/core/router.js', '/core/toast.js', '/core/firebase.js',
  '/modules/login/index.js',
  '/modules/dashboard/index.js',
  '/modules/incidencias/index.js',
  '/modules/actas/index.js',
  '/modules/permisos/index.js',
  '/modules/historial/index.js',
  '/modules/personal/index.js',
  '/modules/reportes/index.js',
  '/modules/documentos/index.js',
  '/modules/compromisos/index.js',
  '/clima-encuesta.html',
  '/modules/evaluacion/index.js',
  '/modules/clima/index.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SW_VERSION).then(c => c.addAll(CACHE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== SW_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
