/**
 * GLPI Control Center - user_context.js
 * -----------------------------------------------------------------------------
 * Contexto centralizado do usuário autenticado.
 *
 * Responsabilidades:
 * - Manter estado do usuário logado (nome, email, foto, perfil)
 * - Disponibilizar dados do usuário para todos os módulos
 * - Gerenciar sessão (criar, renovar, invalidar)
 * - Fornecer informações de permissões
 * - Serializar/desserializar sessão
 *
 * NÃO realiza login/logout. Consulte auth.js.
 * NÃO verifica permissões. Consulte permissions.js.
 * NÃO protege rotas. Consulte auth_guard.js.
 *
 * Sprint 9.5: Google OAuth, Controle de Acesso e Perfis de Usuário
 */

window.UserContext = (function () {

  // ── Estado interno ─────────────────────────────────────────────────────

  let _user = null;
  let _session = null;
  let _listeners = [];

  // ══════════════════════════════════════════════════════════════════════════
  // SESSÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Cria uma nova sessão para o usuário.
   * @param {object} googleUser - Dados retornados pelo Google
   * @param {string} profileKey - Perfil do usuário (RBAC)
   * @returns {object} Sessão criada
   */
  function createSession(googleUser, profileKey) {
    const now = new Date();
    const config = window.AUTH_CONFIG?.session || {};

    _user = {
      id: googleUser.sub || googleUser.id,
      nome: googleUser.name || googleUser.nome || 'Usuário',
      email: googleUser.email || '',
      foto: googleUser.picture || googleUser.foto || '',
      perfil: profileKey || 'SUPORTE',
      dominio: (googleUser.email || '').split('@')[1] || '',
      provedor: 'google',
    };

    _session = {
      token: googleUser.access_token || googleUser.id_token || '',
      createdAt: now.toISOString(),
      expiresAt: googleUser.expires_at || new Date(now.getTime() + (config.maxSessionDurationMs || 43200000)).toISOString(),
      lastActivity: now.toISOString(),
      refreshCount: 0,
      csrfToken: googleUser.csrf_token || '',
    };

    _saveToStorage();
    _emit('user:login', { user: _user, session: _session });

    return { user: _user, session: _session };
  }

  /**
   * Renova a sessão atual.
   * @returns {boolean}
   */
  function refreshSession() {
    if (!_session) return false;

    const now = new Date();
    const config = window.AUTH_CONFIG?.session || {};

    // Verificar se não expirou
    if (new Date(_session.expiresAt).getTime() < now.getTime()) {
      invalidate();
      return false;
    }

    _session.lastActivity = now.toISOString();
    _session.refreshCount++;
    // A expiração é assinada pelo backend e não pode ser prorrogada pelo cliente.

    _saveToStorage();
    _emit('user:refresh', { session: _session });

    return true;
  }

  /**
   * Invalida a sessão atual (logout).
   */
  function invalidate() {
    const prevUser = _user ? { ..._user } : null;

    _user = null;
    _session = null;

    _removeFromStorage();
    _emit('user:logout', { user: prevUser });
  }

  /**
   * Verifica se a sessão é válida.
   * @returns {boolean}
   */
  function isSessionValid() {
    if (!_user || !_session) return false;

    const now = new Date().getTime();
    const expiresAt = new Date(_session.expiresAt).getTime();

    return expiresAt > now;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PERSISTÊNCIA
  // ══════════════════════════════════════════════════════════════════════════

  function _saveToStorage() {
    try {
      const config = window.AUTH_CONFIG?.session || {};
      const key = config.storageKey || 'glpi:gcc:session';
      const data = { user: _user, session: _session };
      sessionStorage.setItem(key, JSON.stringify(data));
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('[UserContext] Erro ao salvar sessão:', e);
    }
  }

  function _loadFromStorage() {
    try {
      const config = window.AUTH_CONFIG?.session || {};
      const key = config.storageKey || 'glpi:gcc:session';
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;

      const data = JSON.parse(raw);
      if (data.user && data.session) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  function _removeFromStorage() {
    try {
      const config = window.AUTH_CONFIG?.session || {};
      const key = config.storageKey || 'glpi:gcc:session';
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch {
      // Ignorar erros
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Tenta restaurar sessão da aba atual.
   * @returns {boolean} true se sessão restaurada com sucesso
   */
  function restoreSession() {
    const stored = _loadFromStorage();
    if (!stored) return false;

    _user = stored.user;
    _session = stored.session;

    if (!isSessionValid()) {
      invalidate();
      return false;
    }

    // Validar se o perfil ainda existe nas permissões atuais
    if (_user?.perfil && window.Permissions && !window.Permissions.getProfile(_user.perfil)) {
      _user.perfil = 'SUPORTE';
      _saveToStorage();
    }

    _emit('user:restored', { user: _user, session: _session });
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna o usuário logado.
   * @returns {object|null}
   */
  function getCurrentUser() {
    return _user ? { ..._user } : null;
  }

  /**
   * Retorna o nome do usuário.
   * @returns {string}
   */
  function getUserName() {
    return _user?.nome || 'Usuário';
  }

  /**
   * Retorna o email do usuário.
   * @returns {string}
   */
  function getUserEmail() {
    return _user?.email || '';
  }

  /**
   * Retorna a foto do usuário.
   * @returns {string}
   */
  function getUserPhoto() {
    return _user?.foto || '';
  }

  /**
   * Retorna as iniciais do usuário.
   * @returns {string}
   */
  function getUserInitials() {
    const name = _user?.nome || '';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase() || '??';
  }

  /**
   * Retorna o perfil do usuário.
   * @returns {string}
   */
  function getUserProfile() {
    return _user?.perfil || 'SUPORTE';
  }

  /**
   * Retorna a sessão atual.
   * @returns {object|null}
   */
  function getSession() {
    return _session ? { ..._session } : null;
  }

  /**
   * Retorna o ID do usuário.
   * @returns {string|null}
   */
  function getUserId() {
    return _user?.id || null;
  }

  /**
   * Verifica se há usuário logado.
   * @returns {boolean}
   */
  function isAuthenticated() {
    return _user !== null && _session !== null && isSessionValid();
  }

  /**
   * Retorna snapshot completo do estado.
   * @returns {object}
   */
  function getState() {
    return {
      user: _user ? { ..._user } : null,
      session: _session ? { ..._session } : null,
      authenticated: isAuthenticated(),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PERMISSÕES (delegação para Permissions)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Verifica se o usuário tem acesso a um módulo.
   * @param {string} moduleKey
   * @returns {boolean}
   */
  function canAccessModule(moduleKey) {
    if (!isAuthenticated()) return false;
    return window.Permissions?.hasModuleAccess(_user.perfil, moduleKey) || false;
  }

  /**
   * Verifica se o usuário pode executar uma ação em um módulo.
   * @param {string} moduleKey
   * @param {string} action
   * @returns {boolean}
   */
  function canDo(moduleKey, action) {
    if (!isAuthenticated()) return false;
    return window.Permissions?.canDo(_user.perfil, moduleKey, action) || false;
  }

  /**
   * Retorna módulos visíveis para o usuário.
   * @returns {array}
   */
  function getVisibleModules() {
    if (!isAuthenticated()) return [];
    return window.Permissions?.getVisibleModules(_user.perfil) || [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Registra listener para eventos de usuário.
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

  function _emit(eventName, detail) {
    _listeners.forEach(function (listener) {
      try {
        listener(eventName, detail);
      } catch (e) {
        console.warn('[UserContext] Erro no listener:', e);
      }
    });

    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    createSession,
    refreshSession,
    invalidate,
    isSessionValid,
    restoreSession,
    getCurrentUser,
    getUserName,
    getUserEmail,
    getUserPhoto,
    getUserInitials,
    getUserProfile,
    getSession,
    getUserId,
    isAuthenticated,
    getState,
    canAccessModule,
    canDo,
    getVisibleModules,
    onEvent,
  };

})();
