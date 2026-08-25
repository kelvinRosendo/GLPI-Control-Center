/**
 * GLPI Control Center - audit.js
 * -----------------------------------------------------------------------------
 * Core do Sistema de Auditoria.
 *
 * Responsabilidades:
 * - Registrar eventos (padrão Singleton via window.Audit)
 * - Enriquecer eventos com contexto (usuário, browser, IP preparado)
 * - Consulta e busca com filtros
 * - Geração de IDs únicos
 * - Comunicação via CustomEvents
 *
 * NÃO persiste dados. Consulte audit_storage.js.
 * NÃO renderiza UI. Consulte audit_ui.js.
 *
 * Sprint 9: Auditoria Avançada e Linha do Tempo Global
 */

window.Audit = (function () {
  // ── Estado interno ─────────────────────────────────────────────────────

  const _listeners = [];
  let _initialized = false;

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Inicializa o módulo de auditoria.
   * Registra listener global de erros e eventos customizados.
   */
  function init() {
    if (_initialized) return;
    _initialized = true;

    // Listener global de erros não capturados
    window.addEventListener('error', function (e) {
      register({
        action: 'erro',
        module: 'app',
        severity: 'error',
        descricao: `Erro não capturado: ${e.message}`,
        extras: { filename: e.filename, lineno: e.lineno, colno: e.colno },
      });
    });

    // Listener de rejeições de promise não tratadas
    window.addEventListener('unhandledrejection', function (e) {
      register({
        action: 'erro',
        module: 'app',
        severity: 'error',
        descricao: `Promise rejeitada: ${e.reason}`,
        extras: { reason: String(e.reason) },
      });
    });

    console.log('[Audit] Sistema de auditoria inicializado');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GERAÇÃO DE IDs
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Gera um ID único para o registro de auditoria.
   * @returns {string}
   */
  function generateId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ENRIQUECIMENTO DE CONTEXTO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Obtém o usuário logado atual.
   * @returns {string}
   */
  function _getCurrentUser() {
    try {
      // Usar UserContext (Sprint 9.5) se disponível
      if (window.UserContext?.isAuthenticated()) {
        const user = window.UserContext.getCurrentUser();
        return user?.nome || user?.email || 'desconhecido';
      }
      // Fallback para estado antigo
      if (window.STATE?.auth?.currentUser) {
        return window.STATE.auth.currentUser.name || window.STATE.auth.currentUser.login || 'desconhecido';
      }
    } catch {}
    return 'sistema';
  }

  /**
   * Obtém informações do browser.
   * @returns {object}
   */
  function _getBrowserInfo() {
    const nav = navigator;
    return {
      userAgent: nav.userAgent,
      language: nav.language,
      platform: nav.platform,
      cookieEnabled: nav.cookieEnabled,
      screenResolution: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    };
  }

  /**
   * Obtém IP (preparado para implementação futura).
   * @returns {string|null}
   */
  function _getIP() {
    // Preparado: implementar via endpoint de backend quando disponível
    return null;
  }

  /**
   * Obtém versão do sistema (preparado para implementação futura).
   * @returns {string}
   */
  function _getSystemVersion() {
    return '1.0.0';
  }

  /**
   * Obtém ID da sessão (preparado para implementação futura).
   * @returns {string}
   */
  function _getSessionId() {
    try {
      if (!window._auditSessionId) {
        window._auditSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      }
      return window._auditSessionId;
    } catch {
      return 'unknown';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REGISTRO DE EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Registra um evento de auditoria.
   *
   * @param {object} params
   * @param {string} params.action - Chave da ação (ex: 'login', 'chamado_aberto')
   * @param {string} params.module - Módulo de origem
   * @param {string} [params.severity] - Severidade (override da config padrão)
   * @param {string} [params.descricao] - Descrição legível do evento
   * @param {string} [params.equipamento] - Nome do equipamento
   * @param {string} [params.fornecedor] - Nome do fornecedor
   * @param {string} [params.usuario] - Usuário envolvido (override)
   * @param {object} [params.extras] - Dados adicionais
   * @param {string} [params.result] - Resultado da operação
   *
   * @returns {object} O registro criado
   */
  function register(params) {
    if (!params || !params.action) {
      console.warn('[Audit] Tentativa de registro sem ação definida');
      return null;
    }

    const actionConfig = window.AUDIT_CONFIG.getAction(params.action);
    const categoryKey = actionConfig ? actionConfig.category : (params.module || 'sistema');
    const categoryConfig = window.AUDIT_CONFIG.getCategory(categoryKey);
    const severityKey = params.severity || (actionConfig && actionConfig.defaultSeverity) || 'info';
    const severityConfig = window.AUDIT_CONFIG.getSeverity(severityKey);

    const record = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      usuario: params.usuario || _getCurrentUser(),
      categoria: categoryKey,
      modulo: params.module || categoryKey,
      acao: params.action,
      acaoLabel: actionConfig ? actionConfig.label : params.action,
      result: params.result || 'ok',
      equipamento: params.equipamento || null,
      fornecedor: params.fornecedor || null,
      descricao: params.descricao || (actionConfig ? actionConfig.label : params.action),
      dados: params.dados || params.extras || null,
      origem: params.origem || 'frontend',
      ip: _getIP(),
      browser: _getBrowserInfo(),
      severity: severityKey,
      severityColor: severityConfig ? severityConfig.color : '#4f7ef7',
      categoryIcon: categoryConfig ? categoryConfig.icon : '&#9881;',
      categoryColor: categoryConfig ? categoryConfig.color : '#9299b8',
      versaoSistema: _getSystemVersion(),
      sessionId: _getSessionId(),
    };

    // Persistir
    window.AuditStorage.addRecord(record);

    // Notificar UI via CustomEvent
    window.dispatchEvent(new CustomEvent('audit:event-recorded', {
      detail: { record },
    }));

    // Notificar listeners registrados
    _listeners.forEach(function (listener) {
      try {
        listener(record);
      } catch (e) {
        console.warn('[Audit] Erro no listener:', e);
      }
    });

    return record;
  }

  /**
   * Convenience: registra uma ação simples.
   * @param {string} action - Chave da ação
   * @param {object} [extra] - Parâmetros extras
   * @returns {object}
   */
  function log(action, extra) {
    return register({ action, ...extra });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSULTA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todos os registros.
   * @returns {array}
   */
  function getAll() {
    return window.AuditStorage.getAll();
  }

  /**
   * Retorna registros paginados.
   * @param {number} page
   * @param {number} pageSize
   * @returns {object}
   */
  function getPaginated(page, pageSize) {
    return window.AuditStorage.getPaginated(page, pageSize);
  }

  /**
   * Busca registros com filtros avançados.
   * @param {object} filters
   * @returns {object}
   */
  function query(filters) {
    return window.AuditStorage.query(filters);
  }

  /**
   * Retorna estatísticas gerais.
   * @returns {object}
   */
  function getStats() {
    return window.AuditStorage.getStats();
  }

  /**
   * Retorna registro por ID.
   * @param {string} id
   * @returns {object|null}
   */
  function getById(id) {
    const all = window.AuditStorage.getAll();
    return all.find(function (r) { return r.id === id; }) || null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LISTENERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Registra um callback para novos eventos.
   * @param {function} callback
   * @returns {function} Função para remover o listener
   */
  function onEvent(callback) {
    _listeners.push(callback);
    return function () {
      const idx = _listeners.indexOf(callback);
      if (idx > -1) _listeners.splice(idx, 1);
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init: init,
    register: register,
    log: log,
    getAll: getAll,
    getPaginated: getPaginated,
    query: query,
    getStats: getStats,
    getById: getById,
    onEvent: onEvent,
    generateId: generateId,
  };
})();
