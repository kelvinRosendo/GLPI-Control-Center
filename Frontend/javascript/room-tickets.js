/**
 * Chamados das salas: operational view backed by the GLPI report endpoint.
 */
window.RoomTickets = (() => {
  'use strict';
  const TYPES = { projector: 'Projetor', pc: 'PC', mouse: 'Mouse', keyboard: 'Teclado',
    chromebook: 'Chromebook', cart: 'Carrinho', other: 'Outros', unknown: 'Não identificado' };
  const STATUS = { aberto: 'Novo', em_andamento: 'Em atendimento', pendente: 'Pendente',
    resolvido: 'Resolvido', fechado: 'Fechado', desconhecido: 'Desconhecido' };
  const SOURCES = { local_glpi: 'Local do chamado no GLPI', campo_local: 'Campo Local da descrição',
    titulo_inferido: 'Interpretado do título — revisar', nao_identificado: 'Não identificado',
    ativo_vinculado: 'Ativo vinculado', categoria_glpi: 'Categoria GLPI',
    campo_equipamento: 'Campo Equipamento da descrição' };
  const defaults = () => ({ period: '30d', from: '', to: '', room: '', type: '', status: '', asset: '', q: '', page: 1 });
  let filters = defaults(), data = null, loading = false, error = '', generation = 0;
  let timer = null, auto = true, initialized = false;
  let lastQuery = '', monitorBound = false;
  let view = 'lista';
  let kanbanLimit = 25;
  let notice = '';
  const monitor = () => window.RoomTicketsMonitor;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const active = () => window.STATE?.tab === 'chamados-salas';
  const formatDate = value => {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] : '') : '—';
  };

  /** Horário de Brasília da última consulta bem-sucedida ao GLPI. */
  function lastUpdateLabel() {
    const collectedAt = data?.meta?.collectedAt;
    if (!collectedAt) return 'Ainda não consultado';
    const date = new Date(collectedAt);
    if (Number.isNaN(date.getTime())) return 'Ainda não consultado';
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });
    const day = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    // A data só aparece quando ela difere do dia de hoje.
    return 'Última atualização: ' + (day === today ? '' : day + ' ') + time;
  }

  /** true quando há dados válidos em tela e a última consulta falhou. */
  function usingCache() {
    if (!data) return false;
    const state = monitor()?.getState?.() || '';
    return state === 'error' || state === 'stale' || state === 'expired';
  }

  function readUrl() {
    if (initialized) return;
    initialized = true;
    const query = new URLSearchParams(window.location.search);
    for (const key of Object.keys(filters)) {
      if (query.has('rt_' + key)) filters[key] = query.get('rt_' + key);
    }
    if (!['30d', 'previous_month', 'custom'].includes(filters.period)) filters.period = '30d';
    filters.page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
    if (query.get('rt_view') === 'kanban') view = 'kanban';
    const limit = Number.parseInt(query.get('rt_kanban_limit'), 10);
    if (Number.isFinite(limit) && limit > 0) kanbanLimit = Math.min(100, limit);
  }

  function writeUrl() {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(filters)) {
      if (value !== '') url.searchParams.set('rt_' + key, String(value));
      else url.searchParams.delete('rt_' + key);
    }
    if (view === 'kanban') url.searchParams.set('rt_view', 'kanban');
    else url.searchParams.delete('rt_view');
    if (kanbanLimit !== 25) url.searchParams.set('rt_kanban_limit', String(kanbanLimit));
    else url.searchParams.delete('rt_kanban_limit');
    window.history.replaceState(null, '', url);
  }

  function options(values, selected, emptyLabel) {
    return '<option value="">' + esc(emptyLabel) + '</option>' + Object.entries(values)
      .map(([key, label]) => '<option value="' + esc(key) + '"' + (key === selected ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
  }

  function leaders(rows) {
    if (!rows?.length) return 'Sem identificação';
    const names = rows.slice(0, 2).map(r => r.label).join(' / ');
    return names + (rows.length > 2 ? ' + ' + (rows.length - 2) : '') + (rows.length > 1 ? ' (empate)' : '');
  }

  function ranking(title, rows, dimension) {
    const maximum = rows[0]?.count || 1;
    return '<section class="rt-panel"><h2>' + esc(title) + '</h2>' +
      (rows.length ? '<ol class="rt-ranking">' + rows.slice(0, 10).map(row =>
        '<li><button type="button" data-rt-dimension="' + dimension + '" data-rt-key="' + esc(row.key) + '">' +
        '<span class="rt-rank-label">' + esc(row.label) +
        (row.tag ? ' <small>Patrimônio ' + esc(row.tag) + '</small>' : '') +
        '</span><strong>' + row.count + '</strong>' +
        '<meter min="0" max="' + maximum + '" value="' + row.count + '" aria-label="' +
        esc(row.label + ': ' + row.count + ' chamados') + '"></meter></button></li>').join('') +
        '</ol><p class="rt-muted">Até 10 resultados. Selecione para filtrar os chamados.</p>'
      : '<p class="rt-muted">Nenhum registro identificado neste recorte.</p>') + '</section>';
  }

  // ── estado da interface que NÃO pode se perder no redesenho ─────────────

  /**
   * O redesenho da área de resultados é inevitável, mas ele não pode apagar o
   * que a pessoa está fazendo: o texto digitado e ainda não aplicado na busca,
   * o foco e a posição do cursor. O diálogo de detalhes vive fora dessa área,
   * em um elemento persistente, e por isso sobrevive a toda atualização.
   */
  let detailDialog = null;

  function captureInteraction() {
    if (typeof document === 'undefined') return null;
    const form = document.getElementById('rt-filters');
    const search = form?.querySelector('input[name="q"]');
    const active = document.activeElement;
    const snapshot = {};
    // Texto digitado mas ainda não aplicado: some da tela, não do formulário.
    if (search && search.value !== '' && search.value !== filters.q) snapshot.search = search.value;
    if (active && active.getAttribute && active.getAttribute('name') && form?.contains(active)) {
      snapshot.focusName = active.getAttribute('name');
      if (typeof active.selectionStart === 'number') {
        snapshot.selectionStart = active.selectionStart;
        snapshot.selectionEnd = active.selectionEnd;
      }
    }
    return Object.keys(snapshot).length ? snapshot : null;
  }

  function restoreInteraction(snapshot) {
    if (!snapshot || typeof document === 'undefined') return;
    const form = document.getElementById('rt-filters');
    if (!form) return;
    if (snapshot.search !== undefined) {
      const search = form.querySelector('input[name="q"]');
      if (search) search.value = snapshot.search;
    }
    if (snapshot.focusName) {
      const field = form.querySelector('[name="' + snapshot.focusName + '"]');
      if (field && typeof field.focus === 'function') {
        field.focus();
        if (typeof field.setSelectionRange === 'function' && typeof snapshot.selectionStart === 'number') {
          try { field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd); } catch { /* não selecionável */ }
        }
      }
    }
  }

  /** Diálogo de detalhes: criado uma vez e nunca recriado pelo redesenho. */
  function ensureDetailDialog() {
    if (detailDialog && detailDialog.isConnected) return detailDialog;
    if (typeof document === 'undefined') return null;
    detailDialog = document.createElement('dialog');
    detailDialog.id = 'rt-detail';
    detailDialog.setAttribute('aria-labelledby', 'rt-detail-title');
    detailDialog.innerHTML = '<div class="rt-detail-body"></div>';
    // Vive fora de .rt-dashboard, então precisa do próprio listener: sem isso
    // os botões de "Assumir", "Aceitar" e "Ver histórico" parariam de funcionar.
    detailDialog.addEventListener('click', onClick);
    document.body.appendChild(detailDialog);
    return detailDialog;
  }

  function latestTicket() {
    if (data?.latest) return data.latest;
    return [...(data?.items || [])].sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)) || b.id - a.id)[0] || null;
  }

  function renderOperational() {
    if (loading && !data) return '<section class="rt-live rt-panel"><div class="rt-message" role="status">Consultando o chamado mais recente…</div></section>';
    if (!data) return '';
    const ticket = latestTicket();
    if (!ticket) return '<section class="rt-live rt-panel"><div><p class="rt-eyebrow">ÚLTIMO CHAMADO RECEBIDO</p><h2>Nenhum chamado no período</h2><p class="rt-muted">A consulta é atualizada automaticamente a cada minuto.</p></div></section>';
    const summary = data.summary || {};
    const room = summary.topRooms?.[0];
    const type = summary.topTypes?.[0];
    const accepted = Boolean(ticket.acknowledgement);
    return '<section class="rt-live" aria-labelledby="rt-live-title"><article class="rt-live-ticket rt-panel">' +
      '<div class="rt-live-heading"><div><p class="rt-eyebrow">ÚLTIMO CHAMADO RECEBIDO</p><h2 id="rt-live-title">' + esc(ticket.room) + '</h2></div><span class="rt-status rt-status--' + (accepted ? 'accepted' : 'new') + '">' + (accepted ? 'Alerta aceito' : 'Novo') + '</span></div>' +
      '<div class="rt-live-meta"><strong>' + esc((ticket.types || []).map(key => TYPES[key] || key).join(', ')) + '</strong><span>#' + ticket.id + (ticket.reference ? ' · ' + esc(ticket.reference) : '') + '</span><span>' + esc(formatDate(ticket.openedAt)) + '</span><span>' + esc(ownerLabel(ticket)) + '</span></div>' +
      '<h3>' + esc(ticket.title || 'Sem título') + '</h3><p class="rt-muted">' + esc(ticket.description || 'Sem descrição.') + '</p>' +
      '<div class="rt-live-actions"><button type="button" class="rt-primary" data-rt-action="assume" data-ticket-id="' + ticket.id + '">Assumir chamado</button>' +
      '<button type="button" data-rt-action="accept" data-ticket-id="' + ticket.id + '"' + (accepted ? ' disabled' : '') + '>' + (accepted ? 'Aceito' : 'Aceitar alerta') + '</button>' +
      '<button type="button" data-rt-ticket="' + ticket.id + '">Ver detalhes</button></div></article>' +
      '<aside class="rt-live-stats"><article class="rt-card"><h2>Chamados abertos</h2><strong>' + (summary.open || 0) + '</strong><p>Atualização a cada minuto</p></article>' +
      '<article class="rt-card"><h2>Sala recorrente</h2><strong>' + esc(room?.label || 'Sem identificação') + '</strong><p>' + (room ? room.count + ' chamado' + (room.count === 1 ? '' : 's') : 'Sem sala identificada') + '</p></article>' +
      '<article class="rt-card"><h2>Dispositivo recorrente</h2><strong>' + esc(type?.label || 'Sem identificação') + '</strong><p>' + (type ? type.count + ' chamado' + (type.count === 1 ? '' : 's') : 'Sem tipo identificado') + '</p></article></aside></section>';
  }

  function renderData() {
    const banner = error ? '<div class="rt-message rt-error" role="alert">' + esc(error) +
      ' <button type="button" data-rt-action="refresh">Tentar novamente</button></div>' : '';
    if (loading && !data) return banner + '<div class="rt-message" role="status">Consultando chamados e vínculos no GLPI…</div>';
    if (!data) return banner;
    const summary = data.summary;
    const period = formatDate(data.filters.from) + ' a ' + formatDate(data.filters.to);
    const cards = [
      ['Chamados no período', summary.total, 'Abertura entre ' + period],
      ['Ainda em aberto', summary.open, 'Entre os chamados do período'],
      ['Sala com mais chamados', leaders(summary.topRooms), summary.topRooms[0] ? summary.topRooms[0].count + ' chamados' : 'Sem sala identificada'],
      ['Tipo com mais chamados', leaders(summary.topTypes), summary.topTypes[0] ? summary.topTypes[0].count + ' chamados' : 'Sem tipo identificado'],
    ];
    return banner +
      '<p class="rt-muted">Período: ' + esc(period) + ' · Horário de Brasília · Contagem pela abertura do chamado.</p>' +
      (data.meta.warnings || []).map(w => '<p class="rt-message" role="status">' + esc(w) + '</p>').join('') +
      (!data.meta.complete ? '<p class="rt-message rt-error" role="alert">Dados incompletos: os valores abaixo não representam todos os chamados.</p>' : '') +
      '<div class="rt-cards">' + cards.map(([label, value, note]) =>
        '<article class="rt-card"><h2>' + esc(label) + '</h2><strong>' + esc(value) + '</strong><p>' + esc(note) + '</p></article>').join('') + '</div>' +
      '<p class="rt-quality">' + summary.withoutRoom + ' sem sala · ' + summary.withoutAsset +
      ' sem ativo vinculado · ' + summary.review + ' para revisar. <button type="button" data-rt-dimension="room" data-rt-key="unknown">Ver sem sala</button></p>' +
      '<div class="rt-charts">' + ranking('Salas com mais chamados', data.rankings.rooms, 'room') +
      ranking('Chamados por tipo de equipamento', data.rankings.types, 'type') +
      ranking('Ativos com mais chamados', data.rankings.assets, 'asset') + '</div>' +
      '<p class="rt-muted">Um chamado pode envolver vários equipamentos; a soma por tipo ou ativo pode superar o total. Nomes e patrimônios vêm do cache do GCC. Salas vêm do próprio chamado.</p>' +
      '<section class="rt-panel"><h2>Chamados encontrados <span class="rt-muted">(' + data.pagination.total + ')</span></h2>' +
      (data.items.length ? '<div class="rt-table-wrap" tabindex="0" role="region" aria-label="Tabela de chamados"><table><thead><tr>' +
      '<th scope="col">Chamado</th><th scope="col">Sala</th><th scope="col">Equipamento</th><th scope="col">Abertura</th><th scope="col">Status</th>' +
      '<th scope="col">Responsável</th>' +
      '</tr></thead><tbody>' + data.items.map(t => '<tr><td><button type="button" class="rt-ticket-link" data-rt-ticket="' + t.id + '">#' +
      t.id + ' — ' + esc(t.title || 'Sem título') + '</button>' + (t.review ? '<small>Revisar identificação</small>' : '') +
      '</td><td>' + esc(t.room) + '</td><td>' + esc(t.types.map(k => TYPES[k] || k).join(', ')) +
      '</td><td>' + esc(formatDate(t.openedAt)) + '</td><td>' + esc(STATUS[t.status] || t.status) + '</td><td>' + esc(ownerLabel(t)) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<p class="rt-message">Nenhum chamado encontrado para estes filtros.</p>') +
      '<div class="rt-pagination"><button type="button" data-rt-action="previous"' + (data.pagination.page <= 1 ? ' disabled' : '') +
      '>Anterior</button><span>Página ' + data.pagination.page + ' de ' + data.pagination.pages + '</span>' +
      '<button type="button" data-rt-action="next"' + (data.pagination.page >= data.pagination.pages ? ' disabled' : '') + '>Próxima</button></div></section>';
  }

  /** Responsável na lista: nome informado no GCC ou técnico do GLPI. */
  function ownerLabel(ticket) {
    const work = ticket.work || null;
    if (work?.handlerName) return work.handlerName + (work.handlerSource === 'glpi_user' ? ' (GLPI)' : ' (informado)');
    if (ticket.assignee?.name) return ticket.assignee.name + ' (GLPI)';
    return 'Não definido';
  }

  function buildQuery() {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== '') query.set(key, String(value));
    // O limite por coluna do Kanban é explícito e viaja com a consulta.
    if (view === 'kanban') query.set('kanban_limit', String(kanbanLimit));
    return query;
  }

  /** Só aceita respostas cujos filtros aplicados são exatamente os pedidos. */
  function matchesFilters(next, query) {
    const applied = next?.filters;
    if (!applied || !query) return false;
    for (const [key, value] of new URLSearchParams(query)) {
      if (key === 'per_page') continue;
      if (String(applied[key] ?? '') !== String(value)) return false;
    }
    return true;
  }

  function adopt(next) {
    data = next;
    if (data.pagination) filters.page = data.pagination.page;
    if (data.filters) { filters.from = data.filters.from; filters.to = data.filters.to; }
    writeUrl();
  }

  function lastUpdateLabelLegacy() {
    return data?.meta?.collectedAt
      ? new Date(data.meta.collectedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : 'Ainda não consultado';
  }

  function statusText() {
    const status = monitor()?.getStatus?.();
    return lastUpdateLabel() + ' · Brasília' + (status?.label ? ' · ' + status.label : '');
  }

  function bindMonitor() {
    if (monitorBound) return;
    const api = monitor();
    if (!api?.subscribe) return;
    monitorBound = true;
    api.subscribe((view2, change) => {
      if ((change === 'data' || change === 'init') && view2.data && lastQuery && matchesFilters(view2.data, lastQuery) && view2.data !== data) {
        adopt(view2.data);
        if (auto && active() && !loading) mount();
        return;
      }
      if (change !== 'status' && change !== 'alert') return;
      const label = typeof document !== 'undefined' && document.querySelector
        ? document.querySelector('.rt-toolbar-status') : null;
      if (label) label.textContent = statusText();
    });
  }

  /** Conteúdo da área de resultados conforme a visão escolhida. */
  function renderResults() {
    if (view !== 'kanban') return renderData();
    // O aviso de erro e o de cache valem para as duas visões.
    const banner = (error
      ? '<div class="rt-message rt-error" role="alert">' + esc(error) +
        ' <button type="button" data-rt-action="refresh">Tentar novamente</button></div>'
      : '')
      + (usingCache()
        ? '<p class="rt-message" role="status">Exibindo dados em cache — tentando reconectar</p>'
        : '');
    return banner + (window.RoomTicketsKanban?.render(data) || '');
  }

  function renderToolbar() {
    const audio = monitor()?.audioStatus?.() || { state: 'off', label: 'Som desativado' };
    const refreshing = loading;
    return '<div class="rt-toolbar"><span class="rt-muted rt-toolbar-status" role="status" aria-live="polite">' +
      esc(statusText()) + '</span>' +
      (refreshing ? '<span class="rt-refreshing" data-rt-refreshing role="status">Atualizando…</span>' : '') +
      (usingCache() ? '<span class="rt-cache-warning" data-rt-cache-warning role="status">Exibindo dados em cache — tentando reconectar</span>' : '') +
      '<div class="rt-toolbar-controls">' +
      '<label><input id="rt-auto" type="checkbox"' + (auto ? ' checked' : '') + '> Atualizar a cada 1 minuto</label>' +
      '<label><input id="rt-monitor" type="checkbox"' + (monitor()?.isMonitorEnabled?.() !== false ? ' checked' : '') + '> Monitorar alertas</label>' +
      '<button type="button" data-rt-action="sound" data-sound-state="' + esc(audio.state) + '">' +
      (audio.state === 'off' ? 'Ativar som' : audio.state === 'blocked' ? 'Ativar som' : 'Silenciar') + '</button>' +
      '<span class="rt-sound-state" data-rt-sound-state="' + esc(audio.state) + '">' + esc(audio.label) + '</span>' +
      '<button type="button" data-rt-action="test-sound">Testar som</button>' +
      '</div></div>';
  }

  function mount() {
    if (!active()) return;
    readUrl();
    bindMonitor();
    monitor()?.start?.();
    const root = document.getElementById('main-content');
    if (!root) return;
    // Diálogo de detalhes é persistente: não é redesenhado junto com a área.
    ensureDetailDialog();
    const interaction = captureInteraction();
    const rooms = Object.fromEntries((data?.options?.rooms || []).map(r => [r.key, r.label]));
    if (filters.room && !rooms[filters.room]) rooms[filters.room] = filters.room === 'unknown' ? 'Sala não identificada' : filters.room;
    root.innerHTML = '<div class="rt-dashboard"><header class="rt-header"><div><p class="rt-eyebrow">OPERAÇÃO · CHAMADOS</p>' +
      '<h1>Chamados das salas</h1><p class="rt-muted">Identifique onde os problemas se repetem e quais equipamentos precisam de atenção.</p></div>' +
      '<div class="rt-header-actions"><button type="button" data-rt-action="refresh"' + (loading ? ' disabled' : '') + '>Atualizar agora</button>' +
      '<button type="button" class="rt-tv-button" data-rt-action="tv">Ativar modo TV</button></div></header>' +
      renderOperational() +
      '<div class="rt-view-switch" role="group" aria-label="Visualização dos chamados">' +
      '<button type="button" data-rt-view="lista"' + (view === 'lista' ? ' class="is-active" aria-pressed="true"' : ' aria-pressed="false"') + '>Lista</button>' +
      '<button type="button" data-rt-view="kanban"' + (view === 'kanban' ? ' class="is-active" aria-pressed="true"' : ' aria-pressed="false"') + '>Kanban</button>' +
      '</div>' +
      (view === 'kanban' ? '' : '<div class="rt-analysis-head"><p class="rt-eyebrow">ANÁLISE DETALHADA</p><h2>Histórico e recorrências</h2><p class="rt-muted">Use os filtros para investigar períodos, salas e equipamentos.</p></div>') +
      '<form id="rt-filters" class="rt-panel"><fieldset' + ((loading && !data) ? ' disabled' : '') + '><legend>Filtrar chamados</legend><div class="rt-filters">' +
      '<label>Período<select name="period"><option value="30d"' + (filters.period === '30d' ? ' selected' : '') + '>Últimos 30 dias</option>' +
      '<option value="previous_month"' + (filters.period === 'previous_month' ? ' selected' : '') + '>Mês anterior completo</option>' +
      '<option value="custom"' + (filters.period === 'custom' ? ' selected' : '') + '>Personalizado</option></select></label>' +
      '<label>De<input type="date" name="from" value="' + esc(filters.from) + '"' + (filters.period !== 'custom' ? ' disabled' : ' required') + '></label>' +
      '<label>Até<input type="date" name="to" value="' + esc(filters.to) + '"' + (filters.period !== 'custom' ? ' disabled' : ' required') + '></label>' +
      '<label>Sala<select name="room">' + options(rooms, filters.room, 'Todas as salas') + '</select></label>' +
      '<label>Equipamento<select name="type">' + options(TYPES, filters.type, 'Todos os tipos') + '</select></label>' +
      '<label>Status<select name="status">' + options(Object.fromEntries(Object.entries(STATUS).filter(([key]) => key !== 'desconhecido')), filters.status, 'Todos os status') + '</select></label>' +
      '<label class="rt-search">Buscar chamado<input name="q" maxlength="200" placeholder="Número, problema ou referência L-…" value="' + esc(filters.q) + '"></label>' +
      '<button type="submit">Aplicar filtros</button><button type="button" data-rt-action="clear">Limpar</button></div></fieldset></form>' +
      (filters.asset ? '<p class="rt-quality">Ativo selecionado: ' + esc(filters.asset) + ' <button type="button" data-rt-action="clear-asset">Remover filtro</button></p>' : '') +
      renderToolbar() +
      (notice ? '<p class="rt-message rt-ok" role="status" data-rt-notice>' + esc(notice) + '</p>' : '') +
      '<div id="rt-results" aria-busy="' + loading + '"' + (view === 'kanban' ? ' data-rt-view="kanban"' : '') + '>' + renderResults() + '</div>' +
      '</div>';
    const dashboard = root.querySelector('.rt-dashboard');
    dashboard.addEventListener('click', onClick);
    // Kanban: um único listener delegado; o módulo do quadro cuida dos seus botões.
    if (window.RoomTicketsKanban) {
      dashboard.addEventListener('dragstart', event => window.RoomTicketsKanban.onDragStart(event));
      dashboard.addEventListener('dragend', event => window.RoomTicketsKanban.onDragEnd(event));
      dashboard.addEventListener('dragover', event => window.RoomTicketsKanban.onDragOver(event));
      dashboard.addEventListener('dragleave', event => window.RoomTicketsKanban.onDragLeave(event));
      dashboard.addEventListener('drop', event => window.RoomTicketsKanban.onDrop(event));
    }
    const form = root.querySelector('#rt-filters');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = new FormData(form);
      for (const key of ['period', 'from', 'to', 'room', 'type', 'status', 'q']) filters[key] = String(values.get(key) || '');
      filters.page = 1;
      load('filters');
    });
    form.elements.period.addEventListener('change', () => {
      for (const name of ['from', 'to']) {
        form.elements[name].disabled = form.elements.period.value !== 'custom';
        form.elements[name].required = form.elements.period.value === 'custom';
      }
    });
    root.querySelector('#rt-auto').addEventListener('change', event => { auto = event.target.checked; startTimer(); });
    root.querySelector('#rt-monitor')?.addEventListener('change', event => {
      monitor()?.setMonitorEnabled?.(event.target.checked);
      mount();
    });
    // O monitor passa a ser dono do ciclo: nenhuma segunda varredura do GLPI.
    monitor()?.setActiveQuery?.(buildQuery().toString());
    restoreInteraction(interaction);
    startTimer();
    if (!data && !loading && !error) load('initial');
  }

  async function load(reason = 'manual') {
    if (loading || !active()) return;
    const id = ++generation;
    loading = true; error = '';
    writeUrl();
    mount();
    const query = buildQuery().toString();
    lastQuery = query;
    const api = monitor();
    try {
      if (!api?.refresh) throw Object.assign(new Error('Monitor de chamados indisponível.'), { status: 0 });
      // Reaproveita a leitura mais recente do monitor; filtros próprios sempre consultam.
      const maxAge = reason === 'initial' ? 4000
        : reason === 'tick' && api.isMonitorEnabled?.() ? 51000
        : 0;
      const result = await api.refresh({ q: query, reason, maxAge });
      if (id !== generation) return;
      if (!result.ok) {
        error = result.message || 'Não foi possível carregar os chamados completos. Tente novamente.';
      } else if (matchesFilters(result.data, query)) {
        adopt(result.data);
      } else {
        error = 'A resposta do servidor não corresponde aos filtros aplicados. Atualize novamente.';
      }
    } catch (failure) {
      if (id !== generation) return;
      error = failure?.status === 401
        ? 'Sua sessão expirou. Entre novamente para consultar os chamados.'
        : 'Não foi possível carregar os chamados completos. Tente novamente.';
    } finally {
      if (id === generation) { loading = false; if (active()) mount(); }
    }
  }

  function onClick(event) {
    // O quadro Kanban tem os seus próprios botões; ele responde primeiro.
    if (window.RoomTicketsKanban?.onClick?.(event) === true) return;
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.rtAction === 'close-detail') { document.getElementById('rt-detail')?.close(); return; }
    if (button.dataset.rtView) {
      if (view === button.dataset.rtView) return;
      view = button.dataset.rtView;
      writeUrl();
      // Trocar de visão não perde filtros nem recarrega a página.
      mount();
      load('view');
      return;
    }
    if (button.dataset.rtAction === 'more') {
      kanbanLimit = Math.min(100, kanbanLimit + 25);
      writeUrl();
      load('kanban-more');
      return;
    }
    if (button.dataset.rtAction === 'sound') {
      const audio = monitor()?.audioStatus?.() || { state: 'off' };
      // Som bloqueado ou indisponível exige ativação explícita, não um simples toggle.
      if (audio.state === 'off' || audio.state === 'blocked' || audio.state === 'unavailable') monitor()?.enableSound?.();
      else monitor()?.setSoundEnabled?.(false);
      mount();
      return;
    }
    if (button.dataset.rtAction === 'test-sound') { monitor()?.testSound?.(); mount(); return; }
    if (loading) return;
    const dimension = button.dataset.rtDimension;
    if (['room', 'type', 'asset'].includes(dimension)) {
      filters[dimension] = button.dataset.rtKey; filters.page = 1; load('filters'); return;
    }
    if (button.dataset.rtAction === 'assume') {
      window.RoomTicketsKanban?.openAssume(findTicket(Number(button.dataset.ticketId)));
      return;
    }
    if (button.dataset.rtAction === 'history') { showHistory(Number(button.dataset.ticketId)); return; }
    if (button.dataset.rtTicket) { detail(Number(button.dataset.rtTicket)); return; }
    switch (button.dataset.rtAction) {
      case 'refresh': load('manual'); break;
      case 'tv': window.RoomTicketsTV?.open(data); break;
      case 'accept': acceptTicket(Number(button.dataset.ticketId), button); break;
      case 'clear': filters = defaults(); load('filters'); break;
      case 'clear-asset': filters.asset = ''; filters.page = 1; load('filters'); break;
      case 'previous': filters.page = Math.max(1, filters.page - 1); load('filters'); break;
      case 'next': filters.page += 1; load('filters'); break;
    }
  }

  /** Procura um chamado nos dados atuais: lista, Kanban ou recorte do monitor. */
  function findTicket(id) {
    if (!id) return null;
    for (const column of Object.values(data?.kanban?.columns || {})) {
      const found = (column.items || []).find(item => Number(item.id) === Number(id));
      if (found) return found;
    }
    const listed = [...(data?.items || []), data?.latest].find(item => item && Number(item.id) === Number(id));
    if (listed) return listed;
    return (monitor()?.getData?.()?.monitor?.recent || []).find(item => Number(item.id) === Number(id)) || null;
  }

  async function acceptTicket(id, button = null) {
    const ticket = [data?.latest, ...(data?.items || [])].find(item => item && Number(item.id) === Number(id));
    if (!ticket || ticket.acknowledgement) return;
    if (button) button.disabled = true;
    try {
      const acknowledgement = await monitor().accept(ticket);
      if (data?.latest?.id === ticket.id) data.latest.acknowledgement = acknowledgement;
      for (const item of data?.items || []) if (item.id === ticket.id) item.acknowledgement = acknowledgement;
      mount();
    } catch (failure) {
      if (button) button.disabled = false;
      error = failure.status === 403 ? 'Seu perfil não pode aceitar este alerta.' : 'Não foi possível registrar o aceite. Tente novamente.';
      mount();
    }
  }

  function detail(id) {
    const ticket = findTicket(id);
    const dialog = ensureDetailDialog();
    if (!ticket || !dialog) return;
    let link = '';
    try {
      const base = window.CONFIG?.glpiUrl || window.ENV_CONFIG?.glpi?.url;
      const url = new URL(base);
      if (['https:', 'http:'].includes(url.protocol)) {
        url.pathname = url.pathname.replace(/\/$/, '') + '/front/ticket.form.php';
        url.search = new URLSearchParams({ id: String(ticket.id) }).toString(); url.hash = '';
        link = '<a href="' + esc(url.href) + '" target="_blank" rel="noopener noreferrer">Abrir no GLPI</a>';
      }
    } catch {}
    const work = ticket.work || null;
    const handler = work?.handlerName
      ? esc(work.handlerName) + (work.handlerSource === 'glpi_user'
        ? ' <small>técnico do GLPI' + (work.glpiUserId ? ' · ID ' + esc(String(work.glpiUserId)) : '') + '</small>'
        : ' <small>informado, sem correspondência exata no GLPI</small>')
      : (ticket.assignee?.name ? esc(ticket.assignee.name) + ' <small>técnico do GLPI</small>' : 'Não definido');
    const solutionHtml = work?.solution
      ? '<dt>Solução</dt><dd>' + esc(work.solution)
        + (work.solutionInGlpi ? '' : ' <small>(não confirmada no GLPI)</small>') + '</dd>' : '';
    dialog.querySelector('.rt-detail-body').innerHTML = '<header class="rt-header"><h2 id="rt-detail-title">Chamado #' +
      ticket.id + '</h2><button type="button" data-rt-action="close-detail" autofocus>Fechar</button></header>' +
      '<h3>' + esc(ticket.title) + '</h3><dl><dt>Sala</dt><dd>' + esc(ticket.room) + '</dd><dt>Origem da sala</dt><dd>' +
      esc(SOURCES[ticket.roomSource] || 'Não identificado') + '</dd><dt>Origem do tipo</dt><dd>' + esc(SOURCES[ticket.typeSource] || 'Não identificado') +
      '</dd><dt>Ativos vinculados</dt><dd>' + esc((ticket.assets || []).map(a => a.name + (a.tag ? ' · Patrimônio ' + a.tag : '') + ' (' + a.key + ')').join('; ') || 'Ativo não identificado') +
      '</dd><dt>Status</dt><dd>' + esc(ticket.statusLabel || STATUS[ticket.status] || ticket.status) +
      '</dd><dt>Responsável</dt><dd>' + handler + '</dd>' +
      (work?.assignedBy ? '<dt>Registrado por</dt><dd>' + esc(work.assignedBy) + ' em ' + esc(formatDate(work.assignedAt)) + '</dd>' : '') +
      solutionHtml +
      '<dt>Referência</dt><dd>' + esc(ticket.reference || 'Não informada') + '</dd></dl>' +
      '<div class="rt-detail-actions"><button type="button" class="rt-primary" data-rt-action="assume" data-ticket-id="' +
      esc(ticket.id) + '">Assumir chamado</button>' +
      '<button type="button" data-rt-action="accept" data-ticket-id="' + esc(ticket.id) + '"' +
      (ticket.acknowledgement ? ' disabled' : '') + '>' + (ticket.acknowledgement ? 'Alerta aceito' : 'Aceitar alerta') + '</button>' +
      '<button type="button" data-rt-action="history" data-ticket-id="' + esc(ticket.id) + '">Ver histórico</button></div>' +
      '<div class="rt-detail-history" data-rt-history hidden></div>' +
      '<p class="rt-description">' + esc(ticket.description || 'Sem descrição.') + '</p>' + link;
    if (!dialog.open) dialog.showModal();
  }

  /** Histórico do chamado, consultado no servidor (fonte oficial). */
  async function showHistory(id) {
    const box = document.querySelector('[data-rt-history]');
    if (!box) return;
    box.hidden = false;
    box.textContent = 'Consultando histórico…';
    try {
      const result = await monitor()?.history?.(id);
      if (!result) { box.textContent = 'Histórico indisponível.'; return; }
      const moves = (result.moves || []).map(move =>
        '<li><b>' + esc(move.action) + '</b> ' + esc(move.fromLabel) + ' → ' + esc(move.toLabel) +
        (move.confirmed ? '' : ' <small>(não confirmado)</small>') +
        (move.partial ? ' <small>(parcial)</small>' : '') +
        '<br><small>' + esc(move.recordedBy) + ' · ' + esc(formatDate(move.at)) +
        (move.note ? ' · ' + esc(move.note) : '') + '</small></li>').join('');
      const assignment = result.assignment
        ? '<p><b>Quem vai atender:</b> ' + esc(result.assignment.handlerName) +
          (result.assignment.glpiUserId ? ' (técnico ' + esc(String(result.assignment.glpiUserId)) + ' do GLPI)' : ' (informado)') +
          ' — registrado por ' + esc(result.assignment.recordedBy) + ' em ' + esc(formatDate(result.assignment.at)) + '</p>'
        : '<p><b>Quem vai atender:</b> ainda não definido. Um aceite anterior apenas confirma leitura.</p>';
      const solution = result.solution
        ? '<p><b>Solução:</b> ' + esc(result.solution.text)
          + (result.solution.glpi ? ' <small>(registrada no GLPI)</small>' : ' <small>(não registrada no GLPI)</small>')
          + ' — por ' + esc(result.solution.recordedBy) +
          ' em ' + esc(formatDate(result.solution.at)) + '</p>'
        : '';
      const acknowledgement = result.acknowledgement
        ? '<p class="rt-muted">Alerta aceito por ' + esc(result.acknowledgement.acceptedBy?.name || '') +
          ' em ' + esc(formatDate(result.acknowledgement.acceptedAt)) + '.</p>'
        : '';
      box.innerHTML = assignment + solution + (moves ? '<ul class="rt-history-list">' + moves + '</ul>' : '<p class="rt-muted">Sem movimentações registradas.</p>') +
        acknowledgement;
    } catch {
      box.textContent = 'Não foi possível consultar o histórico.';
    }
  }

  /**
   * Só o intervalo de RELÓGIO da tela fica aqui. A consulta ao GLPI é do
   * monitor, que já consulta a cada 60 s a visão ativa e a fila de alertas.
   *
   * Este timer NÃO consulta o GLPI: o relatório já está inscrito no monitor
   * (`bindMonitor`) e se redesenha sozinho quando chega leitura nova. Manter
   * `load('tick')` aqui fazia DUAS varreduras completas do GLPI por minuto,
   * defasadas entre si.
   */
  function startTimer() {
    if (timer !== null) clearInterval(timer);
    timer = auto && active() ? setInterval(() => {
      if (document.hidden) return;
      // Só repinta o carimbo de horário e o estado; nenhuma consulta nova.
      if (loading || monitorBound) return;
      mount();
    }, 60000) : null;
  }
  function unmount() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
  function reset() {
    unmount(); generation++; loading = false; data = null; error = ''; filters = defaults(); auto = true;
    lastQuery = '';
    view = 'lista';
    kanbanLimit = 25;
    notice = '';
    window.RoomTicketsKanban?.close?.();
    window.RoomTicketsKanban?.setNotice?.(null);
    monitor()?.reset?.();
    // Do not restore the previous user's filters on a subsequent login.
    initialized = true;
    const url = new URL(window.location.href);
    for (const key of Object.keys(filters)) url.searchParams.delete('rt_' + key);
    url.searchParams.delete('rt_view');
    url.searchParams.delete('rt_kanban_limit');
    window.history.replaceState(null, '', url);
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('roomtickets:accepted', event => {
      const ticketId = Number(event.detail?.ticketId);
      const acknowledgement = event.detail?.acknowledgement;
      if (!ticketId || !acknowledgement || !data) return;
      if (Number(data.latest?.id) === ticketId) data.latest.acknowledgement = acknowledgement;
      for (const item of data.items || []) if (Number(item.id) === ticketId) item.acknowledgement = acknowledgement;
      if (active()) mount();
    });
    // Uma gravação no GLPI (assumir, mover, concluir) foi confirmada.
    document.addEventListener('roomtickets:changed', event => {
      notice = event.detail?.message || 'Chamado atualizado no GLPI.';
      if (active()) { mount(); load('after-write'); }
    });
    // "Assumir chamado" a partir do alerta funciona em qualquer tela.
    document.addEventListener('roomtickets:assume-request', event => {
      const ticket = event.detail?.ticket || null;
      if (!ticket) return;
      window.RoomTicketsKanban?.openAssume(findTicket(Number(ticket.id)) || ticket);
    });
    document.addEventListener('roomtickets:kanban-change', () => {
      if (active()) mount();
    });
  }
  return { mount, reset, unmount, getData: () => data, getView: () => view };
})();
