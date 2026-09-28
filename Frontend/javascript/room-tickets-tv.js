/**
 * Operational TV mode for GCC.
 * Rotates the assets and room-ticket panels and owns the 15-second new-ticket alert.
 */
window.RoomTicketsTV = (() => {
  'use strict';

  const ROTATION_SECONDS = 30;
  const REFRESH_MS = 60000;
  const ALERT_MS = 15000;
  const OPEN_STATUSES = new Set(['aberto', 'em_andamento', 'pendente']);
  const TYPES = { projector: 'Projetor', pc: 'PC', mouse: 'Mouse', keyboard: 'Teclado',
    chromebook: 'Chromebook', cart: 'Carrinho', other: 'Outros', unknown: 'Não identificado' };

  let overlay = null;
  let callData = null;
  let active = false;
  let panel = 'assets';
  let paused = false;
  let soundEnabled = false;
  let rotationRemaining = ROTATION_SECONDS;
  let tickTimer = null;
  let refreshTimer = null;
  let alertTimer = null;
  let alertTicket = null;
  let alertUntil = 0;
  let lastAlertedId = null;
  let globalAlert = null;
  let audioContext = null;

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
          <li><i></i><span>GLPI</span><strong>Online</strong></li><li><i></i><span>Backend</span><strong>Online</strong></li>
          <li><i></i><span>Autenticação</span><strong>Online</strong></li><li><i class="warn"></i><span>Integrações</span><strong>Em acompanhamento</strong></li>
        </ul></article>
      </section>
    </main>`;
  }

  function callPanel() {
    const ticket = latest();
    const summary = callData?.summary || {};
    const room = summary.topRooms?.[0];
    const type = summary.topTypes?.[0];
    if (!ticket) return `<main class="rt-tv-main"><header class="rt-tv-section-head"><div><span>ATENDIMENTO</span><h1>Chamados das salas</h1></div></header><section class="rt-tv-empty">Nenhum chamado encontrado nos últimos 30 dias.</section></main>`;
    const accepted = Boolean(ticket.acknowledgement);
    return `<main class="rt-tv-main">
      <header class="rt-tv-section-head"><div><span>ATENDIMENTO</span><h1>Chamados das salas</h1></div><strong>${summary.total || 0} no período · ${summary.open || 0} em aberto</strong></header>
      <section class="rt-tv-grid rt-tv-grid--calls">
        <article class="rt-tv-card rt-tv-card--latest">
          <div class="rt-tv-ticket-head"><span>ÚLTIMO CHAMADO RECEBIDO</span><strong>#${ticket.id}${ticket.reference ? ` · ${esc(ticket.reference)}` : ''}</strong></div>
          <h2>${esc(ticket.room)}</h2><p class="rt-tv-device">${esc((ticket.types || []).map(typeKey => TYPES[typeKey] || typeKey).join(', '))}</p>
          <h3>${esc(ticket.title || 'Sem título')}</h3><p>${esc(ticket.description || 'Sem descrição.')}</p>
          <div class="rt-tv-ticket-meta"><span>Abertura<strong>${formatDate(ticket.openedAt, true)}</strong></span><span>Status<strong>${accepted ? 'Alerta aceito' : 'Aguardando aceite'}</strong></span></div>
          <button type="button" data-tv-action="accept" data-ticket-id="${ticket.id}" ${accepted ? 'disabled' : ''}>${accepted ? 'Aceito' : 'Aceitar alerta'}</button>
        </article>
        <aside class="rt-tv-stats">
          <article><span>Chamados abertos</span><strong>${summary.open || 0}</strong><small>Atualização a cada minuto</small></article>
          <article><span>Sala com mais chamados</span><strong>${esc(room?.label || 'Sem identificação')}</strong><small>${room ? `${room.count} chamado${room.count === 1 ? '' : 's'}` : 'Sem sala identificada'}</small></article>
          <article><span>Dispositivo com mais chamados</span><strong>${esc(type?.label || 'Sem identificação')}</strong><small>${type ? `${type.count} chamado${type.count === 1 ? '' : 's'}` : 'Sem dispositivo identificado'}</small></article>
        </aside>
      </section>
    </main>`;
  }

  function alertBanner() {
    if (!alertTicket || Date.now() >= alertUntil) return '';
    const types = (alertTicket.types || []).map(key => TYPES[key] || key).join(', ');
    return `<section class="rt-tv-alert" role="alert">
      <span class="rt-tv-alert-label">NOVO CHAMADO</span><strong>${esc(alertTicket.room)}</strong><span>${esc(types)}</span>
      <small>#${alertTicket.id}${alertTicket.reference ? ` · ${esc(alertTicket.reference)}` : ''} · ${formatDate(alertTicket.openedAt, true)}</small>
      <span class="rt-tv-alert-sound">${soundEnabled ? 'Som ativado' : 'Som desativado'}</span>
      <span class="rt-tv-alert-count">Some em <b data-tv-alert-count>${Math.max(0, Math.ceil((alertUntil - Date.now()) / 1000))}</b></span>
      <button type="button" data-tv-action="accept" data-ticket-id="${alertTicket.id}">Aceitar</button>
    </section>`;
  }

  function render() {
    if (!active || !overlay) return;
    overlay.innerHTML = `<div class="rt-tv-shell">
      <header class="rt-tv-top"><div class="rt-tv-brand"><img src="/assets/branding/logo/logotextoesquerdabranco.png" alt="Colégio Satélite"><span>Painel Operacional<small>Central de T.I.</small></span></div>
      <nav aria-label="Painéis do modo TV"><button type="button" data-tv-panel="assets" class="${panel === 'assets' ? 'active' : ''}">01 Ativos</button><button type="button" data-tv-panel="calls" class="${panel === 'calls' ? 'active' : ''}">02 Chamados</button></nav>
      <div class="rt-tv-connection"><span>Conectado ao GCC</span><strong class="rt-tv-clock">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></div></header>
      ${alertBanner()}${panel === 'assets' ? assetPanel() : callPanel()}
      <footer class="rt-tv-footer"><div><b data-tv-countdown>${String(rotationRemaining).padStart(2, '0')}</b><span>${alertTicket ? 'Rotação em espera durante o alerta' : paused ? 'Rotação pausada' : 'Próxima troca'}<small>Painel ${panel === 'assets' ? '01 · Ativos' : '02 · Chamados'}</small></span></div>
      <div class="rt-tv-controls"><button type="button" data-tv-action="pause">${paused ? 'Retomar rotação' : 'Pausar rotação'}</button><button type="button" data-tv-action="switch">Trocar painel</button><button type="button" data-tv-action="sound">${soundEnabled ? 'Desativar som' : 'Ativar som'}</button><button type="button" data-tv-action="close">Sair do modo TV</button></div></footer>
    </div>`;
  }

  function updateClock() {
    if (!active || !overlay) return;
    const clock = overlay.querySelector('.rt-tv-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const alertCount = overlay.querySelector('[data-tv-alert-count]');
    if (alertCount) alertCount.textContent = String(Math.max(0, Math.ceil((alertUntil - Date.now()) / 1000)));
    const countdown = overlay.querySelector('[data-tv-countdown]');
    if (countdown) countdown.textContent = String(rotationRemaining).padStart(2, '0');
  }

  function tick() {
    if (alertTicket && Date.now() >= alertUntil) {
      alertTicket = null;
      alertUntil = 0;
      rotationRemaining = ROTATION_SECONDS;
      render();
      return;
    }
    if (!paused && !alertTicket) {
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

  async function fetchCalls() {
    try {
      const response = await window.ApiClient.get('/api/tickets/salas?period=30d&page=1', { cache: false, retries: 0, timeout: 90000 });
      if (response?.data?.summary) update(response.data);
    } catch (error) {
      console.warn('[RoomTicketsTV] Não foi possível atualizar os chamados.', error);
    }
  }

  function considerAlert(ticket) {
    if (!ticket || ticket.acknowledgement || !OPEN_STATUSES.has(ticket.status) || Number(ticket.id) === Number(lastAlertedId)) return;
    lastAlertedId = Number(ticket.id);
    alertTicket = ticket;
    alertUntil = Date.now() + ALERT_MS;
    panel = 'calls';
    rotationRemaining = ROTATION_SECONDS;
    playSound();
    if (active) {
      render();
      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => { alertTicket = null; alertUntil = 0; render(); }, ALERT_MS + 100);
    } else {
      showGlobalAlert(ticket);
    }
  }

  function update(nextData) {
    callData = nextData;
    considerAlert(latest(nextData));
    if (active) render();
  }

  async function accept(ticket) {
    if (!ticket?.id) throw new Error('Chamado inválido.');
    const response = await window.ApiClient.post(`/api/tickets/salas/${encodeURIComponent(ticket.id)}/aceite`, {
      reference: ticket.reference || '', openedAt: ticket.openedAt || '',
    }, { cache: false, retries: 0, timeout: 15000 });
    const acknowledgement = response?.data?.acknowledgement;
    if (!acknowledgement) throw new Error('Resposta incompleta do servidor.');
    if (callData?.latest?.id === ticket.id) callData.latest.acknowledgement = acknowledgement;
    for (const item of callData?.items || []) if (item.id === ticket.id) item.acknowledgement = acknowledgement;
    if (alertTicket?.id === ticket.id) { alertTicket = null; alertUntil = 0; }
    removeGlobalAlert();
    if (active) render();
    document.dispatchEvent(new CustomEvent('roomtickets:accepted', { detail: { ticketId: ticket.id, acknowledgement } }));
    return acknowledgement;
  }

  function showGlobalAlert(ticket) {
    removeGlobalAlert();
    globalAlert = document.createElement('aside');
    globalAlert.className = 'rt-global-alert';
    globalAlert.setAttribute('role', 'alert');
    globalAlert.innerHTML = `<span>Novo chamado em sala</span><strong>${esc(ticket.room)}</strong><p>${esc(ticket.title || 'Sem título')}</p><div><button type="button" data-global-alert-accept>Aceitar</button><button type="button" data-global-alert-close>Fechar</button></div>`;
    globalAlert.querySelector('[data-global-alert-accept]').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { await accept(ticket); } catch { event.currentTarget.disabled = false; }
    });
    globalAlert.querySelector('[data-global-alert-close]').addEventListener('click', removeGlobalAlert);
    document.body.appendChild(globalAlert);
    alertTimer = setTimeout(removeGlobalAlert, ALERT_MS);
  }

  function removeGlobalAlert() {
    if (globalAlert) globalAlert.remove();
    globalAlert = null;
    clearTimeout(alertTimer);
  }

  function ensureAudio() {
    if (!audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioContext = new AudioContext();
    }
    audioContext?.resume?.().catch(() => {});
  }

  function playSound() {
    if (!soundEnabled) return;
    ensureAudio();
    if (!audioContext) return;
    const start = audioContext.currentTime;
    [0, 0.22].forEach(offset => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(start + offset); oscillator.stop(start + offset + 0.18);
    });
  }

  function onOverlayClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.tvPanel) { switchPanel(button.dataset.tvPanel); return; }
    switch (button.dataset.tvAction) {
      case 'close': close(); break;
      case 'switch': switchPanel(); break;
      case 'pause': paused = !paused; render(); break;
      case 'sound': soundEnabled = !soundEnabled; if (soundEnabled) { ensureAudio(); playSound(); } render(); break;
      case 'accept': {
        const ticket = [alertTicket, latest()].find(item => item && Number(item.id) === Number(button.dataset.ticketId));
        if (!ticket) return;
        button.disabled = true;
        accept(ticket).catch(() => { button.disabled = false; });
        break;
      }
    }
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && active) close();
  }

  function open(seedData = null) {
    if (active) return;
    active = true; panel = 'assets'; paused = false; rotationRemaining = ROTATION_SECONDS;
    soundEnabled = true; ensureAudio();
    if (seedData) callData = seedData;
    overlay = document.createElement('section');
    overlay.className = 'rt-tv';
    overlay.setAttribute('aria-label', 'Modo TV do GCC');
    overlay.addEventListener('click', onOverlayClick);
    document.body.appendChild(overlay);
    document.body.classList.add('rt-tv-open');
    document.addEventListener('keydown', onKeydown);
    render();
    tickTimer = setInterval(tick, 1000);
    refreshTimer = setInterval(fetchCalls, REFRESH_MS);
    fetchCalls();
    overlay.requestFullscreen?.().catch(() => {});
  }

  function close() {
    if (!active) return;
    active = false;
    clearInterval(tickTimer); clearInterval(refreshTimer); clearTimeout(alertTimer);
    tickTimer = refreshTimer = alertTimer = null;
    document.removeEventListener('keydown', onKeydown);
    overlay?.remove(); overlay = null;
    document.body.classList.remove('rt-tv-open');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  return { open, close, update, accept, isActive: () => active };
})();
