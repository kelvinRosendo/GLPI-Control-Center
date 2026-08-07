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

  function _showDemoLogin() {
    const email = prompt('Modo Demo - Digite seu email (@colegiosatelite.com.br):');
    if (!email) return;

    if (!window.AUTH_CONFIG.isDomainAllowed(email)) {
      _showError(window.AUTH_CONFIG.messages.domainNotAllowed);
      return;
    }

    const name = email.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase());

    _handleLoginSuccess({
      sub: 'demo_' + Date.now(),
      name: name,
      email: email,
      picture: '',
      access_token: 'demo_token',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CALLBACK DO GOOGLE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Chamado quando o Google retorna a resposta.
   * @param {object} response - Resposta do Google
   */
  function _handleGoogleResponse(response) {
    try {
      // Decodificar o JWT token
      const payload = _decodeJwtPayload(response.credential);

      if (!payload) {
        _showError(window.AUTH_CONFIG.messages.genericError);
        return;
      }

      _handleLoginSuccess({
        sub: payload.sub,
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
        access_token: response.credential,
      });
    } catch (e) {
      console.error('[Auth] Erro ao processar resposta do Google:', e);
      _showError(window.AUTH_CONFIG.messages.genericError);
    }
  }

  /**
   * Decodifica o payload de um JWT token.
   * @param {string} token
   * @returns {object|null}
   */
  function _decodeJwtPayload(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROCESSAMENTO DO LOGIN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Processa login bem-sucedido.
   * Valida domínio, cria sessão e notifica App.
   * @param {object} googleUser - Dados do usuário Google
   */
  function _handleLoginSuccess(googleUser) {
    _hideError();

    // Validar domínio
    if (!window.AUTH_CONFIG.isDomainAllowed(googleUser.email)) {
      _showError(window.AUTH_CONFIG.messages.domainNotAllowed);
      _auditLoginFailed(googleUser.email, 'domain_not_allowed');
      return;
    }

    // Determinar perfil (por enquanto, todos são COORDENADORA para demo)
    // Em produção, isso viria de um backend
    const profileKey = _determineProfile(googleUser.email);

    // Criar sessão
    const session = window.UserContext.createSession(googleUser, profileKey);

    // Registrar auditoria
    _auditLoginSuccess(googleUser);

    // Notificar App
    if (window.App?.onLoginSuccess) {
      window.App.onLoginSuccess(googleUser.name);
    }
  }

  /**
   * Determina o perfil do usuário baseado no email.
   * Em produção, isso viria de um backend.
   * @param {string} email
   * @returns {string}
   */
  function _determineProfile(email) {
    const lowerEmail = email.toLowerCase();

    // Regras de exemplo - em produção viria do backend
    if (lowerEmail.includes('admin')) return 'ADMIN';
    if (lowerEmail.includes('ti') || lowerEmail.includes('suporte')) return 'TI';
    if (lowerEmail.includes('coordenador')) return 'COORDENADORA';
    if (lowerEmail.includes('diretor')) return 'DIRETORA';
    if (lowerEmail.includes('vice')) return 'VICE_DIRETORA';

    return 'COORDENADORA';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOGOUT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Realiza logout do usuário.
   */
  function logout() {
    const user = window.UserContext.getCurrentUser();

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
