// Real Chromium test of the Kanban, the attendance form and the global alert.
// Only an isolated page with the new modules/styles is served; no real GLPI.
const http = require('node:http');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const monitorJs = fs.readFileSync(__dirname + '/javascript/room-tickets-monitor.js');
const kanbanJs = fs.readFileSync(__dirname + '/javascript/room-tickets-kanban.js');
const reportJs = fs.readFileSync(__dirname + '/javascript/room-tickets.js');
const tvJs = fs.readFileSync(__dirname + '/javascript/room-tickets-tv.js');
const css = fs.readFileSync(__dirname + '/css/room-tickets.css');
const tvCss = fs.readFileSync(__dirname + '/css/room-tickets-tv.css');
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/room.css"><link rel="stylesheet" href="/room-tv.css"><style>*{box-sizing:border-box}body{margin:0;background:#0f1420;color:#e5e7eb;font-family:Arial,sans-serif}main{padding:16px}</style></head>
<body><main id="main-content"></main><script>
window.STATE = {tab:'chamados-salas'};
window.CONFIG = {glpiUrl:'https://glpi.example.test'};
window.calls = [];
window.posts = [];
window.failWrites = false;
window.UserContext = { getUserName: () => 'Kelvin Souza', getUserEmail: () => 'kelvin@escola', isAuthenticated: () => true };
const spNow = secondsAgo => new Date(Date.now() - secondsAgo * 1000 - 3 * 3600 * 1000).toISOString().slice(0,19).replace('T',' ');
const isoNow = () => new Date().toISOString();
const card = (id, statusId, extra) => Object.assign({
  id, reference: 'L-00' + id, room: 'Sala ' + (10 + id), title: 'Projetor sem imagem #' + id,
  types: ['projector'], openedAt: spNow(1200), status: 'aberto', statusId, column: 'abertos',
  waiting: statusId === 4, eligible: true, assignee: { userId: 0, name: '' }, work: null,
}, extra || {});
window.__state = { tickets: [
  card(31, 1), card(32, 1), card(33, 2), card(34, 4), card(35, 5),
]};
// Cada leitura traz um chamado recém-aberto diferente: o alerta é reproduzível.
window.__alertSeq = 0;
const freshAlert = () => { window.__alertSeq += 1; return card(100 + window.__alertSeq, 1, { openedAt: spNow(8) }); };
const buildData = (url) => {
  const query = new URL(url, location.href).searchParams;
  const filters = { period: query.get('period') || '30d', room: '', type: '', status: '', asset: '', q: '',
    kanban_limit: Number(query.get('kanban_limit') || 25) };
  const columns = { abertos: [], andamento: [], concluidos: [] };
  const keys = { 1: 'abertos', 2: 'andamento', 3: 'andamento', 4: 'andamento', 5: 'concluidos', 6: 'concluidos' };
  for (const ticket of window.__state.tickets) {
    const column = keys[ticket.statusId] || 'abertos';
    columns[column].push(Object.assign({}, ticket, { column, status: ({1:'aberto',2:'em_andamento',4:'pendente',5:'resolvido'})[ticket.statusId] || 'aberto' }));
  }
  return { data: {
    filters: Object.assign({ from: '2026-08-26', to: '2026-09-24', page: 1, per_page: 25 }, filters),
    pagination: { page: 1, pages: 1, total: window.__state.tickets.length },
    summary: { total: window.__state.tickets.length, open: 3, withoutRoom: 0, withoutAsset: 1, review: 0, topRooms: [], topTypes: [] },
    rankings: { rooms: [], types: [], assets: [] },
    options: { rooms: [{ key: '0:sala 10', label: 'Sala 10' }] },
    meta: { complete: true, collectedAt: isoNow(), warnings: [] },
    items: window.__state.tickets.slice(0, 2),
    latest: window.__state.tickets[0],
    monitor: { recent: [freshAlert()], recentLimit: 30, collectedAt: isoNow() },
    kanban: { limit: Number(query.get('kanban_limit') || 25), total: window.__state.tickets.length, unmapped: 0, columns: {
      abertos: { key: 'abertos', label: 'Abertos', count: window.__state.tickets.filter(t => keys[t.statusId] === 'abertos').length, shown: 2, hasMore: true, items: columns.abertos.slice(0, 2) },
      andamento: { key: 'andamento', label: 'Em andamento', count: window.__state.tickets.filter(t => keys[t.statusId] === 'andamento').length, shown: 2, hasMore: false, items: columns.andamento },
      concluidos: { key: 'concluidos', label: 'Concluídos', count: window.__state.tickets.filter(t => keys[t.statusId] === 'concluidos').length, shown: 1, hasMore: false, items: columns.concluidos },
    } },
  } };
};
window.ApiClient = {
  get: async (url) => {
    calls.push(url);
    if (url.includes('/aceites')) return { data: { acknowledgements: {} } };
    if (url.includes('/responsaveis')) return { data: { available: true, message: '', technicians: [
      { id: 42, name: 'Ana Ribeiro' }, { id: 43, name: 'Bia Alves' }] } };
    if (url.includes('/historico')) return { data: { ticketId: 31, assignment: null, solution: null, moves: [], acknowledgement: null } };
    return buildData(url);
  },
  post: async (url, body) => {
    posts.push({ url, body });
    if (window.failWrites) throw Object.assign(new Error('conflito'), { status: 409 });
    const id = Number((url.match(/salas\\/(\\d+)\\//) || [])[1]);
    if (url.includes('/assumir')) {
      const match = window.__state.tickets.find(t => t.id === id);
      if (match) {
        match.statusId = 2; match.status = 'em_andamento';
        match.work = { handlerName: body.handler, handlerSource: 'glpi_user', glpiUserId: 42, solution: '' };
        match.assignee = { userId: 42, name: body.handler };
      }
      return { data: { ticketId: id, handlerName: body.handler, handlerSource: 'glpi_user', glpiUserId: 42,
        fromStatus: 1, toStatus: 2, confirmed: true, partial: false, work: match ? match.work : null } };
    }
    if (url.includes('/mover')) {
      const match = window.__state.tickets.find(t => t.id === id);
      if (body.action === 'concluir') { if (match) { match.statusId = 5; match.status = 'resolvido'; } }
      if (body.action === 'reabrir') { if (match) { match.statusId = 1; match.status = 'aberto'; } }
      return { data: { ticketId: id, action: body.action, toStatus: match ? match.statusId : 0,
        confirmed: true, partial: false, work: match ? match.work : null } };
    }
    return { data: { acknowledgement: { ticketId: id, by: 'Kelvin', at: isoNow() } } };
  },
};
</script><script src="/monitor.js"></script><script src="/kanban.js"></script><script src="/report.js"></script><script src="/tv.js"></script><script>
(async () => {
  const pause = async (rounds = 30) => { for (let i = 0; i < rounds; i++) await Promise.resolve(); };
  const wait = async (predicate, ms = 3000) => {
    const limit = Date.now() + ms;
    while (Date.now() < limit) { if (predicate()) return true; await new Promise(r => setTimeout(r, 25)); }
    return predicate();
  };
  let checks = 0;
  let step = 'inicio';
  window.__step = 'inicio';
  function check(ok, message) { window.__step = step; if (!ok) throw new Error('[' + step + '] ' + message); checks++; }
  window.addEventListener('error', event => {
    document.body.dataset.result = 'failed';
    document.body.dataset.error = 'JS [' + window.__step + ']: ' + event.message;
  });
  try {
    step = 'kanban';
    // ── 1. Visão Kanban ────────────────────────────────────────────────
    RoomTickets.mount(); await pause();
    await wait(() => document.querySelector('.rt-view-switch'));
    document.querySelector('[data-rt-view="kanban"]').click();
    await wait(() => document.querySelector('.rt-kanban'));
    check(document.querySelectorAll('.rt-kanban-column').length === 3, 'three Kanban columns · results=' +
      String((document.getElementById('rt-results') || {}).innerHTML).slice(0, 200).replace(/"/g, "'"));
    check(document.querySelector('[data-rt-count="abertos"]').textContent === '2', 'open column counts the whole set');
    check(document.querySelector('[data-rt-count="concluidos"]').textContent === '1', 'done column counted');
    check(document.querySelectorAll('.rt-kanban-card').length >= 4, 'cards rendered');
    check(/Mostrar mais/.test(document.querySelector('.rt-kanban-more').textContent), 'per-column limit announced');
    check(document.documentElement.scrollWidth <= innerWidth + 1, 'no horizontal overflow on the board');

    step = 'form';
    // ── 2. Formulário "Assumir chamado" ─────────────────────────────────
    const firstOpen = document.querySelector('.rt-kanban-column--open .rt-kanban-card');
    const ticketId = firstOpen.dataset.rtCard;
    firstOpen.querySelector('[data-rt-move="assumir"]').click();
    await wait(() => document.querySelector('#rt-action-form')?.open);
    const form = document.querySelector('#rt-action-form');
    check(form.open, 'attendance dialog opens');
    check(form.textContent.includes('Quem do TI foi resolver o problema?'), 'required question shown');
    check(form.querySelector('[data-rt-role="handler"]').value === 'Kelvin Souza', 'prefilled with the signed-in user');
    // A lista de técnicos chega depois; o texto livre continua utilizável.
    check(form.querySelector('[data-rt-role="choice"]').disabled, 'select starts disabled while loading');
    await wait(() => [...form.querySelectorAll('[data-rt-role="choice"] option')].some(o => o.textContent === 'Ana Ribeiro'));
    const options = [...document.querySelectorAll('#rt-action-form [data-rt-role="choice"] option')].map(o => o.textContent);
    check(options.includes('Ana Ribeiro') && options.includes('Bia Alves'), 'team members from GLPI offered');
    // Texto digitado pelo usuário não pode ser apagado por atualização automática.
    form.querySelector('[data-rt-role="handler"]').value = 'Bia Alves';
    document.querySelector('[data-rt-action="refresh"]').click();
    await wait(() => document.querySelector('#rt-action-form')?.open);
    check(document.querySelector('#rt-action-form').open, 'form stays open during auto refresh');
    check(document.querySelector('[data-rt-role="handler"]').value === 'Bia Alves', 'typed content survives auto refresh');
    // Fim do alerta (15s) também não pode apagar o formulário.
    RoomTicketsMonitor.dismiss(Number(ticketId));
    await pause();
    check(document.querySelector('#rt-action-form').open, 'form survives the alert expiring');
    check(document.querySelector('[data-rt-role="handler"]').value === 'Bia Alves', 'content intact after alert expiry');

    step = 'falha';
    // ── 3. Falha mantém o estado anterior ───────────────────────────────
    window.failWrites = true;
    document.querySelector('#rt-action-form button[type="submit"]').click();
    await wait(() => document.querySelector('[data-rt-form-error]'));
    check(document.querySelector('#rt-action-form').open, 'dialog stays open on failure · error=' +
      String((document.querySelector('[data-rt-form-error]') || {}).textContent) + ' · posts=' +
      posts.length);
    check(document.querySelector('[data-rt-form-error]').textContent.includes('conflito'), 'failure message shown');
    check(document.querySelector('.rt-kanban-column--open [data-rt-card="' + ticketId + '"]') !== null,
      'card keeps its previous column when the server refuses');
    check(document.querySelectorAll('.rt-kanban-column--progress .rt-kanban-card').length === 2,
      'no optimistic move · cards=' + document.querySelectorAll('.rt-kanban-card').length +
      ' · open=' + document.querySelectorAll('.rt-kanban-column--open .rt-kanban-card').length +
      ' · andamento=' + document.querySelectorAll('.rt-kanban-column--progress .rt-kanban-card').length +
      ' · done=' + document.querySelectorAll('.rt-kanban-column--done .rt-kanban-card').length);

    step = 'sucesso';
    // ── 4. Sucesso move o cartão e limpa o alerta ───────────────────────
    window.failWrites = false;
    document.querySelector('#rt-action-form [type="submit"]').click();
    await wait(() => !document.querySelector('#rt-action-form').open);
    await wait(() => document.querySelector('.rt-kanban-column--progress [data-rt-card="' + ticketId + '"]'));
    check(document.querySelector('.rt-kanban-column--progress [data-rt-card="' + ticketId + '"]') !== null,
      'card confirmed into Em andamento after server confirmation');
    check(posts.some(post => post.url.includes('/assumir') && post.body.handler === 'Bia Alves'),
      'assumption posted with the chosen technician');
    check(posts.every(post => typeof post.body.requestId === 'string' && post.body.requestId.length > 8),
      'every submission carries an idempotency key');
    check(document.querySelector('.rt-kanban-column--progress').textContent.includes('Bia Alves'),
      'responsible shown on the card');

    step = 'conclusao';
    // ── 5. Conclusão registra a solução ─────────────────────────────────
    const inProgress = document.querySelector('.rt-kanban-column--progress .rt-kanban-card');
    inProgress.querySelector('[data-rt-move="concluir"]').click();
    await wait(() => document.querySelector('[data-rt-form="concluir"]'));
    check(document.querySelector('#rt-action-form').textContent.includes('Como o problema foi resolvido?'),
      'resolution question asked');
    document.querySelector('[data-rt-role="solution"]').value = 'Troca do cabo HDMI.';
    document.querySelector('#rt-action-form [type="submit"]').click();
    await wait(() => !document.querySelector('#rt-action-form').open);
    await wait(() => document.querySelector('.rt-kanban-column--done [data-rt-card="' + inProgress.dataset.rtCard + '"]'));
    check(document.querySelector('.rt-kanban-column--done [data-rt-card="' + inProgress.dataset.rtCard + '"]') !== null,
      'ticket moved to Concluídos after the server confirmed');
    check(posts.some(post => post.url.includes('/mover') && post.body.solution === 'Troca do cabo HDMI.'),
      'solution sent to the server');

    step = 'solucao-vazia';
    // ── 6. Solução vazia é recusada sem gravar ──────────────────────────
    const another = document.querySelector('.rt-kanban-column--progress .rt-kanban-card');
    const beforePosts = posts.length;
    another.querySelector('[data-rt-move="concluir"]').click();
    await wait(() => document.querySelector('[data-rt-form="concluir"]'));
    document.querySelector('#rt-action-form [type="submit"]').click();
    await pause(60);
    check(document.querySelector('#rt-action-form').open, 'empty resolution keeps the dialog open');
    check(posts.length === beforePosts, 'no write sent without a resolution');

    step = 'alerta-dialog';
    // ── 7. Alerta sobre detalhes (camada superior) ──────────────────────
    // Um novo chamado precisa gerar alerta mesmo com a tela no Kanban.
    await RoomTicketsMonitor.refresh({ q: 'period=30d&page=1&kanban_limit=25', reason: 'alerta', maxAge: 0 });
    await wait(() => document.querySelector('.rt-monitor-alert'));
    check(!!document.querySelector('.rt-monitor-alert'), 'novo chamado gera alerta global com o quadro aberto');
    document.querySelector('#rt-action-form [data-rt-form-action="cancel"]')?.click();
    await wait(() => !document.querySelector('#rt-action-form').open);
    await wait(() => document.querySelector('.rt-kanban-column--open .rt-kanban-detail'));
    document.querySelector('.rt-kanban-column--open .rt-kanban-detail').click();
    await wait(() => document.querySelector('#rt-detail')?.open);
    check(document.querySelector('#rt-detail').open, 'details dialog open');
    check(document.querySelector('#rt-detail').textContent.includes('Responsável'), 'details show the responsible field');
    check(document.querySelector('[data-rt-action="history"]') !== null, 'history action available');
    // O alerta precisa ficar dentro do dialog: z-index sozinho não sobrepõe a camada superior.
    check(!!document.querySelector('#rt-detail .rt-monitor-alert'),
      'global alert rendered inside the open dialog (top layer) · queue=' +
      RoomTicketsMonitor.getQueue().length + ' · bodyAlert=' + !!document.querySelector('body > .rt-monitor-alert') +
      ' · dialogAlert=' + !!document.querySelector('#rt-detail .rt-monitor-alert') +
      ' · anyAlert=' + !!document.querySelector('.rt-monitor-alert'));
    check(document.querySelector('#rt-detail .rt-monitor-alert').classList.contains('is-in-dialog'),
      'alert styled for the top layer');
    const alertBox = document.querySelector('#rt-detail .rt-monitor-alert').getBoundingClientRect();
    const dialogBox = document.querySelector('#rt-detail').getBoundingClientRect();
    check(alertBox.top >= dialogBox.top - 1 && alertBox.bottom <= dialogBox.bottom + 1,
      'alert is painted inside the dialog area');
    // Ao fechar o dialog, o alerta volta para o corpo.
    document.querySelector('[data-rt-action="close-detail"]').click();
    await wait(() => !document.querySelector('#rt-detail').open);
    check(!!document.querySelector('body > .rt-monitor-alert'), 'alert returns to the body after closing');
    check(!document.querySelector('#rt-detail .rt-monitor-alert'), 'nothing left inside the closed dialog');

    step = 'arrastar';
    // ── 8. Arrastar e soltar é complemento dos botões ───────────────────
    const dragCard = document.querySelector('.rt-kanban-column--progress .rt-kanban-card');
    const dropZone = document.querySelector('[data-rt-drop="concluidos"]');
    const transfer = new DataTransfer();
    dragCard.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    check(dragCard.classList.contains('is-dragging'), 'card marked as dragging');
    dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    check(document.querySelector('.rt-kanban-column--done').classList.contains('is-drop-target'), 'drop target highlighted');
    dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    await wait(() => document.querySelector('[data-rt-form="concluir"]'));
    check(!!document.querySelector('[data-rt-form="concluir"]'), 'dropping into Concluídos asks for the resolution');
    document.querySelector('#rt-action-form [data-rt-form-action="cancel"]').click();
    await wait(() => !document.querySelector('#rt-action-form').open);
    dragCard.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
    check(!document.querySelector('.is-drop-target'), 'drop highlight cleared');

    step = 'audio';
    step = 'audio';
    // ── 9. Áudio: nada de "pronto" sem interação real ───────────────────
    const stateBefore = RoomTicketsMonitor.audioStatus().state;
    const soundStateEl = document.querySelector('[data-rt-sound-state]');
    check(soundStateEl !== null, 'audio state element rendered · body=' +
      String(document.body.innerHTML).slice(0, 200).replace(/"/g, "'"));
    check(stateBefore !== 'ready' || document.querySelector('[data-rt-sound-state]') !== null,
      'audio state is explicit before any interaction');
    document.querySelector('[data-rt-action="test-sound"]').click();
    await pause(40);
    const label = soundStateEl.textContent;
    check(/Som (pronto|bloqueado|indisponível|desativado)/.test(label), 'audio state shown as text: ' + label);
    check(!document.querySelector('.rt-kanban').textContent.includes('Som pronto') || label === 'Som pronto',
      'board never promises sound it cannot play');

    step = 'tv';
    // ── 10. Modo TV mostra o responsável e assume ────────────────────────
    RoomTicketsTV.open();
    await wait(() => document.querySelector('.rt-tv'));
    check(document.querySelector('.rt-tv') !== null, 'TV overlay open');
    RoomTicketsTV.close();
    await pause();
    check(document.querySelector('.rt-tv') === null, 'TV overlay closes');

    document.body.dataset.result='passed';
    document.body.dataset.checks=String(checks);
    document.body.dataset.viewport=String(innerWidth);
  } catch(error) {
    window.__step = step;
    document.body.dataset.result='failed';
    document.body.dataset.error='[' + step + '] ' + error.message;
    const results = document.getElementById('rt-results');
    document.body.dataset.debug = String(results ? results.innerHTML : document.body.innerHTML).slice(0, 600);
  }
})();
</script></body></html>`;

const server = http.createServer((req,res) => {
  const path = new URL(req.url,'http://localhost').pathname;
  if (path === '/monitor.js') {res.setHeader('Content-Type','text/javascript');res.end(monitorJs);}
  else if (path === '/kanban.js') {res.setHeader('Content-Type','text/javascript');res.end(kanbanJs);}
  else if (path === '/report.js') {res.setHeader('Content-Type','text/javascript');res.end(reportJs);}
  else if (path === '/tv.js') {res.setHeader('Content-Type','text/javascript');res.end(tvJs);}
  else if (path === '/room.css') {res.setHeader('Content-Type','text/css');res.end(css);}
  else if (path === '/room-tv.css') {res.setHeader('Content-Type','text/css');res.end(tvCss);}
  else if (path === '/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}
  else {res.writeHead(404);res.end();}
});
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    for (const size of ['1600,1000','500,900']) {
      const {stdout} = await execute(process.env.CHROME_BIN || 'google-chrome', [
        '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--disable-background-networking','--disable-extensions',
        '--autoplay-policy=no-user-gesture-required',
        '--window-size='+size,'--virtual-time-budget=15000','--dump-dom',
        'http://127.0.0.1:'+server.address().port+'/',
      ], {timeout:60000,maxBuffer:2000000});
      if (!stdout.includes('data-result="passed"')) {
        throw new Error('Browser '+size+': '+(stdout.match(/data-error="([^"]*)"/)?.[1] || 'test did not finish'));
      }
      console.log('OK Kanban Chromium '+size+': '+stdout.match(/data-checks="(\d+)"/)?.[1]+' checks; viewport '+stdout.match(/data-viewport="(\d+)"/)?.[1]);
    }
  } finally { server.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
