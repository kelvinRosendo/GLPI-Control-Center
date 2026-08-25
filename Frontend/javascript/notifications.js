/**
 * GLPI Control Center - notifications.js
 * -----------------------------------------------------------------------------
 * Módulo principal de notificações.
 *
 * Coordena recebimento, processamento, armazenamento e distribuição
 * de notificações. Atua como orquestrador entre:
 *   - NotificationEvents (entrada)
 *   - NotificationsStorage (persistência)
 *   - NotificationTemplates (formatação)
 *   - NotificationsCenter (lógica de negócio)
 *   - NotificationsUI (renderização)
 *
 * Nenhum módulo conhece diretamente outro.
 * Toda comunicação ocorre via eventos.
 *
 * Sprint 10: Central de Notificações Inteligentes
 */

window.Notifications = (function () {

  // ── Estado ───────────────────────────────────────────────────────────────

  let _initialized = false;
  let _listeners = [];

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Inicializa o módulo de notificações.
   * Registra listeners para todos os eventos automáticos.
   */
  function init() {
    if (_initialized) return;

    _initialized = true;

    // Registrar listeners para eventos automáticos
    _registerEventListeners();

    // Executar manutenção inicial
    window.NotificationsStorage.maintenance();

    // Iniciar limpeza periódica
    _startPeriodicCleanup();

    // Escutar eventos do sistema de audit (desacoplado)
    _listenToAuditEvents();

    console.log('[Notifications] Módulo inicializado');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RECEBIMENTO DE NOTIFICAÇÕES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Recebe uma notificação e a processa.
   * Método principal de entrada para novas notificações.
   *
   * @param {object} notification - Dados da notificação
   * @param {string} notification.eventKey - Chave do evento (ex: 'WORKFLOW_CREATED')
   * @param {object} notification.data - Dados do evento
   * @param {string} notification.usuario - Nome do usuário
   * @param {string} notification.origem - Módulo de origem
   * @returns {object} Notificação processada e salva
   */
  function receive(notification) {
    const config = window.NOTIFICATIONS_CONFIG;
    const eventConfig = config.getEventConfig(notification.eventKey);

    if (!eventConfig && !notification.titulo) {
      console.warn('[Notifications] Evento desconhecido:', notification.eventKey);
      return null;
    }

    // Aplicar template se disponível
    let titulo, mensagem, acao;
    if (eventConfig?.template) {
      const templated = window.NotificationTemplates.apply(eventConfig.template, notification.data || {});
      titulo = templated.titulo;
      mensagem = templated.mensagem;
      acao = templated.acao;
    } else {
      titulo = notification.titulo || 'Notificação';
      mensagem = notification.mensagem || '';
      acao = notification.acao || null;
    }

    // Montar objeto de notificação
    const notif = {
      id: _generateId(),
      titulo: titulo,
      mensagem: mensagem,
      categoria: notification.categoria || eventConfig?.category || 'INFO',
      tipo: notification.tipo || eventConfig?.type || 'info',
      icone: notification.icone || eventConfig?.icon || config.getIcon(notification.origem),
      usuario: notification.usuario || window.UserContext?.getCurrentUser()?.nome || 'Sistema',
      dataHora: new Date().toISOString(),
      origem: notification.origem || 'system',
      prioridade: notification.prioridade || eventConfig?.priority || 'NORMAL',
      lida: false,
      acao: acao || notification.acao || null,
      dados: notification.data || {},
      expiracao: notification.expiracao || null,
    };

    // Salvar no storage
    window.NotificationsStorage.save(notif);

    // Notificar UI
    _emit('notifications:new', notif);

    // Atualizar badge
    _updateBadge();

    // Registrar em auditoria (desacoplado)
    _auditNotification(notif);

    return notif;
  }

  /**
   * Cria notificação diretamente (sem template).
   * Útil para notificações manuais ou customizadas.
   */
  function create(data) {
    return receive({
      eventKey: data.eventKey || 'GENERIC',
      titulo: data.titulo,
      mensagem: data.mensagem,
      categoria: data.categoria,
      tipo: data.tipo,
      icone: data.icone,
      usuario: data.usuario,
      origem: data.origem,
      prioridade: data.prioridade,
      acao: data.acao,
      data: data.dados,
      expiracao: data.expiracao,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AÇÕES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Marca uma notificação como lida.
   * @param {string} id
   */
  function markAsRead(id) {
    const notif = window.NotificationsStorage.findById(id);
    if (!notif) return;

    notif.lida = true;
    notif.dataLeitura = new Date().toISOString();
    window.NotificationsStorage.save(notif);

    _emit('notifications:read', notif);
    _updateBadge();
  }

  /**
   * Marca todas as notificações como lidas.
   */
  function markAllAsRead() {
    const unread = window.NotificationsStorage.findUnread();
    unread.forEach(function (n) {
      n.lida = true;
      n.dataLeitura = new Date().toISOString();
    });
    window.NotificationsStorage.saveAll(unread);

    _emit('notifications:read-all', { count: unread.length });
    _updateBadge();
  }

  /**
   * Exclui uma notificação.
   * @param {string} id
   */
  function dismiss(id) {
    window.NotificationsStorage.remove(id);
    _emit('notifications:dismiss', { id });
    _updateBadge();
  }

  /**
   * Exclui todas as notificações.
   */
  function dismissAll() {
    window.NotificationsStorage.clear();
    _emit('notifications:dismiss-all', {});
    _updateBadge();
  }

  /**
   * Executa a ação associada a uma notificação.
   * @param {string} id
   */
  function executeAction(id) {
    const notif = window.NotificationsStorage.findById(id);
    if (!notif?.acao) return;

    const actionConfig = window.NOTIFICATIONS_CONFIG.getAction(notif.acao.tipo);
    if (!actionConfig) return;

    // Navegar para a rota
    if (actionConfig.route && window.App?.go) {
      window.App.go(actionConfig.route);
    }

    _emit('notifications:action', { id, action: notif.acao });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSULTAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todas as notificações.
   */
  function getAll() {
    return window.NotificationsStorage.findAll();
  }

  /**
   * Retorna contagem de não lidas.
   */
  function getUnreadCount() {
    return window.NotificationsStorage.countUnread();
  }

  /**
   * Retorna notificações agrupadas por data.
   */
  function getGrouped() {
    return window.NotificationsStorage.findByDateGroups();
  }

  /**
   * Busca notificações.
   */
  function search(query) {
    return window.NotificationsStorage.search(query);
  }

  /**
   * Retorna notificações por filtro.
   */
  function getFiltered(filterKey) {
    const filterConfig = window.NOTIFICATIONS_CONFIG.getFilter(filterKey);
    if (!filterConfig?.filter) return window.NotificationsStorage.findAll();
    return window.NotificationsStorage.findAll().filter(filterConfig.filter);
  }

  /**
   * Retorna estatísticas.
   */
  function getStats() {
    return window.NotificationsStorage.getStats();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS (MÓDULOS EXTERNOS)
  // ══════════════════════════════════════════════════════════════════════════

  function _registerEventListeners() {
    const events = window.NOTIFICATIONS_CONFIG.events;
    const Event = window.NotificationEvents;

    // Workflow
    Event.on('workflow:created', function (e) {
      receive({ eventKey: 'WORKFLOW_CREATED', data: e.data, origem: 'workflow' });
    });
    Event.on('workflow:cancelled', function (e) {
      receive({ eventKey: 'WORKFLOW_CANCELLED', data: e.data, origem: 'workflow' });
    });
    Event.on('workflow:completed', function (e) {
      receive({ eventKey: 'WORKFLOW_COMPLETED', data: e.data, origem: 'workflow' });
    });
    Event.on('workflow:error', function (e) {
      receive({ eventKey: 'WORKFLOW_ERROR', data: e.data, origem: 'workflow' });
    });

    // Projetores
    Event.on('projectors:lamp_high', function (e) {
      receive({ eventKey: 'PROJECTOR_LAMP_HIGH', data: e.data, origem: 'projectors' });
    });
    Event.on('projectors:lamp_critical', function (e) {
      receive({ eventKey: 'PROJECTOR_LAMP_CRITICAL', data: e.data, origem: 'projectors' });
    });
    Event.on('projectors:maint_overdue', function (e) {
      receive({ eventKey: 'PROJECTOR_MAINT_OVERDUE', data: e.data, origem: 'projectors' });
    });
    Event.on('projectors:maint_done', function (e) {
      receive({ eventKey: 'PROJECTOR_MAINT_DONE', data: e.data, origem: 'projectors' });
    });

    // Dashboard
    Event.on('dashboard:updated', function (e) {
      receive({ eventKey: 'DASHBOARD_UPDATED', data: e.data, origem: 'dashboard' });
    });
    Event.on('dashboard:error', function (e) {
      receive({ eventKey: 'DASHBOARD_ERROR', data: e.data, origem: 'dashboard' });
    });

    // Relatórios
    Event.on('reports:exported', function (e) {
      receive({ eventKey: 'REPORT_EXPORTED', data: e.data, origem: 'reports' });
    });
    Event.on('reports:viewed', function (e) {
      receive({ eventKey: 'REPORT_VIEWED', data: e.data, origem: 'reports' });
    });
    Event.on('reports:error', function (e) {
      receive({ eventKey: 'REPORT_ERROR', data: e.data, origem: 'reports' });
    });

    // Auth
    Event.on('auth:login', function (e) {
      receive({ eventKey: 'AUTH_LOGIN', data: e.data, origem: 'auth' });
    });
    Event.on('auth:logout', function (e) {
      receive({ eventKey: 'AUTH_LOGOUT', data: e.data, origem: 'auth' });
    });
    Event.on('auth:session_expired', function (e) {
      receive({ eventKey: 'AUTH_SESSION_EXPIRED', data: e.data, origem: 'auth' });
    });
    Event.on('auth:domain_denied', function (e) {
      receive({ eventKey: 'AUTH_DOMAIN_DENIED', data: e.data, origem: 'auth' });
    });

    // Integrações
    Event.on('integrations:started', function (e) {
      receive({ eventKey: 'INTEGRATION_STARTED', data: e.data, origem: 'integrations' });
    });
    Event.on('integrations:success', function (e) {
      receive({ eventKey: 'INTEGRATION_SUCCESS', data: e.data, origem: 'integrations' });
    });
    Event.on('integrations:error', function (e) {
      receive({ eventKey: 'INTEGRATION_ERROR', data: e.data, origem: 'integrations' });
    });
    Event.on('integrations:cancelled', function (e) {
      receive({ eventKey: 'INTEGRATION_CANCELLED', data: e.data, origem: 'integrations' });
    });
  }

  function _listenToAuditEvents() {
    // Escutar eventos de auditoria de forma desacoplada
    if (window.NotificationEvents) {
      window.NotificationEvents.on('audit:*', function (e) {
        // Notificar sobre erros de auditoria
        if (e.data?.severity === 'error' || e.data?.tipo === 'error') {
          receive({
            eventKey: 'GENERIC',
            titulo: 'Erro de Auditoria',
            mensagem: e.data?.descricao || 'Erro registrado no sistema de auditoria.',
            categoria: 'AUDIT',
            tipo: 'error',
            origem: 'audit',
            data: e.data,
          });
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUDITORIA DESACOPLADA
  // ══════════════════════════════════════════════════════════════════════════

  function _auditNotification(notif) {
    // Desacoplado: apenas registra se Audit existir
    if (window.Audit?.log) {
      window.Audit.log({
        action: 'notification_created',
        module: 'notifications',
        descricao: `Notificação: ${notif.titulo}`,
        usuario: notif.usuario,
        dados: { notificationId: notif.id, categoria: notif.categoria },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BADGE
  // ══════════════════════════════════════════════════════════════════════════

  function _updateBadge() {
    const count = window.NotificationsStorage.countUnread();
    _emit('notifications:badge', { count });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIMPEZA
  // ══════════════════════════════════════════════════════════════════════════

  let _cleanupInterval = null;

  function _startPeriodicCleanup() {
    _stopPeriodicCleanup();

    const interval = window.NOTIFICATIONS_CONFIG?.storage?.cleanupIntervalMs || 3600000;

    _cleanupInterval = setInterval(function () {
      window.NotificationsStorage.maintenance();
    }, interval);
  }

  function _stopPeriodicCleanup() {
    if (_cleanupInterval) {
      clearInterval(_cleanupInterval);
      _cleanupInterval = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ══════════════════════════════════════════════════════════════════════════

  function _generateId() {
    return 'notif_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
  }

  function _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORTAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Exporta notificações como JSON.
   * @param {object} options - Filtros opcionais
   * @returns {string} JSON stringificado
   */
  function exportJSON(options = {}) {
    const notifications = _getFilteredForExport(options);
    return JSON.stringify(notifications, null, 2);
  }

  /**
   * Exporta notificações como CSV.
   * @param {object} options - Filtros opcionais
   * @returns {string} CSV formatado
   */
  function exportCSV(options = {}) {
    const notifications = _getFilteredForExport(options);
    const headers = ['ID', 'Título', 'Mensagem', 'Categoria', 'Tipo', 'Prioridade', 'Lida', 'Data/Hora', 'Usuário', 'Origem'];
    const rows = notifications.map(n => [
      n.id,
      `"${(n.titulo || '').replace(/"/g, '""')}"`,
      `"${(n.mensagem || '').replace(/"/g, '""')}"`,
      n.categoria,
      n.tipo,
      n.prioridade,
      n.lida ? 'Sim' : 'Não',
      n.dataHora,
      `"${(n.usuario || '').replace(/"/g, '""')}"`,
      `"${(n.origem || '').replace(/"/g, '""')}"`,
    ]);

    return [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  }

  /**
   * Exporta e faz download de notificações.
   * @param {string} format - 'json' ou 'csv'
   * @param {object} options - Filtros opcionais
   */
  function exportAndDownload(format = 'json', options = {}) {
    let content, filename, mimeType;

    if (format === 'csv') {
      content = exportCSV(options);
      filename = `notificacoes_${_getDateStr()}.csv`;
      mimeType = 'text/csv;charset=utf-8;';
    } else {
      content = exportJSON(options);
      filename = `notificacoes_${_getDateStr()}.json`;
      mimeType = 'application/json;charset=utf-8;';
    }

    const blob = new Blob(['\ufeff' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    _emit('notifications:exported', { format, count: _getFilteredForExport(options).length });
  }

  function _getFilteredForExport(options) {
    let notifications = window.NotificationsStorage.findAll();

    if (options.category) {
      notifications = notifications.filter(n => n.categoria === options.category);
    }
    if (options.startDate) {
      notifications = notifications.filter(n => new Date(n.dataHora) >= new Date(options.startDate));
    }
    if (options.endDate) {
      notifications = notifications.filter(n => new Date(n.dataHora) <= new Date(options.endDate));
    }
    if (options.unreadOnly) {
      notifications = notifications.filter(n => !n.lida);
    }

    return notifications;
  }

  function _getDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BADGES POR MÓDULO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna contagem de não lidas por categoria/módulo.
   * @returns {object} { WORKFLOW: 3, PROJECTORS: 1, ... }
   */
  function getUnreadByModule() {
    const unread = window.NotificationsStorage.findUnread();
    const counts = {};

    unread.forEach(n => {
      const cat = n.categoria || 'OTHER';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    return counts;
  }

  /**
   * Emite eventos de badge por módulo.
   */
  function _updateModuleBadges() {
    const counts = getUnreadByModule();
    _emit('notifications:moduleBadges', { counts });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init,
    receive,
    create,
    markAsRead,
    markAllAsRead,
    dismiss,
    dismissAll,
    executeAction,
    getAll,
    getUnreadCount,
    getGrouped,
    search,
    getFiltered,
    getStats,
    exportJSON,
    exportCSV,
    exportAndDownload,
    getUnreadByModule,
  };

})();
