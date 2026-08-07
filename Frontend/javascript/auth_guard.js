/**
 * GLPI Control Center - auth_guard.js
 * -----------------------------------------------------------------------------
 * Guard de autenticação e proteção de rotas.
 *
 * Responsabilidades:
 * - Verificar se o usuário está autenticado antes de acessar rotas
 * - Verificar se o usuário tem permissão para acessar módulos
 * - Redirecionar para login quando necessário
 * - Bloquear acesso a módulos não permitidos
 * - Gerenciar estado de carregamento da autenticação
 *
 * NÃO realiza login/logout. Consulte auth.js.
 * NÃO gerencia sessão. Consulte user_context.js.
 * NÃO define permissões. Consulte permissions.js.
 *
 * Sprint 9.5: Google OAuth, Controle de Acesso e Perfis de Usuário
 */

window.AuthGuard = (function () {

  // ── Estado ───────────────────────────────────────────────────────────────

  let _initialized = false;
  let _checking = false;

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Inicializa o AuthGuard.
   * Verifica sessão existente e configura monitoramento.
   * @returns {boolean} true se há sessão válida
   */
  function init() {
    if (_initialized) return window.UserContext.isAuthenticated();

    _initialized = true;

    // Tentar restaurar sessão do localStorage
    const restored = window.UserContext.restoreSession();

    if (restored) {
      _startSessionMonitor();
    }

    return restored;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VERIFICAÇÃO DE AUTENTICAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Verifica se o usuário está autenticado.
   * Se não estiver, redireciona para login.
   * @returns {boolean}
   */
  function checkAuth() {
    if (window.UserContext.isAuthenticated()) {
      return true;
    }

    _showLoginScreen();
    return false;
  }

  /**
   * Verifica se o usuário pode acessar um módulo específico.
   * @param {string} moduleKey
   * @returns {boolean}
   */
  function checkModule(moduleKey) {
    if (!checkAuth()) return false;

    if (!window.UserContext.canAccessModule(moduleKey)) {
      _showAccessDenied(moduleKey);
      return false;
    }

    return true;
  }

  /**
   * Verifica se o usuário pode executar uma ação.
   * @param {string} moduleKey
   * @param {string} action
   * @returns {boolean}
   */
  function checkAction(moduleKey, action) {
    if (!checkAuth()) return false;

    if (!window.UserContext.canDo(moduleKey, action)) {
      return false;
    }

    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROTEÇÃO DE ROTA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Protege uma rota/módulo.
   * Retorna true se acesso permitido, false caso contrário.
   * @param {string} moduleKey
   * @returns {boolean}
   */
  function guard(moduleKey) {
    // Verificar autenticação
    if (!window.UserContext.isAuthenticated()) {
      _emit('guard:unauthenticated', { module: moduleKey });
      _showLoginScreen();
      return false;
    }

    // Verificar se sessão não expirou
    if (!window.UserContext.isSessionValid()) {
      window.UserContext.invalidate();
      _emit('guard:expired', { module: moduleKey });
      _showLoginScreen();
      return false;
    }

    // Verificar permissão do módulo
    if (moduleKey && !window.UserContext.canAccessModule(moduleKey)) {
      _emit('guard:denied', { module: moduleKey });
      _showAccessDenied(moduleKey);
      return false;
    }

    _emit('guard:passed', { module: moduleKey });
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MONITORAMENTO DE SESSÃO
  // ══════════════════════════════════════════════════════════════════════════

  let _sessionMonitorInterval = null;

  function _startSessionMonitor() {
    _stopSessionMonitor();

    const config = window.AUTH_CONFIG?.session || {};
    const interval = config.tokenRefreshIntervalMs || 1800000; // 30 min

    _sessionMonitorInterval = setInterval(function () {
      if (!window.UserContext.isAuthenticated()) {
        _stopSessionMonitor();
        _showLoginScreen();
        return;
      }

      // Renovar sessão
      const renewed = window.UserContext.refreshSession();
      if (!renewed) {
        _stopSessionMonitor();
        _showLoginScreen();
      }
    }, interval);
  }

  function _stopSessionMonitor() {
    if (_sessionMonitorInterval) {
      clearInterval(_sessionMonitorInterval);
      _sessionMonitorInterval = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UI
  // ══════════════════════════════════════════════════════════════════════════

  function _showLoginScreen() {
    if (window.App?.showLoginScreen) {
      window.App.showLoginScreen();
    }
  }

  function _showAccessDenied(moduleKey) {
    const moduleName = window.Permissions?.getModules()?.[moduleKey]?.label || moduleKey;
    console.warn(`[AuthGuard] Acesso negado ao módulo: ${moduleName}`);

    _emit('guard:access-denied', { module: moduleKey, moduleName });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  function _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init,
    checkAuth,
    checkModule,
    checkAction,
    guard,
  };

})();
