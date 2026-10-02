const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function worker() {
  const handlers = {}, notifications = [], navigations = [];
  const self = { location: { origin: 'https://gcc.test' }, skipWaiting: async () => {},
    addEventListener: (key, fn) => handlers[key] = fn,
    registration: { showNotification: async (...args) => notifications.push(args) },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async path => navigations.push(path) } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/sw.js', 'utf8'), { self, URL });
  return { handlers, notifications, navigations, self };
}
test('push produces visible notification, same ticket tag and authenticated link', async () => {
  const w = worker(); let pending;
  w.handlers.push({ data: { json: () => ({ title: 'Sala 10', body: 'Chamado', ticketId: 80 }) }, waitUntil: p => pending = p });
  await pending;
  assert.equal(w.notifications[0][1].tag, 'gcc-ticket-80');
  assert.equal(w.notifications[0][1].renotify, false);
  w.handlers.notificationclick({ notification: { close() {}, data: { ticketId: 80, url: 'https://evil.test' } }, waitUntil: p => pending = p });
  await pending;
  assert.equal(w.navigations[0], '/?rt_group=abertos&rt_ticket=80');
});
test('malformed payload still produces visible notification, never external navigation', async () => {
  const w = worker(); let pending;
  w.handlers.push({ data: { json: () => { throw Error(); } }, waitUntil: p => pending = p });
  await pending;
  assert.equal(w.notifications[0][0], 'Novo chamado no GCC');
  w.handlers.notificationclick({ notification: { close() {}, data: { ticketId: 'https://evil.test' } }, waitUntil: p => pending = p });
  await pending;
  assert.equal(w.navigations[0], '/?rt_group=abertos');
});
test('service worker caches neither private data nor authentication', () => {
  const w = worker(); assert.equal(w.handlers.fetch, undefined);
});
test('phone list has one primary workflow, uses server actions and escapes content', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(__dirname + '/javascript/room-tickets-list.js', 'utf8'), { window, Date });
  const data = { kanban: { columns: { abertos: { count: 1, items: [{ id: 9, room: '<script>x</script>', title: 'Falha', actions: [{ action: 'assumir' }] }] } } } };
  const html = window.RoomTicketsList.renderPhone(data, 'abertos');
  assert.match(html, /Vou atender/); assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /data-rt-move="concluir"|Aceitar alerta|rt-cards/);
  data.kanban.columns.abertos.items[0].actions = [];
  assert.doesNotMatch(window.RoomTicketsList.renderPhone(data, 'abertos'), /Vou atender/);
});
