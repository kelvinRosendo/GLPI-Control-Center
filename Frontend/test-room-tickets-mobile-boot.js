/* Roteiro de verificação mobile dos chamados das salas.
 *
 * Carrega os MÓDULOS REAIS (api-client, monitor, kanban, lista, relatório, TV,
 * sidebar, app) e o CONJUNTO DE CSS DE PRODUÇÃO na ordem do index.html, e fala
 * com um servidor de teste através do `fetch` interceptado — o mesmo caminho de
 * rede do navegador, com status HTTP de verdade (403, 409, 502, 401).
 *
 * Nenhum mock de módulo, nenhum chamado real, nenhuma credencial.
 */
(() => {
  const params = new URLSearchParams(location.search);
  const scenario = params.get('cenario') || 'entrada-mobile';
  const noPermission = params.get('sem-permissao') === '1';
  const noSession = params.get('sem-sessao') === '1';
  const spNow = s => new Date(Date.now() - s * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const isoNow = () => new Date().toISOString();

  // ── O contexto do usuário: permissão por módulo, como no GCC real ────────
  const modules = ['home', 'chamados-salas', 'chamados', 'computadores', 'relatorios', 'auditoria'];
  const visible = noPermission ? modules.filter(key => key !== 'chamados-salas') : modules;
  window.UserContext = {
    nome: 'Kelvin Souza',
    perfil: 'operador',
    getUserName: () => 'Kelvin Souza',
    getUserEmail: () => 'kelvin.souza@colegiosatelite.com.br',
    isAuthenticated: () => !noSession,
    getCurrentUser: () => (noSession ? null : { nome: 'Kelvin Souza', email: 'kelvin.souza@colegiosatelite.com.br', perfil: 'operador' }),
    canAccessModule: key => !noPermission && modules.includes(key),
    canDo: () => true,
    getVisibleModules: () => visible.map(key => ({ key })),
  };
  window.CONFIG = { glpiUrl: 'https://glpi.example.test', backendUrl: '' };
  window.GlpiClient = { loadAll: async () => ({ ok: true }), invalidateGeneration() { } };
  window.Dashboard = { isLoaded: () => false, isLoading: () => false, reset() { }, render() { }, load: async () => ({ ok: false }), getIndicators: () => ({ }) };
  window.DashboardUI = { render() { } };
  window.UI = { renderHomeLoading: () => '<p class="empty-msg">Carregando…</p>' };
  window.Permissions = { getProfileLabel: () => 'Operador', getProfileColor: () => '#4f7ef7', getModules: () => ({}) };

  // ── Tabela de ações idêntica à do backend (RoomTicketsService::ACTIONS) ───
  const ACTIONS = {
    1: [['assumir', 'Assumir chamado', 'responsavel'], ['concluir', 'Concluir', 'solucao']],
    2: [['concluir', 'Concluir', 'solucao'], ['pendente', 'Marcar aguardando', 'status']],
    3: [['assumir', 'Assumir chamado', 'responsavel'], ['concluir', 'Concluir', 'solucao'], ['pendente', 'Marcar aguardando', 'status']],
    4: [['assumir', 'Assumir chamado', 'responsavel'], ['concluir', 'Concluir', 'solucao'], ['retomar', 'Retomar', 'status']],
    5: [['reabrir', 'Reabrir chamado', 'status']],
    6: [['reabrir', 'Reabrir chamado', 'status']],
  };
  const STATUS_KEY = { 1: 'aberto', 2: 'em_andamento', 3: 'em_andamento', 4: 'pendente', 5: 'resolvido', 6: 'fechado' };
  const STATUS_NAME = { 1: 'Novo', 2: 'Em atendimento', 3: 'Planejado', 4: 'Pendente', 5: 'Resolvido', 6: 'Fechado' };
  const COLUMN = { 1: 'abertos', 2: 'andamento', 3: 'andamento', 4: 'andamento', 5: 'concluidos', 6: 'concluidos' };
  const actionsOf = id => (ACTIONS[id] || []).map(([action, label, kind]) => ({ action, label, kind }));

  const state = {
    tickets: [],
    posts: [],
    listRequests: [],
    // Controles que o roteiro muda em tempo de execução.
    listStatus: 200,
    assumeStatus: 200,
    moveStatus: 200,
    writeDelay: 0,
    listDelay: 0,
    technicians: { available: true, message: '', technicians: [{ id: 42, name: 'Ana Ribeiro' }, { id: 43, name: 'Bia Alves' }] },
    freshSeq: 0,
    empty: false,
    complete: true,
  };
  window.__state = state;

  const card = (id, statusId, extra) => Object.assign({
    id, reference: 'L-00' + id, room: 'Sala ' + (10 + id), title: 'Projetor sem imagem #' + id,
    types: ['projector'], openedAt: spNow(3600), status: STATUS_KEY[statusId] || 'aberto', statusId,
    column: COLUMN[statusId], statusLabel: STATUS_NAME[statusId], waiting: statusId === 4,
    urgency: 3, eligible: true, review: false,
    assignee: { userId: 0, name: '' }, work: null, actions: actionsOf(statusId),
  }, extra || {});

  function buildData(url) {
    const query = new URL(url, location.href).searchParams;
    const limit = Number(query.get('kanban_limit') || 25);
    const page = Number(query.get('page') || 1);
    const q = (query.get('q') || '').toLowerCase();
    let rows = state.empty ? [] : state.tickets.slice();
    if (q) rows = rows.filter(t => (t.id + ' ' + t.title + ' ' + t.reference).toLowerCase().includes(q));
    const statusFilter = query.get('status') || '';
    if (statusFilter) rows = rows.filter(t => t.status === statusFilter);
    // Mais antigo primeiro dentro da coluna, como o servidor entrega.
    const byColumn = { abertos: [], andamento: [], concluidos: [] };
    for (const t of rows) byColumn[COLUMN[t.statusId] || 'abertos'].push(t);
    for (const key of Object.keys(byColumn)) {
      byColumn[key].sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.id - b.id);
    }
    const perPage = 25;
    const pages = Math.max(1, Math.ceil(rows.length / perPage));
    const current = Math.min(pages, page);
    state.freshSeq += 1;
    const fresh = card(900 + state.freshSeq, 1, { openedAt: spNow(6), room: 'Sala 101' });
    return {
      filters: { period: query.get('period') || '30d', from: '2026-08-26', to: '2026-09-24',
        start: '2026-08-26 00:00:00', end: '2026-09-24 23:59:59', timezone: 'America/Sao_Paulo',
        room: query.get('room') || '', type: query.get('type') || '', status: statusFilter,
        asset: query.get('asset') || '', q: query.get('q') || '', page: current, per_page: perPage,
        kanban_limit: limit },
      pagination: { page: current, perPage, pages, total: rows.length },
      summary: { total: rows.length, open: rows.filter(t => t.statusId < 5).length,
        withoutRoom: 0, withoutAsset: 1, review: 0, topRooms: [], topTypes: [] },
      rankings: { rooms: [], types: [], assets: [] }, options: { rooms: [] },
      meta: { complete: state.complete, collectedAt: isoNow(), warnings: [], source: 'GLPI' },
      items: rows.slice((current - 1) * perPage, current * perPage),
      latest: rows[0] || null,
      monitor: { recent: state.empty ? [] : [fresh], recentLimit: 30, collectedAt: isoNow() },
      kanban: { limit, total: rows.length, unmapped: 0, columns: {
        abertos: { key: 'abertos', label: 'Abertos', statuses: [1], count: byColumn.abertos.length,
          shown: Math.min(limit, byColumn.abertos.length), hasMore: byColumn.abertos.length > limit,
          items: byColumn.abertos.slice(0, limit) },
        andamento: { key: 'andamento', label: 'Em andamento', statuses: [2, 3, 4], count: byColumn.andamento.length,
          shown: Math.min(limit, byColumn.andamento.length), hasMore: byColumn.andamento.length > limit,
          items: byColumn.andamento.slice(0, limit) },
        concluidos: { key: 'concluidos', label: 'Concluídos', statuses: [5, 6], count: byColumn.concluidos.length,
          shown: Math.min(limit, byColumn.concluidos.length), hasMore: byColumn.concluidos.length > limit,
          items: byColumn.concluidos.slice(0, limit) },
      } },
    };
  }

  const json = (payload, status) => new Response(JSON.stringify(payload), {
    status: status || 200, headers: { 'Content-Type': 'application/json' } });
  const ok = data => json({ ok: true, data });

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pause = async (rounds = 6) => { for (let i = 0; i < rounds; i++) await Promise.resolve(); };
  const until = async (predicate, ms = 8000) => {
    const limit = Date.now() + ms;
    while (Date.now() < limit) {
      let value = null;
      try { value = predicate(); } catch { value = null; }
      if (value) return value;
      await wait(20);
    }
    return null;
  };

  // ── fetch de teste: status HTTP reais, latência controlável ──────────────
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, options = {}) => {
    const path = String(url);
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;
    if (!path.includes('/api/')) return realFetch(url, options);
    if (state.writeDelay && method === 'POST') await wait(state.writeDelay);
    if (path.includes('/aceites')) return ok({ acknowledgements: {}, checkedAt: isoNow() });
    if (path.includes('/responsaveis')) return ok(state.technicians);
    if (path.includes('/historico')) return ok({ ticketId: 31, assignment: null, solution: null, moves: [], acknowledgement: null });
    if (path.includes('/aceite')) return ok({ acknowledgement: { ticketId: 31, by: 'Kelvin Souza', at: isoNow() } });
    if (path.includes('/assumir')) {
      state.posts.push({ action: 'assumir', path, body });
      if (state.assumeStatus === 403) {
        return json({ ok: false, error: 'Seu perfil não tem permissão para alterar chamados.' }, 403);
      }
      if (state.assumeStatus !== 200) {
        return json({ ok: false, error: 'Este chamado já está com Ana Ribeiro.',
          meta: { status: 409, currentHandler: 'Ana Ribeiro', currentStatusLabel: 'Em atendimento',
            allowedActions: [{ action: 'concluir', label: 'Concluir' }] } }, 409);
      }
      const t = state.tickets.find(x => x.id === Number(path.match(/salas\/(\d+)\//)[1]));
      // A origem do responsável é decidida pelo servidor: só vira técnico do
      // GLPI com correspondência exata e única na lista de usuários.
      const known = state.technicians.available
        ? state.technicians.technicians.filter(u => u.name === String(body.handler || '').trim())
        : [];
      const matched = known.length === 1;
      if (t) {
        t.statusId = 2; t.status = 'em_andamento'; t.column = 'andamento'; t.statusLabel = STATUS_NAME[2];
        t.actions = actionsOf(2);
        t.work = { handlerName: body.handler, handlerSource: matched ? 'glpi_user' : 'informado',
          glpiUserId: matched ? known[0].id : 0, solution: '', solutionInGlpi: true };
        t.assignee = matched ? { userId: known[0].id, name: body.handler } : { userId: 0, name: '' };
      }
      return ok({ ticketId: t ? t.id : 0, handlerName: body.handler,
        handlerSource: matched ? 'glpi_user' : 'informado', glpiUserId: matched ? known[0].id : 0,
        fromStatus: 1, toStatus: 2, confirmed: true, partial: false });
    }
    if (path.includes('/mover')) {
      state.posts.push({ action: 'mover', path, body });
      if (state.moveStatus === 403) {
        return json({ ok: false, error: 'Seu perfil não tem permissão para alterar chamados.' }, 403);
      }
      if (state.moveStatus === 409) {
        return json({ ok: false, error: 'O chamado mudou de status no GLPI.',
          meta: { status: 409, currentStatusLabel: 'Resolvido', allowedActions: [{ action: 'reabrir', label: 'Reabrir chamado' }] } }, 409);
      }
      if (state.moveStatus !== 200) {
        return json({ ok: false, error: 'O status mudou no GLPI, mas a solução não ficou registrada.',
          meta: { status: 502, data: { partial: true, applied: { status: true, solution: false },
            steps: [{ step: 'status', ok: true, label: 'Status no GLPI' },
              { step: 'solucao', ok: false, label: 'Solução registrada no GLPI' }] } } }, 502);
      }
      const t = state.tickets.find(x => x.id === Number(path.match(/salas\/(\d+)\//)[1]));
      if (t && body.action === 'concluir') {
        t.statusId = 5; t.status = 'resolvido'; t.column = 'concluidos'; t.statusLabel = STATUS_NAME[5]; t.actions = actionsOf(5);
        t.work = { ...(t.work || {}), solution: body.solution, solutionInGlpi: true };
      }
      if (t && body.action === 'reabrir') {
        t.statusId = 1; t.status = 'aberto'; t.column = 'abertos'; t.statusLabel = STATUS_NAME[1]; t.actions = actionsOf(1);
      }
      if (t && body.action === 'pendente') { t.statusId = 4; t.waiting = true; t.status = 'pendente'; t.statusLabel = STATUS_NAME[4]; t.actions = actionsOf(4); }
      if (t && body.action === 'retomar') { t.statusId = 2; t.waiting = false; t.status = 'em_andamento'; t.statusLabel = STATUS_NAME[2]; t.actions = actionsOf(2); }
      return ok({ ticketId: t ? t.id : 0, action: body.action, toStatus: t ? t.statusId : 0, confirmed: true, partial: false });
    }
    if (path.includes('/api/tickets/salas')) {
      state.listRequests.push(path);
      if (state.listDelay) await wait(state.listDelay);
      if (state.listStatus === 401) return json({ ok: false, error: 'Sessão expirada.' }, 401);
      if (state.listStatus !== 200) return json({ ok: false, error: 'Não foi possível carregar os chamados completos.' }, 502);
      return ok(buildData(path));
    }
    return json({ ok: false, error: 'Rota não roteada no teste.' }, 404);
  };

  // ── Verificações ────────────────────────────────────────────────────────
  const scenarios = {};
  let checks = 0;
  const check = (okFlag, message) => {
    if (!okFlag) throw new Error(message);
    checks += 1;
  };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const clientWidth = () => document.documentElement.clientWidth;
  const noOverflow = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
  const ticketDialog = () => { const d = document.getElementById('rt-action-form'); return d && d.open ? d : null; };
  const submit = dialog => dialog.querySelector('[data-rt-form]')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  /** Espera o botão ficar utilizável e só então atualiza: ele é desabilitado
   *  durante a consulta, e um clique em botão desabilitado não faria nada. */
  const refreshNow = async () => {
    const button = await until(() => {
      const b = document.querySelector('[data-rt-action="refresh"]');
      return b && !b.disabled ? b : null;
    }, 15000);
    if (!button) throw new Error('botão Atualizar agora nunca ficou disponível');
    button.click();
  };

  /** Conjunto de chamados que cobre os agrupamentos e os casos de borda. */
  function seed() {
    state.tickets = [
      card(31, 1),
      card(32, 1, { room: 'Sala 12', title: 'Chromebook não liga após atualização de sistema' }),
      card(33, 2, { work: { handlerName: 'Ana Ribeiro', handlerSource: 'glpi_user', glpiUserId: 42, solution: '' } }),
      card(34, 3, { title: 'Projetor sem imagem ao abrir a aula de ciências' }),
      card(35, 4, { work: { handlerName: 'Bia Alves', handlerSource: 'informado', glpiUserId: 0, solution: '' } }),
      card(36, 5, { work: { handlerName: 'Ana Ribeiro', handlerSource: 'glpi_user', glpiUserId: 42, solution: 'Troca do cabo HDMI.', solutionInGlpi: true } }),
      card(37, 1, { room: 'Sala não identificada', review: true, types: [], reference: '',
        title: 'Relato de chamado com descrição longa demais para caber em uma linha e que precisa quebrar' }),
      card(38, 1, { room: 'Laboratório de Informática — Bloco B, Pavilhão Térreo, Ala Leste',
        types: ['pc', 'chromebook'], reference: 'L-0' + '9'.repeat(18),
        title: 'Vários equipamentos sem rede após a manutenção elétrica programada' }),
    ];
  }

  const report = payload => {
    if (window.__reported) return;
    window.__reported = true;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/resultado', false);
      xhr.send(JSON.stringify(payload));
    } catch { /* sem resultado */ }
  };
  window.addEventListener('error', event => report({ ok: false, error: 'JS: ' + event.message }));
  window.addEventListener('unhandledrejection', event =>
    report({ ok: false, error: 'promise: ' + String((event.reason && event.reason.message) || event.reason) }));

  // ── 1. Entrada mobile e navegação explícita preservada ───────────────────
  scenarios['entrada-mobile'] = async () => {
    const narrow = clientWidth() <= 900;
    if (noSession) {
      await pause(20);
      check(getComputedStyle(document.getElementById('login-screen')).display !== 'none',
        'sem sessão, a tela de login continua sendo a entrada');
      check(getComputedStyle(document.getElementById('app')).display === 'none', 'a aplicação não abre sem sessão');
      check(!$('.rt-dashboard'), 'nenhuma tela de chamados é montada antes do login');
      return;
    }
    if (noPermission) {
      await until(() => $('#sidebar .sidebar-item'));
      check(window.STATE.tab === 'home',
        'sem permissão para chamados das salas, a entrada continua sendo o Dashboard · ' + window.STATE.tab);
      check(!$('.rt-dashboard'), 'a tela de chamados não é aberta sem permissão');
      return;
    }
    await until(() => $('#sidebar .sidebar-item, .rt-dashboard'));
    check(!!$('#sidebar .sidebar-item'), 'navegação completa renderizada no menu recolhível');
    check(!!$('.sidebar-item[data-sidebar-tab="chamados-salas"]'), 'Chamados das salas presente na navegação');
    if (narrow) {
      // `?tab=` na URL é uma navegação explícita para outro destino: a entrada
      // automática é suspensa. Já os parâmetros `rt_*` indicam que a pessoa
      // estava nesta tela, e por isso a tela é preservada.
      const explicit = ['tab', 'gcc_tab', 'view'].some(key => params.get(key));
      if (explicit) {
        check(window.STATE.tab === 'home',
          'navegação explícita na URL impede a entrada automática · aba=' + window.STATE.tab);
      } else {
        check(window.STATE.tab === 'chamados-salas',
          'entrada no celular é Chamados das salas · aba=' + window.STATE.tab);
        await until(() => $('.rt-list'));
        check(!!$('.rt-list'), 'lista vertical compacta é a apresentação inicial');
        const expected = params.get('rt_group');
        if (expected) {
          check($('.rt-chip[data-rt-group="' + expected + '"]').getAttribute('aria-pressed') === 'true',
            'filtro rápido da URL preservado na entrada · ' + expected);
        }
        if (params.get('rt_view')) {
          check($('[data-rt-view="kanban"]').classList.contains('is-active') === (params.get('rt_view') === 'kanban'),
            'visão da URL preservada na entrada · ' + params.get('rt_view'));
        }
        const table = $('.rt-table-wrap');
        check(table === null || getComputedStyle(table).display === 'none',
          'a tabela larga não é a apresentação do celular');
      }
      // Menu recolhível: abre, fecha e é operável.
      const sidebar = $('#sidebar');
      const overlay = $('#sidebar-overlay');
      const btn = $('#sidebar-mobile-toggle');
      check(getComputedStyle(btn).display !== 'none', 'botão do menu visível no celular');
      btn.click();
      // A gaveta tem transição: a medição espera o fim do movimento.
      await until(() => sidebar.classList.contains('sidebar--mobile-open')
        && Math.abs(sidebar.getBoundingClientRect().left) < 1, 3000);
      check(sidebar.classList.contains('sidebar--mobile-open'), 'menu abre pelo botão do topo');
      check(overlay.classList.contains('active'), 'sobreposição ativa com a gaveta aberta');
      check(btn.getAttribute('aria-expanded') === 'true', 'aria-expanded acompanha a gaveta');
      check(getComputedStyle($('.sidebar-item-label')).display !== 'none',
        'os nomes dos itens continuam visíveis na gaveta');
      const drawer = sidebar.getBoundingClientRect();
      check(drawer.left >= -1 && drawer.right <= clientWidth() + 1,
        'gaveta cabe na largura da tela · ' + Math.round(drawer.left) + '..' + Math.round(drawer.right));
      overlay.click();
      await until(() => sidebar.getBoundingClientRect().right <= 1, 3000);
      check(!sidebar.classList.contains('sidebar--mobile-open'), 'menu fecha pela sobreposição');
      check(btn.getAttribute('aria-expanded') === 'false', 'aria-expanded volta a false');
      check(sidebar.getBoundingClientRect().right <= 1, 'gaveta recolhida fica fora da tela');
    } else {
      check(window.STATE.tab === 'home', 'desktop continua abrindo no Dashboard · aba=' + window.STATE.tab);
    }
    check(noOverflow(), 'sem rolagem horizontal na página');
  };

  // ── 2. Lista, filtros rápidos, contagens e paginação ────────────────────
  scenarios['lista-e-filtros'] = async () => {
    await until(() => $('.rt-list'));
    const chips = $$('.rt-chip');
    check(chips.length === 4, 'quatro filtros rápidos (Abertos, Em andamento, Concluídos, Todos) · ' + chips.length);
    const counts = Object.fromEntries(chips.map(c => [c.dataset.rtGroup, c.querySelector('.rt-chip-count').textContent]));
    check(counts.abertos === '4' && counts.andamento === '3' && counts.concluidos === '1',
      'contagens vindas dos agrupamentos do backend · ' + JSON.stringify(counts));
    check(counts.todos === '8', 'contagem do conjunto completo · ' + counts.todos);
    check($$('.rt-list .rt-item').length === 8, 'todos os chamados do filtro aparecem, nada é escondido');
    check(noOverflow(), 'sem rolagem horizontal com a lista completa');

    const item31 = $('.rt-item[data-rt-item="31"]');
    check(!!item31, 'item do chamado 31 presente');
    check(item31.querySelector('.rt-item-room').textContent.includes('Sala 41'), 'sala no item');
    check(item31.querySelector('.rt-item-ref').textContent.includes('#31')
      && item31.querySelector('.rt-item-ref').textContent.includes('L-0031'),
      'número do chamado e referência no item · ' + item31.querySelector('.rt-item-ref').textContent);
    check(item31.querySelector('.rt-item-title').textContent.includes('Projetor sem imagem'), 'resumo do problema');
    check(item31.querySelector('.rt-item-equip').textContent === 'Projetor', 'equipamento identificado');
    check(item31.querySelector('.rt-status').textContent === 'Novo', 'status real do item');
    check(item31.querySelector('.rt-item-open').textContent.includes('/'), 'horário de abertura no item');
    check(item31.querySelector('.rt-item-owner').textContent.includes('não definido'), 'responsável não definido é dito');
    check($('.rt-item[data-rt-item="33"] .rt-item-owner').textContent.includes('técnico do GLPI'),
      'responsável atribuído no GLPI é distinguido');
    check($('.rt-item[data-rt-item="35"] .rt-item-owner').textContent.includes('informado no GCC'),
      'nome informado no GCC é distinguido do técnico do GLPI');
    check($('.rt-item[data-rt-item="35"] .rt-status').textContent === 'Pendente', 'pendente mantém o rótulo real');
    check($('.rt-item[data-rt-item="34"] .rt-status').textContent === 'Planejado', 'planejado mantém o rótulo real');

    const noRoom = $('.rt-item[data-rt-item="37"]');
    check(noRoom.querySelector('.rt-item-room').textContent.includes('não identificada'), 'sala não identificada aparece');
    check(noRoom.querySelector('.rt-item-equip').textContent.includes('não identificado'), 'ausência de equipamento é declarada');
    const long = $('.rt-item[data-rt-item="38"]');
    check(long.getBoundingClientRect().width <= clientWidth(), 'item com texto longo cabe na largura');
    check(noOverflow(), 'texto longo não cria rolagem horizontal');

    const small = $$('.rt-item-actions button, .rt-chip').filter(b => {
      const r = b.getBoundingClientRect();
      return r.height < 43.5 || r.width < 43.5;
    });
    check(small.length === 0, 'alvos de toque de pelo menos 44x44 · ' + small.length + ' pequenos');

    const before = state.listRequests.length;
    $('.rt-chip[data-rt-group="abertos"]').click();
    await until(() => $('[data-rt-list="abertos"]'));
    check($('.rt-chip[data-rt-group="abertos"]').getAttribute('aria-pressed') === 'true', 'chip marcado como selecionado');
    check($$('[data-rt-list="abertos"] .rt-item').length === 4, 'quatro chamados em Abertos');
    check($('.rt-list-note').textContent.includes('Exibindo 4 de 4'), 'a nota diz quanto é exibido do total');
    const open31 = $('.rt-item[data-rt-item="31"]');
    check(!!open31.querySelector('[data-rt-move="assumir"]'), 'ação de assumir disponível em Abertos');
    check(!!open31.querySelector('[data-rt-move="concluir"]'), 'ação de concluir disponível em Abertos');
    check(open31.querySelectorAll('button').length >= 3, 'movimentar não depende de arrastar');
    await until(() => state.listRequests.length >= before + 1, 8000);
    check(state.listRequests.length === before + 1, 'trocar o filtro rápido consulta uma vez, com o limite por coluna · ' + (state.listRequests.length - before));
    check(state.listRequests[state.listRequests.length - 1].includes('kanban_limit=25'),
      'o limite por coluna viaja com a consulta · ' + state.listRequests[state.listRequests.length - 1]);

    $('.rt-chip[data-rt-group="andamento"]').click();
    await until(() => $('[data-rt-list="andamento"]'));
    const labels = $$('[data-rt-list="andamento"] .rt-status').map(s => s.textContent).sort();
    check(JSON.stringify(labels) === JSON.stringify(['Em atendimento', 'Pendente', 'Planejado']),
      'Em andamento distingue em atendimento, planejado e pendente · ' + JSON.stringify(labels));
    check($$('[data-rt-list="andamento"] .rt-item').length === 3, 'três chamados em andamento');
    check(!!$('.rt-item[data-rt-item="35"] [data-rt-move="retomar"]'), 'retomar disponível no pendente');
    check(!!$('.rt-item[data-rt-item="34"] [data-rt-move="pendente"]'), 'marcar aguardando no planejado');

    $('.rt-chip[data-rt-group="concluidos"]').click();
    await until(() => $('[data-rt-list="concluidos"]'));
    check(!!$('.rt-item[data-rt-item="36"] [data-rt-move="reabrir"]'), 'reabrir disponível em Concluídos');
    check($('.rt-item[data-rt-item="36"]').textContent.includes('Troca do cabo HDMI.'), 'solução registrada no item');

    $('.rt-chip[data-rt-group="todos"]').click();
    await until(() => $('.rt-pagination-info'));
    check($('.rt-pagination-info').textContent.includes('Página 1 de 1'), 'posição na paginação informada');
    check($('.rt-pagination-info').textContent.includes('8 chamados'), 'tamanho do conjunto no filtro');
    check($$('.rt-list .rt-item').length === 8, 'lista completa traz os oito chamados');
    check($('[data-rt-action="previous"]').disabled && $('[data-rt-action="next"]').disabled,
      'sem páginas para percorrer em um conjunto pequeno');

    state.empty = true;
    await refreshNow();
    await until(() => $('[data-rt-empty="true"]'), 15000);
    check(!!$('[data-rt-empty="true"]'), 'estado vazio explícito após consulta bem-sucedida');
    check($('[data-rt-state]').dataset.rtState === 'empty',
      'faixa de estado diz que a consulta terminou sem chamados · ' + $('[data-rt-state]').dataset.rtState);
    check($('.rt-chip[data-rt-group="todos"] .rt-chip-count').textContent === '0', 'contagens zeradas após a consulta');
  };

  // ── 3. Busca contínua, foco, cursor e rolagem ───────────────────────────
  scenarios['busca-preservada'] = async () => {
    await until(() => $('.rt-list'));
    check($('#rt-filter-more').hidden === (clientWidth() <= 860),
      'filtros recolhidos no celular e abertos no desktop · hidden=' + $('#rt-filter-more').hidden);
    const search = $('#rt-filters input[name="q"]');
    check(!!search && getComputedStyle(search).display !== 'none', 'campo de busca sempre visível');
    search.value = 'projetor';
    search.focus();
    search.setSelectionRange(8, 8);
    check(document.activeElement === search, 'campo de busca com foco');
    window.scrollTo(0, 220);
    await wait(60);
    const scrollBefore = window.scrollY;
    check(scrollBefore > 100, 'página rolada para o teste de deslocamento · ' + scrollBefore);

    await window.RoomTicketsMonitor.refresh({ q: 'period=30d&page=1', reason: 'tick', maxAge: 0 });
    await pause(12);
    const after = $('#rt-filters input[name="q"]');
    check(after.value === 'projetor', 'texto digitado e ainda não aplicado sobrevive · ' + after.value);
    check(document.activeElement === after, 'foco permanece no campo de busca');
    check(after.selectionStart === 8, 'posição do cursor preservada · ' + after.selectionStart);
    check($('#rt-filters').elements.q.tagName === 'INPUT', 'o campo continua sendo um campo de texto');
    check(Math.abs(window.scrollY - scrollBefore) < 2, 'rolagem não se desloca na atualização · ' + window.scrollY);

    // Aplicar a busca consulta o servidor com o termo.
    $('#rt-filters input[name="q"]').value = 'sem-resultado-99';
    $('#rt-filters').requestSubmit();
    await until(() => state.listRequests.some(url => url.includes('q=sem-resultado-99')), 12000);
    check(state.listRequests.some(url => url.includes('q=sem-resultado-99')), 'busca aplicada na consulta');
    await until(() => $('[data-rt-empty="true"]'), 12000);
    check(!$('.rt-list'), 'busca sem resultado não mantém a lista anterior na tela');
    check(!!$('[data-rt-empty="true"]'), 'estado vazio explícito para a busca');
    check($('.rt-chip[data-rt-group="todos"] .rt-chip-count').textContent === '0', 'contagens coerentes com a busca');
    check($('#rt-filters input[name="q"]').value === 'sem-resultado-99', 'o termo aplicado continua no campo');
  };

  // ── 4. Assumir e concluir com a API simulada ─────────────────────────────
  scenarios['atendimento'] = async () => {
    await until(() => $('.rt-chip[data-rt-group="abertos"]'));
    $('.rt-chip[data-rt-group="abertos"]').click();
    await until(() => $('[data-rt-list="abertos"]'));

    $('.rt-item[data-rt-item="31"] [data-rt-move="assumir"]').click();
    let dialog = await until(ticketDialog);
    check(!!dialog, 'formulário de assumir aberto');
    check(dialog.textContent.includes('Quem do TI foi resolver o problema?'), 'pergunta do responsável exibida');
    const box = dialog.getBoundingClientRect();
    check(box.left >= -1 && box.right <= clientWidth() + 1, 'formulário cabe na largura disponível');
    check(box.top >= -1 && box.bottom <= document.documentElement.clientHeight + 1,
      'formulário cabe na altura visível · ' + Math.round(box.height));
    const fields = $$('#rt-action-form input, #rt-action-form select, #rt-action-form textarea');
    check(fields.length >= 2 && fields.every(f => f.closest('label')), 'todo campo tem rótulo visível');
    const tiny = $$('#rt-action-form .rt-form-actions button').filter(b => b.getBoundingClientRect().height < 43.5);
    check(tiny.length === 0 && $$('#rt-action-form .rt-form-actions button').length === 2,
      'botões do formulário com altura de toque confortável · ' + tiny.length + ' pequenos');
    check(!dialog.querySelector('.rt-form-close'), 'sem botão Fechar redundante');
    check(dialog.textContent.includes('Cancelar'), 'Cancelar disponível');
    check(dialog.querySelector('[data-rt-role="handler"]').value === 'Kelvin Souza', 'responsável pré-preenchido com quem está conectado');
    check(dialog.textContent.includes('correspondência exata'),
      'o formulário avisa que nome livre não é atribuição confirmada');
    await until(() => Array.from(dialog.querySelectorAll('[data-rt-role="choice"] option')).some(o => o.textContent === 'Ana Ribeiro'));
    check(Array.from(dialog.querySelectorAll('[data-rt-role="choice"] option')).some(o => o.textContent === 'Ana Ribeiro'),
      'técnicos do GLPI oferecidos quando a lista está disponível');
    dialog.querySelector('[data-rt-role="choice"]').value = 'Ana Ribeiro';
    submit(dialog);
    // Envio duplicado: dois disparos no mesmo instante, uma única gravação.
    submit(dialog);
    await until(() => !ticketDialog(), 12000);
    check(!ticketDialog(), 'formulário fecha depois da confirmação do servidor');
    const assumePosts = state.posts.filter(p => p.action === 'assumir');
    check(assumePosts.length === 1, 'envio duplicado não grava duas vezes · ' + assumePosts.length);
    check(assumePosts[0].body.handler === 'Ana Ribeiro', 'responsável enviado na gravação');
    check(typeof assumePosts[0].body.requestId === 'string' && assumePosts[0].body.requestId.length > 8,
      'gravação com identificador de idempotência');

    $('.rt-chip[data-rt-group="andamento"]').click();
    await until(() => $('[data-rt-list="andamento"] .rt-item[data-rt-item="31"]'));
    const moved = $('.rt-item[data-rt-item="31"]');
    check(moved.querySelector('.rt-item-owner').textContent.includes('Ana Ribeiro'), 'responsável exibido no item');
    check(moved.querySelector('.rt-status').textContent === 'Em atendimento', 'status real do item após assumir');
    check(!moved.querySelector('[data-rt-move="assumir"]'), 'ação de assumir some no status novo');
    check(!!moved.querySelector('[data-rt-move="concluir"]'), 'concluir disponível no novo status');

    $('.rt-item[data-rt-item="31"] [data-rt-move="concluir"]').click();
    dialog = await until(ticketDialog);
    check(dialog.textContent.includes('Como o problema foi resolvido?'), 'pergunta da conclusão exibida');
    dialog.querySelector('[data-rt-role="solution"]').value = 'Troca do cabo HDMI do projetor.';
    submit(dialog);
    await until(() => !ticketDialog(), 12000);
    const movePost = state.posts.find(p => p.action === 'mover');
    check(movePost && movePost.body.solution === 'Troca do cabo HDMI do projetor.', 'solução enviada ao servidor');
    $('.rt-chip[data-rt-group="concluidos"]').click();
    await until(() => $('.rt-item[data-rt-item="31"]'));
    check($('.rt-item[data-rt-item="31"]').textContent.includes('Troca do cabo HDMI do projetor.'), 'solução visível no item concluído');
    check(!!$('.rt-item[data-rt-item="31"] [data-rt-move="reabrir"]'), 'reabrir disponível após concluir');
  };

  // ── 4b. Diretório de técnicos restrito: o texto livre continua valendo ──
  scenarios['atendimento-restrito'] = async () => {
    // A lista de técnicos é recusada desde o começo, como acontece com um perfil
    // sem acesso à coleção de usuários do GLPI.
    state.technicians = { available: false, message: 'O perfil não pode listar os usuários do GLPI.', technicians: [] };
    await until(() => $('.rt-chip[data-rt-group="abertos"]'));
    $('.rt-chip[data-rt-group="abertos"]').click();
    await until(() => $('.rt-item[data-rt-item="32"] [data-rt-move="assumir"]'));
    $('.rt-item[data-rt-item="32"] [data-rt-move="assumir"]').click();
    const dialog = await until(ticketDialog);
    await until(() => dialog.textContent.includes('não pode listar os usuários'), 8000);
    check(dialog.querySelector('[data-rt-role="choice"]').disabled, 'seleção desabilitada sem a lista de técnicos');
    check(dialog.textContent.includes('não pode listar os usuários'), 'motivo da restrição informado ao técnico');
    check(!dialog.querySelector('[data-rt-role="handler"]').disabled, 'nome livre continua utilizável');
    dialog.querySelector('[data-rt-role="handler"]').value = 'Bia Alves';
    submit(dialog);
    await until(() => !ticketDialog(), 12000);
    const free = state.posts.filter(p => p.action === 'assumir').pop();
    check(free.body.handler === 'Bia Alves', 'nome livre gravado como quem vai atender');
    $('.rt-chip[data-rt-group="andamento"]').click();
    await until(() => $('.rt-item[data-rt-item="32"]'));
    const owner = $('.rt-item[data-rt-item="32"] .rt-item-owner').textContent;
    check(owner.includes('Bia Alves') && owner.includes('informado no GCC'),
      'nome livre não aparece como atribuição confirmada a um usuário do GLPI · ' + owner);
    check(!owner.includes('técnico do GLPI'), 'a origem do responsável fica explícita');
  };

  // ── 5. Cancelar antes, durante e depois de uma falha ────────────────────
  scenarios['cancelamento'] = async () => {
    await until(() => $('.rt-chip[data-rt-group="abertos"]'));
    $('.rt-chip[data-rt-group="abertos"]').click();
    await until(() => $('[data-rt-list="abertos"]'));

    // Antes de enviar: cancela na hora e não grava nada.
    const before = state.posts.length;
    $('.rt-item[data-rt-item="31"] [data-rt-move="assumir"]').click();
    let dialog = await until(ticketDialog);
    dialog.querySelector('[data-rt-form-action="cancel"]').click();
    await pause();
    check(!ticketDialog(), 'Cancelar antes de enviar fecha imediatamente');
    check(state.posts.length === before, 'Cancelar antes de enviar não grava nada');
    check(getComputedStyle(document.getElementById('rt-action-form')).display === 'none', 'diálogo cancelado fica invisível');

    // Durante o envio: cancela com a requisição em voo e a resposta atrasada
    // não pode ressuscitar o formulário.
    state.assumeStatus = 409;
    state.writeDelay = 350;
    $('.rt-item[data-rt-item="31"] [data-rt-move="assumir"]').click();
    dialog = await until(ticketDialog);
    submit(dialog);
    await pause(6);
    dialog.querySelector('[data-rt-form-action="cancel"]').click();
    check(!ticketDialog(), 'Cancelar durante o envio fecha imediatamente');
    await wait(1200);
    check(!ticketDialog(), 'resposta atrasada depois do cancelamento não reabre o formulário');
    check(!$('[data-rt-form-error]'), 'nenhum erro reaparece sobre o formulário cancelado');
    check(state.posts.filter(p => p.action === 'assumir').length === 1, 'a requisição em voo terminou uma vez');

    // Depois de uma falha: o texto fica, o cancelamento é imediato e a
    // reabertura é uma nova intenção, com outro identificador.
    state.writeDelay = 0;
    $('.rt-item[data-rt-item="31"] [data-rt-move="assumir"]').click();
    dialog = await until(ticketDialog);
    dialog.querySelector('[data-rt-role="handler"]').value = 'Bia Alves';
    submit(dialog);
    await until(() => $('[data-rt-form-error]'), 12000);
    check($('[data-rt-form-error]').textContent.includes('Ana Ribeiro'), 'conflito explicado com o responsável atual');
    check(dialog.querySelector('[data-rt-role="handler"]').value === 'Bia Alves', 'texto preservado após a falha');
    const firstRequest = state.posts.filter(p => p.action === 'assumir').pop().body.requestId;
    dialog.querySelector('[data-rt-form-action="cancel"]').click();
    check(!ticketDialog(), 'Cancelar depois da falha fecha imediatamente');
    $('.rt-item[data-rt-item="31"] [data-rt-move="assumir"]').click();
    dialog = await until(ticketDialog);
    dialog.querySelector('[data-rt-role="handler"]').value = 'Bia Alves';
    submit(dialog);
    await until(() => !ticketDialog(), 12000);
    const secondRequest = state.posts.filter(p => p.action === 'assumir').pop().body.requestId;
    check(firstRequest !== secondRequest, 'reabrir o formulário é uma nova intenção, com outro requestId');
  };

  // ── 6. Erros 403, 409 e 502 com alteração parcial ────────────────────────
  scenarios['erros'] = async () => {
    await until(() => $('.rt-chip[data-rt-group="abertos"]'));
    $('.rt-chip[data-rt-group="abertos"]').click();
    await until(() => $('[data-rt-list="abertos"]'));

    state.assumeStatus = 403;
    $('.rt-item[data-rt-item="31"] [data-rt-move="assumir"]').click();
    let dialog = await until(ticketDialog);
    dialog.querySelector('[data-rt-role="handler"]').value = 'Ana Ribeiro';
    submit(dialog);
    await until(() => $('[data-rt-form-error]'), 12000);
    const erro403 = $('[data-rt-form-error]').textContent;
    check(/permissão/i.test(erro403), '403 explicado como falta de permissão · ' + erro403);
    check(!/HTTP 403/.test(erro403), '403 não mostra "HTTP 403"');
    check($('.rt-item[data-rt-item="31"]') !== null, 'item permanece na coluna original');
    check($('.rt-item[data-rt-item="31"] .rt-status').textContent === 'Novo', 'status não muda com recusa');
    dialog.querySelector('[data-rt-form-action="cancel"]').click();

    state.assumeStatus = 200;
    $('.rt-chip[data-rt-group="andamento"]').click();
    await until(() => $('.rt-item[data-rt-item="33"] [data-rt-move="concluir"]'));
    state.moveStatus = 409;
    $('.rt-item[data-rt-item="33"] [data-rt-move="concluir"]').click();
    dialog = await until(ticketDialog);
    dialog.querySelector('[data-rt-role="solution"]').value = 'Ajuste do cabo de rede.';
    submit(dialog);
    await until(() => $('[data-rt-form-error]'), 12000);
    const erro409 = $('[data-rt-form-error]').textContent;
    check(/mudou de status/i.test(erro409), '409 explica a mudança de estado · ' + erro409);
    check(/Reabrir chamado/.test(erro409), '409 informa as ações ainda disponíveis · ' + erro409);
    check(!/HTTP 409/.test(erro409), '409 não mostra "HTTP 409"');
    check(dialog.querySelector('[data-rt-role="solution"]').value === 'Ajuste do cabo de rede.', 'solução preservada após o 409');
    check($('.rt-item[data-rt-item="33"] .rt-status').textContent === 'Em atendimento', 'item não muda de coluna com o 409');
    dialog.querySelector('[data-rt-form-action="cancel"]').click();

    state.moveStatus = 502;
    $('.rt-item[data-rt-item="34"] [data-rt-move="concluir"]').click();
    dialog = await until(ticketDialog);
    dialog.querySelector('[data-rt-role="solution"]').value = 'Reinício do projetor e troca do cabo.';
    submit(dialog);
    await until(() => $('[data-rt-form-error]'), 12000);
    const erro502 = $('[data-rt-form-error]').textContent;
    check(!/HTTP 502/.test(erro502), '502 não mostra "HTTP 502" · ' + erro502.slice(0, 140));
    check(/metade|parcial/i.test(erro502), '502 diz que a alteração ficou pela metade · ' + erro502.slice(0, 140));
    check(/status foi alterado/i.test(erro502), '502 diz o que de fato foi aplicado');
    check(/Solução registrada no GLPI/.test(erro502), '502 nomeia a etapa que falhou');
    check(!/Tente novamente de forma automática/.test(erro502), 'não orienta reenvio cego');
    check(dialog.querySelector('[data-rt-role="solution"]').value === 'Reinício do projetor e troca do cabo.',
      'solução preservada após a falha parcial');
    check(!!ticketDialog(), 'diálogo continua aberto com a falha parcial');
    state.moveStatus = 200;
  };

  // ── 7. Atualização automática com o formulário aberto ────────────────────
  scenarios['atualizacao'] = async () => {
    await until(() => $('.rt-chip[data-rt-group="abertos"]'));
    $('.rt-chip[data-rt-group="abertos"]').click();
    await until(() => $('[data-rt-list="abertos"]'));
    // A consulta disparada pela troca de filtro precisa pousar antes de contar:
    // o que interessa é o silêncio do ciclo, não a leitura em andamento.
    await wait(300);
    const listBefore = state.listRequests.length;

    // O ciclo de 60 s é o do monitor: nenhuma varredura a mais enquanto ele
    // não vence, e nenhuma segunda consulta por atualização de tela.
    await wait(3200);
    check(state.listRequests.length === listBefore,
      'nenhuma consulta extra enquanto o ciclo não vence · ' + (state.listRequests.length - listBefore));
    check($$('#rt-filters').length === 1, 'uma única área de filtros, sem ciclo duplicado');

    $('.rt-item[data-rt-item="31"] [data-rt-move="assumir"]').click();
    const dialog = await until(ticketDialog);
    await until(() => Array.from(dialog.querySelectorAll('[data-rt-role="choice"] option')).length > 1);
    dialog.querySelector('[data-rt-role="handler"]').value = 'Bia Alves';

    state.tickets.push(card(39, 1, { room: 'Sala 44', title: 'Impressora sem resposta ao imprimir' }));
    await window.RoomTicketsMonitor.refresh({ q: 'period=30d&page=1&kanban_limit=25', reason: 'tick', maxAge: 0 });
    await pause(15);
    check(state.listRequests.length === listBefore + 1, 'uma consulta por ciclo, feita pelo monitor');
    check(!!ticketDialog(), 'formulário continua aberto durante a atualização');
    check(dialog.querySelector('[data-rt-role="handler"]').value === 'Bia Alves', 'texto do formulário sobrevive à atualização');
    check(!!$('.rt-item[data-rt-item="39"]'), 'o chamado novo aparece na lista atualizada');
    check(!!dialog.querySelector('[data-rt-role="choice"]'), 'seleção de técnico sobrevive à atualização');

    // Ler é diferente de escrever: durante a atualização, "Detalhes" continua
    // abrindo em vez de ignorar silenciosamente o toque.
    state.listDelay = 400;
    $('[data-rt-action="refresh"]').click();
    await until(() => $('#rt-results').getAttribute('aria-busy') === 'true', 4000);
    const whileLoading = $('.rt-item[data-rt-item="39"] .rt-item-detail');
    check(!!whileLoading, 'item disponível durante a atualização');
    whileLoading.click();
    check(!!$('#rt-detail')?.open, 'detalhes abrem durante uma atualização em curso');
    document.getElementById('rt-detail')?.close();
    await until(() => $('#rt-results').getAttribute('aria-busy') === 'false', 8000);
    state.listDelay = 0;
    check($('[data-rt-state="ok"]') !== null, 'faixa de estado mostra "Dados atualizados" · ' + $('[data-rt-state]').dataset.rtState);
    check($('.rt-toolbar-status').textContent.includes('Última atualização'), 'horário real da última consulta');
  };

  // ── 8. Cache, desconexão e sessão expirada ──────────────────────────────
  scenarios['cache-e-sessao'] = async () => {
    await until(() => $('.rt-list'));
    check($('[data-rt-state="ok"]') !== null, 'estado inicial é "Dados atualizados" · ' + $('[data-rt-state]').dataset.rtState);
    const updated = $('.rt-state-when').textContent;
    // A data só aparece quando difere do dia de hoje; o horário é sempre o da
    // última consulta bem-sucedida ao GLPI.
    check(/Última atualização: (\d{2}\/\d{2}\/\d{4} )?\d{2}:\d{2}:\d{2}/.test(updated),
      'horário da última consulta bem-sucedida ao GLPI · ' + updated);

    state.listStatus = 502;
    await refreshNow();
    await until(() => $('[data-rt-state="error"]'), 15000);
    check($('[data-rt-state="error"]') !== null, 'estado "Falha de conexão" mostrado');
    check($('.rt-state-when').textContent === updated, 'o horário da última consulta bem-sucedida não avança na falha');
    check($$('.rt-item').length > 0, 'os dados anteriores são preservados durante a falha');
    check(!!$('[data-rt-cache-warning]'), 'aviso de dados em cache presente');
    check(!!$('.rt-message.rt-error'), 'erro explicado acima dos dados, sem esvaziá-los');

    state.listStatus = 200;
    await refreshNow();
    await until(() => $('[data-rt-state="ok"]'), 15000);
    check($('[data-rt-state="ok"]') !== null, 'volta a "Dados atualizados" depois de reconectar');
    check($('[data-rt-cache-warning]') === null, 'aviso de cache desaparece após reconectar');

    state.listStatus = 401;
    await refreshNow();
    await until(() => $('[data-rt-state="expired"]'), 15000);
    check($('[data-rt-state="expired"]') !== null, 'estado "Sessão expirada" próprio');
    check($('.rt-state').textContent.includes('Sessão expirada'), 'a expiração é dita ao técnico');
    check($('[data-rt-cache-warning]') === null, 'sessão expirada não é apresentada como simples cache');
  };

  // ── 9. Alertas e estado do áudio ────────────────────────────────────────
  scenarios['alerta-e-audio'] = async () => {
    await until(() => $('.rt-list'));
    const sound = $('[data-rt-sound-state]');
    check(sound && sound.dataset.rtSoundState === 'off',
      'som começa desativado, sem promessa de áudio · estado=' + (sound ? sound.dataset.rtSoundState : 'sem elemento'));
    check($('.rt-toolbar').textContent.includes('Ativar som'), 'ativação do som é explícita');
    $('[data-rt-action="sound"]').click();
    await pause(30);
    const audio = window.RoomTicketsMonitor.audioStatus();
    const shown = $('[data-rt-sound-state]');
    check(shown.dataset.rtSoundState === audio.state, 'a interface mostra o estado real do áudio · ' + shown.dataset.rtSoundState);
    check(/Som (pronto|bloqueado|indisponível|desativado)/.test(shown.textContent), 'rótulo de áudio reconhecido · ' + shown.textContent);

    await window.RoomTicketsMonitor.refresh({ q: 'period=30d&page=1&alerta=1', reason: 'alerta', maxAge: 0 });
    const alert = await until(() => $('.rt-monitor-alert'), 12000);
    check(!!alert, 'alerta de novo chamado exibido');
    const box = alert.getBoundingClientRect();
    check(box.left >= -1 && box.right <= clientWidth() + 1, 'alerta cabe na largura do celular');
    check(box.height <= document.documentElement.clientHeight * 0.6, 'alerta não toma a tela inteira · ' + Math.round(box.height));
    check(!!alert.querySelector('[data-monitor-action="assume"]'), 'alerta oferece assumir o chamado');
    check(!!alert.querySelector('[data-monitor-action="accept"]'), 'alerta oferece aceitar a leitura');
    check(alert.textContent.includes('Some em'), 'alerta expira sozinho');
    check(alert.textContent.includes(audio.label), 'o alerta mostra o mesmo estado real do áudio');
    // O alerta não cobre campos e botões de forma permanente: dispensar tira o
    // chamado da fila. A fila pode ter mais de um item, então ela é esvaziada
    // inteiro antes de afirmar que a tela voltou a ficar livre.
    const dismissed = await until(() => $('.rt-monitor-alert [data-monitor-action="dismiss"]'), 8000);
    if (!dismissed) throw new Error('o alerta expirou antes de ser dispensado');
    const dismissedId = dismissed.dataset.ticketId;
    dismissed.click();
    await pause(15);
    const stillShowing = $('.rt-monitor-alert [data-monitor-action="dismiss"]');
    check(!stillShowing || stillShowing.dataset.ticketId !== dismissedId,
      'o chamado dispensado sai da fila de alertas');
    for (let i = 0; i < 40 && $('.rt-monitor-alert'); i++) {
      $('.rt-monitor-alert [data-monitor-action="dismiss"]')?.click();
      await wait(20);
    }
    check(!$('.rt-monitor-alert'), 'alerta dispensado some da tela · fila=' + RoomTicketsMonitor.getQueue().length);
    const last = $$('.rt-item-actions button').pop();
    check(last.getBoundingClientRect().height >= 43.5, 'ações do último item continuam utilizáveis');
    check(noOverflow(), 'sem rolagem horizontal com o alerta');

    // Com o formulário aberto, o alerta entra no diálogo e não empurra nada.
    // A lista compacta por agrupamento é a que oferece as ações de atendimento.
    $('.rt-chip[data-rt-group="abertos"]').click();
    const assumeButton = await until(() => $('.rt-item[data-rt-item="31"] [data-rt-move="assumir"]'), 8000);
    if (!assumeButton) throw new Error('item em Abertos sem ação de assumir');
    assumeButton.click();
    const active = await until(ticketDialog, 8000);
    check(!!active, 'formulário aberto para receber um alerta novo');
    const before = active.getBoundingClientRect().top;
    await window.RoomTicketsMonitor.refresh({ q: 'period=30d&page=1&alerta=2', reason: 'alerta', maxAge: 0 });
    const inDialog = await until(() => $('#rt-action-form .rt-monitor-alert'), 12000);
    if (!inDialog) throw new Error('alerta não foi hospedado no diálogo aberto');
    check(inDialog.classList.contains('is-in-dialog'), 'alerta no fluxo do diálogo, não sobreposto');
    const dialogBox = active.getBoundingClientRect();
    const alertBox = inDialog.getBoundingClientRect();
    check(alertBox.top >= dialogBox.top - 1 && alertBox.bottom <= dialogBox.bottom + 1,
      'alerta pintado dentro da área do diálogo');
    check(Math.abs(active.getBoundingClientRect().top - before) < 1, 'o alerta novo não empurra o formulário');
    check(!!active.querySelector('[data-rt-role="handler"]'), 'os campos continuam alcançáveis com o alerta');
    const cancelButton = active.querySelector('[data-rt-form-action="cancel"]');
    check(cancelButton.getBoundingClientRect().height >= 43.5,
      'os botões do formulário continuam tocáveis com o alerta na tela');
    cancelButton.click();
    check(!ticketDialog(), 'o alerta dentro do diálogo não impede cancelar');
  };

  // ── 10. Ausência de regressão no desktop e no modo TV ────────────────────
  scenarios['desktop-e-tv'] = async () => {
    // Primeiro o login termina, para as medições valerem com a tela visível.
    await until(() => document.getElementById('app').style.display === 'flex', 12000);
    window.App.go('chamados-salas');
    const table = await until(() => $('.rt-table-wrap tbody tr'), 15000);
    check(!!table, 'tabela de chamados carregada no desktop');
    check(!$('.rt-list'), 'desktop não usa a lista compacta');
    check(window.STATE.tab === 'chamados-salas', 'navegação explícita para chamados é preservada');
    check(!!$('.rt-pagination'), 'paginação do desktop preservada');
    check(getComputedStyle($('.rt-filters-toggle')).display === 'none', 'botão de recolher filtros não aparece no desktop');
    check(!$('#rt-filter-more').hidden, 'filtros expandidos no desktop');
    check($('[data-rt-disclosure="analise"]') === null, 'sem seção recolhível no desktop');
    check($$('.rt-charts .rt-panel').length === 3, 'análise detalhada sempre visível no desktop');
    check(!!$('.rt-state'), 'faixa de estado presente também no desktop');
    check($('.rt-toolbar-status').textContent.includes('Atualizado'), 'estado do monitor no desktop');
    check(noOverflow(), 'sem rolagem horizontal no desktop');

    // Modo TV: informativo, sem ações de atendimento, e sem quebrar nada.
    $('[data-rt-action="tv"]').click();
    const overlay = await until(() => $('.rt-tv'), 8000);
    check(!!overlay, 'modo TV abre');
    check(!/data-tv-action="assume"/.test(overlay.innerHTML), 'TV sem botão de assumir');
    check(!/Assumir chamado/.test(overlay.innerHTML), 'TV sem o texto de assumir');
    check(!!overlay.querySelector('[data-tv-action="close"]'), 'TV com controle de saída');
    check(window.RoomTicketsMonitor.snapshot().running === true, 'monitoramento segue ativo na TV');
    $('[data-tv-action="close"]').click();
    await until(() => !$('.rt-tv'), 8000);
    check(!$('.rt-tv'), 'modo TV fecha');
    check(!!$('.rt-table-wrap'), 'lista do desktop intacta depois da TV');
  };

  // ── 11. Telas para captura de imagem ─────────────────────────────────────
  // Não verifica nada: deixa a interface no estado pedido e a mantem parada.
  scenarios['captura'] = async () => {
    const tela = params.get('tela') || 'lista';
    if (tela === 'desktop') {
      // No desktop a entrada é o Dashboard: a captura navega como a pessoa faria.
      await until(() => document.getElementById('app').style.display === 'flex', 15000);
      window.App.go('chamados-salas');
      await until(() => $('.rt-table-wrap tbody tr'), 15000);
      for (let i = 0; i < 40 && $('.rt-monitor-alert'); i++) {
        $('.rt-monitor-alert [data-monitor-action="dismiss"]')?.click();
        await wait(15);
      }
      await wait(300);
      return;
    }
    await until(() => $('.rt-dashboard') || $('.rt-list'), 15000);
    if (tela === 'menu') {
      $('#sidebar-mobile-toggle').click();
      await until(() => $('#sidebar').getBoundingClientRect().left >= -1, 4000);
      return;
    }
    await until(() => $('.rt-list'), 15000);
    if (tela === 'filtros') {
      $('[data-rt-action="filters"]').click();
      await pause(20);
    } else if (tela === 'erro-conexao') {
      state.listStatus = 502;
      await refreshNow();
      await until(() => $('[data-rt-state="error"]'), 15000);
    } else if (tela === 'assumir') {
      $('[data-rt-group="abertos"]').click();
      await until(() => $('.rt-item[data-rt-item="31"] [data-rt-move="assumir"]'), 12000);
      $('.rt-item[data-rt-item="31"] [data-rt-move="assumir"]').click();
      await until(ticketDialog, 8000);
    } else if (tela === 'concluir') {
      $('[data-rt-group="andamento"]').click();
      await until(() => $('.rt-item[data-rt-item="33"] [data-rt-move="concluir"]'), 12000);
      $('.rt-item[data-rt-item="33"] [data-rt-move="concluir"]').click();
      await until(() => document.querySelector('[data-rt-form="concluir"]'), 8000);
    } else if (tela === 'historico') {
      $('[data-rt-group="andamento"]').click();
      await until(() => $('.rt-item[data-rt-item="33"]'), 12000);
      // O botão "Detalhes" da lista compacta; as ações de status também carregam
      // `data-rt-ticket`, então a escolha precisa ser explícita.
      $('.rt-item[data-rt-item="33"] .rt-item-detail').click();
      await until(() => document.getElementById('rt-detail')?.open, 8000);
      await pause(30);
    } else if (tela === 'analise') {
      $('[data-rt-disclosure-name="analise"]').click();
      await pause(20);
    } else if (tela !== 'todos') {
      $('[data-rt-group="abertos"]').click();
      await until(() => $('[data-rt-list="abertos"]'), 12000);
    }
    // O alerta é o assunto da captura `alerta`. Nas demais telas a fila é
    // esvaziada no fim, para a leitura do fluxo principal não ficar coberta.
    if (tela === 'alerta') {
      await window.RoomTicketsMonitor.refresh({ q: 'period=30d&page=1&alerta=1', reason: 'alerta', maxAge: 0 });
      await until(() => $('.rt-monitor-alert'), 12000);
    } else {
      for (let i = 0; i < 40 && $('.rt-monitor-alert'); i++) {
        $('.rt-monitor-alert [data-monitor-action="dismiss"]')?.click();
        await wait(15);
      }
    }
    await wait(300);
  };

  // ── Execução ────────────────────────────────────────────────────────────
  seed();
  (async () => {
    try {
      window.ApiClient.init({ baseUrl: '', cacheEnabled: false, retryDelay: 1 });
      const run = scenarios[scenario];
      if (!run) throw new Error('cenário desconhecido: ' + scenario);
      await run();
      report({ ok: true, checks, scenario, viewport: clientWidth() });
    } catch (error) {
      report({ ok: false, error: String((error && error.message) || error), scenario,
        viewport: clientWidth(), debug: String(document.body.innerHTML).slice(0, 700) });
    }
  })();
})();
