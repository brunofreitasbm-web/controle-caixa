self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || 'Controle de Caixa';
      const options = {
        body: data.body || 'Nova notificação.',
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
