/**
 * GLPI Control Center - error-handler.js
 * -----------------------------------------------------------------------------
 * Sistema centralizado de tratamento de erros.
 *
 * Captura, categoriza e gerencia erros de forma consistente.
 * Integra com Audit para registro e ErrorUI para feedback visual.
 *
 * Sprint 24: Error Handling
 */

window.ErrorHandler = (function () {
  'use strict';

  let _initialized = false;
  let _listeners = [];
  const _errorQueue = [];
  const MAX_QUEUE_SIZE = 50;

  // ════════════════════════════════════════════════════════════════════════════
  // CATEGORIAS DE ERRO
  // ════════════════════════════════════════════════════════════════════════════

  const CATEGORIES = {
    NETWORK: { label: 'Rede', icon: '&#127760;', color: '#f7768e' },
    AUTH: { label: 'Autenticação', icon: '&#128274;', color: '#ff9e64' },
    VALIDATION: { label: 'Validação', icon: '&#9888;', color: '#e0af68' },
    RENDER: { label: 'Renderização', icon: '&#128196;', color: '#bb9af7' },
    DATA: { label: 'Dados', icon: '&#128190;', color: '#7dcfff' },
    PERMISSION: { label: 'Permissão', icon: '&#128272;', color: '#f7768e' },
    UNKNOWN: { label: 'Desconhecido', icon: '&#10067;', color: '#565f89' },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    if (_initialized) return;
    _initialized = true;

    _captureGlobalErrors();
    _captureUnhandledRejections();
  }

  function _captureGlobalErrors() {
    window.addEventListener('error', function (event) {
      const error = {
        message: event.message || 'Erro desconhecido',
        filename: event.filename || '',
        lineno: event.lineno || 0,
        colno: event.colno || 0,
        error: event.error || null,
      };

      handle({
        type: 'global',
        category: _categorizeError(error),
        message: error.message,
        source: error.filename,
        line: error.lineno,
        stack: error.error?.stack || '',
        severity: 'error',
      });

      return false;
    });
  }

  function _captureUnhandledRejections() {
    window.addEventListener('unhandledrejection', function (event) {
      const reason = event.reason || {};

      handle({
        type: 'unhandledrejection',
        category: _categorizeError(reason),
        message: reason.message || String(reason) || 'Promise rejeitada',
        stack: reason.stack || '',
        severity: 'error',
      });
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TRATAMENTO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Trata um erro.
   * @param {object} error - Objeto de erro
   * @returns {object} Erro processado
   */
  function handle(error) {
    const processed = {
      id: _generateId(),
      timestamp: new Date().toISOString(),
      type: error.type || 'app',
      category: error.category || 'UNKNOWN',
      message: error.message || 'Erro desconhecido',
      details: error.details || null,
      source: error.source || '',
      stack: error.stack || '',
      severity: error.severity || 'error',
      module: error.module || '',
      user: _getCurrentUser(),
      context: error.context || {},
    };

    // Adicionar à fila
    _addToQueue(processed);

    // Registrar em audit
    _logToAudit(processed);

    // Notificar listeners
    _notifyListeners(processed);

    // Mostrar UI se severidade alta
    if (processed.severity === 'error' || processed.severity === 'critical') {
      _showErrorUI(processed);
    }

    return processed;
  }

  /**
   * Trata erro de rede.
   * @param {string} message - Mensagem
   * @param {object} context - Contexto adicional
   * @returns {object}
   */
  function handleNetwork(message, context = {}) {
    return handle({
      type: 'network',
      category: 'NETWORK',
      message,
      severity: 'error',
      context,
    });
  }

  /**
   * Trata erro de autenticação.
   * @param {string} message - Mensagem
   * @returns {object}
   */
  function handleAuth(message) {
    return handle({
      type: 'auth',
      category: 'AUTH',
      message,
      severity: 'warning',
    });
  }

  /**
   * Trata erro de validação.
   * @param {string} message - Mensagem
   * @param {object} context - Campo(s) com erro
   * @returns {object}
   */
  function handleValidation(message, context = {}) {
    return handle({
      type: 'validation',
      category: 'VALIDATION',
      message,
      severity: 'warning',
      context,
    });
  }

  /**
   * Trata erro de permissão.
   * @param {string} message - Mensagem
   * @returns {object}
   */
  function handlePermission(message) {
    return handle({
      type: 'permission',
      category: 'PERMISSION',
      message,
      severity: 'warning',
    });
  }

  /**
   * Registra uma mensagem informativa.
   * @param {string} message
   * @param {object} context
   * @returns {object}
   */
  function info(message, context = {}) {
    return handle({
      type: 'info',
      category: 'UNKNOWN',
      message,
      severity: 'info',
      context,
    });
  }

  /**
   * Registra um aviso.
   * @param {string} message
   * @param {object} context
   * @returns {object}
   */
  function warn(message, context = {}) {
    return handle({
      type: 'warning',
      category: 'UNKNOWN',
      message,
      severity: 'warning',
      context,
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // WRAPPER PARA ASYNC
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Captura erros em funções async.
   * @param {Function} fn - Função async
   * @param {object} options - Opções: module, onerror
   * @returns {Function}
   */
  function wrapAsync(fn, options = {}) {
    return async function (...args) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        const processed = handle({
          type: 'async',
          category: _categorizeError(error),
          message: error.message || 'Erro assíncrono',
          stack: error.stack || '',
          severity: 'error',
          module: options.module || '',
          context: { args: args.slice(0, 3) },
        });

        if (options.onerror) options.onerror(processed);
        throw error;
      }
    };
  }

  /**
   * Captura erros em funções síncronas.
   * @param {Function} fn - Função
   * @param {object} options - Opções: module, onerror, fallback
   * @returns {Function}
   */
  function wrapSync(fn, options = {}) {
    return function (...args) {
      try {
        return fn.apply(this, args);
      } catch (error) {
        const processed = handle({
          type: 'sync',
          category: _categorizeError(error),
          message: error.message || 'Erro síncrono',
          stack: error.stack || '',
          severity: 'error',
          module: options.module || '',
          context: { args: args.slice(0, 3) },
        });

        if (options.onerror) options.onerror(processed);
        return options.fallback;
      }
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CATEGORIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function _categorizeError(error) {
    const msg = (error.message || error || '').toLowerCase();
    const stack = (error.stack || '').toLowerCase();

    if (msg.includes('network') || msg.includes('fetch') || msg.includes('cors') || msg.includes('offline')) {
      return 'NETWORK';
    }
    if (msg.includes('auth') || msg.includes('token') || msg.includes('session') || msg.includes('login')) {
      return 'AUTH';
    }
    if (msg.includes('permission') || msg.includes('access denied') || msg.includes('403')) {
      return 'PERMISSION';
    }
    if (msg.includes('validation') || msg.includes('invalid') || msg.includes('required')) {
      return 'VALIDATION';
    }
    if (msg.includes('render') || msg.includes('dom') || msg.includes('null is not')) {
      return 'RENDER';
    }
    if (msg.includes('data') || msg.includes('parse') || msg.includes('json')) {
      return 'DATA';
    }

    return 'UNKNOWN';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AUDIT
  // ════════════════════════════════════════════════════════════════════════════

  function _logToAudit(error) {
    if (window.Audit) {
      window.Audit.log({
        action: 'error_handled',
        module: error.module || 'app',
        descricao: `[${error.category}] ${error.message}`,
        severity: error.severity,
        dados: {
          errorId: error.id,
          type: error.type,
          source: error.source,
          stack: error.stack?.substring(0, 500),
        },
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UI
  // ════════════════════════════════════════════════════════════════════════════

  function _showErrorUI(error) {
    if (window.ErrorUI) {
      window.ErrorUI.showError(error);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FILA E LISTENERS
  // ════════════════════════════════════════════════════════════════════════════

  function _addToQueue(error) {
    _errorQueue.push(error);
    if (_errorQueue.length > MAX_QUEUE_SIZE) {
      _errorQueue.shift();
    }
  }

  function _notifyListeners(error) {
    _listeners.forEach(fn => {
      try { fn(error); } catch (e) { /* Ignorar */ }
    });
    document.dispatchEvent(new CustomEvent('error:handled', { detail: error }));
  }

  /**
   * Registra listener para erros.
   * @param {Function} fn
   * @returns {Function} Unsubscribe
   */
  function onError(fn) {
    _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(l => l !== fn);
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ════════════════════════════════════════════════════════════════════════════

  function getQueue() { return [..._errorQueue]; }
  function getQueueSize() { return _errorQueue.length; }
  function clearQueue() { _errorQueue.length = 0; }
  function getCategory(key) { return CATEGORIES[key] || CATEGORIES.UNKNOWN; }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  function _generateId() {
    return 'err_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
  }

  function _getCurrentUser() {
    return window.UserContext?.getCurrentUser?.()?.email || 'unknown';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    handle,
    handleNetwork,
    handleAuth,
    handleValidation,
    handlePermission,
    info,
    warn,
    wrapAsync,
    wrapSync,
    onError,
    getQueue,
    getQueueSize,
    clearQueue,
    getCategory,
  };
})();
