const CACHE_NAME = 'ponto-pwa-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/tailwind-compiled.css',
  '/app.js',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/vendor/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/ponto') || event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  event.respondWith(
    // ignoreSearch: assets como style.css?v=6/app.js?v=7 têm query de cache-busting
    // no HTML, mas foram precacheados sem ela — sem isso, todo load era cache miss.
    caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
      if (cachedResponse) {
        fetch(event.request).then(networkResponse => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      // Sem cache e sem rede (servidor fora do ar/offline): antes rejeitava sem
      // catch, virando "Uncaught (in promise) TypeError: Failed to fetch" no console.
      return fetch(event.request).catch(() => caches.match('/index.html'));
    })
  );
});

self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || 'Ponto Eletrônico Seguro';
      const options = {
        body: data.body || 'Nova notificação de jornada.',
        icon: data.icon || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: data.url || '/'
      };
      
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
      console.error('Erro ao fazer parse do push data', e);
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = new URL(event.notification.data, self.location.origin).href;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
