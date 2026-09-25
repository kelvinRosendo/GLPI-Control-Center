/**
 * Chamados das salas: isolated read-only view. No ticket data persisted in storage.
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
  let timer = null, auto = false, initialized = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const active = () => window.STATE?.tab === 'chamados-salas';
  const formatDate = value => {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] : '') : '—';
  };

  function readUrl() {
    if (initialized) return;
    initialized = true;
    const query = new URLSearchParams(window.location.search);
    for (const key of Object.keys(filters)) {
      if (query.has('rt_' + key)) filters[key] = query.get('rt_' + key);
    }
    if (!['30d', 'previous_month', 'custom'].includes(filters.period)) filters.period = '30d';
    filters.page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  }

  function writeUrl() {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(filters)) {
      if (value !== '') url.searchParams.set('rt_' + key, String(value));
      else url.searchParams.delete('rt_' + key);
    }
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

  function renderData() {
    if (loading) return '<div class="rt-message" role="status">Consultando chamados e vínculos no GLPI…</div>';
    if (error) return '<div class="rt-message rt-error" role="alert">' + esc(error) +
      ' <button type="button" data-rt-action="refresh">Tentar novamente</button></div>';
    if (!data) return '';
    const summary = data.summary;
    const period = formatDate(data.filters.from) + ' a ' + formatDate(data.filters.to);
    const cards = [
      ['Chamados no período', summary.total, 'Abertura entre ' + period],
      ['Ainda em aberto', summary.open, 'Entre os chamados do período'],
      ['Sala com mais chamados', leaders(summary.topRooms), summary.topRooms[0] ? summary.topRooms[0].count + ' chamados' : 'Sem sala identificada'],
      ['Tipo com mais chamados', leaders(summary.topTypes), summary.topTypes[0] ? summary.topTypes[0].count + ' chamados' : 'Sem tipo identificado'],
    ];
    return '<p class="rt-muted">Período: ' + esc(period) + ' · Horário de Brasília · Contagem pela abertura do chamado.</p>' +
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
      '</tr></thead><tbody>' + data.items.map(t => '<tr><td><button type="button" class="rt-ticket-link" data-rt-ticket="' + t.id + '">#' +
      t.id + ' — ' + esc(t.title || 'Sem título') + '</button>' + (t.review ? '<small>Revisar identificação</small>' : '') +
      '</td><td>' + esc(t.room) + '</td><td>' + esc(t.types.map(k => TYPES[k] || k).join(', ')) +
      '</td><td>' + esc(formatDate(t.openedAt)) + '</td><td>' + esc(STATUS[t.status] || t.status) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<p class="rt-message">Nenhum chamado encontrado para estes filtros.</p>') +
      '<div class="rt-pagination"><button type="button" data-rt-action="previous"' + (data.pagination.page <= 1 ? ' disabled' : '') +
      '>Anterior</button><span>Página ' + data.pagination.page + ' de ' + data.pagination.pages + '</span>' +
      '<button type="button" data-rt-action="next"' + (data.pagination.page >= data.pagination.pages ? ' disabled' : '') + '>Próxima</button></div></section>';
  }

  function mount() {
    if (!active()) return;
    readUrl();
    const root = document.getElementById('main-content');
    if (!root) return;
    const rooms = Object.fromEntries((data?.options?.rooms || []).map(r => [r.key, r.label]));
    if (filters.room && !rooms[filters.room]) rooms[filters.room] = filters.room === 'unknown' ? 'Sala não identificada' : filters.room;
    const lastUpdate = data?.meta?.collectedAt ? new Date(data.meta.collectedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Ainda não consultado';
    root.innerHTML = '<div class="rt-dashboard"><header class="rt-header"><div><p class="rt-eyebrow">ATENDIMENTO · ESCOLA</p>' +
      '<h1>Chamados das salas</h1><p class="rt-muted">Identifique onde os problemas se repetem e quais equipamentos precisam de atenção.</p></div>' +
      '<button type="button" data-rt-action="refresh"' + (loading ? ' disabled' : '') + '>Atualizar agora</button></header>' +
      '<form id="rt-filters" class="rt-panel"><fieldset' + (loading ? ' disabled' : '') + '><legend>Filtrar chamados</legend><div class="rt-filters">' +
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
      '<div class="rt-toolbar"><span class="rt-muted">Última consulta: ' + esc(lastUpdate) + '</span>' +
      '<label><input id="rt-auto" type="checkbox"' + (auto ? ' checked' : '') + '> Atualizar a cada 5 minutos</label></div>' +
      '<div id="rt-results" aria-busy="' + loading + '">' + renderData() + '</div>' +
      '<dialog id="rt-detail" aria-labelledby="rt-detail-title"><div class="rt-detail-body"></div></dialog></div>';
    root.querySelector('.rt-dashboard').addEventListener('click', onClick);
    const form = root.querySelector('#rt-filters');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = new FormData(form);
      for (const key of ['period', 'from', 'to', 'room', 'type', 'status', 'q']) filters[key] = String(values.get(key) || '');
      filters.page = 1;
      load();
    });
    form.elements.period.addEventListener('change', () => {
      for (const name of ['from', 'to']) {
        form.elements[name].disabled = form.elements.period.value !== 'custom';
        form.elements[name].required = form.elements.period.value === 'custom';
      }
    });
    root.querySelector('#rt-auto').addEventListener('change', event => { auto = event.target.checked; startTimer(); });
    startTimer();
    if (!data && !loading && !error) load();
  }

  async function load() {
    if (loading || !active()) return;
    const id = ++generation;
    loading = true; error = ''; data = null;
    writeUrl();
    mount();
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value !== '') query.set(key, String(value));
      const response = await window.ApiClient.get('/api/tickets/salas?' + query.toString(), {
        cache: false, retries: 0, timeout: 90000,
      });
      if (id !== generation) return;
      if (!response?.data?.summary || !Array.isArray(response.data.items)) throw new Error('Resposta incompleta do servidor.');
      data = response.data;
      filters.page = data.pagination.page;
      filters.from = data.filters.from; filters.to = data.filters.to;
      writeUrl();
    } catch (failure) {
      if (id !== generation) return;
      if (failure.status === 401) error = 'Sua sessão expirou. Entre novamente para consultar os chamados.';
      else if (failure.status === 403) error = 'Seu perfil não tem acesso a estes chamados.';
      else if (failure.status === 422) error = 'Revise os filtros: datas válidas, início antes do fim e intervalo máximo de 366 dias.';
      else error = 'Não foi possível carregar os chamados completos. Tente novamente. Se persistir, verifique o acesso ao GLPI e o limite de 10 mil registros por coleção.';
    } finally {
      if (id === generation) { loading = false; if (active()) mount(); }
    }
  }

  function onClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.rtAction === 'close-detail') { document.getElementById('rt-detail')?.close(); return; }
    if (loading) return;
    const dimension = button.dataset.rtDimension;
    if (['room', 'type', 'asset'].includes(dimension)) {
      filters[dimension] = button.dataset.rtKey; filters.page = 1; load(); return;
    }
    if (button.dataset.rtTicket) { detail(Number(button.dataset.rtTicket)); return; }
    switch (button.dataset.rtAction) {
      case 'refresh': load(); break;
      case 'clear': filters = defaults(); load(); break;
      case 'clear-asset': filters.asset = ''; filters.page = 1; load(); break;
      case 'previous': filters.page = Math.max(1, filters.page - 1); load(); break;
      case 'next': filters.page += 1; load(); break;
    }
  }

  function detail(id) {
    const ticket = data?.items.find(t => t.id === id);
    const dialog = document.getElementById('rt-detail');
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
    dialog.querySelector('.rt-detail-body').innerHTML = '<header class="rt-header"><h2 id="rt-detail-title">Chamado #' +
      ticket.id + '</h2><button type="button" data-rt-action="close-detail" autofocus>Fechar</button></header>' +
      '<h3>' + esc(ticket.title) + '</h3><dl><dt>Sala</dt><dd>' + esc(ticket.room) + '</dd><dt>Origem da sala</dt><dd>' +
      esc(SOURCES[ticket.roomSource]) + '</dd><dt>Origem do tipo</dt><dd>' + esc(SOURCES[ticket.typeSource]) +
      '</dd><dt>Ativos vinculados</dt><dd>' + esc(ticket.assets.map(a => a.name + (a.tag ? ' · Patrimônio ' + a.tag : '') + ' (' + a.key + ')').join('; ') || 'Ativo não identificado') +
      '</dd><dt>Status</dt><dd>' + esc(STATUS[ticket.status] || ticket.status) +
      '</dd><dt>Referência</dt><dd>' + esc(ticket.reference || 'Não informada') + '</dd></dl>' +
      '<p class="rt-description">' + esc(ticket.description || 'Sem descrição.') + '</p>' + link;
    dialog.showModal();
  }

  function startTimer() {
    if (timer !== null) clearInterval(timer);
    timer = auto && active() ? setInterval(() => { if (!document.hidden && !loading) load(); }, 300000) : null;
  }
  function unmount() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
  function reset() {
    unmount(); generation++; loading = false; data = null; error = ''; filters = defaults(); auto = false;
    // Do not restore the previous user's filters on a subsequent login.
    initialized = true;
    const url = new URL(window.location.href);
    for (const key of Object.keys(filters)) url.searchParams.delete('rt_' + key);
    window.history.replaceState(null, '', url);
  }
  return { mount, reset, unmount };
})();
