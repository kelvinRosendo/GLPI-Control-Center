/**
 * GLPI Control Center - auth.js
 * -----------------------------------------------------------------------------
 * Módulo de autenticação com Google OAuth 2.0.
 *
 * Responsabilidades:
 * - Inicializar Google Identity Services
 * - Realizar login com Google
 * - Validar domínio do email
 * - Criar sessão via UserContext
 * - Gerenciar logout
 * - Emitir eventos de autenticação
 *
 * NÃO gerencia permissões. Consulte permissions.js.
 * NÃO armazena sessão. Consulte user_context.js.
 * NÃO protege rotas. Consulte auth_guard.js.
 *
 * Sprint 9.5: Google OAuth, Controle de Acesso e Perfis de Usuário
 */

window.Auth = (function () {

  // ── Estado ───────────────────────────────────────────────────────────────

  let _googleInitialized = false;
  let _googleClientId = null;

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Inicializa o módulo de autenticação.
   * Carrega Google Identity Services e configura callback.
   */
  function init() {
    _googleClientId = window.AUTH_CONFIG?.google?.clientId;

    if (!_googleClientId) {
      console.warn('[Auth] Google Client ID não configurado. Usando modo demo.');
      _initDemoMode();
      return;
    }

    _loadGoogleScript();
  }

  /**
   * Carrega o script do Google Identity Services.
   */
  function _loadGoogleScript() {
    if (document.getElementById('google-identity-script')) {
      _onGoogleScriptLoaded();
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-identity-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = _onGoogleScriptLoaded;
    script.onerror = function () {
      console.warn('[Auth] Falha ao carregar Google Identity Services. Usando modo demo.');
      _initDemoMode();
    };
    document.head.appendChild(script);
  }

  /**
   * Chamado quando o script do Google é carregado.
   */
  function _onGoogleScriptLoaded() {
    if (!window.google?.accounts?.id) {
      console.warn('[Auth] Google Identity Services não disponível. Usando modo demo.');
      _initDemoMode();
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: _googleClientId,
        callback: _handleGoogleResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      _googleInitialized = true;
      _renderGoogleButton();

      console.log('[Auth] Google Identity Services inicializado');
    } catch (e) {
      console.warn('[Auth] Erro ao inicializar Google:', e);
      _initDemoMode();
    }
  }

  /**
   * Renderiza o botão "Entrar com Google" no DOM.
   */
  function _renderGoogleButton() {
    const container = document.getElementById('google-btn-container');
    if (!container) return;

    container.innerHTML = '';

    try {
      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 300,
      });
    } catch (e) {
      // Fallback para botão customizado
      container.innerHTML = '<button class="login-btn login-btn--google" id="google-login-btn">Entrar com Google</button>';
      const btn = document.getElementById('google-login-btn');
      if (btn) btn.addEventListener('click', _triggerGoogleLogin);
    }
  }

  /**
   * Abre o prompt de login do Google manualmente.
   */
  function _triggerGoogleLogin() {
    if (_googleInitialized && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      _showDemoLogin();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODO DEMO (quando Google não está configurado)
  // ══════════════════════════════════════════════════════════════════════════

  function _initDemoMode() {
    const container = document.getElementById('google-btn-container');
    if (container) {
      container.innerHTML = '<button class="login-btn login-btn--demo" id="demo-login-btn">Entrar (Modo Demo)</button>';
      const btn = document.getElementById('demo-login-btn');
      if (btn) btn.addEventListener('click', _showDemoLogin);
    }
  }

  async function _showDemoLogin() {
    const email = prompt('Modo Demo - Digite seu email (@colegiosatelite.com.br):');
    if (!email) return;

    if (!window.AUTH_CONFIG.isDomainAllowed(email)) {
      _showError(window.AUTH_CONFIG.messages.domainNotAllowed);
      return;
    }

    const name = email.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase());

    await _authenticate('/api/auth/demo', { email: email, name: name });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CALLBACK DO GOOGLE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Chamado quando o Google retorna a resposta.
   * @param {object} response - Resposta do Google
   */
  async function _handleGoogleResponse(response) {
    try {
      await _authenticate('/api/auth/google', { credential: response.credential });
    } catch (e) {
      console.error('[Auth] Erro ao processar resposta do Google:', e);
      _showError(window.AUTH_CONFIG.messages.genericError);
    }
  }

  async function _authenticate(path, body) {
    try {
      const baseUrl = (window.CONFIG?.backendUrl ?? 'http://localhost:8080').replace(/\/$/, '');
      const response = await fetch(baseUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Falha de autenticação');
      _handleLoginSuccess(result);
    } catch (error) {
      console.error('[Auth] Falha na autenticação pelo servidor:', error);
      _showError(error.message || window.AUTH_CONFIG.messages.genericError);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROCESSAMENTO DO LOGIN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Processa login bem-sucedido.
   * Valida domínio, cria sessão e notifica App.
   * @param {object} authResult - Sessão verificada e assinada pelo backend
   */
  function _handleLoginSuccess(authResult) {
    _hideError();
    const verifiedUser = authResult.user;
    window.UserContext.createSession({
      sub: verifiedUser.id,
      name: verifiedUser.name,
      email: verifiedUser.email,
      picture: verifiedUser.picture,
      access_token: '',
      csrf_token: authResult.csrfToken,
      expires_at: authResult.expiresAt,
    }, verifiedUser.profile);

    // Registrar auditoria
    _auditLoginSuccess(verifiedUser);

    // Notificar App
    if (window.App?.onLoginSuccess) {
      window.App.onLoginSuccess(verifiedUser.name);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOGOUT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Realiza logout do usuário.
   */
  function logout() {
    const user = window.UserContext.getCurrentUser();
    const session = window.UserContext.getSession();
    const baseUrl = (window.CONFIG?.backendUrl ?? 'http://localhost:8080').replace(/\/$/, '');
    fetch(baseUrl + '/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: session?.csrfToken ? { 'X-CSRF-Token': session.csrfToken } : {},
    }).catch(() => {});

    // Revogar token Google
    if (window.google?.accounts?.id && user?.provedor === 'google') {
      window.google.accounts.id.disableAutoSelect();
    }

    // Invalidar sessão
    window.UserContext.invalidate();

    // Registrar auditoria
    if (window.Audit) {
      window.Audit.register({
        action: 'logout',
        module: 'auth',
        descricao: `Logout realizado: ${user?.nome || 'desconhecido'}`,
      });
    }

    // Despertar evento de notificação
    if (window.NotificationEvents) {
      window.NotificationEvents.dispatchAuth('logout', {
        usuario: user?.nome || 'desconhecido',
      });
    }

    // Mostrar tela de login
    if (window.App?.showLoginScreen) {
      window.App.showLoginScreen();
    }

    console.log('[Auth] Logout realizado');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUDITORIA
  // ══════════════════════════════════════════════════════════════════════════

  function _auditLoginSuccess(googleUser) {
    if (window.Audit) {
      window.Audit.register({
        action: 'login',
        module: 'auth',
        descricao: `Login realizado: ${googleUser.name} (${googleUser.email})`,
        usuario: googleUser.name,
        dados: { email: googleUser.email, provedor: 'google' },
      });
    }

    // Despertar evento de notificação
    if (window.NotificationEvents) {
      window.NotificationEvents.dispatchAuth('login', {
        usuario: googleUser.name,
        email: googleUser.email,
      });
    }
  }

  function _auditLoginFailed(email, reason) {
    if (window.Audit) {
      window.Audit.register({
        action: 'login_falha',
        module: 'auth',
        severity: 'warning',
        descricao: `Falha de login: ${email} (${reason})`,
        usuario: email,
        dados: { reason },
      });
    }

    // Despertar evento de notificação
    if (window.NotificationEvents) {
      window.NotificationEvents.dispatchAuth('domain_denied', {
        email: email,
        reason: reason,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UI
  // ══════════════════════════════════════════════════════════════════════════

  function _showError(message) {
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  function _hideError() {
    const errorEl = document.getElementById('login-error');
    if (errorEl) errorEl.style.display = 'none';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init,
    logout,
  };

})();
