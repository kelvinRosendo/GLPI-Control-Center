/**
 * GLPI Control Center - app.js
 * -----------------------------------------------------------------------------
 * Orquestrador principal. Inicializa módulos, controla navegação e
 * re-renderiza a interface quando o estado muda.
 */

window.App = {

  // ── Inicialização ──────────────────────────────────────────────────────────

  async init() {
    // Mostra tela de login, inicializa auth
    this.showLoginScreen();
    window.Auth.init();
  },

  // ── Login ──────────────────────────────────────────────────────────────────

  async onLoginSuccess(username) {
    // Atualiza avatar
    const avatar = document.getElementById('user-avatar');
    if (avatar) avatar.textContent = username.charAt(0).toUpperCase();

    // Mostra app, esconde login
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Atualiza status de conexão
    this._setGlpiStatus('carregando');

    // Busca todos os dados do backend
    try {
      const result = await window.GlpiClient.loadAll();

      if (result.ok) {
        this._setGlpiStatus('conectado');
        console.log('[App] Dados reais carregados com sucesso.');
      } else {
        this._setGlpiStatus('parcial');
        console.warn('[App] Alguns endpoints falharam:', result.errors);
      }
    } catch (e) {
      this._setGlpiStatus('offline');
      console.warn('[App] Backend indisponível, usando dados mock.', e);
    }

    // Navega para home e renderiza
    this.go('home');
  },

  showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    window.State.resetFilters();
    window.State.setTab('home');
  },

  // ── Navegação ──────────────────────────────────────────────────────────────

  go(tabId) {
    window.State.setTab(tabId);
    window.State.resetFilters();
    this.render();
  },

  // ── Renderização ───────────────────────────────────────────────────────────

  render() {
    const tabsEl = document.getElementById('tabs-bar');
    const mainEl = document.getElementById('main-content');
    if (!tabsEl || !mainEl) return;

    // Renderiza abas
    tabsEl.innerHTML = window.UI.renderTabs();

    // Renderiza conteúdo da aba atual
    const tab = window.STATE.tab;
    switch (tab) {
      case 'home':
        mainEl.innerHTML = window.UI.renderHome();
        break;
      case 'computadores':
        mainEl.innerHTML = window.UI.renderAssetList(
          window.DATA.computadores,
          'Buscar computador por nome, serial ou patrimônio…'
        );
        break;
      case 'geekiees':
        mainEl.innerHTML = window.UI.renderAssetList(
          window.DATA.chromebooksGeekiees,
          'Buscar Chromebook Geekiee por nome ou serial…'
        );
        break;
      case 'apoio':
        mainEl.innerHTML = window.UI.renderCarrinhos();
        break;
      case 'projetores':
        mainEl.innerHTML = window.UI.renderAssetList(
          window.DATA.projetores,
          'Buscar projetor por nome ou serial…'
        );
        break;
      case 'impressoras':
        mainEl.innerHTML = window.UI.renderAssetList(
          window.DATA.impressoras,
          'Buscar impressora por nome ou serial…',
          'impressora'
        );
        break;
      case 'chamados':
        mainEl.innerHTML = '<p class="result-count">Carregando chamados…</p>';
        window.GlpiClient.fetchTickets().then(lista => {
          mainEl.innerHTML = window.UI.renderTickets(lista);
        });
        break;
    }


    // Anexa eventos após injetar HTML
    this._bindTabEvents();
    this._bindSearchEvents();
  },

  // ── Eventos de aba ─────────────────────────────────────────────────────────

  _bindTabEvents() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => this.go(btn.dataset.tab));
    });
  },

  // ── Eventos de busca ───────────────────────────────────────────────────────

  _bindSearchEvents() {
    const input = document.getElementById('global-search');
    const clearBtn = document.getElementById('search-clear');

    if (input) {
      // Foca no input e coloca cursor no fim
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);

      input.addEventListener('input', () => {
        window.State.setSearch(input.value);
        this._renderContent(); // re-renderiza só o conteúdo, sem perder o foco
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.State.setSearch('');
        this._renderContent();
      });
    }

    // Filtros de status
    document.querySelectorAll('.filter-btn[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.State.setStatus(btn.dataset.status);
        this._renderContent();
      });
    });
  },

  /**
   * Re-renderiza apenas o main-content (sem re-renderizar as tabs),
   * preservando o foco no input de busca.
   */
  _renderContent() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;

    const tab = window.STATE.tab;
    switch (tab) {
      case 'computadores':
        mainEl.innerHTML = window.UI.renderAssetList(
          window.DATA.computadores,
          'Buscar computador por nome, serial ou patrimônio…'
        );
        break;
      case 'geekiees':
        mainEl.innerHTML = window.UI.renderAssetList(
          window.DATA.chromebooksGeekiees,
          'Buscar Chromebook Geekiee por nome ou serial…'
        );
        break;
      case 'apoio':
        mainEl.innerHTML = window.UI.renderCarrinhos();
        break;
      case 'projetores':
        mainEl.innerHTML = window.UI.renderAssetList(
          window.DATA.projetores,
          'Buscar projetor por nome ou serial…'
        );
        break;
      case 'impressoras':
        mainEl.innerHTML = window.UI.renderAssetList(
          window.DATA.impressoras,
          'Buscar impressora por nome ou serial…',
          'impressora'
        );
        break;
      case 'chamados':
        mainEl.innerHTML = '<p class="result-count">Carregando chamados…</p>';
        window.GlpiClient.fetchTickets().then(lista => {
          mainEl.innerHTML = window.UI.renderTickets(lista);
        });
        break;
    }

    this._bindSearchEvents();
  },

  // ── Status GLPI na topbar ──────────────────────────────────────────────────

  _setGlpiStatus(estado) {
    const el = document.getElementById('glpi-status');
    if (!el) return;

    const map = {
      carregando: { icon: '⟳', texto: 'Conectando ao GLPI…', cor: '#888' },
      conectado: { icon: '●', texto: 'Conectado ao GLPI', cor: '#4ade80' },
      parcial: { icon: '◐', texto: 'Parcialmente conectado', cor: '#facc15' },
      offline: { icon: '●', texto: 'Modo offline (mock)', cor: '#f87171' },
    };

    const s = map[estado] || map.offline;
    el.style.color = s.cor;
    el.textContent = `${s.icon} ${s.texto}`;
  },
};

// Inicia o app quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => window.App.init());
