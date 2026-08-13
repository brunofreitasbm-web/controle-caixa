const CACHE_NAME = 'ponto-pwa-v60'; // v60: bump version to clear cache for app.js so inicializarMetasImportTab is available
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/tailwind-compiled.css',
  '/app.js',
  '/realtime.js',
  '/camera-universal.js',
  '/mensagens-aniversario.js',
  '/bluedox.html',
  '/bluedox.css',
  '/bluedox.js',
  '/catalogo.html',
  '/catalogo.js',
  '/catalogo-admin.html',
  '/catalogo-admin.js',
  '/manifest.json',
  '/favicon.ico',
  '/icons/favicon-16.png',
  '/icons/favicon-32.png',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/vendor/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Distingue "primeira instalação" de "atualização de versão": só na atualização
// existe uma tela aberta rodando código velho que precisa ser recarregada.
let ehAtualizacaoDeVersao = false;

self.addEventListener('install', event => {
  ehAtualizacaoDeVersao = !!self.registration.active;
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // cache.addAll() é tudo-ou-nada: se UM único asset da lista faltar
      // (404) ou a rede falhar num deles, a promise inteira rejeita e
      // NENHUM asset é cacheado — foi o que aconteceu quando icon-180.png
      // ficou referenciado aqui sem o arquivo existir. cache.add() individual
      // com allSettled isola a falha: um asset ausente vira um aviso no
      // console, os demais continuam sendo cacheados normalmente.
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => {
          console.warn('[SW] Falha ao pre-cachear (ignorado):', url, err.message);
          throw err;
        }))
      );
    }).then(() => self.skipWaiting())
  );
});

// Recarrega as telas abertas assim que a nova versão assume o controle. Sem
// isso, o app que já estava aberto continuava exibindo o HTML/JS antigos até o
// usuário fechar e abrir de novo — era o motivo de um deploy parecer "não ter
// pego" no celular.
async function recarregarClientesAbertos() {
  if (!ehAtualizacaoDeVersao) return;
  const janelas = await self.clients.matchAll({ type: 'window' });
  janelas.forEach(janela => {
    try {
      // Sem await de propósito: navigate() só resolve quando a nova navegação
      // termina de ser servida por este mesmo SW. Esperar por ela travaria a
      // ativação, e a navegação nunca sairia do lugar.
      janela.navigate(janela.url).catch(() => {});
    } catch (e) {
      // Alguns navegadores não expõem navigate() — o network-first do fetch já
      // garante conteúdo novo no próximo carregamento.
    }
  });
}

self.addEventListener('activate', event => {
  const prepararNovaVersao = caches.keys().then(keys => {
    return Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      })
    );
  }).then(() => self.clients.claim());

  event.waitUntil(prepararNovaVersao);
  // Fora do waitUntil: a recarga depende deste SW já estar ativo para responder
  // à navegação — só pode acontecer depois que a ativação terminar.
  prepararNovaVersao.then(() => recarregarClientesAbertos());
});

// Resposta de último recurso: sem ela, um respondWith que resolve para
// undefined estoura "Failed to convert value to 'Response'".
function respostaOffline() {
  return new Response(
    JSON.stringify({ offline: true, erro: 'Sem conexão com o servidor.' }),
    { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'application/json' } }
  );
}

// HTML, CSS e JS servidos pelo próprio domínio — o que é reconstruído a cada
// deploy. Fica de fora tudo que vem de CDN e os binários (ícones, imagens).
function ehAppShell(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return url.pathname === '/' || /\.(html|css|js|json)$/i.test(url.pathname);
}

self.addEventListener('fetch', event => {
  // Só GET passa pelo cache. POST/PUT/DELETE não podem ser armazenados
  // (cache.put lança) e devem ir direto para a rede.
  if (event.request.method !== 'GET') return;

  // O canal de tempo real é uma conexão longa (text/event-stream). Deixamos
  // passar direto: qualquer intermediação do Service Worker atrapalha o fluxo
  // contínuo de eventos.
  if (event.request.url.includes('/api/events')) {
    return;
  }

  if (event.request.url.includes('/api/ponto') || event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        // caches.match devolve undefined quando não há cópia — e respondWith(undefined)
        // vira "Failed to convert value to 'Response'" no console. Devolvemos uma
        // resposta 503 explícita para o app cair no fluxo offline dele.
        const cached = await caches.match(event.request);
        return cached || respostaOffline();
      })
    );
    return;
  }

  // App shell (HTML/CSS/JS do próprio app): rede primeiro, cache como plano B.
  // Esses arquivos mudam a cada deploy — servi-los do cache primeiro fazia o
  // usuário ver a versão anterior até recarregar uma segunda vez. Imagens,
  // ícones e libs de CDN continuam no cache-first (não mudam entre deploys).
  if (ehAppShell(event.request)) {
    event.respondWith(
      fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const copia = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
        }
        return networkResponse;
      }).catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        const shell = await caches.match('/index.html');
        return shell || respostaOffline();
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
      return fetch(event.request)
        .catch(() => caches.match('/index.html'))
        .then(res => res || respostaOffline());
    })
  );
});

self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || 'HuB Operações';
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
