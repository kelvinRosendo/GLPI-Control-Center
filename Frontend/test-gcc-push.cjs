const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function phone(request, register = async () => ({ pushManager: { getSubscription: async () => null } })) {
  const host = { isConnected: true, innerHTML: '', buttons: [], querySelectorAll() {
    this.buttons = [...this.innerHTML.matchAll(/<button[^>]*data-phone="([^"]+)"[^>]*>/g)].map(m => ({
      dataset: { phone: m[1] }, disabled: m[0].includes(' disabled'), addEventListener(_, fn) { this.click = fn; },
    })); return this.buttons;
  } };
  const window = { isSecureContext: true, PushManager: {}, Notification: { permission: 'default' },
    matchMedia: () => ({ matches: false }), addEventListener() {},
    UserContext: { getCurrentUser: () => ({ email: 'ti@example.test' }) }, ApiClient: { request } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/javascript/gcc-phone.js', 'utf8'), {
    window, Notification: window.Notification, navigator: { serviceWorker: { register }, userAgent: '' },
    localStorage: { getItem: () => null },
  });
  return { host, app: window.GccPhone, button: name => host.buttons.find(b => b.dataset.phone === name) };
}
const settled = () => new Promise(resolve => setImmediate(resolve));
test('notification query failure can recover in place without login', async () => {
  let calls = 0;
  const p = phone(async () => { if (++calls === 1) throw Error(); return { data: { enabled: true } }; });
  p.app.mount(p.host); await settled();
  assert.ok(p.button('enable').disabled);
  p.button('retry').click(); await settled();
  assert.equal(calls, 2); assert.equal(p.button('enable').disabled, false);
});
test('registration failure after settings loaded still offers retry', async () => {
  let calls = 0;
  const p = phone(async () => ({ data: { enabled: true } }), async () => { calls++; throw Error(); });
  p.app.mount(p.host); await settled();
  assert.ok(p.button('retry')); assert.ok(p.button('enable').disabled);
  const retry = p.button('retry'); retry.click(); retry.click(); await settled();
  assert.equal(calls, 2);
});
test('disabled server configuration is displayed without attempting registration', async () => {
  const p = phone(async () => ({ data: { enabled: false, message: 'Configuração pendente' } }), () => { throw Error('must not register'); });
  p.app.mount(p.host); await settled();
  assert.match(p.host.innerHTML, /Configuração pendente/);
  assert.ok(p.button('enable').disabled); assert.ok(p.button('retry'));
});
test('logout discards pending notification settings', async () => {
  let resolve;
  const p = phone(() => new Promise(r => { resolve = r; }));
  p.app.mount(p.host); p.app.reset(); resolve({ data: { enabled: true } }); await settled();
  assert.ok(p.button('enable').disabled);
});
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
