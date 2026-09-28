/**
 * Shared monitoring for room-ticket alerts (GCC).
 *
 * Owns the single ticket poll, the acknowledgement synchronisation, the alert
 * queue, the connection status, the audio and the cross-tab coordination.
 * The report page and the TV overlay only read from this module.
 *
 * Contracts:
 * - one list request per minute per browser (localStorage poll lock + broadcast);
 * - alert acceptance is shared between tabs and screens, never with GLPI;
 * - no ticket content is persisted: only two boolean preferences.
 */
window.RoomTicketsMonitor = (() => {
  'use strict';

  const LIST_INTERVAL_MS = 60000;
  const LIST_LOCK_MS = 55000;
  const LIST_LOCK_FORCE_MS = 150000;
  const TICK_MAX_AGE_MS = 51000;        // 85% do intervalo: reaproveita leitura fresca
  const INITIAL_MAX_AGE_MS = 4000;
  const ACK_INTERVAL_MS = 5000;
  const ACK_LOCK_MS = 4000;
  const ACK_LOCK_FORCE_MS = 15000;
  const ALERT_MS = 15000;
  const BASELINE_WINDOW_MS = 120000;    // chamados com mais de 2 min não geram alerta
  const STALE_MS = 90000;
  const HEARTBEAT_MS = 15000;
  const DEFAULT_QUERY = 'period=30d&page=1';
  const CHANNEL = 'gcc-room-tickets';
  const LOCK_LIST = 'gcc-room-tickets-poll';
  const LOCK_ACK = 'gcc-room-tickets-ack';
  const CLAIM_SOUND = 'gcc-room-tickets-sound-claim';
  const PREF_MONITOR = 'gcc-room-tickets-monitor';
  const PREF_SOUND = 'gcc-room-tickets-sound';
  const SP_OFFSET_MS = -3 * 3600 * 1000; // America/Sao_Paulo é UTC-3 o ano inteiro
  const TYPES = { projector: 'Projetor', pc: 'PC', mouse: 'Mouse', keyboard: 'Teclado',
    chromebook: 'Chromebook', cart: 'Carrinho', other: 'Outros', unknown: 'Não identificado' };
  const LABELS = {
    idle: 'Aguardando',
    loading: 'Carregando',
    ok: 'Atualizado',
    stale: 'Desatualizado',
    error: 'Falha de conexão',
    expired: 'Sessão expirada',
    paused: 'Monitoramento pausado',
  };

  let running = false;
  let expired = false;
  let fetchFailed = false;
  let lastErrorStatus = 0;
  let errorMessage = '';
  let epoch = 0;
  let chain = Promise.resolve();
  let inflight = null;
  const payloads = new Map();
  const stamps = new Map();
  let lastData = null;
  let lastSuccessAt = 0;
  let firstLoad = false;
  const seen = new Set();
  let queue = [];
  const acks = new Map();
  const listeners = new Set();
  let channel = null;
  let initialized = false;
  let listTimer = null;
  let ackTimer = null;
  let tickerTimer = null;
  let heartbeatTimer = null;
  let monitorEnabled = readBool(PREF_MONITOR, true);
  let soundEnabled = readBool(PREF_SOUND, false);
  let audioContext = null;
  let widget = null;
  let banner = null;
  let lastChange = 'init';
  const TAB_ID = Math.random().toString(36).slice(2, 10);

  // ── utilidades ───────────────────────────────────────────────────────────

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function readBool(key, fallback) {
    try {
      const raw = window.localStorage?.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return raw === '1';
    } catch { return fallback; }
  }

  function writeBool(key, value) {
    try { window.localStorage?.setItem(key, value ? '1' : '0'); } catch { /* armazenamento indisponível */ }
  }

  function canUseDom() {
    return typeof document !== 'undefined'
      && typeof document.addEventListener === 'function'
      && typeof document.createElement === 'function'
      && !!document.body;
  }

  function emitDocument(name, detail) {
    if (typeof document === 'undefined' || typeof document.dispatchEvent !== 'function') return;
    if (typeof CustomEvent !== 'function') return;
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function parseOpenedAt(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return NaN;
    return Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]) + SP_OFFSET_MS;
  }

  function acquireLock(key, windowMs, forceAfterMs) {
    try {
      const now = Date.now();
      const raw = window.localStorage?.getItem(key);
      const lock = raw ? JSON.parse(raw) : null;
      if (lock && lock.tab !== TAB_ID && now - Number(lock.at || 0) < windowMs) {
        if (!forceAfterMs || now - Number(lock.at || 0) < forceAfterMs) return false;
      }
      window.localStorage?.setItem(key, JSON.stringify({ at: now, tab: TAB_ID }));
      return true;
    } catch { return true; }
  }

  function post(message) {
    if (!channel) return;
    try { channel.postMessage({ ...message, tab: TAB_ID }); } catch { /* canal fechado */ }
  }

  // ── estado e assinantes ──────────────────────────────────────────────────

  function state() {
    if (expired) return 'expired';
    if (!monitorEnabled && running) return 'paused';
    if (!lastData) return fetchFailed ? 'error' : (firstLoad ? 'loading' : 'idle');
    if (fetchFailed) return 'error';
    return Date.now() - lastSuccessAt > STALE_MS ? 'stale' : 'ok';
  }

  function snapshot() {
    const current = currentAlert();
    return {
      state: state(),
      label: LABELS[state()] || LABELS.idle,
      message: errorMessage,
      lastSuccessAt,
      data: lastData,
      alert: current ? { ticket: current.ticket, until: current.until } : null,
      queueLength: queue.length,
      monitorEnabled,
      soundEnabled,
      running,
      expired,
    };
  }

  function emit(change = 'status') {
    lastChange = change;
    const view = snapshot();
    for (const listener of Array.from(listeners)) {
      try { listener(view, change); } catch (error) { console.warn('[RoomTicketsMonitor] assinante falhou.', error); }
    }
    renderWidget();
    renderBanner();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    try { listener(snapshot(), 'init'); } catch { /* assinante inicial falhou */ }
    return () => listeners.delete(listener);
  }

  // ── leituras e cache ─────────────────────────────────────────────────────

  function store(q, data) {
    payloads.set(q, data);
    stamps.set(q, Date.now());
    lastData = data;
    lastSuccessAt = Date.now();
    fetchFailed = false;
    lastErrorStatus = 0;
    errorMessage = '';
  }

  function cached(q) {
    const data = payloads.get(q);
    if (!data) return null;
    if (Date.now() - Number(stamps.get(q) || 0) > 6 * 3600 * 1000) {
      payloads.delete(q); stamps.delete(q);
      return null;
    }
    return data;
  }

  async function refresh(options = {}) {
    const q = String(options.q || DEFAULT_QUERY);
    const maxAge = Number(options.maxAge || 0);
    const reason = String(options.reason || 'manual');
    const fallback = { ok: false, data: cached(q), error: expired ? { status: 401 } : null, message: errorMessage };

    if (expired) {
      return { ...fallback, message: 'Sua sessão expirou. Entre novamente para consultar os chamados.' };
    }
    const fresh = cached(q);
    if (fresh && maxAge > 0 && Date.now() - Number(stamps.get(q) || 0) <= maxAge && !fetchFailed) {
      return { ok: true, data: fresh, error: null, message: '' };
    }
    if (inflight && inflight.q === q) return inflight.promise;

    firstLoad = true;
    const promise = chain.then(() => runFetch(q, reason), () => runFetch(q, reason));
    chain = promise.then(() => undefined, () => undefined);
    inflight = { q, promise };
    const clear = () => { if (inflight && inflight.promise === promise) inflight = null; };
    promise.then(clear, clear);
    return promise;
  }

  async function runFetch(q, reason) {
    const myEpoch = epoch;
    if (!lastData) { emit('status'); }
    try {
      const response = await window.ApiClient.get('/api/tickets/salas?' + q, {
        cache: false, retries: 0, timeout: 90000,
      });
      if (myEpoch !== epoch) return { ok: false, data: null, error: null, message: '', discarded: true };
      const data = response?.data;
      if (!data?.summary || !Array.isArray(data.items)) throw new Error('Resposta incompleta do servidor.');
      applyPayload(q, data, true);
      return { ok: true, data, error: null, message: '' };
    } catch (failure) {
      if (myEpoch !== epoch) return { ok: false, data: null, error: null, message: '', discarded: true };
      return handleFailure(failure, q);
    }
  }

  function handleFailure(failure, q) {
    const status = Number(failure?.status || 0);
    if (status === 401) {
      expired = true;
      fetchFailed = false;
      stopPolling();
      errorMessage = 'Sua sessão expirou. Entre novamente para consultar os chamados.';
      emit('status');
      emitDocument('roomtickets:expired', {});
      return { ok: false, data: cached(q), error: { status }, message: errorMessage };
    }
    fetchFailed = true;
    lastErrorStatus = status;
    if (status === 403) errorMessage = 'Seu perfil não tem acesso a estes chamados.';
    else if (status === 422) errorMessage = 'Revise os filtros: datas válidas, início antes do fim e intervalo máximo de 366 dias.';
    else if (status === 429) errorMessage = 'Muitas consultas em seguida. O painel retoma automaticamente.';
    else errorMessage = 'Não foi possível carregar os chamados completos. Tente novamente. Se persistir, verifique o acesso ao GLPI e o limite de 10 mil registros por coleção.';
    emit('status');
    return { ok: false, data: cached(q), error: { status }, message: errorMessage };
  }

  // ── aplicação de dados, aceites e fila ───────────────────────────────────

  function patch(data, id, entry) {
    if (!data) return;
    if (data.latest && Number(data.latest.id) === id) data.latest.acknowledgement = entry;
    for (const item of data.items || []) if (Number(item.id) === id) item.acknowledgement = entry;
    for (const item of data.monitor?.recent || []) if (Number(item.id) === id) item.acknowledgement = entry;
  }

  function collectAcks(data) {
    const entries = [];
    const push = ticket => {
      if (ticket && ticket.acknowledgement && Number(ticket.id)) {
        entries.push([String(Number(ticket.id)), ticket.acknowledgement]);
      }
    };
    push(data.latest);
    for (const item of data.items || []) push(item);
    for (const item of data.monitor?.recent || []) push(item);
    return entries;
  }

  function applyAck(id, entry, broadcast) {
    const key = String(Number(id));
    acks.set(key, entry);
    for (const data of payloads.values()) patch(data, Number(id), entry);
    queue = queue.filter(alert => alert.id !== Number(id));
    if (!queue.length) stopAckTimer();
    if (broadcast) post({ type: 'acks', entries: { [key]: entry } });
    emit('data');
  }

  function applyPayload(q, data, broadcast) {
    store(q, data);
    for (const [key, entry] of collectAcks(data)) {
      if (!acks.has(key)) acks.set(key, entry);
    }
    for (const data2 of payloads.values()) {
      for (const [key, entry] of acks) patch(data2, Number(key), entry);
    }
    evaluateAlerts(data);
    if (broadcast) post({ type: 'payload', q, data });
    emit('data');
  }

  function evaluateAlerts(data) {
    const recent = data?.monitor?.recent;
    if (!Array.isArray(recent)) { purgeQueue(); return; }
    const now = Date.now();
    let added = 0;
    for (const entry of recent) {
      const id = Number(entry?.id);
      if (!id) continue;
      const acknowledged = entry.acknowledgement || acks.get(String(id));
      const age = now - parseOpenedAt(entry.openedAt);
      if (acknowledged) { seen.add(id); continue; }
      // Baseline: chamados antigos (ou sem data confiável) nunca geram alerta.
      if (!entry.eligible || !Number.isFinite(age) || age > BASELINE_WINDOW_MS) {
        if (!Number.isFinite(age) || age > BASELINE_WINDOW_MS) seen.add(id);
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push({ id, ticket: entry, openedAt: entry.openedAt, until: now + ALERT_MS });
      added += 1;
      claimAndPlaySound(id);
      emitDocument('roomtickets:alert', { ticket: entry });
    }
    if (added) {
      queue.sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt)) || a.id - b.id);
      startTicker();
      syncAcks();
    }
    purgeQueue();
  }

  function purgeQueue() {
    const now = Date.now();
    const before = queue.length;
    queue = queue.filter(alert => alert.until > now
      && !alert.ticket?.acknowledgement
      && !acks.has(String(alert.id)));
    if (before !== queue.length && !queue.length) stopAckTimer();
  }

  function currentAlert() {
    purgeQueue();
    return queue[0] || null;
  }

  function dismiss(id) {
    const numeric = Number(id);
    if (!numeric) return;
    seen.add(numeric);
    queue = queue.filter(alert => alert.id !== numeric);
    if (!queue.length) stopAckTimer();
    emit('alert');
  }

  async function accept(ticket) {
    const id = Number(ticket?.id);
    if (!id) throw new Error('Chamado inválido.');
    const response = await window.ApiClient.post(
      '/api/tickets/salas/' + encodeURIComponent(id) + '/aceite',
      {}, { cache: false, retries: 0, timeout: 15000 }
    );
    const acknowledgement = response?.data?.acknowledgement;
    if (!acknowledgement) throw new Error('Resposta incompleta do servidor.');
    applyAck(id, acknowledgement, true);
    emitDocument('roomtickets:accepted', { ticketId: id, acknowledgement });
    return acknowledgement;
  }

  // ── sincronização de aceites ─────────────────────────────────────────────

  function startAckTimer() {
    if (ackTimer !== null) return;
    if (typeof setInterval !== 'function') return;
    ackTimer = setInterval(syncAcks, ACK_INTERVAL_MS);
  }

  function stopAckTimer() {
    if (ackTimer !== null && typeof clearInterval === 'function') clearInterval(ackTimer);
    ackTimer = null;
  }

  async function syncAcks() {
    if (!running || expired || !monitorEnabled) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const ids = queue.map(alert => alert.id);
    if (!ids.length) { stopAckTimer(); return; }
    if (!acquireLock(LOCK_ACK, ACK_LOCK_MS, ACK_LOCK_FORCE_MS)) return;
    const myEpoch = epoch;
    try {
      const response = await window.ApiClient.get(
        '/api/tickets/salas/aceites?ids=' + ids.join(','),
        { cache: false, retries: 0, timeout: 15000 }
      );
      if (myEpoch !== epoch) return;
      const entries = response?.data?.acknowledgements;
      if (!entries || typeof entries !== 'object') return;
      const changed = [];
      for (const [key, entry] of Object.entries(entries)) {
        if (!entry || acks.has(String(key))) continue;
        changed.push([Number(key), entry]);
      }
      if (!changed.length) return;
      for (const [id, entry] of changed) applyAck(id, entry, true);
    } catch (failure) {
      if (Number(failure?.status) === 401) handleFailure(failure, DEFAULT_QUERY);
    }
  }

  // ── ciclo de vida ────────────────────────────────────────────────────────

  function init() {
    if (initialized) return;
    initialized = true;
    if (typeof BroadcastChannel === 'function') {
      try {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = event => onChannelMessage(event?.data);
      } catch { channel = null; }
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('user:logout', () => reset());
      document.addEventListener('user:restored', () => { expired = false; start(); });
      document.addEventListener('guard:expired', () => reset());
      document.addEventListener('guard:unauthenticated', () => reset());
      document.addEventListener('visibilitychange', () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (running && monitorEnabled) { tickList(); syncAcks(); }
      });
    }
  }

  function onChannelMessage(message) {
    if (!message || message.tab === TAB_ID) return;
    if (message.type === 'payload' && message.q && message.data) {
      payloads.set(String(message.q), message.data);
      stamps.set(String(message.q), Date.now());
      lastData = message.data;
      lastSuccessAt = Date.now();
      fetchFailed = false;
      for (const [key, entry] of collectAcks(message.data)) if (!acks.has(key)) acks.set(key, entry);
      evaluateAlerts(message.data);
      emit('data');
      return;
    }
    if (message.type === 'acks' && message.entries) {
      let changed = false;
      for (const [key, entry] of Object.entries(message.entries)) {
        if (!entry || acks.has(String(key))) continue;
        applyAck(Number(key), entry, false);
        changed = true;
      }
      if (changed) emit('data');
      return;
    }
    if (message.type === 'reset') hardClear();
  }

  function start() {
    init();
    expired = false;
    if (running) { if (monitorEnabled) { tickList(); } return; }
    running = true;
    if (!monitorEnabled) { emit('status'); return; }
    startPolling();
    emit('status');
  }

  function startPolling() {
    if (listTimer === null && typeof setInterval === 'function') {
      listTimer = setInterval(tickList, LIST_INTERVAL_MS);
    }
    if (heartbeatTimer === null && typeof setInterval === 'function') {
      heartbeatTimer = setInterval(() => { purgeQueue(); emit('status'); }, HEARTBEAT_MS);
    }
    if (queue.length) startAckTimer();
    tickList();
  }

  function tickList() {
    if (!running || !monitorEnabled || expired) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!acquireLock(LOCK_LIST, LIST_LOCK_MS, LIST_LOCK_FORCE_MS)) return;
    refresh({ q: DEFAULT_QUERY, reason: 'tick', maxAge: TICK_MAX_AGE_MS });
  }

  function stopPolling() {
    if (listTimer !== null && typeof clearInterval === 'function') clearInterval(listTimer);
    if (heartbeatTimer !== null && typeof clearInterval === 'function') clearInterval(heartbeatTimer);
    listTimer = null;
    heartbeatTimer = null;
    stopAckTimer();
  }

  function stop() {
    running = false;
    stopPolling();
    if (tickerTimer !== null && typeof clearInterval === 'function') clearInterval(tickerTimer);
    tickerTimer = null;
    emit('status');
  }

  function hardClear() {
    payloads.clear();
    stamps.clear();
    acks.clear();
    seen.clear();
    queue = [];
    lastData = null;
    lastSuccessAt = 0;
    firstLoad = false;
    fetchFailed = false;
    lastErrorStatus = 0;
    errorMessage = '';
  }

  function reset() {
    epoch += 1;
    const wasRunning = running;
    stop();
    running = false;
    expired = false;
    hardClear();
    if (wasRunning) post({ type: 'reset' });
    renderBanner();
    renderWidget();
    emit('status');
  }

  // ── preferências, som e áudio ────────────────────────────────────────────

  function setMonitorEnabled(enabled) {
    monitorEnabled = Boolean(enabled);
    writeBool(PREF_MONITOR, monitorEnabled);
    if (monitorEnabled && running) { startPolling(); }
    else if (!monitorEnabled) { stopPolling(); }
    emit('status');
  }

  function setSoundEnabled(enabled) {
    soundEnabled = Boolean(enabled);
    writeBool(PREF_SOUND, soundEnabled);
    if (soundEnabled) { ensureAudio(); playTone(); }
    emit('status');
  }

  function ensureAudio() {
    if (audioContext) { audioContext.resume?.().catch(() => {}); return audioContext; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    try { audioContext = new AudioContext(); } catch { audioContext = null; }
    audioContext?.resume?.().catch(() => {});
    return audioContext;
  }

  function playTone() {
    const context = ensureAudio();
    if (!context) return;
    const start = context.currentTime;
    [0, 0.22].forEach(offset => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start + offset); oscillator.stop(start + offset + 0.18);
    });
  }

  function claimAndPlaySound(id) {
    if (!soundEnabled) return;
    const claim = { id, at: Date.now(), tab: TAB_ID };
    try {
      const raw = window.localStorage?.getItem(CLAIM_SOUND);
      const previous = raw ? JSON.parse(raw) : null;
      if (previous && Number(previous.id) === id && Date.now() - Number(previous.at || 0) < 3000) return;
      window.localStorage?.setItem(CLAIM_SOUND, JSON.stringify(claim));
    } catch { /* sem armazenamento: toca localmente mesmo assim */ }
    if (typeof setTimeout !== 'function') { playTone(); return; }
    // Confirmação entre abas: só a aba que detém a marca toca o alerta.
    setTimeout(() => {
      try {
        const raw = window.localStorage?.getItem(CLAIM_SOUND);
        const current = raw ? JSON.parse(raw) : null;
        if (current && current.tab !== TAB_ID && Number(current.id) === id) return;
      } catch { /* segue e toca */ }
      if (soundEnabled) playTone();
    }, 80);
  }

  // ── áudio e fila: renderização ───────────────────────────────────────────

  function startTicker() {
    if (tickerTimer !== null || typeof setInterval !== 'function') return;
    tickerTimer = setInterval(() => {
      const before = queue.length;
      purgeQueue();
      if (queue.length !== before || queue.length) emit('alert');
      if (!queue.length) {
        if (tickerTimer !== null && typeof clearInterval === 'function') clearInterval(tickerTimer);
        tickerTimer = null;
      }
    }, 1000);
    startAckTimer();
  }

  function renderBanner() {
    if (!canUseDom()) return;
    const tvActive = Boolean(window.RoomTicketsTV?.isActive?.());
    const alert = tvActive ? null : currentAlert();
    if (!alert) { banner?.remove(); banner = null; return; }
    const ticket = alert.ticket;
    const types = (ticket.types || []).map(key => TYPES[key] || key).join(', ');
    const seconds = Math.max(0, Math.ceil((alert.until - Date.now()) / 1000));
    const html = '<span class="rt-monitor-alert-label">NOVO CHAMADO</span>' +
      '<strong>' + esc(ticket.room) + '</strong>' +
      (types ? '<span class="rt-monitor-alert-types">' + esc(types) + '</span>' : '') +
      '<small>#' + esc(ticket.id) + (ticket.reference ? ' · ' + esc(ticket.reference) : '') + '</small>' +
      '<span class="rt-monitor-alert-count">Some em <b data-monitor-alert-count>' + seconds + '</b></span>' +
      '<span class="rt-monitor-alert-sound">' + (soundEnabled ? 'Som ativado' : 'Som desativado') + '</span>' +
      '<span class="rt-monitor-alert-actions">' +
      '<button type="button" data-monitor-action="accept" data-ticket-id="' + esc(ticket.id) + '">Aceitar</button>' +
      '<button type="button" data-monitor-action="dismiss" data-ticket-id="' + esc(ticket.id) + '">Dispensar</button>' +
      '<button type="button" data-monitor-action="sound">' + (soundEnabled ? 'Desativar som' : 'Ativar som') + '</button>' +
      '</span>';
    if (!banner) {
      banner = document.createElement('aside');
      banner.className = 'rt-monitor-alert';
      banner.setAttribute('role', 'alert');
      banner.addEventListener('click', onBannerClick);
      document.body.appendChild(banner);
    }
    banner.innerHTML = html;
  }

  async function onBannerClick(event) {
    const button = event.target.closest?.('button');
    if (!button) return;
    const id = Number(button.dataset.ticketId);
    if (button.dataset.monitorAction === 'sound') { setSoundEnabled(!soundEnabled); return; }
    if (button.dataset.monitorAction === 'dismiss') { dismiss(id); return; }
    if (button.dataset.monitorAction === 'accept') {
      const alert = queue.find(item => item.id === id);
      if (!alert) return;
      button.disabled = true;
      try { await accept(alert.ticket); } catch { button.disabled = false; renderBanner(); }
    }
  }

  function renderWidget() {
    if (!canUseDom()) return;
    const view = snapshot();
    const html = '<span class="rt-monitor-widget-state is-' + esc(view.state) + '" aria-hidden="true"></span>' +
      '<span class="rt-monitor-widget-label">' + esc(view.label) + '</span>' +
      '<button type="button" data-monitor-action="toggle-monitor">' +
      (monitorEnabled ? 'Pausar monitoramento' : 'Retomar monitoramento') + '</button>' +
      '<button type="button" data-monitor-action="toggle-sound">' +
      (soundEnabled ? 'Som ativo' : 'Som inativo') + '</button>';
    if (!widget) {
      widget = document.createElement('aside');
      widget.className = 'rt-monitor-widget';
      widget.setAttribute('aria-label', 'Monitoramento de chamados');
      widget.addEventListener('click', onWidgetClick);
      document.body.appendChild(widget);
    }
    widget.innerHTML = html;
    widget.hidden = !running;
  }

  function onWidgetClick(event) {
    const button = event.target.closest?.('button');
    if (!button) return;
    if (button.dataset.monitorAction === 'toggle-monitor') setMonitorEnabled(!monitorEnabled);
    if (button.dataset.monitorAction === 'toggle-sound') setSoundEnabled(!soundEnabled);
  }

  function removeOverlays() {
    banner?.remove(); banner = null;
    widget?.remove(); widget = null;
  }

  return {
    DEFAULT_QUERY,
    LIST_INTERVAL_MS,
    ALERT_MS,
    BASELINE_WINDOW_MS,
    init,
    start,
    stop,
    reset,
    refresh,
    subscribe,
    snapshot,
    getState: () => state(),
    getStatus: () => {
      const view = snapshot();
      return { state: view.state, label: view.label, message: view.message, lastSuccessAt: view.lastSuccessAt };
    },
    getAlert: () => currentAlert(),
    getQueue: () => queue.map(alert => ({ id: alert.id, ticket: alert.ticket, until: alert.until })),
    getData: () => lastData,
    accept,
    dismiss,
    syncAcks,
    isMonitorEnabled: () => monitorEnabled,
    isSoundEnabled: () => soundEnabled,
    setMonitorEnabled,
    setSoundEnabled,
    testSound: () => { ensureAudio(); playTone(); },
    removeOverlays,
    dismissBanner: () => { banner?.remove(); banner = null; },
    syncUi: () => emit('alert'),
    queryFor: () => DEFAULT_QUERY,
    parseOpenedAt,
  };
})();
