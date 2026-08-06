/**
 * GLPI Control Center - auth.js
 * -----------------------------------------------------------------------------
 * Responsável por:
 * - Controle de autenticação (login/logout)
 * - Validação de credenciais (modo mock/local)
 * - Controle visual: mostrar app ou tela de login
 *
 * Observação:
 * - Atualmente usa CONFIG.users (definido em data.js)
 * - Em versão futura pode integrar com backend real
 */

window.Auth = {
  /**
   * Inicializa o módulo de autenticação.
   * Define event listeners do login e logout.
   */
  init() {
    this.bindEvents();
  },

  /**
   * Conecta eventos aos elementos do DOM.
   */
  bindEvents() {
    const loginBtn = document.getElementById("login-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const passInput = document.getElementById("login-pass");

    if (loginBtn) {
      loginBtn.addEventListener("click", () => this.login());
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => this.logout());
    }

    if (passInput) {
      passInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this.login();
        }
      });
    }
  },

  /**
   * Realiza validação de login.
   * Valida usuário e senha contra CONFIG.users.
   */
  login() {
    const userInput = document.getElementById("login-user");
    const passInput = document.getElementById("login-pass");
    const errorEl = document.getElementById("login-error");

    if (!userInput || !passInput) return;

    const username = userInput.value.trim();
    const password = passInput.value.trim();

    // Validação simples (mock)
    if (window.CONFIG?.users?.[username] === password) {
      this.onLoginSuccess(username);
    } else {
      this.onLoginError();
      if (errorEl) errorEl.style.display = "block";
    }
  },

  /**
   * Executado quando login é válido.
   */
  onLoginSuccess(username) {
    const errorEl = document.getElementById("login-error");
    if (errorEl) errorEl.style.display = "none";

    // Registrar auditoria
    if (window.Audit) {
      window.Audit.register({ action: 'login', module: 'auth', descricao: `Login realizado: ${username}`, usuario: username });
    }

    // Delega ao App (que mostra a tela e carrega os dados reais do GLPI)
    if (window.App?.onLoginSuccess) {
      window.App.onLoginSuccess(username);
    }
  },

  /**
   * Executado quando login falha.
   */
  onLoginError() {
    const userInput = document.getElementById("login-user");
    const username = userInput ? userInput.value.trim() : 'desconhecido';

    // Registrar auditoria
    if (window.Audit) {
      window.Audit.register({ action: 'login_falha', module: 'auth', severity: 'warning', descricao: `Falha de login: ${username}`, usuario: username });
    }

    console.warn("Falha no login: credenciais inválidas");
  },

  /**
   * Realiza logout e reseta interface.
   */
  logout() {
    // Limpa campos
    const userInput = document.getElementById("login-user");
    const passInput = document.getElementById("login-pass");
    const errorEl = document.getElementById("login-error");

    if (userInput) userInput.value = "";
    if (passInput) passInput.value = "";
    if (errorEl) errorEl.style.display = "none";

    // Registrar auditoria
    if (window.Audit) {
      window.Audit.register({ action: 'logout', module: 'auth', descricao: 'Logout realizado' });
    }

    // Reseta estado global
    if (window.State?.resetFilters) {
      window.State.resetFilters();
    }

    // Mostra login
    if (window.App?.showLoginScreen) {
      window.App.showLoginScreen();
    }
  },
};