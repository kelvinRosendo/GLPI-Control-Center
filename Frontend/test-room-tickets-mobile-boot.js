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
        await until(() => $('.rt-phone-list'));
        check(!!$('.rt-phone-list'), 'fila de atendimento é a apresentação inicial');
        const expected = params.get('rt_group');
        if (expected) {
          check($('[data-rt-group="' + expected + '"]').getAttribute('aria-pressed') === 'true',
            'filtro rápido da URL preservado na entrada · ' + expected);
        }
        if (params.get('rt_view')) {
          check(!$('[data-rt-view="kanban"]'), 'celular sempre usa a fila simples');
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

  scenarios['phone-flow'] = async () => {
    await until(() => $('.rt-phone-list'));
    check($$('.rt-phone-tabs button').length === 3, 'três filas sem indicadores extras');
    check($$('.rt-phone-ticket').length === 4, 'somente chamados abertos na entrada');
    check(!$('.rt-live') && !$('.rt-charts') && !$('.rt-view-switch'), 'sem dashboard, gráficos ou seletor de Kanban no celular');
    check($('[data-rt-disclosure-name="analise"]').getAttribute('aria-expanded') === 'false', 'filtros e som começam recolhidos');
    check(!$('#rt-filters').getBoundingClientRect().height, 'formulário de busca fora da tela inicial');
    check(getComputedStyle($('.rt-monitor-widget')).display === 'none', 'widget flutuante não cobre os chamados');
    check($('.rt-state-when').textContent.includes('Última atualização'), 'horário de atualização visível');
    const card31 = $('.rt-phone-ticket[data-rt-item="31"]');
    check(card31.textContent.includes('Sala 41'), 'sala em destaque');
    check(card31.textContent.includes('Projetor sem imagem'), 'problema visível');
    check(card31.querySelector('[data-rt-move="assumir"]').textContent === 'Vou atender', 'uma ação primária clara');
    check(!card31.querySelector('[data-rt-move="concluir"]'), 'concluir fica nos detalhes');
    check(card31.querySelector('button').getBoundingClientRect().height >= 44, 'alvo de toque adequado');
    check(noOverflow(), 'texto longo sem rolagem horizontal');
    card31.querySelector('[data-rt-move="assumir"]').click();
    let dialog = await until(ticketDialog);
    check(dialog.querySelector('[data-rt-role="handler"]').value === 'Kelvin Souza', 'responsável pré-preenchido');
    check(!dialog.querySelector('.rt-form-close'), 'sem fechar duplicado');
    dialog.querySelector('[data-rt-form-action="cancel"]').click();
    await until(() => !ticketDialog());
    check(state.posts.length === 0, 'cancelar não grava');
    $('.rt-phone-ticket[data-rt-item="31"] [data-rt-move="assumir"]').click();
    dialog = await until(ticketDialog);
    submit(dialog); submit(dialog);
    await until(() => !ticketDialog(), 12000);
    check(state.posts.filter(p => p.action === 'assumir').length === 1, 'duplo envio assume só uma vez');
    $('[data-rt-group="andamento"]').click();
    await until(() => $('.rt-phone-ticket[data-rt-item="31"]'));
    check($('.rt-phone-ticket[data-rt-item="31"]').textContent.includes('Kelvin Souza'), 'quem atende aparece na fila');
    $('.rt-phone-ticket[data-rt-item="31"] [data-rt-ticket]:not([data-rt-move])').click();
    await until(() => $('#rt-detail')?.open);
    $('#rt-detail [data-rt-move="concluir"]').click();
    dialog = await until(ticketDialog);
    check(!$('#rt-detail').open, 'detalhes fecham ao abrir o formulário');
    dialog.querySelector('[data-rt-role="solution"]').value = 'Troca do cabo HDMI.';
    submit(dialog);
    await until(() => !ticketDialog(), 12000);
    $('[data-rt-group="concluidos"]').click();
    await until(() => $('.rt-phone-ticket[data-rt-item="31"]'));
    check(state.posts.some(p => p.action === 'mover' && p.body.solution === 'Troca do cabo HDMI.'), 'solução enviada pelo fluxo existente');
    $('[data-rt-disclosure-name="analise"]').click();
    check($('#rt-filters').getBoundingClientRect().height > 0, 'busca acessível sob demanda');
    const input = $('#rt-filters input[name="q"]');
    input.value = 'texto em digitação'; input.focus(); input.setSelectionRange(5, 5);
    window.RoomTickets.mount();
    check($('#rt-filters input[name="q"]').value === 'texto em digitação', 'redesenho preserva busca');
    check(document.activeElement.name === 'q', 'redesenho preserva foco');
    const stamp = $('.rt-state-when').textContent;
    state.listStatus = 502; await refreshNow();
    await until(() => $('[data-rt-state="error"]'), 15000);
    check($$('.rt-phone-ticket').length > 0, 'falha mantém dados anteriores');
    check($('.rt-state-when').textContent === stamp, 'falha não atualiza data artificialmente');
    state.listStatus = 200; await refreshNow();
    await until(() => $('[data-rt-state="ok"]'), 15000);
    state.listStatus = 401; await refreshNow();
    await until(() => $('[data-rt-state="expired"]'), 15000);
    check(!$('[data-rt-cache-warning]'), 'sessão expirada não é cache');
  };
  scenarios['phone-errors'] = async () => {
    await until(() => $('.rt-phone-list'));
    state.moveStatus = Number(params.get('error'));
    $('[data-rt-group="andamento"]').click();
    await until(() => $('.rt-phone-ticket[data-rt-item="33"]'));
    $('.rt-phone-ticket[data-rt-item="33"] [data-rt-ticket]:not([data-rt-move])').click();
    await until(() => $('#rt-detail')?.open);
    $('#rt-detail [data-rt-move="concluir"]').click();
    const dialog = await until(ticketDialog);
    dialog.querySelector('[data-rt-role="solution"]').value = 'Teste de falha';
    submit(dialog);
    await until(() => dialog.querySelector('[data-rt-form-error]')?.textContent.trim(), 15000);
    check(!!ticketDialog(), 'falha mantém solução para revisão');
    check(dialog.querySelector('[data-rt-role="solution"]').value === 'Teste de falha', 'texto preservado na falha');
    dialog.querySelector('[data-rt-form-action="cancel"]').click();
    await until(() => !ticketDialog());
    check(state.posts.length === 1, 'cancelar após falha não repete escrita');
    check(noOverflow(), 'erro cabe na tela');
  };
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
    await until(() => $('.rt-dashboard') || $('.rt-phone-list'), 15000);
    if (tela === 'menu') {
      $('#sidebar-mobile-toggle').click();
      await until(() => $('#sidebar').getBoundingClientRect().left >= -1, 4000);
      return;
    }
    await until(() => $('.rt-phone-list'), 15000);
    if (tela === 'filtros') {
      $('[data-rt-action="filters"]').click();
      await pause(20);
    } else if (tela === 'erro-conexao') {
      state.listStatus = 502;
      await refreshNow();
      await until(() => $('[data-rt-state="error"]'), 15000);
    } else if (tela === 'assumir') {
      $('[data-rt-group="abertos"]').click();
      await until(() => $('.rt-phone-ticket[data-rt-item="31"] [data-rt-move="assumir"]'), 12000);
      $('.rt-phone-ticket[data-rt-item="31"] [data-rt-move="assumir"]').click();
      await until(ticketDialog, 8000);
    } else if (tela === 'concluir') {
      $('[data-rt-group="andamento"]').click();
      await until(() => $('.rt-phone-ticket[data-rt-item="33"] [data-rt-move="concluir"]'), 12000);
      $('.rt-phone-ticket[data-rt-item="33"] [data-rt-move="concluir"]').click();
      await until(() => document.querySelector('[data-rt-form="concluir"]'), 8000);
    } else if (tela === 'historico') {
      $('[data-rt-group="andamento"]').click();
      await until(() => $('.rt-phone-ticket[data-rt-item="33"]'), 12000);
      // O botão "Detalhes" da lista compacta; as ações de status também carregam
      // `data-rt-ticket`, então a escolha precisa ser explícita.
      $('.rt-phone-ticket[data-rt-item="33"] [data-rt-ticket]:not([data-rt-move])').click();
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
      report({ ok: false, error: String((error && error.stack) || error), scenario,
        viewport: clientWidth(), debug: String(document.body.innerHTML).slice(0, 700) });
    }
  })();
})();
