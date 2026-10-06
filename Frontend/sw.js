/* Push only: no API/auth cache and no offline copy of private tickets. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* A visible fallback is mandatory. */ }
  const id = Number(payload.ticketId);
  const ticketId = Number.isSafeInteger(id) && id > 0 ? id : null;
  event.waitUntil(self.registration.showNotification(
    typeof payload.title === 'string' ? payload.title.slice(0, 120) : 'Novo chamado no GCC', {
      body: typeof payload.body === 'string' ? payload.body.slice(0, 180) : 'Abra o GCC para consultar os chamados.',
      icon: '/assets/pwa/icon-192.png', badge: '/assets/pwa/badge.png',
      tag: ticketId ? 'gcc-ticket-' + ticketId : 'gcc-room-ticket',
      renotify: false, requireInteraction: true, data: { ticketId },
    }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const id = Number(event.notification.data?.ticketId);
  // No automatic acceptance: open the authenticated application first.
  const path = '/?rt_group=abertos' + (Number.isSafeInteger(id) && id > 0 ? '&rt_ticket=' + id : '');
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(path); return existing.focus(); }
    return self.clients.openWindow(path);
  })());
});
