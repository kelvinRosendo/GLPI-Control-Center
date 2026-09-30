/**
 * Modo TV do GCC: EXCLUSIVAMENTE informativo.
 *
 * O atendimento acontece apenas na interface operacional do PC. Este módulo
 * mostra chamados, salas, responsáveis, status, indicadores e alertas, e nada
 * mais: não assume, não aceita, não atribui, não move, não conclui e não
 * reabre. Não há botão, atalho de teclado nem manipulador que abra um
 * formulário operacional a partir daqui.
 *
 * A separação é de interface, não de segurança: quem estiver na TV continua
 * usando a sessão do GCC, e a proteção real continua sendo a permissão
 * `chamados edit` no backend. Se um dia existir uma sessão exclusiva de TV, ela
 * precisa ter somente leitura no backend também.
 *
 * A TV reflete o que acontece no PC pela atualização automática dos dados.
 * BroadcastChannel só alcança abas do mesmo navegador: entre computadores
 * diferentes, a propagação leva até um ciclo de consulta (60 s).
 */
window.RoomTicketsTV = (() => {
  'use strict';

  const ROTATION_SECONDS = 30;
  const TYPES = { projector: 'Projetor', pc: 'PC', mouse: 'Mouse', keyboard: 'Teclado',
    chromebook: 'Chromebook', cart: 'Carrinho', other: 'Outros', unknown: 'Não identificado' };
  const SYNC_LABELS = {
    success: 'Concluída', partial: 'Parcial', failed: 'Falhou',
    running: 'Em execução', not_created: 'Não criada',
  };

  let overlay = null;
  let callData = null;
  let active = false;
  let panel = 'assets';
  let paused = false;
  let rotationRemaining = ROTATION_SECONDS;
  let tickTimer = null;
  let alertInfo = null;
  let monitorView = null;
  let unsubscribe = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function formatDate(value, includeDate = false) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!match) return '—';
    return includeDate ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : `${match[4]}:${match[5]}`;
  }

  function latest(data = callData) {
    if (data?.latest) return data.latest;
    return [...(data?.items || [])].sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt)) || b.id - a.id)[0] || null;
  }

  /** Responsável do chamado: nome informado no GCC ou técnico do GLPI. */
  function ownerLabel(ticket) {
    const work = ticket?.work || null;
    if (work?.handlerName) return `${work.handlerName} (${work.handlerSource === 'glpi_user' ? 'técnico GLPI' : 'informado'})`;
    if (ticket?.assignee?.name) return `${ticket.assignee.name} (técnico GLPI)`;
    return 'Responsável não definido';
  }

  /**
   * Status real do chamado, lido do GLPI. "Alerta aceito" é apenas a leitura
   * do aviso: nunca é apresentado como se o chamado estivesse em atendimento.
   */
  function statusLabel(ticket) {
    const id = Number(ticket?.statusId || 0);
    const labels = { 1: 'Novo', 2: 'Em atendimento', 3: 'Planejado', 4: 'Pendente (aguardando)',
      5: 'Resolvido', 6: 'Fechado' };
    const base = labels[id] || 'Status desconhecido';
    return ticket?.waiting && !base.includes('aguardando') ? `${base} · aguardando` : base;
  }

  function monitorApi() { return window.RoomTicketsMonitor; }

  function assetIndicators() {
    const dashboard = window.Dashboard?.getIndicators?.() || {};
    const data = window.DATA || {};
    const count = value => Array.isArray(value) ? value.length : 0;
    const computers = dashboard.computadores ?? count(data.computadores);
    const chromebooks = dashboard.chromebooks_total ?? (
      count(data.chromebooksGeekiees) + count(data.chromebooksExibicao) +
      Object.values(data.chromebooksApoio || {}).reduce((sum, rows) => sum + count(rows), 0)
    );
    const projectors = dashboard.projetores ?? count(data.projetores);
    const printers = dashboard.impressoras ?? count(data.impressoras);
    const total = dashboard.total_ativos ?? computers + chromebooks + projectors + printers;
    return { total, computers, chromebooks, projectors, printers };
  }

  function assetPanel() {
    const values = assetIndicators();
    const rows = [
      ['Chromebooks', values.chromebooks, 'blue'],
      ['Computadores', values.computers, 'cyan'],
      ['Projetores', values.projectors, 'yellow'],
      ['Impressoras', values.printers, 'red'],
    ];
    const maximum = Math.max(1, ...rows.map(row => row[1]));
    const assetStatus = window.App?.glpiStatus || 'desconhecido';
    const assetMap = {
      conectado: ['ok', 'Dados carregados'],
      carregando: ['warn', 'Carregando'],
      parcial: ['warn', 'Dados parciais'],
      sem_sync: ['warn', 'Sem sincronização'],
      offline: ['bad', 'Indisponível'],
      desconhecido: ['warn', 'Não verificado'],
    };
    const [assetTone, assetLabel] = assetMap[assetStatus] || assetMap.desconhecido;
    const sessionOk = Boolean(window.UserContext?.isAuthenticated?.());
    const sessionTone = sessionOk ? 'ok' : 'bad';
    const sync = window.DATA?.syncStatus?.status || 'unknown';
    const monitorState = monitorApi()?.snapshot?.() || {};
    const monitorTone = ['error', 'expired'].includes(monitorState.state) ? 'bad'
      : monitorState.state === 'ok' ? 'ok' : 'warn';
    const syncTone = sync === 'success' ? 'ok' : 'warn';
    const row = (tone, label, value) =>
      `<li><i class="${tone === 'ok' ? '' : tone}"></i><span>${esc(label)}</span><strong class="${tone}">${esc(value)}</strong></li>`;
    return `<main class="rt-tv-main">
      <header class="rt-tv-section-head"><div><span>VISÃO GERAL</span><h1>Ativos da infraestrutura</h1></div><strong>${values.total} ativos classificados</strong></header>
      <section class="rt-tv-kpis">
        ${[['Total de ativos', values.total], ['Computadores', values.computers], ['Chromebooks', values.chromebooks], ['Projetores', values.projectors], ['Impressoras', values.printers]]
          .map(([label, value]) => `<article><strong>${value}</strong><span>${esc(label)}</span></article>`).join('')}
      </section>
      <section class="rt-tv-grid">
        <article class="rt-tv-card rt-tv-card--wide"><h2>Ativos por tipo</h2><div class="rt-tv-bars">
          ${rows.map(([label, value, color]) => `<div class="rt-tv-bar"><span>${label}</span><div><i class="rt-tv-bar--${color}" style="width:${Math.max(2, value / maximum * 100)}%"></i></div><strong>${value}</strong></div>`).join('')}
        </div></article>
        <article class="rt-tv-card"><h2>Status da infraestrutura</h2><ul class="rt-tv-status">
          ${row(assetTone, 'Inventário GCC', assetLabel)}
          ${row(sessionTone, 'Sessão', sessionOk ? 'Autenticada' : 'Expirada')}
          ${row(monitorTone, 'Monitor de chamados', monitorState.label || 'Aguardando')}
          ${row(syncTone, 'Sincronização', SYNC_LABELS[sync] || 'Não verificada')}
        </ul></article>
      </section>
    </main>`;
  }

  function callPanel() {
    const ticket = latest();
    const summary = callData?.summary || {};
    const room = summary.topRooms?.[0];
    const type = summary.topTypes?.[0];
    const queue = monitorApi()?.getQueue?.() || [];
    const accepted = Boolean(ticket?.acknowledgement);
    const queueHtml = queue.length > 1
      ? `<article class="rt-tv-card rt-tv-queue-card"><h2>Fila de alertas (${queue.length})</h2><ul class="rt-tv-queue">
          ${queue.map(item => `<li><strong>${esc(item.ticket.room)}</strong><span>#${esc(item.id)}${item.ticket.reference ? ` · ${esc(item.ticket.reference)}` : ''}</span><small>${formatDate(item.ticket.openedAt, true)}</small></li>`).join('')}
        </ul></article>`
      : '';
    if (!ticket) {
      const state = (monitorView || monitorApi()?.snapshot?.() || {}).state;
      const message = state === 'expired' ? 'Sessão expirada. Entre novamente no GCC.'
        : state === 'error' ? 'Não foi possível atualizar os chamados. Aguardando nova tentativa automática.'
        : !callData ? 'Carregando chamados das salas…'
        : 'Nenhum chamado encontrado nos últimos 30 dias.';
      return `<main class="rt-tv-main"><header class="rt-tv-section-head"><div><span>ATENDIMENTO</span><h1>Chamados das salas</h1></div></header><section class="rt-tv-empty">${message}</section></main>`;
    }
    return `<main class="rt-tv-main">
      <header class="rt-tv-section-head"><div><span>ATENDIMENTO</span><h1>Chamados das salas</h1></div><strong>${summary.total || 0} no período · ${summary.open || 0} em aberto${queue.length ? ` · ${queue.length} aguardando leitura` : ''}</strong></header>
      <section class="rt-tv-grid rt-tv-grid--calls">
        <article class="rt-tv-card rt-tv-card--latest">
          <div class="rt-tv-ticket-head"><span>ÚLTIMO CHAMADO RECEBIDO</span><strong>#${ticket.id}${ticket.reference ? ` · ${esc(ticket.reference)}` : ''}</strong></div>
          <h2>${esc(ticket.room)}</h2><p class="rt-tv-device">${esc((ticket.types || []).map(typeKey => TYPES[typeKey] || typeKey).join(', '))}</p>
          <h3>${esc(ticket.title || 'Sem título')}</h3><p>${esc(ticket.description || 'Sem descrição.')}</p>
          <div class="rt-tv-ticket-meta">
            <span>Abertura<strong>${formatDate(ticket.openedAt, true)}</strong></span>
            <span>Status<strong>${esc(statusLabel(ticket))}</strong></span>
            <span>Responsável<strong>${esc(ownerLabel(ticket))}</strong></span>
            <span>Alerta<strong>${accepted ? 'Lido' : 'Não lido'}</strong></span>
          </div>
          <p class="rt-tv-readonly-note">Modo TV informativo. O atendimento é feito no computador da equipe de TI.</p>
        </article>
        <aside class="rt-tv-stats">
          <article><span>Chamados abertos</span><strong>${summary.open || 0}</strong><small>Atualização a cada minuto</small></article>
          <article><span>Sala com mais chamados</span><strong>${esc(room?.label || 'Sem identificação')}</strong><small>${room ? `${room.count} chamado${room.count === 1 ? '' : 's'}` : 'Sem sala identificada'}</small></article>
          <article><span>Dispositivo com mais chamados</span><strong>${esc(type?.label || 'Sem identificação')}</strong><small>${type ? `${type.count} chamado${type.count === 1 ? '' : 's'}` : 'Sem dispositivo identificado'}</small></article>
        </aside>
        ${queueHtml}
      </section>
    </main>`;
  }

  function alertBanner() {
    if (!alertInfo?.ticket || Date.now() >= alertInfo.until) return '';
    const ticket = alertInfo.ticket;
    const types = (ticket.types || []).map(key => TYPES[key] || key).join(', ');
    const audio = monitorApi()?.audioStatus?.() || { label: 'Som desativado' };
    return `<section class="rt-tv-alert" role="alert">
      <span class="rt-tv-alert-label">NOVO CHAMADO</span><strong>${esc(ticket.room)}</strong><span>${esc(types)}</span>
      <small>#${esc(ticket.id)}${ticket.reference ? ` · ${esc(ticket.reference)}` : ''} · ${formatDate(ticket.openedAt, true)}</small>
      <span class="rt-tv-alert-owner">${esc(ownerLabel(ticket))}</span>
      <span class="rt-tv-alert-sound">${esc(audio.label)}</span>
      <span class="rt-tv-alert-count">Some em <b data-tv-alert-count>${Math.max(0, Math.ceil((alertInfo.until - Date.now()) / 1000))}</b></span>
    </section>`;
  }

  function connectionStatus() {
    const view = monitorView || monitorApi()?.snapshot?.() || {};
    const tone = ['error', 'expired'].includes(view.state) ? 'is-error' : view.state === 'ok' ? 'is-ok' : 'is-warn';
    return `<div class="rt-tv-connection"><span class="rt-tv-connection-state ${tone}">${esc(view.label || 'Aguardando')}</span><strong class="rt-tv-clock">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></div>`;
  }

  function render() {
    if (!active || !overlay) return;
    overlay.innerHTML = `<div class="rt-tv-shell">
      <header class="rt-tv-top"><div class="rt-tv-brand"><img src="/assets/branding/logo/logotextoesquerdabranco.png" alt="Colégio Satélite"><span>Painel Operacional<small>Central de T.I.</small></span></div>
      <nav aria-label="Painéis do modo TV"><button type="button" data-tv-panel="assets" class="${panel === 'assets' ? 'active' : ''}">01 Ativos</button><button type="button" data-tv-panel="calls" class="${panel === 'calls' ? 'active' : ''}">02 Chamados</button></nav>
      ${connectionStatus()}</header>
      ${alertBanner()}${panel === 'assets' ? assetPanel() : callPanel()}
      <footer class="rt-tv-footer"><div><b data-tv-countdown>${String(rotationRemaining).padStart(2, '0')}</b><span>${alertInfo ? 'Rotação em espera durante o alerta' : paused ? 'Rotação pausada' : 'Próxima troca'}<small>Painel ${panel === 'assets' ? '01 · Ativos' : '02 · Chamados'}</small></span></div>
      <div class="rt-tv-controls"><button type="button" data-tv-action="pause">${paused ? 'Retomar rotação' : 'Pausar rotação'}</button><button type="button" data-tv-action="switch">Trocar painel</button><button type="button" data-tv-action="sound">${monitorApi()?.isSoundEnabled?.() ? 'Silenciar' : 'Ativar som'}</button><button type="button" data-tv-action="fullscreen">${typeof document !== 'undefined' && document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia'}</button><button type="button" data-tv-action="close">Sair do modo TV</button></div></footer>
    </div>`;
  }

  function updateClock() {
    if (!active || !overlay) return;
    const clock = overlay.querySelector('.rt-tv-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const alertCount = overlay.querySelector('[data-tv-alert-count]');
    if (alertCount && alertInfo) alertCount.textContent = String(Math.max(0, Math.ceil((alertInfo.until - Date.now()) / 1000)));
    const countdown = overlay.querySelector('[data-tv-countdown]');
    if (countdown) countdown.textContent = String(rotationRemaining).padStart(2, '0');
  }

  function tick() {
    if (alertInfo && Date.now() >= alertInfo.until) {
      alertInfo = null;
      rotationRemaining = ROTATION_SECONDS;
      render();
      return;
    }
    if (!paused && !alertInfo) {
      rotationRemaining -= 1;
      if (rotationRemaining <= 0) switchPanel();
    }
    updateClock();
  }

  function switchPanel(next = null) {
    panel = next || (panel === 'assets' ? 'calls' : 'assets');
    rotationRemaining = ROTATION_SECONDS;
    render();
  }

  function applyView(view) {
    if (!view) return;
    const previous = monitorView;
    const previousData = callData;
    const previousAlertId = previous?.alert?.ticket?.id ?? null;
    const nextAlertId = view.alert?.ticket?.id ?? null;
    monitorView = view;
    if (view.data) callData = view.data;
    alertInfo = view.alert;
    if (!active) return;
    const changed = !previous
      || callData !== previousData
      || nextAlertId !== previousAlertId
      || view.state !== previous.state
      || view.queueLength !== previous.queueLength;
    if (changed) render();
  }

  function onOverlayClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.tvPanel) { switchPanel(button.dataset.tvPanel); return; }
    switch (button.dataset.tvAction) {
      case 'close': close(); break;
      case 'switch': switchPanel(); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'pause': paused = !paused; render(); break;
      case 'sound': {
        const api = monitorApi();
        const audio = api?.audioStatus?.() || { state: 'off' };
        // Som bloqueado ou indisponível precisa de uma ação explícita do usuário.
        if (audio.state === 'off' || audio.state === 'blocked' || audio.state === 'unavailable') api?.enableSound?.();
        else api?.setSoundEnabled?.(false);
        render();
        break;
      }
      // Nenhum outro botão existe aqui de propósito: a TV não escreve.
      default: break;
    }
  }

  function toggleFullscreen() {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
    else overlay?.requestFullscreen?.().catch?.(() => {});
    render();
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && active) close();
  }

  function open(seedData = null) {
    if (active) return;
    active = true; panel = 'assets'; paused = false; rotationRemaining = ROTATION_SECONDS;
    if (seedData) callData = seedData;
    overlay = document.createElement('section');
    overlay.className = 'rt-tv';
    overlay.setAttribute('aria-label', 'Modo TV do GCC (somente leitura)');
    overlay.addEventListener('click', onOverlayClick);
    document.body.appendChild(overlay);
    document.body.classList.add('rt-tv-open');
    document.addEventListener('keydown', onKeydown);
    render();
    tickTimer = setInterval(tick, 1000);
    const api = monitorApi();
    if (api) {
      if (unsubscribe) unsubscribe();
      unsubscribe = api.subscribe(applyView);
      // Entrar na TV não interrompe a atualização do painel: o monitor segue
      // dono do ciclo de consulta e continua rodando por baixo da sobreposição.
      api.start();
      applyView(api.snapshot());
      // A TV tem o próprio alerta, então o banner global sai da tela.
      api.dismissBanner?.();
    }
    overlay.requestFullscreen?.().catch(() => {});
  }

  function close() {
    if (!active) return;
    active = false;
    if (tickTimer !== null) clearInterval(tickTimer);
    tickTimer = null;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    document.removeEventListener('keydown', onKeydown);
    overlay?.remove(); overlay = null;
    document.body.classList.remove('rt-tv-open');
    monitorApi()?.syncUi?.();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  return { open, close, isActive: () => active, isReadOnly: () => true };
})();
