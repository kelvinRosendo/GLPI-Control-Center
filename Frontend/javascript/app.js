/*
        app.js — Bootstrap / Inicialização

    É o “orquestrador”.
    Inicializa a aplicação
    Faz o primeiro render da tela
    Liga os módulos (auth + ui + state + data)
    Define fluxo de start: login → app → tabs
    Pensa nele como o “main()” do projeto.
*/

/**
 * GLPI Control Center - app.js
 * -----------------------------------------------------------------------------
 * Ponto de entrada (entrypoint) do Frontend.
 *
 * Responsabilidades:
 * - Inicializar a aplicação quando o DOM estiver pronto
 * - Conectar os módulos (Auth, UI, State, GLPI Client)
 * - Centralizar a troca de abas e re-renderização
 * - Definir o fluxo principal: Login -> App -> Logout
 *
 * Observação:
 * - Este projeto usa "Vanilla JS modular por arquivos".
 * - Cada arquivo expõe um objeto global em window (ex: window.Auth, window.UI).
 */

/* ============================================================================
 * 1) Utilitários simples (helper functions)
 * ========================================================================== */

/**
 * Retorna um elemento do DOM pelo id.
 * Mantém o código mais limpo e evita repetir document.getElementById.
 */
function $(id) {
  return document.getElementById(id);
}

/**
 * Pequeno log de debug (desative ou remova se quiser).
 */
function debug(...args) {
  // console.log("[GLPI Control Center]", ...args);
}

/* ============================================================================
 * 2) App Controller (objeto principal)
 * ========================================================================== */

window.App = {
  /**
   * Inicializa a aplicação.
   * Chamado assim que o DOM termina de carregar.
   */
  init() {
    debug("Inicializando app...");

    // Garantias visuais iniciais (antes do login)
    this.showLoginScreen();

    // Inicializa módulos
    // Auth cuida de login/logout (e chama App.render() após login)
    if (window.Auth && typeof window.Auth.init === "function") {
      window.Auth.init();
    }

    // Renderiza a barra de abas (mesmo antes do login, pra já ficar pronto)
    if (window.UI && typeof window.UI.renderTabs === "function") {
      window.UI.renderTabs();
    }

    // Render inicial do conteúdo (pode ser home vazia/placeholder)
    this.render();
  },

  /**
   * Renderiza a tela com base no estado global (window.STATE).
   * É o método central que "refaz" a UI sempre que algo muda.
   */
  render() {
    // Renderiza tabs (destaca a aba ativa)
    if (window.UI && typeof window.UI.renderTabs === "function") {
      window.UI.renderTabs();
    }

    // Decide qual tela mostrar
    const tab = window.STATE?.tab || "home";
    debug("Renderizando tab:", tab);

    const main = $("main-content");
    if (!main) return;

    // Cada tela retorna HTML (string) para ser injetado no container principal.
    // A lógica de criação do HTML fica concentrada em ui.render.js
    switch (tab) {
      case "home":
        main.innerHTML = window.UI?.renderHome?.() ?? this.renderFallback("Home");
        break;

      case "computadores":
        main.innerHTML =
          window.UI?.renderComputadores?.() ??
          this.renderFallback("Computadores");
        break;

      case "geekiees":
        main.innerHTML =
          window.UI?.renderGeekiees?.() ??
          this.renderFallback("Chromebooks (Geekiees)");
        break;

      case "apoio":
        main.innerHTML = window.UI?.renderCarrinhos?.() ?? this.renderFallback("Chromebooks (Apoio)");
        break;

      case "projetores":
        main.innerHTML =
          window.UI?.renderProjetores?.() ??
          this.renderFallback("Projetores");
        break;

      case "impressoras":
        main.innerHTML =
          window.UI?.renderImpressoras?.() ??
          this.renderFallback("Impressoras");
        break;

      default:
        main.innerHTML = this.renderFallback("Tela");
        break;
    }
  },

  /**
   * Troca a aba atual e re-renderiza.
   * Esse método é o padrão pra navegação no app.
   */
  go(tabId) {
    window.STATE.tab = tabId;
    this.resetFilters(); // opcional: zera busca/filtros quando trocar de aba
    this.render();
  },

  /**
   * Reseta busca e filtros ao trocar de aba.
   * Mantém UX limpa (sem filtros "vazando" para outras abas).
   */
  resetFilters() {
    if (!window.STATE) return;
    window.STATE.search = "";
    window.STATE.status = "todos";
    window.STATE.reparticao = "todas";
  },

  /**
   * Mostra a tela de login e esconde o app.
   */
  showLoginScreen() {
    const login = $("login-screen");
    const app = $("app");

    if (login) login.style.display = "flex";
    if (app) app.style.display = "none";
  },

  /**
   * Mostra o app e esconde o login.
   * Normalmente chamado pelo auth.js depois de validar credenciais.
   */
  showAppScreen() {
    const login = $("login-screen");
    const app = $("app");

    if (login) login.style.display = "none";
    if (app) app.style.display = "flex";
  },

  /**
   * Placeholder caso algum método do UI não exista ainda.
   * Ajuda você a desenvolver por partes sem quebrar tudo.
   */
  renderFallback(title) {
    return `
      <div class="empty">
        <div class="empty-icon">🛠️</div>
        <h3>${title} em construção</h3>
        <p style="margin-top:8px;color:var(--text3);font-size:13px;">
          Essa tela ainda não foi implementada no <code>ui.render.js</code>.
        </p>
      </div>
    `;
  },
};

/* ============================================================================
 * 3) Boot (inicialização automática quando DOM carregar)
 * ========================================================================== */
window.addEventListener("DOMContentLoaded", () => {
  window.App.init();
});