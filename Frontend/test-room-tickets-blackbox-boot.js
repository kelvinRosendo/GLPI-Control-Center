/* Roteiro de caixa preta: carrega os módulos reais do GCC e fala com o
   servidor de teste através do ApiClient real. Nenhum mock de módulo. */
(() => {
  const params = new URLSearchParams(location.search);
  const scenario = params.get('cenario') || 'dialogo-centralizado';
  const spNow = s => new Date(Date.now() - s * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const isoNow = () => new Date().toISOString();

  window.STATE = { tab: 'chamados-salas' };
  window.CONFIG = { glpiUrl: 'https://glpi.example.test', backendUrl: '' };
  window.UserContext = {
    getUserName: () => 'Kelvin Souza',
    getUserEmail: () => 'kelvin@colegiosatelite.com.br',
    isAuthenticated: () => true,
    getSession: () => ({}),
  };
  window.Dashboard = { getIndicators: () => ({}) };
  window.DATA = {};

  // Mesma tabela de transições do backend (RoomTicketsService::ACTIONS).
  const ACTIONS = {
    1: [['assumir', 'Assumir chamado', 'responsavel'], ['concluir', 'Concluir', 'solucao']],
    2: [['concluir', 'Concluir', 'solucao'], ['pendente', 'Marcar aguardando', 'status']],
    3: [['assumir', 'Assumir chamado', 'responsavel'], ['concluir', 'Concluir', 'solucao'], ['pendente', 'Marcar aguardando', 'status']],
    4: [['assumir', 'Assumir chamado', 'responsavel'], ['concluir', 'Concluir', 'solucao'], ['retomar', 'Retomar', 'status']],
    5: [['reabrir', 'Reabrir chamado', 'status']],
    6: [['reabrir', 'Reabrir chamado', 'status']],
  };
  const TARGET = { assumir: 2, pendente: 4, retomar: 2, concluir: 5, reabrir: 1 };
  const COLUMN = { 1: 'abertos', 2: 'andamento', 3: 'andamento', 4: 'andamento', 5: 'concluidos', 6: 'concluidos' };
  const actionsOf = id => (ACTIONS[id] || []).map(([action, label, kind]) => ({ action, label, kind, target: TARGET[action] }));

  const state = { tickets: [], posts: [], handlers: {} };
  window.__state = state;
  const card = (id, statusId, extra) => Object.assign({
    id, reference: 'L-00' + id, room: 'Sala ' + (10 + id), title: 'Projetor sem imagem #' + id,
    types: ['projector'], openedAt: spNow(3600), statusId, column: COLUMN[statusId],
    statusLabel: { 1: 'Novo', 2: 'Em atendimento', 4: 'Pendente', 5: 'Resolvido' }[statusId] || 'Novo',
    waiting: statusId === 4, eligible: true, assignee: { userId: 0, name: '' }, work: null,
    actions: actionsOf(statusId),
  }, extra || {});

  function buildData(url) {
    const query = new URL(url, location.href).searchParams;
    const limit = Number(query.get('kanban_limit') || 25);
    const page = Number(query.get('page') || 1);
    const columns = { abertos: [], andamento: [], concluidos: [] };
    for (const t of state.tickets) columns[t.column].push(t);
    const column = key => ({
      key, label: { abertos: 'Abertos', andamento: 'Em andamento', concluidos: 'Concluídos' }[key],
      statuses: [], count: columns[key].length, shown: Math.min(limit, columns[key].length),
      hasMore: columns[key].length > limit, items: columns[key].slice(0, limit),
    });
    // `serverOk` já embrulha em {ok:true,data}; aqui devolvemos só a carga.
    return {
      // Ecoa exatamente a consulta pedida, como o backend faz.
      filters: { period: query.get('period') || '30d', from: '2026-08-26', to: '2026-09-24',
        page, per_page: 25, room: query.get('room') || '', type: query.get('type') || '',
        status: query.get('status') || '', asset: query.get('asset') || '',
        q: query.get('q') || '', kanban_limit: limit },
      pagination: { page, pages: 1, total: state.tickets.length },
      summary: { total: state.tickets.length, open: state.tickets.filter(t => t.statusId < 5).length,
        withoutRoom: 0, withoutAsset: 0, review: 0, topRooms: [], topTypes: [] },
      rankings: { rooms: [], types: [], assets: [] },
      options: { rooms: [] },
      meta: { complete: true, collectedAt: isoNow(), warnings: [], contract: { realInstanceValidated: false } },
      items: state.tickets.slice(0, 2),
      latest: state.tickets[0] || null,
      monitor: { recent: scenario === 'tv-sem-acoes' ? [card(900, 1, { openedAt: spNow(5) })] : [], recentLimit: 30, collectedAt: isoNow() },
      kanban: { limit, total: state.tickets.length, unmapped: 0,
        columns: { abertos: column('abertos'), andamento: column('andamento'), concluidos: column('concluidos') } },
    };
  }

  function jsonResponse(payload, status) {
    return new Response(JSON.stringify(payload), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  }
  const serverOk = data => jsonResponse({ ok: true, data });

  // Cada cenário decide o que o servidor de teste responde.
  state.handlers = {
    list: url => serverOk(buildData(url)),
    assume: (id, body) => {
      if (scenario === 'erros-409-502') {
        return jsonResponse({ ok: false, error: 'Este chamado já está com Ana Ribeiro.',
          meta: { status: 409, currentHandler: 'Ana Ribeiro', currentStatusLabel: 'Em atendimento',
            allowedActions: [{ action: 'concluir', label: 'Concluir' }] } }, 409);
      }
      const t = state.tickets.find(x => x.id === id);
      if (t) { t.statusId = 2; t.column = 'andamento'; t.status = 'em_andamento'; t.actions = actionsOf(2);
        t.work = { handlerName: body.handler, handlerSource: 'glpi_user', glpiUserId: 42, solution: '', solutionInGlpi: false }; }
      return serverOk({ ticketId: id, handlerName: body.handler, fromStatus: 1, toStatus: 2, confirmed: true, partial: false });
    },
    move: (id, body) => {
      if (scenario === 'erros-409-502' && body.action === 'concluir') {
        return jsonResponse({ ok: false, error: 'O status mudou no GLPI, mas a solução não ficou registrada.',
          meta: { status: 502, data: { partial: true, applied: { status: true, solution: false },
            steps: [{ step: 'status', ok: true, label: 'Status no GLPI' },
              { step: 'solucao', ok: false, label: 'Solução registrada no GLPI' }] } } }, 502);
      }
      const t = state.tickets.find(x => x.id === id);
      if (t) {
        if (body.action === 'concluir') { t.statusId = 5; t.column = 'concluidos'; t.status = 'resolvido'; t.actions = actionsOf(5); }
        if (body.action === 'reabrir') { t.statusId = 1; t.column = 'abertos'; t.status = 'aberto'; t.actions = actionsOf(1); }
        if (body.action === 'retomar') { t.statusId = 2; t.status = 'em_andamento'; t.actions = actionsOf(2); }
        if (body.action === 'pendente') { t.statusId = 4; t.waiting = true; t.status = 'pendente'; t.actions = actionsOf(4); }
      }
      return serverOk({ ticketId: id, action: body.action, toStatus: t ? t.statusId : 0, confirmed: true, partial: false });
    },
    tecnicos: () => serverOk({ available: true, message: '',
      technicians: [{ id: 42, name: 'Ana Ribeiro' }, { id: 43, name: 'Kelvin Souza' }] }),
    history: () => serverOk({ ticketId: 31, assignment: null, solution: null, moves: [], acknowledgement: null }),
  };

  // fetch real: o ApiClient real interpreta estas respostas HTTP de verdade.
  state.failures = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, options = {}) => {
    const path = String(url);
    const method = (options.method || 'GET').toUpperCase();
    state.posts.push({ method, path, body: options.body ? JSON.parse(options.body) : null });
    if (path.includes('/aceites')) return serverOk({ acknowledgements: {} });
    if (path.includes('/responsaveis')) return state.handlers.tecnicos();
    if (path.includes('/historico')) return state.handlers.history();
    if (path.includes('/assumir')) return state.handlers.assume(Number((path.match(/salas\/(\d+)\//) || [])[1]), {});
    if (path.includes('/mover')) {
      const body = options.body ? JSON.parse(options.body) : {};
      return state.handlers.move(Number((path.match(/salas\/(\d+)\//) || [])[1]), body);
    }
    // A lista precisa refletir a consulta pedida: `matchesFilters` compara os
    // filtros devolvidos com os aplicados.
    try {
      return state.handlers.list(path);
    } catch (error) {
      state.failures.push('lista: ' + String(error && error.message));
      throw error;
    }
  };

  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('falha ao carregar ' + src));
    document.head.appendChild(script);
  });
  const pause = async (r = 20) => { for (let i = 0; i < r; i += 1) await Promise.resolve(); };
  // Espera por contagem de voltas, e não por relógio: sob relógio acelerado o
  // `Date.now()` estouraria a espera antes de a requisição assíncrona resolver.
  // Devolve o VALOR verdadeiro (o elemento encontrado), não apenas `true`.
  const wait = async (predicate, rounds = 400, what = '') => {
    for (let i = 0; i < rounds; i += 1) {
      let value = null;
      try { value = predicate(); } catch { value = null; }
      if (value) return value;
      await new Promise(r => setTimeout(r, 0));
    }
    if (what) {
      const results = document.getElementById('rt-results');
      throw new Error('timeout esperando ' + what + ' · resultados='
        + String((results || {}).innerHTML || '(sem #rt-results)').slice(0, 300)
        + ' · acoes=' + JSON.stringify((state.tickets[0] || {}).actions)
        + ' · statusId=' + JSON.stringify((state.tickets[0] || {}).statusId)
        + ' · chamadas=' + JSON.stringify(state.posts.map(p => p.path))
        + ' · falhas=' + JSON.stringify(state.failures));
    }
    return null;
  };

  const scenarios = {};

  const openDialog = () => {
    const dialog = document.getElementById('rt-action-form');
    return dialog && dialog.open ? dialog : null;
  };

  scenarios['dialogo-centralizado'] = async check => {
    state.tickets = [card(31, 1), card(33, 2)];
    window.RoomTickets.mount();
    await wait(() => document.querySelector('.rt-view-switch'), 4000, '.rt-view-switch');
    await wait(() => document.querySelector('[data-rt-view="kanban"]'), 2000, 'botão kanban');
    document.querySelector('[data-rt-view="kanban"]').click();
    await wait(() => document.querySelector('.rt-kanban'), 4000, '.rt-kanban');
    await wait(() => document.querySelector('[data-rt-move="assumir"]'), 2000, 'botão assumir');
    document.querySelector('[data-rt-move="assumir"]').click();
    const dialog = await wait(openDialog, 2000, 'formulário de assumir aberto');
    check(Boolean(dialog && dialog.open), 'formulário de assumir aberto');
    check(!dialog.querySelector('.rt-form-close'), 'sem botão Fechar redundante');
    const rect = dialog.getBoundingClientRect();
    const style = getComputedStyle(dialog);
    // clientWidth exclui a barra de rolagem: é o viewport de layout, contra o
    // qual a centralização do `dialog` é medida.
    const viewW = document.documentElement.clientWidth;
    const viewH = document.documentElement.clientHeight;
    check(Math.abs((rect.left + rect.right) / 2 - viewW / 2) < 2,
      'centralizado horizontalmente · centro=' + ((rect.left + rect.right) / 2) + ' viewport=' + viewW);
    check(Math.abs((rect.top + rect.bottom) / 2 - viewH / 2) < 2,
      'centralizado verticalmente · centro=' + ((rect.top + rect.bottom) / 2) + ' viewport=' + viewH);
    check(parseFloat(style.marginTop) > 0 || style.margin === 'auto', 'margem não é zerada pelos estilos globais');
    check(rect.height <= viewH * 0.9, 'altura máxima respeitada · ' + Math.round(rect.height) + '/' + viewH);
    check(document.activeElement && dialog.contains(document.activeElement), 'foco inicial dentro do formulário');
    check(!!dialog.querySelector('label') && /Quem do TI foi resolver/.test(dialog.textContent),
      'pergunta do formulário presente');
    // Fechamento acessível por teclado.
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    check(true, 'tecla Escape não lança erro');
  };

  scenarios['dialogo-centralizado-estreito'] = async check => {
    state.tickets = [card(31, 1)];
    window.RoomTickets.mount();
    await wait(() => document.querySelector('.rt-view-switch'), 4000, '.rt-view-switch');
    document.querySelector('[data-rt-view="kanban"]').click();
    await wait(() => document.querySelector('.rt-kanban'), 4000, '.rt-kanban');
    await wait(() => document.querySelector('[data-rt-move="assumir"]'), 2000, 'botão assumir');
    document.querySelector('[data-rt-move="assumir"]').click();
    const dialog = await wait(openDialog, 2000, 'formulário aberto na tela estreita');
    const rect = dialog.getBoundingClientRect();
    const viewW = document.documentElement.clientWidth;
    check(rect.left >= -1 && rect.right <= viewW + 1, 'formulário cabe na tela estreita');
    check(Math.abs((rect.left + rect.right) / 2 - viewW / 2) < 2, 'centralizado na tela estreita');
    // Um alerta novo não pode empurrar o formulário.
    const before = rect.top;
    document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;bottom:0;height:80px">alerta gigante</div>');
    await pause();
    const after = dialog.getBoundingClientRect().top;
    check(Math.abs(after - before) < 1, 'posição do formulário não muda com novo alerta');
  };

  scenarios['tv-sem-acoes'] = async check => {
    state.tickets = [card(31, 1, { assignee: { userId: 42, name: 'Ana Ribeiro' } })];
    window.RoomTickets.mount();
    await wait(() => document.querySelector('.rt-view-switch'), 4000, '.rt-view-switch');
    window.RoomTicketsTV.open();
    await pause(40);
    const overlay = await wait(() => document.querySelector('.rt-tv'), 2000, 'overlay do modo TV');
    document.querySelector('[data-tv-panel="calls"]').click();
    await wait(() => document.querySelector('.rt-tv-card--latest'), 2000, 'painel de chamados da TV');
    const html = overlay.innerHTML;
    check(!/data-tv-action="assume"/.test(html), 'TV sem botão de assumir');
    check(!/data-tv-action="accept"/.test(html), 'TV sem botão de aceitar');
    check(!/Assumir chamado/.test(html), 'TV sem o texto "Assumir chamado"');
    check(!/Aceitar alerta/.test(html), 'TV sem o texto "Aceitar alerta"');
    check(!/alertas? aceito/i.test(html), 'TV não confunde alerta aceito com chamado em andamento');
    check(/Ana Ribeiro/.test(html), 'TV mostra quem está atendendo');
    check(/Novo/.test(html), 'TV mostra o status real do chamado');
    check(typeof window.RoomTicketsTV.accept === 'undefined', 'TV não expõe ação de aceite');
    check(overlay.querySelector('[data-tv-action="sound"]') !== null, 'TV mantém o controle de som');
    check(overlay.querySelector('[data-tv-action="fullscreen"]') !== null, 'TV mantém o controle de tela cheia');
    check(overlay.querySelector('[data-tv-action="close"]') !== null, 'TV mantém o controle de saída');
    // Nenhum clique na TV abre formulário operacional.
    const opened = [];
    document.addEventListener('roomtickets:assume-request', () => opened.push(true));
    for (const button of overlay.querySelectorAll('button')) button.click();
    await pause(30);
    check(opened.length === 0, 'cliques na TV não abrem formulário operacional');
    check(!openDialog(), 'nenhum formulário operacional aberto pela TV');
    // Entrar na TV não interrompe a atualização do painel.
    const running = window.RoomTicketsMonitor.snapshot().running;
    check(running === true, 'monitoramento continua ativo dentro do modo TV');
    window.RoomTicketsTV.close();
  };

  scenarios['arraste-e-acoes'] = async check => {
    state.tickets = [card(31, 1), card(33, 2), card(34, 4), card(35, 5)];
    window.RoomTickets.mount();
    await wait(() => document.querySelector('.rt-view-switch'), 4000, '.rt-view-switch');
    document.querySelector('[data-rt-view="kanban"]').click();
    await wait(() => document.querySelector('.rt-kanban'), 4000, '.rt-kanban');
    // Ações por status, vindas do backend.
    const labelsFor = id => Array.from(document.querySelectorAll('[data-rt-card="' + id + '"] [data-rt-move]'))
      .map(b => b.dataset.rtMove);
    check(JSON.stringify(labelsFor(31)) === JSON.stringify(['assumir', 'concluir']),
      'novo oferece assumir e concluir · ' + JSON.stringify(labelsFor(31)));
    check(JSON.stringify(labelsFor(33)) === JSON.stringify(['concluir', 'pendente']),
      'em atendimento não oferece retomar · ' + JSON.stringify(labelsFor(33)));
    check(JSON.stringify(labelsFor(34)) === JSON.stringify(['assumir', 'concluir', 'retomar']),
      'pendente oferece retomar e não oferece aguardar de novo · ' + JSON.stringify(labelsFor(34)));
    check(JSON.stringify(labelsFor(35)) === JSON.stringify(['reabrir']),
      'resolvido só oferece reabrir · ' + JSON.stringify(labelsFor(35)));
    // Arraste de Abertos para Em andamento abre "Assumir chamado".
    const source = document.querySelector('[data-rt-card="31"]');
    const target = document.querySelector('[data-rt-drop="andamento"]');
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    source.dispatchEvent(dragStart);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'target', { value: target });
    RoomTicketsKanban.onDrop(drop);
    await pause(20);
    const dialog = document.getElementById('rt-action-form');
    check(Boolean(dialog && dialog.open), 'arraste de Abertos para Em andamento abre formulário');
    check(/Assumir chamado/.test(dialog.textContent),
      'arraste de Abertos para Em andamento abre ASSUMIR, não aguardar · ' + dialog.textContent.slice(0, 60));
    document.querySelector('[data-rt-form-action="cancel"]').click();
    check(getComputedStyle(document.getElementById('rt-action-form')).display === 'none', 'diálogo fechado fica invisível');
  };

  scenarios['erros-409-502'] = async check => {
    state.tickets = [card(31, 1), card(33, 2)];
    window.RoomTickets.mount();
    await wait(() => document.querySelector('.rt-view-switch'), 4000, '.rt-view-switch');
    document.querySelector('[data-rt-view="kanban"]').click();
    await wait(() => document.querySelector('.rt-kanban'), 4000, '.rt-kanban');
    // 409: conflito explicado, com o responsável atual.
    await wait(() => document.querySelector('[data-rt-card="31"] [data-rt-move="assumir"]'), 2000, 'botão assumir');
    document.querySelector('[data-rt-card="31"] [data-rt-move="assumir"]').click();
    const form = await wait(openDialog, 2000, 'formulário de assumir');
    await wait(() => form.querySelector('[data-rt-role="handler"]'), 2000, 'campo de responsável');
    form.querySelector('[data-rt-role="handler"]').value = 'Bia Alves';
    form.querySelector('button[type="submit"]').click();
    await wait(() => form.querySelector('[data-rt-form-error]'), 3000, 'erro de conflito no formulário');
    const erro = form.querySelector('[data-rt-form-error]').textContent;
    check(/já está com Ana Ribeiro/.test(erro), '409 explica o conflito com o responsável atual · ' + erro);
    check(!/HTTP 409/.test(erro), '409 não mostra "HTTP 409"');
    check(/Concluir/.test(erro), '409 informa as ações ainda disponíveis');
    check(form.querySelector('[data-rt-role="handler"]').value === 'Bia Alves', 'texto do formulário preservado após o erro');
    // 502 parcial: distingue "não confirmado" de "parte aplicada".
    form.querySelector('[data-rt-form-action="cancel"]').click();
    check(getComputedStyle(document.getElementById('rt-action-form')).display === 'none', 'Cancelar oculta após erro');
    await pause(10);
    await wait(() => document.querySelector('[data-rt-card="33"] [data-rt-move="concluir"]'), 3000, 'botão concluir');
    document.querySelector('[data-rt-card="33"] [data-rt-move="concluir"]').click();
    const form2 = await wait(openDialog, 2000, 'formulário de conclusão');
    await wait(() => form2.querySelector('[data-rt-role="solution"]'), 2000, 'campo de solução');
    form2.querySelector('[data-rt-role="solution"]').value = 'Troca do cabo HDMI do projetor.';
    form2.querySelector('button[type="submit"]').click();
    await wait(() => form2.querySelector('[data-rt-form-error]'), 3000, 'erro de falha parcial');
    const erro2 = form2.querySelector('[data-rt-form-error]').textContent;
    check(!/HTTP 502/.test(erro2), '502 não mostra "HTTP 502" · ' + erro2.slice(0, 80));
    check(/metade|parcial/i.test(erro2), '502 diz que a alteração ficou pela metade · ' + erro2.slice(0, 120));
    check(/status foi alterado/i.test(erro2), '502 diz o que de fato foi aplicado');
    check(/Solução registrada no GLPI/.test(erro2), '502 nomeia a etapa que falhou');
    check(form2.querySelector('[data-rt-role="solution"]').value === 'Troca do cabo HDMI do projetor.',
      'solução preservada após falha parcial');
    check(!/Tente novamente de forma automática/.test(erro2), 'não orienta reenvio cego');
  };

  scenarios['interface-preservada'] = async check => {
    state.tickets = [card(31, 1), card(33, 2)];
    window.RoomTickets.mount();
    await wait(() => document.querySelector('#rt-filters'), 4000, '#rt-filters');
    // A consulta inicial precisa terminar: com a tela ainda carregando o filtro
    // fica desabilitado de propósito.
    await wait(() => document.querySelector('[data-rt-ticket]'), 6000, 'lista carregada');
    const search = await wait(() => document.querySelector('#rt-filters input[name="q"]'), 2000, 'campo de busca');
    search.value = 'projetor da sala 16';
    search.focus();
    search.setSelectionRange(9, 9);
    check(document.activeElement === search, 'campo de busca recebeu o foco antes de atualizar · ativo='
      + (document.activeElement ? document.activeElement.tagName : 'nenhum'));
    // Atualização automática com o formulário em uso: busca, foco e cursor.
    window.RoomTicketsMonitor.refresh({ q: 'period=30d&page=1', reason: 'tick', maxAge: 0 });
    await pause(80);
    const after = document.querySelector('#rt-filters input[name="q"]');
    check(after.value === 'projetor da sala 16', 'busca digitada e não aplicada é preservada · ' + after.value);
    check(document.activeElement === after, 'foco permanece no campo de busca · ativo='
      + (document.activeElement ? document.activeElement.tagName + '/' + document.activeElement.getAttribute('name') : 'nenhum'));
    check(after.selectionStart === 9, 'posição do cursor preservada · ' + after.selectionStart);
    // Detalhes e histórico abertos: precisam sobreviver à atualização.
    const link = await wait(() => document.querySelector('[data-rt-ticket]'), 4000, 'link de detalhes');
    link.click();
    const dialog = await wait(() => {
      const d = document.getElementById('rt-detail');
      return d && d.open ? d : null;
    }, 2000, 'diálogo de detalhes');
    dialog.querySelector('[data-rt-action="history"]').click();
    await wait(() => !dialog.querySelector('[data-rt-history]').hidden, 2000, 'histórico carregado');
    window.RoomTicketsMonitor.refresh({ q: 'period=30d&page=1', reason: 'tick', maxAge: 0 });
    await pause(80);
    check(document.getElementById('rt-detail')?.open === true, 'diálogo de detalhes continua aberto após atualizar');
    check(document.querySelector('[data-rt-history]')?.hidden === false, 'histórico carregado continua visível');
    check(document.querySelector('#rt-filters input[name="q"]').value === 'projetor da sala 16',
      'busca continua preenchida com o diálogo aberto');
    document.getElementById('rt-detail').close();
  };

  scenarios['duas-conclusoes'] = async check => {
    // Concluir, reabrir e concluir de novo: três intenções diferentes.
    state.tickets = [card(35, 1)];
    window.RoomTickets.mount();
    await wait(() => document.querySelector('.rt-view-switch'), 4000, '.rt-view-switch');
    document.querySelector('[data-rt-view="kanban"]').click();
    await wait(() => document.querySelector('.rt-kanban'), 4000, '.rt-kanban');
    const act = async (action, text) => {
      const button = await wait(() => document.querySelector('[data-rt-card="35"] [data-rt-move="' + action + '"]'),
        4000, 'botão ' + action);
      button.click();
      const form = await wait(openDialog, 2000, 'formulário de ' + action);
      if (text !== undefined) {
        const field = await wait(() => form.querySelector('[data-rt-role="solution"]'), 2000, 'campo de solução');
        field.value = text;
      }
      form.querySelector('button[type="submit"]').click();
      await wait(() => !form.open, 4000, action + ' confirmada pelo servidor');
    };
    await act('concluir', 'Primeira resolucao registrada.');
    await act('reabrir');
    await act('concluir', 'Segunda resolucao, depois de reabrir.');
    const moves = state.posts.filter(p => p.path.includes('/mover'));
    const ids = moves.map(m => m.body.requestId);
    check(moves.length === 3, 'concluir, reabrir e concluir de novo geram três gravações · ' + moves.length);
    check(new Set(ids).size === 3, 'cada intenção tem um requestId próprio · ' + JSON.stringify(ids));
    check(state.tickets[0].statusId === 5, 'chamado termina resolvido');
    // Logout descarta qualquer identificador da sessão anterior.
    window.RoomTicketsMonitor.reset();
    state.posts.length = 0;
    window.RoomTickets.mount();
    await wait(() => document.querySelector('.rt-view-switch'), 4000, 'painel após logout');
    document.querySelector('[data-rt-view="kanban"]').click();
    await wait(() => document.querySelector('.rt-kanban'), 4000, 'Kanban após logout');
    await act('reabrir');
    const afterLogout = state.posts.filter(p => p.path.includes('/mover')).map(m => m.body.requestId);
    check(afterLogout.length === 1 && !ids.includes(afterLogout[0]),
      'após o logout o identificador anterior não é reaproveitado · ' + JSON.stringify(afterLogout));
  };

  const report = payload => {
    if (window.__reported) return;
    window.__reported = true;
    // Relata ao servidor de teste; o console do Chrome headless não é confiável.
    const body = JSON.stringify(payload);
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/resultado', false);
      xhr.send(body);
      return;
    } catch { /* tenta o beacon */ }
    try { if (navigator.sendBeacon) navigator.sendBeacon('/resultado', body); } catch { /* nada a fazer */ }
  };
  window.addEventListener('error', event => report({ ok: false, error: 'JS: ' + event.message }));
  window.addEventListener('unhandledrejection', event =>
    report({ ok: false, error: 'promise: ' + String((event.reason && event.reason.message) || event.reason) }));

  (async () => {
    let checks = 0;
    const check = (ok, message) => { if (!ok) throw new Error(message); checks += 1; };
    try {
      await load('/js/api-client.js');
      await load('/js/room-tickets-monitor.js');
      await load('/js/room-tickets-kanban.js');
      await load('/js/room-tickets.js');
      await load('/js/room-tickets-tv.js');
      window.ApiClient.init({ baseUrl: '', cacheEnabled: false, retryDelay: 1 });
      const run = scenarios[scenario];
      if (!run) throw new Error('cenário desconhecido: ' + scenario);
      await run(check);
      report({ ok: true, checks });
    } catch (error) {
      report({ ok: false, error: String((error && error.message) || error) });
    }
  })();
})();
