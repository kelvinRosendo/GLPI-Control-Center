const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const monitorSource = fs.readFileSync(__dirname + '/javascript/room-tickets-monitor.js', 'utf8');
const reportSource = fs.readFileSync(__dirname + '/javascript/room-tickets.js', 'utf8');

const flush = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) await new Promise(resolve => setImmediate(resolve));
};

class FakeCustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
}

/** openedAt é interpretado como America/Sao_Paulo (UTC-3). */
function spNow(secondsAgo) {
  return new Date(Date.now() - secondsAgo * 1000 + 3 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
function isoNow(secondsAgo = 0) {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

function ticket(id, secondsAgo, extra = {}) {
  return {
    id, room: 'Sala 10', types: ['projector'], openedAt: spNow(secondsAgo), eligible: true,
    title: 'Projetor sem imagem', description: 'Imagem não aparece.', status: 'aberto',
    reference: 'L-' + String(id).padStart(4, '0'), roomSource: 'local_glpi', typeSource: 'categoria_glpi',
    assets: [], ...extra,
  };
}

function payload(url, override = {}) {
  const query = new URL(url, 'https://gcc.example.test').searchParams;
  const get = (key, fallback) => query.get(key) ?? fallback;
  const page = Number(get('page', '1'));
  const filters = {
    period: get('period', '30d'), from: get('from', '2026-08-26'), to: get('to', '2026-09-24'),
    start: '2026-08-26 00:00:00', end: '2026-09-24 23:59:59', timezone: 'America/Sao_Paulo',
    room: get('room', ''), type: get('type', ''), status: get('status', ''), asset: get('asset', ''),
    q: get('q', ''), page, per_page: Number(get('per_page', '25')),
    ...override,
  };
  return { data: {
    filters,
    pagination: { page, pages: 2, total: 26 },
    summary: { total: 26, open: 4, withoutRoom: 1, withoutAsset: 3, review: 1,
      topRooms: [{ label: 'Sala 10', count: 12 }], topTypes: [{ label: 'Projetor', count: 14 }] },
    rankings: { rooms: [{ key: '0:sala 10', label: 'Sala 10', count: 12 }],
      types: [{ key: 'projector', label: 'Projetor', count: 14 }], assets: [] },
    options: { rooms: [{ key: '0:sala 10', label: 'Sala 10' }] },
    meta: { complete: true, collectedAt: isoNow(), warnings: [] },
    items: [ticket(9, 60000, { title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>' })],
    monitor: { recent: [], recentLimit: 30, collectedAt: isoNow() },
  } };
}

function fixture() {
  const timers = new Set();
  const timeouts = new Set();
  const calls = [];
  const events = [];
  const docListeners = new Map();
  const storage = new Map();
  const nodes = new Map();
  const detailBody = { innerHTML: '' };
  const dialog = {
    open: false,
    querySelector: sel => (sel === '.rt-detail-body' ? detailBody : null),
    showModal() { this.open = true; },
    close() { this.open = false; },
  };
  const statusLabel = { textContent: '' };

  function makeNode(key) {
    const node = {
      key, textContent: '', value: '', disabled: false, required: false, checked: true,
      listeners: {},
      addEventListener(name, fn) { this.listeners[name] = fn; },
      removeEventListener(name) { delete this.listeners[name]; },
      querySelector(sel) { return nodeFor(key + ' ' + sel); },
      closest() { return null; },
    };
    if (key === '#rt-filters') {
      node.elements = {};
      for (const name of ['period', 'from', 'to', 'room', 'type', 'status', 'q']) {
        const field = makeNode('#rt-filters :' + name);
        field.value = name === 'period' ? '30d' : '';
        if (name === 'from' || name === 'to') field.disabled = true;
        node.elements[name] = field;
      }
    }
    return node;
  }
  function nodeFor(key) {
    if (!nodes.has(key)) nodes.set(key, makeNode(key));
    return nodes.get(key);
  }

  const root = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(value) { this._html = String(value); nodes.clear(); },
    querySelector(sel) { return nodeFor(sel); },
    addEventListener() {},
    removeEventListener() {},
  };

  const documentMock = {
    hidden: false,
    getElementById(id) {
      if (id === 'main-content') return root;
      if (id === 'rt-detail') return dialog;
      return null;
    },
    querySelector(sel) { return sel === '.rt-toolbar-status' ? statusLabel : null; },
    addEventListener(name, fn) {
      if (!docListeners.has(name)) docListeners.set(name, new Set());
      docListeners.get(name).add(fn);
    },
    removeEventListener(name, fn) { docListeners.get(name)?.delete(fn); },
    dispatchEvent(event) {
      events.push({ type: event.type, detail: event.detail });
      for (const fn of Array.from(docListeners.get(event.type) || [])) fn(event);
      return true;
    },
  };

  function track(method, url, options, body) {
    return new Promise((resolve, reject) => {
      calls.push({ method, url, options, body, resolve, reject, settled: false });
    });
  }

  const window = {
    STATE: { tab: 'chamados-salas' },
    CONFIG: { glpiUrl: 'https://glpi.example.test' },
    location: { href: 'https://gcc.example.test/', search: '' },
    history: { replaceState(_, __, url) {
      window.location.href = String(url);
      window.location.search = new URL(String(url)).search;
    } },
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    ApiClient: {
      get: (url, options) => track('GET', url, options),
      post: (url, body, options) => track('POST', url, options, body),
    },
  };

  const context = vm.createContext({
    window, document: documentMock, console,
    URL, URLSearchParams, CustomEvent: FakeCustomEvent,
    FormData: class {
      constructor(form) { this.form = form; }
      get(key) { return this.form.elements?.[key]?.value; }
    },
    setInterval(fn, ms) { const id = { fn, ms, kind: 'interval' }; timers.add(id); return id; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn, ms) { const id = { fn, ms, kind: 'timeout' }; timeouts.add(id); return id; },
    clearTimeout(id) { timeouts.delete(id); },
  });

  vm.runInContext(monitorSource, context);
  vm.runInContext(reportSource, context);

  function take(match) {
    const call = calls.find(item => !item.settled && item.url.includes(match));
    assert.ok(call, 'nenhuma requisição pendente para "' + match + '" · pendentes: ' +
      calls.filter(item => !item.settled).map(item => item.method + ' ' + item.url).join(' | '));
    call.settled = true;
    return call;
  }

  return {
    window, root, dialog, detailBody, statusLabel, calls, timers, timeouts, events,
    pending: () => calls.filter(call => !call.settled),
    async settle(match, value) { const call = take(match); call.resolve(value); await flush(); },
    async fail(match, error) { const call = take(match); call.reject(error); await flush(); },
    click(dataset) {
      const dashboard = root.querySelector('.rt-dashboard');
      dashboard.listeners.click({ target: { closest: () => ({ dataset }) } });
    },
    change(sel, checked) { root.querySelector(sel).listeners.change({ target: { checked } }); },
    submit() { root.querySelector('#rt-filters').listeners.submit({ preventDefault() {} }); },
    listCalls: () => calls.filter(call => call.url.includes('/api/tickets/salas?')),
  };
}

test('relatório carrega pelo monitor, escapa conteúdo e abre detalhes', async () => {
  const f = fixture();
  f.window.RoomTickets.mount();
  f.window.RoomTickets.mount();
  await flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, 'GET');
  assert.equal(f.calls[0].url, '/api/tickets/salas?period=30d&page=1');
  assert.equal(f.calls[0].options.cache, false);
  assert.equal(f.calls[0].options.retries, 0);
  assert.match(f.root.innerHTML, /Consultando chamados/);
  await f.settle('/api/tickets/salas?', payload(f.calls[0].url));
  assert.doesNotMatch(f.root.innerHTML, /Consultando/);
  assert.match(f.root.innerHTML, /26/);
  assert.match(f.root.innerHTML, /Atualizado/);
  assert.match(f.root.innerHTML, /&lt;img/);
  assert.doesNotMatch(f.root.innerHTML, /<img src=x/);
  f.click({ rtTicket: '9' });
  assert.equal(f.dialog.open, true);
  assert.match(f.detailBody.innerHTML, /&lt;script&gt;/);
  assert.match(f.detailBody.innerHTML, /https:\/\/glpi.example.test\/front\/ticket.form.php\?id=9/);
});

test('consultas simultâneas compartilham a requisição e a leitura em cache', async () => {
  const f = fixture();
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  const first = monitor.refresh({ q: 'period=30d&page=1', reason: 'manual' });
  const second = monitor.refresh({ q: 'period=30d&page=1', reason: 'manual' });
  await flush();
  assert.equal(f.listCalls().length, 1);
  await f.settle('/api/tickets/salas?', payload(f.calls[0].url));
  const [resultOne, resultTwo] = await Promise.all([first, second]);
  assert.equal(resultOne.ok, true);
  assert.equal(resultTwo.ok, true);
  const cached = await monitor.refresh({ q: 'period=30d&page=1', maxAge: 4000 });
  assert.equal(cached.ok, true);
  assert.equal(f.listCalls().length, 1);
});

test('clique no ranking e paginação enviam filtros ao backend', async () => {
  const f = fixture();
  f.window.RoomTickets.mount();
  await flush();
  await f.settle('/api/tickets/salas?', payload(f.calls[0].url));
  f.click({ rtDimension: 'type', rtKey: 'projector' });
  await flush();
  assert.match(f.calls[1].url, /type=projector/);
  assert.match(f.calls[1].url, /page=1/);
  await f.settle('type=projector', payload(f.calls[1].url));
  f.click({ rtAction: 'next' });
  await flush();
  assert.match(f.calls[2].url, /page=2/);
  assert.match(f.calls[2].url, /type=projector/);
});

test('datas personalizadas e busca entram na consulta', async () => {
  const f = fixture();
  f.window.RoomTickets.mount();
  await flush();
  await f.settle('/api/tickets/salas?', payload(f.calls[0].url));
  const form = f.root.querySelector('#rt-filters');
  form.elements.period.value = 'custom';
  form.elements.from.value = '2026-09-01';
  form.elements.to.value = '2026-09-20';
  form.elements.q.value = 'mouse & teclado';
  f.submit();
  await flush();
  assert.match(f.calls[1].url, /period=custom/);
  assert.match(f.calls[1].url, /from=2026-09-01/);
  assert.match(f.calls[1].url, /q=mouse\+%26\+teclado/);
});

test('resposta com filtros divergentes não substitui os dados anteriores', async () => {
  const f = fixture();
  f.window.RoomTickets.mount();
  await flush();
  await f.settle('/api/tickets/salas?', payload(f.calls[0].url));
  assert.match(f.root.innerHTML, /26/);
  f.click({ rtDimension: 'type', rtKey: 'projector' });
  await flush();
  const call = f.calls.find(item => !item.settled && item.url.includes('type=projector'));
  assert.ok(call, 'a consulta filtrada deve ser enviada');
  await f.settle('type=projector', payload(call.url, { type: '' }));
  assert.match(f.root.innerHTML, /não corresponde aos filtros/);
  assert.match(f.root.innerHTML, /26/);
  assert.match(f.root.innerHTML, /rt-cards/);
});

test('erro de sessão congela o monitor e não vira ranking zerado', async () => {
  const f = fixture();
  f.window.RoomTickets.mount();
  await flush();
  const sessionError = () => Object.assign(new Error('HTTP 401'), { status: 401 });
  await f.fail('/api/tickets/salas?', sessionError());
  // A nova renderização tenta retomar o monitoramento; a sessão segue inválida.
  await flush();
  if (f.pending().some(call => call.url.includes('/api/tickets/salas?'))) {
    await f.fail('/api/tickets/salas?', sessionError());
  }
  assert.equal(f.window.RoomTicketsMonitor.getState(), 'expired');
  assert.match(f.root.innerHTML, /sessão expirou/);
  assert.doesNotMatch(f.root.innerHTML, /rt-cards/);
  assert.ok(f.events.some(event => event.type === 'roomtickets:expired'));
  assert.equal(f.timers.size, 1);
  const before = f.calls.length;
  const result = await f.window.RoomTicketsMonitor.refresh({ q: 'period=30d&page=1' });
  assert.equal(result.ok, false);
  assert.equal(f.calls.length, before);
});

test('resposta atrasada depois do logout é descartada; timers são removidos', async () => {
  const f = fixture();
  f.window.RoomTickets.mount();
  await flush();
  assert.equal(f.timers.size, 3);
  f.window.RoomTickets.reset();
  f.root.innerHTML = 'LOGIN';
  await f.settle('/api/tickets/salas?', payload(f.calls[0].url));
  assert.equal(f.root.innerHTML, 'LOGIN');
  assert.equal(f.window.RoomTicketsMonitor.snapshot().data, null);
  assert.equal(f.timers.size, 0);
});

test('resposta ao sair da página não substitui outra tela', async () => {
  const f = fixture();
  f.window.RoomTickets.mount();
  await flush();
  f.window.STATE.tab = 'home';
  f.window.RoomTickets.unmount();
  f.root.innerHTML = 'HOME';
  await f.settle('/api/tickets/salas?', payload(f.calls[0].url));
  assert.equal(f.root.innerHTML, 'HOME');
});

test('fila de alertas aplica baseline e aceita dispensa', async () => {
  const f = fixture();
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1');
  data.data.monitor.recent = [
    ticket(9, 15),
    ticket(10, 600),
    ticket(11, 20, { acknowledgement: { by: 'T.I.', at: isoNow() } }),
    ticket(12, 30, { eligible: false }),
  ];
  await f.settle('/api/tickets/salas?', data);
  assert.deepEqual(Array.from(monitor.getQueue(), alert => alert.id), [9]);
  assert.equal(monitor.snapshot().alert.ticket.id, 9);
  assert.ok(f.calls.some(call => call.url.includes('/api/tickets/salas/aceites?ids=9')));
  monitor.dismiss(9);
  assert.equal(monitor.getQueue().length, 0);
  assert.equal(monitor.snapshot().alert, null);
});

test('aceite feito em outra tela é aplicado pela sincronização', async () => {
  const f = fixture();
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1');
  data.data.monitor.recent = [ticket(9, 15), ticket(10, 25)];
  await f.settle('/api/tickets/salas?', data);
  // A fila é ordenada do mais antigo para o mais recente.
  assert.deepEqual(Array.from(monitor.getQueue(), alert => alert.id), [10, 9]);
  await f.settle('aceites?ids=', { data: { acknowledgements: { '10': { by: 'Painel TV', at: isoNow() } } } });
  assert.deepEqual(Array.from(monitor.getQueue(), alert => alert.id), [9]);
  assert.equal(monitor.getData().monitor.recent.find(item => item.id === 10).acknowledgement.by, 'Painel TV');
});

test('aceite confirma no servidor e compartilha o reconhecimento', async () => {
  const f = fixture();
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1');
  data.data.monitor.recent = [ticket(9, 15)];
  await f.settle('/api/tickets/salas?', data);
  await f.settle('aceites?ids=', { data: { acknowledgements: {} } });
  const promise = monitor.accept({ id: 9 });
  await flush();
  const call = f.calls.find(item => !item.settled && item.url.includes('9/aceite'));
  assert.ok(call, 'aceite deve confirmar no servidor');
  assert.equal(call.method, 'POST');
  await f.settle('9/aceite', { data: { acknowledgement: { by: 'Operador', at: isoNow() } } });
  const acknowledgement = await promise;
  assert.equal(acknowledgement.by, 'Operador');
  assert.equal(monitor.getQueue().length, 0);
  assert.equal(monitor.getData().monitor.recent[0].acknowledgement.by, 'Operador');
  assert.ok(f.events.some(event => event.type === 'roomtickets:accepted' && event.detail.ticketId === 9));
});

test('preferências de monitoramento e som ficam no armazenamento', async () => {
  const f = fixture();
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  monitor.setMonitorEnabled(false);
  assert.equal(monitor.isMonitorEnabled(), false);
  assert.equal(monitor.getState(), 'paused');
  assert.equal(f.window.localStorage.getItem('gcc-room-tickets-monitor'), '0');
  monitor.setSoundEnabled(true);
  assert.equal(monitor.isSoundEnabled(), true);
  assert.equal(f.window.localStorage.getItem('gcc-room-tickets-sound'), '1');
});
