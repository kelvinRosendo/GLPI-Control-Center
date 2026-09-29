const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const monitorSource = fs.readFileSync(__dirname + '/javascript/room-tickets-monitor.js', 'utf8');
const reportSource = fs.readFileSync(__dirname + '/javascript/room-tickets.js', 'utf8');
const kanbanSource = fs.readFileSync(__dirname + '/javascript/room-tickets-kanban.js', 'utf8');

const flush = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) await new Promise(resolve => setImmediate(resolve));
};

/** Aguarda uma condição sem depender do número exato de voltas do event loop. */
const flushUntil = async (predicate, rounds = 40) => {
  for (let i = 0; i < rounds; i += 1) {
    if (predicate()) return true;
    await new Promise(resolve => setImmediate(resolve));
  }
  return predicate();
};

class FakeCustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
}

/** openedAt é horário de parede de America/Sao_Paulo (UTC-3): subtrai 3 h do instante UTC. */
function spNow(secondsAgo) {
  return new Date(Date.now() - secondsAgo * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
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
    kanban_limit: Number(get('kanban_limit', '25')),
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

function fixture(options = {}) {
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
    UserContext: { getUserName: () => 'Kelvin', getUserEmail: () => 'kelvin@colegiosatelite.com.br' },
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

  // AudioContext falso: o estado real (running/suspended/bloqueado) define o rótulo.
  if (options.audioContext !== undefined) {
    if (options.audioContext !== null) {
      const mode = options.audioContext;
      window.AudioContext = class FakeAudioContext {
        constructor() {
          this.state = mode === 'running' ? 'running' : 'suspended';
          this.currentTime = 0;
          this.destination = {};
        }
        resume() {
          // 'blocked' simula o navegador recusando o áudio sem gesto do usuário.
          if (mode === 'blocked') return Promise.reject(new Error('áudio bloqueado'));
          this.state = 'running';
          return Promise.resolve();
        }
        createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
      };
    }
  }

  const globals = {
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
  };
  // Relógio fixo opcional: idades de chamado ficam determinísticas nos testes.
  if (options.now !== undefined) {
    const fixedNow = options.now;
    globals.Date = class FixedDate extends Date {
      constructor(...args) { if (args.length === 0) super(fixedNow); else super(...args); }
      static now() { return fixedNow; }
    };
  }
  const context = vm.createContext(globals);

  vm.runInContext(monitorSource, context);
  vm.runInContext(kanbanSource, context);
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

// ── conversão de horário: openedAt é horário de parede de America/Sao_Paulo ─

test('parseOpenedAt converte São Paulo (UTC-3) para instante UTC', () => {
  const parse = fixture().window.RoomTicketsMonitor.parseOpenedAt;
  assert.equal(parse('2026-09-28 12:00:00'), Date.parse('2026-09-28T15:00:00.000Z'));
  assert.equal(parse('2026-09-28 00:00:00'), Date.parse('2026-09-28T03:00:00.000Z'));
  // Virada do dia: 28/09 23:59:30 em SP é 29/09 02:59:30 em UTC.
  assert.equal(parse('2026-09-28 23:59:30'), Date.parse('2026-09-29T02:59:30.000Z'));
  assert.equal(parse('2026-09-29 00:00:05'), Date.parse('2026-09-29T03:00:05.000Z'));
  // Datas inválidas não viram instante utilizável: nunca geram alerta.
  assert.ok(Number.isNaN(parse('2026-02-30 10:00:00')));
  assert.ok(Number.isNaN(parse('2026-09-28 25:00:00')));
  assert.ok(Number.isNaN(parse('28/09/2026 12:00:00')));
  assert.ok(Number.isNaN(parse('')));
});

test('fila de alertas com relógio fixo mede a idade real em São Paulo', async () => {
  const NOW = Date.parse('2026-09-28T15:00:05.000Z'); // 12:00:05 em São Paulo
  const f = fixture({ now: NOW });
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1');
  data.data.monitor.recent = [
    ticket(9, 0, { openedAt: '2026-09-28 12:00:00' }),   // há 5 s → dentro da janela
    ticket(10, 0, { openedAt: '2026-09-28 11:57:00' }),  // há 180 s → além dos 120 s
    ticket(11, 0, { openedAt: '2026-02-30 10:00:00' }),  // data inválida → sem alerta
  ];
  await f.settle('/api/tickets/salas?', data);
  assert.deepEqual(Array.from(monitor.getQueue(), alert => alert.id), [9]);
  const alerts = f.events.filter(event => event.type === 'roomtickets:alert');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].detail.ticket.id, 9);
});

test('alerta da primeira hora cruza a virada do dia entre São Paulo e UTC', async () => {
  const NOW = Date.parse('2026-09-29T02:00:10.000Z'); // 23:00:10 de 28/09 em SP
  const f = fixture({ now: NOW });
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1');
  data.data.monitor.recent = [
    ticket(12, 0, { openedAt: '2026-09-28 23:00:00' }), // há 10 s antes da meia-noite em SP
    ticket(13, 0, { openedAt: '2026-09-28 22:50:00' }), // há 610 s → fora da janela
  ];
  await f.settle('/api/tickets/salas?', data);
  assert.deepEqual(Array.from(monitor.getQueue(), alert => alert.id), [12]);
});

// ── escrita no GLPI: assumir, mover e concluir ────────────────────────────

test('assumir chamado grava no GLPI, invalida o cache e avisa as telas', async () => {
  const f = fixture();
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1');
  data.data.monitor.recent = [ticket(9, 15)];
  await f.settle('/api/tickets/salas?', data);
  await f.settle('aceites?ids=', { data: { acknowledgements: {} } });
  assert.equal(monitor.snapshot().data, data.data, 'cache aquecido antes da escrita');
  const reads = () => f.calls.filter(call => call.url.includes('/api/tickets/salas?')).length;
  const before = reads();
  const promise = monitor.assume({ id: 9 }, 'Kelvin Souza');
  await flush();
  const call = f.calls.find(item => !item.settled && item.url.includes('/assumir'));
  assert.ok(call, 'assumir envia POST para o endpoint do GLPI');
  assert.equal(call.method, 'POST');
  assert.equal(call.body.handler, 'Kelvin Souza', 'envia quem vai atender');
  assert.match(call.body.requestId, /^rt-assumir-9-/, 'envia identificador único por submissão');
  await f.settle('9/assumir', { data: {
    ticketId: 9, handlerName: 'Kelvin Souza', handlerSource: 'glpi_user', glpiUserId: 42,
    fromStatus: 1, toStatus: 2, confirmed: true, partial: false,
    acknowledgement: { ticketId: 9, by: 'Kelvin', at: isoNow() },
  } });
  const result = await promise;
  assert.equal(result.handlerName, 'Kelvin Souza');
  // Dados válidos ficam em tela e a tela relê o GLPI depois da mudança.
  assert.equal(monitor.snapshot().data, data.data, 'dados válidos permanecem enquanto relê do GLPI');
  assert.ok(await flushUntil(() => reads() > before),
    'a próxima leitura vai ao GLPI em vez de usar o cache invalidado');
  assert.equal(monitor.snapshot().data, data.data, 'nada esvazia durante a releitura');
  assert.equal(monitor.getQueue().length, 0, 'alerta do chamado assumido sai da fila');
  const changed = f.events.filter(event => event.type === 'roomtickets:changed');
  assert.equal(changed.length, 1, 'as telas recebem a mudança confirmada');
  assert.equal(changed[0].detail.action, 'assumir');
});

test('falha ao assumir mantém o estado anterior e devolve a mensagem', async () => {
  const f = fixture();
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1');
  await f.settle('/api/tickets/salas?', data);
  const promise = monitor.assume({ id: 9 }, 'Outra pessoa');
  await flush();
  await f.fail('9/assumir', Object.assign(new Error('conflito'), { status: 409 }));
  await assert.rejects(() => promise);
  assert.equal(monitor.snapshot().data, data.data, 'nada é invalidado quando o servidor recusa');
  assert.equal(f.events.filter(event => event.type === 'roomtickets:changed').length, 0,
    'sem evento de mudança quando a escrita falha');
});

test('reenvio da mesma movimentação não duplica a gravação', async () => {
  const f = fixture();
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  await f.settle('/api/tickets/salas?', payload('/api/tickets/salas?period=30d&page=1'));
  monitor.move({ id: 7 }, 'concluir', 'Troca do cabo HDMI.');
  await flush();
  const callsAfterFirst = f.calls.filter(call => call.url.includes('/mover'));
  const second = monitor.move({ id: 7 }, 'concluir', 'Troca do cabo HDMI.');
  await flush();
  const calls = f.calls.filter(call => call.url.includes('/mover'));
  assert.equal(calls.length, 1, 'a segunda submissão reaproveita a requisição em voo');
  assert.equal(callsAfterFirst.length, 1);
  const call = calls[0];
  assert.match(call.body.requestId, /^rt-mover-concluir-7-/, 'identificador por movimentação');
  assert.equal(call.body.action, 'concluir');
  assert.equal(call.body.solution, 'Troca do cabo HDMI.', 'envia a solução registrada');
  await f.settle('/mover', { data: { ticketId: 7, toStatus: 5, confirmed: true, partial: false } });
  assert.equal((await second).toStatus, 5, 'as duas submissões recebem o mesmo resultado');
});

test('movimentação parcial é informada em vez de sucesso silencioso', async () => {
  const f = fixture();
  const monitor = f.window.RoomTicketsMonitor;
  monitor.start();
  await flush();
  await f.settle('/api/tickets/salas?', payload('/api/tickets/salas?period=30d&page=1'));
  const promise = monitor.move({ id: 7 }, 'concluir', 'Troca do projetor.');
  await flush();
  await f.settle('/mover', { data: { ticketId: 7, toStatus: 5, confirmed: false, partial: true } });
  const result = await promise;
  assert.equal(result.partial, true);
  const changed = f.events.find(event => event.type === 'roomtickets:changed');
  assert.equal(changed.detail.partial, true, 'a interface sabe que houve falha parcial');
  assert.match(changed.detail.message, /parcial/i);
});

// ── estado real do áudio ──────────────────────────────────────────────────

test('áudio ativado por gesto passa a pronto; sem contexto fica indisponível', async () => {
  const ready = fixture({ audioContext: 'running' });
  const monitor = ready.window.RoomTicketsMonitor;
  assert.deepEqual({ ...monitor.audioStatus(), enabled: undefined }, { state: 'off', label: 'Som desativado', enabled: undefined },
    'começa desativado mesmo com a preferência');
  monitor.enableSound();
  await flush();
  const afterEnable = monitor.audioStatus();
  assert.equal(afterEnable.state, 'ready', 'contexto em execução significa som pronto');
  assert.equal(afterEnable.label, 'Som pronto');
  assert.equal(ready.window.localStorage.getItem('gcc-room-tickets-sound'), '1', 'preferência só é salva após o gesto');
  monitor.setSoundEnabled(false);
  assert.equal(monitor.audioStatus().state, 'off', 'silenciar volta para desativado');

  const blocked = fixture({ audioContext: 'blocked' });
  blocked.window.RoomTicketsMonitor.enableSound();
  await flush();
  assert.equal(blocked.window.RoomTicketsMonitor.audioStatus().state, 'blocked',
    'preferência salva não pode declarar o som pronto quando o navegador bloqueia');
  assert.match(blocked.window.RoomTicketsMonitor.audioStatus().label, /bloqueado/i);

  const unsupported = fixture({ audioContext: null });
  unsupported.window.RoomTicketsMonitor.enableSound();
  await flush();
  assert.equal(unsupported.window.RoomTicketsMonitor.audioStatus().state, 'unavailable',
    'sem AudioContext o estado é indisponível');
});

test('testar som devolve o estado real e não promete o que não pode tocar', async () => {
  const f = fixture({ audioContext: 'suspended' });
  const monitor = f.window.RoomTicketsMonitor;
  monitor.setSoundEnabled(false);
  const result = await monitor.testSound();
  assert.equal(result.state, 'ready', 'o teste de som ativa o contexto a partir do clique');
  const blocked = fixture({ audioContext: 'blocked' });
  const blockedResult = await blocked.window.RoomTicketsMonitor.testSound();
  assert.equal(blockedResult.state, 'blocked');
});

test('preferência salva sem contexto não aparece como som pronto', () => {
  const f = fixture({ audioContext: null });
  f.window.localStorage.setItem('gcc-room-tickets-sound', '1');
  f.window.RoomTicketsMonitor.init();
  f.window.RoomTicketsMonitor.start();
  const state = f.window.RoomTicketsMonitor.audioStatus();
  assert.ok(['blocked', 'off'].includes(state.state), 'nada é prometido antes de uma interação real');
  assert.notEqual(state.state, 'ready');
});

// ── Kanban, visão e atualização automática ─────────────────────────────────

test('Kanban mostra as três colunas com as contagens do conjunto consultado', async () => {
  const f = fixture();
  f.window.RoomTickets.mount();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1&kanban_limit=25');
  data.data.kanban = {
    limit: 25, total: 3, unmapped: 0,
    columns: {
      abertos: { key: 'abertos', label: 'Abertos', statuses: [1], count: 12, shown: 2, hasMore: true, items: [
        { id: 21, room: 'Sala 10', title: 'Projetor sem imagem', types: ['projector'], openedAt: '2026-09-28 10:00:00',
          status: 'aberto', statusId: 1, column: 'abertos', waiting: false, reference: 'L-0021', assignee: { userId: 0, name: '' },
          work: { handlerName: '', handlerSource: '', glpiUserId: 0 } },
        { id: 22, room: 'Sala 12', title: 'Sem internet', types: ['pc'], openedAt: '2026-09-28 09:00:00',
          status: 'aberto', statusId: 1, column: 'abertos', waiting: false, reference: '', assignee: { userId: 0, name: '' }, work: null },
      ] },
      andamento: { key: 'andamento', label: 'Em andamento', statuses: [2, 3, 4], count: 5, shown: 1, hasMore: true, items: [
        { id: 23, room: 'Sala 16', title: 'Projetor queimado', types: ['projector'], openedAt: '2026-09-28 08:00:00',
          status: 'pendente', statusId: 4, column: 'andamento', waiting: true, reference: 'L-0023',
          assignee: { userId: 42, name: 'Ana Ribeiro' }, work: { handlerName: 'Ana Ribeiro', handlerSource: 'glpi_user', glpiUserId: 42 } },
      ] },
      concluidos: { key: 'concluidos', label: 'Concluídos', statuses: [5, 6], count: 2, shown: 1, hasMore: false, items: [
        { id: 24, room: 'Sala 20', title: 'Mouse trocado', types: ['mouse'], openedAt: '2026-09-27 08:00:00',
          status: 'resolvido', statusId: 5, column: 'concluidos', waiting: false, reference: '', assignee: { userId: 0, name: '' },
          work: { solution: 'Troca do mouse', handlerName: 'Bia', handlerSource: 'informado' } },
      ] },
    },
  };
  await f.settle('/api/tickets/salas?', data);
  f.click({ rtView: 'kanban' });
  await flush();
  await f.settle('/api/tickets/salas?', data);
  const html = f.root.innerHTML;
  assert.match(html, /rt-kanban/, 'quadro Kanban renderizado');
  assert.match(html, /Abertos/);
  assert.match(html, /Em andamento/);
  assert.match(html, /Concluídos/);
  assert.match(html, /data-rt-count="abertos">12</, 'contagem vem do conjunto inteiro, não da página');
  assert.match(html, /data-rt-count="andamento">5</);
  assert.match(html, /data-rt-count="concluidos">2</);
  assert.match(html, /Mostrar mais 10/, 'limite por coluna sinalizado');
  assert.match(html, /Responsável<\/span> Ana Ribeiro <small>\(GLPI 42\)<\/small>/, 'responsável atribuído no GLPI');
  assert.match(html, /Responsável não definido/, 'cartão sem responsável é explícito');
  assert.match(html, /Pendente \(Aguardando\)/, 'pendente aparece como Aguardando');
  assert.match(html, /Solução<\/span> Troca do mouse/, 'solução registrada aparece no cartão');
  assert.match(html, /data-rt-move="assumir"/, 'botão acessível de assumir');
  assert.match(html, /data-rt-move="reabrir"/, 'botão acessível de reabrir em Concluídos');
  assert.match(f.calls.at(-1).url, /kanban_limit=25/, 'o limite por coluna viaja na consulta');
  assert.equal(f.window.RoomTickets.getView(), 'kanban');
});

test('ampliar a coluna pede mais cartões e mantém os filtros', async () => {
  const f = fixture();
  f.window.location.search = '?rt_room=0%3Asala%2010';
  f.window.RoomTickets.mount();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1&room=0%3Asala%2010&kanban_limit=25');
  data.data.kanban = { limit: 25, total: 40, unmapped: 0, columns: {
    abertos: { key: 'abertos', label: 'Abertos', count: 40, shown: 25, hasMore: true, items: [] },
    andamento: { key: 'andamento', label: 'Em andamento', count: 0, shown: 0, hasMore: false, items: [] },
    concluidos: { key: 'concluidos', label: 'Concluídos', count: 0, shown: 0, hasMore: false, items: [] },
  } };
  await f.settle('/api/tickets/salas?', data);
  f.click({ rtView: 'kanban' });
  await flush();
  await f.settle('/api/tickets/salas?', data);
  f.click({ rtAction: 'more' });
  await flush();
  assert.match(f.calls.at(-1).url, /kanban_limit=50/, 'mostrar mais amplia o limite explícito');
  assert.match(f.calls.at(-1).url, /room=0%3Asala\+10|room=0%3Asala%2010/, 'o filtro de sala é preservado');
  assert.match(f.window.location.href, /rt_kanban_limit=50/, 'o limite fica na URL');
});

test('última atualização usa o horário de Brasília e distingue cache de consulta', async () => {
  const f = fixture();
  f.window.RoomTickets.mount();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1');
  // CollectedAt é a consulta ao GLPI, com horário de Brasília explícito.
  data.data.meta.collectedAt = '2026-09-28T15:04:05+00:00';
  await f.settle('/api/tickets/salas?', data);
  assert.match(f.root.innerHTML, /Última atualização: 12:04:05/, 'mostra a hora de Brasília da consulta');
  assert.match(f.root.innerHTML, /Brasília/);
  assert.doesNotMatch(f.root.innerHTML, /Exibindo dados em cache/);
  // Falha de consulta com dados em tela: avisa que está exibindo cache.
  f.click({ rtAction: 'refresh' });
  await flush();
  await f.fail('/api/tickets/salas?', Object.assign(new Error('GLPI fora'), { status: 0 }));
  assert.match(f.root.innerHTML, /Exibindo dados em cache — tentando reconectar/,
    'dados anteriores permanecem com aviso de reconexão');
  assert.match(f.root.innerHTML, /rt-cards/, 'o quadro não esvazia na falha');
  assert.match(f.root.innerHTML, /26/, 'os números anteriores continuam visíveis');
});

test('logout descarta a visão, os filtros e o rascunho do Kanban', async () => {
  const f = fixture();
  f.window.RoomTickets.mount();
  await flush();
  const data = payload('/api/tickets/salas?period=30d&page=1');
  data.data.kanban = { limit: 25, total: 0, unmapped: 0, columns: {} };
  await f.settle('/api/tickets/salas?', data);
  f.click({ rtView: 'kanban' });
  await flush();
  await f.settle('/api/tickets/salas?', data);
  assert.equal(f.window.RoomTickets.getView(), 'kanban');
  f.window.RoomTickets.reset();
  assert.equal(f.window.RoomTickets.getView(), 'lista', 'a sessão seguinte não herda a visão');
  assert.equal(f.window.RoomTickets.getData(), null, 'dados do usuário anterior são descartados');
  assert.equal(f.window.RoomTicketsMonitor.getQueue().length, 0, 'fila de alertas esvaziada');
  assert.doesNotMatch(f.window.location.href, /rt_view|rt_kanban_limit/, 'preferências de URL limpas no logout');
});
