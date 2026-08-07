/**
 * GLPI Control Center - notifications_events.js
 * -----------------------------------------------------------------------------
 * Event Bus para o sistema de notificações.
 *
 * Implementa o padrão Observer/Event Bus para desacoplamento completo
 * entre módulos. Nenhum módulo conhece diretamente outro.
 *
 * Fluxo:
 *   Módulo → NotificationEvents.dispatch() → Listeners → Notifications.receive()
 *
 * Sprint 10: Central de Notificações Inteligentes
 */

window.NotificationEvents = (function () {

  // ── Estado ───────────────────────────────────────────────────────────────

  const _listeners = {};
  let _eventLog = [];
  const MAX_LOG_SIZE = 200;

  // ══════════════════════════════════════════════════════════════════════════
  // SUBSCRIBE / UNSUBSCRIBE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Escuta um evento.
   * @param {string} eventName - Nome do evento (ex: 'workflow:created')
   * @param {Function} callback - Função chamada quando evento ocorre
   * @returns {Function} Função para cancelar inscrição
   */
  function on(eventName, callback) {
    if (!_listeners[eventName]) {
      _listeners[eventName] = [];
    }
    _listeners[eventName].push(callback);

    // Retornar função de unsubscribe
    return function unsubscribe() {
      off(eventName, callback);
    };
  }

  /**
   * Remove inscrição de um evento.
   * @param {string} eventName
   * @param {Function} callback
   */
  function off(eventName, callback) {
    if (!_listeners[eventName]) return;
    _listeners[eventName] = _listeners[eventName].filter(cb => cb !== callback);
  }

  /**
   * Escuta um evento apenas uma vez.
   * @param {string} eventName
   * @param {Function} callback
   * @returns {Function}
   */
  function once(eventName, callback) {
    const wrapper = function (data) {
      off(eventName, wrapper);
      callback(data);
    };
    return on(eventName, wrapper);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISPATCH
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Dispara um evento para todos os listeners.
   * @param {string} eventName - Nome do evento
   * @param {object} data - Dados do evento
   */
  function dispatch(eventName, data) {
    const eventData = {
      event: eventName,
      timestamp: new Date().toISOString(),
      data: data || {},
    };

    // Registrar no log
    _addToLog(eventData);

    // Notificar listeners específicos
    const listeners = _listeners[eventName] || [];
    listeners.forEach(function (callback) {
      try {
        callback(eventData);
      } catch (e) {
        console.error(`[NotificationEvents] Erro no listener de "${eventName}":`, e);
      }
    });

    // Notificar listeners globais (wildcard *)
    const globalListeners = _listeners['*'] || [];
    globalListeners.forEach(function (callback) {
      try {
        callback(eventData);
      } catch (e) {
        console.error('[NotificationEvents] Erro no listener global:', e);
      }
    });

    // Notificar listeners de categoria (ex: 'workflow:*')
    const category = eventName.split(':')[0];
    const categoryListeners = _listeners[`${category}:*`] || [];
    categoryListeners.forEach(function (callback) {
      try {
        callback(eventData);
      } catch (e) {
        console.error(`[NotificationEvents] Erro no listener de categoria "${category}:*":`, e);
      }
    });

    return eventData;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MÉTODOS DE CONVENIÊNCIA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Dispatch de evento de workflow.
   */
  function dispatchWorkflow(action, data) {
    return dispatch(`workflow:${action}`, {
      module: 'workflow',
      ...data,
    });
  }

  /**
   * Dispatch de evento de projetor.
   */
  function dispatchProjector(action, data) {
    return dispatch(`projectors:${action}`, {
      module: 'projectors',
      ...data,
    });
  }

  /**
   * Dispatch de evento de relatório.
   */
  function dispatchReport(action, data) {
    return dispatch(`reports:${action}`, {
      module: 'reports',
      ...data,
    });
  }

  /**
   * Dispatch de evento de autenticação.
   */
  function dispatchAuth(action, data) {
    return dispatch(`auth:${action}`, {
      module: 'auth',
      ...data,
    });
  }

  /**
   * Dispatch de evento de integração.
   */
  function dispatchIntegration(action, data) {
    return dispatch(`integrations:${action}`, {
      module: 'integrations',
      ...data,
    });
  }

  /**
   * Dispatch de evento de dashboard.
   */
  function dispatchDashboard(action, data) {
    return dispatch(`dashboard:${action}`, {
      module: 'dashboard',
      ...data,
    });
  }

  /**
   * Dispatch de evento de sistema.
   */
  function dispatchSystem(action, data) {
    return dispatch(`system:${action}`, {
      module: 'system',
      ...data,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOG
  // ══════════════════════════════════════════════════════════════════════════

  function _addToLog(eventData) {
    _eventLog.push(eventData);
    if (_eventLog.length > MAX_LOG_SIZE) {
      _eventLog = _eventLog.slice(-MAX_LOG_SIZE);
    }
  }

  /**
   * Retorna os últimos eventos registrados.
   * @param {number} limit
   * @returns {Array}
   */
  function getEventLog(limit) {
    return _eventLog.slice(-(limit || MAX_LOG_SIZE));
  }

  /**
   * Limpa o log de eventos.
   */
  function clearLog() {
    _eventLog = [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEBUG
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna estatísticas dos listeners.
   */
  function getStats() {
    const stats = {};
    Object.keys(_listeners).forEach(function (key) {
      stats[key] = _listeners[key].length;
    });
    return {
      totalEvents: _eventLog.length,
      totalListeners: Object.keys(_listeners).reduce(function (acc, key) {
        return acc + _listeners[key].length;
      }, 0),
      listenersByEvent: stats,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    on,
    off,
    once,
    dispatch,
    dispatchWorkflow,
    dispatchProjector,
    dispatchReport,
    dispatchAuth,
    dispatchIntegration,
    dispatchDashboard,
    dispatchSystem,
    getEventLog,
    clearLog,
    getStats,
  };

})();
