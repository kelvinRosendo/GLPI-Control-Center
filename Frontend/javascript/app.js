/**
 * GLPI Control Center - app.js
 * -----------------------------------------------------------------------------
 * Orquestrador principal. Fluxo:
 *
 *   1. DOM pronto → App.init()
 *   2. Usuário faz login → Auth chama App.onLoginSuccess()
 *   3. App mostra loading e chama GlpiClient.loadAll()
 *   4. Dados carregados → App.render() com dados reais
 *   5. Erros → App mostra tela de erro com botão de retry
 */

function $(id) { return document.getElementById(id); }

window.App = {

  /* ==========================================================================
     1) Inicialização
     ========================================================================== */

  init() {
    this.showLoginScreen();

    if (window.Auth?.init) window.Auth.init();

    // Renderiza tabs vazias para ficar pronto
    if (window.UI?.renderTabs) window.UI.renderTabs();
  },


  /* ==========================================================================
     2) Fluxo pós-login
     ========================================================================== */

  /**
   * Chamado pelo Auth após validar credenciais.
   * Mostra o app e dispara o carregamento real dos dados.
   */
  async onLoginSuccess(username) {
    // Atualiza avatar
    const avatar = $('user-avatar');
    if (avatar) avatar.textContent = username.charAt(0).toUpperCase();

    this.showAppScreen();
    await this.reloadData();
  },

  /**
   * Carrega (ou recarrega) todos os dados do backend.
   * Exibe loading → dados → ou tela de erro.
   */
  async reloadData() {
    // Mostra loading imediatamente
    const main = $('main-content');
    if (main && window.UI?.renderLoading) {
      main.innerHTML = window.UI.renderLoading();
    }

    // Atualiza status na topbar
    this.setGlpiStatus('connecting');

    const result = await window.GlpiClient.loadAll();

    if (result.ok) {
      this.setGlpiStatus('connected');
      this.render();
    } else {
      this.setGlpiStatus('error');
      if (main && window.UI?.renderError) {
        main.innerHTML = window.UI.renderError(result.errors ?? []);
      }
    }
  },


  /* ==========================================================================
     3) Renderização
     ========================================================================== */

  render() {
    if (window.UI?.renderTabs) window.UI.renderTabs();

    const tab  = window.STATE?.tab ?? 'home';
    const main = $('main-content');
    if (!main) return;

    const views = {
      home:         () => window.UI?.renderHome?.(),
      computadores: () => window.UI?.renderComputadores?.(),
      geekiees:     () => window.UI?.renderGeekiees?.(),
      apoio:        () => window.UI?.renderCarrinhos?.(),
      projetores:   () => window.UI?.renderProjetores?.(),
      impressoras:  () => window.UI?.renderImpressoras?.(),
    };

    main.innerHTML = views[tab]?.() ?? this.renderFallback(tab);
  },

  renderFallback(title) {
    return `
      <div class="empty">
        <div class="empty-icon">🛠️</div>
        <h3>${title} em construção</h3>
      </div>
    `;
  },


  /* ==========================================================================
     4) Navegação
     ========================================================================== */

  go(tabId) {
    window.STATE.tab = tabId;
    this.resetFilters();
    this.render();
  },

  resetFilters() {
    if (!window.STATE) return;
    window.STATE.search     = '';
    window.STATE.status     = 'todos';
    window.STATE.reparticao = 'todas';
  },


  /* ==========================================================================
     5) Controle de telas (login / app)
     ========================================================================== */

  showLoginScreen() {
    const login = $('login-screen');
    const app   = $('app');
    if (login) login.style.display = 'flex';
    if (app)   app.style.display   = 'none';
  },

  showAppScreen() {
    const login = $('login-screen');
    const app   = $('app');
    if (login) login.style.display = 'none';
    if (app)   app.style.display   = 'flex';
  },


  /* ==========================================================================
     6) Status do GLPI na topbar
     ========================================================================== */

  setGlpiStatus(state) {
    const el = $('glpi-status');
    if (!el) return;

    const map = {
      connected:  { text: '● Conectado ao GLPI',    color: 'var(--green)'  },
      connecting: { text: '● Conectando ao GLPI…',  color: 'var(--yellow)' },
      error:      { text: '● Erro ao conectar GLPI', color: 'var(--red)'   },
    };

    const s = map[state] ?? map.connected;
    el.textContent    = s.text;
    el.style.color    = s.color;
  },
};

/* ============================================================================
 * Boot
 * ========================================================================== */
window.addEventListener('DOMContentLoaded', () => window.App.init());