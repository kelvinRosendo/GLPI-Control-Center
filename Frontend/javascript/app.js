/**
 * GLPI Control Center - app.js
 */

window.App = {
  assetsLoading: false,
  assetsLoaded: false,

  async init() {
    this.showLoginScreen();
    window.Auth.init();
  },

  async onLoginSuccess(username) {
    const avatar = document.getElementById('user-avatar');
    if (avatar) avatar.textContent = username.charAt(0).toUpperCase();

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    this.assetsLoading = true;
    this.assetsLoaded = false;
    this._setGlpiStatus('carregando');
    this.go('home');

    this._loadInitialData();
  },

  async _loadInitialData() {
    try {
      const result = await window.GlpiClient.loadAll();
      this.assetsLoading = false;
      this.assetsLoaded = true;

      if (result.ok) {
        this._setGlpiStatus('conectado');
      } else {
        this._setGlpiStatus('parcial');
        console.warn('[App] Alguns endpoints falharam:', result.errors);
      }

      this._preloadTickets();
      this.render();

    } catch (e) {
      this.assetsLoading = false;
      this.assetsLoaded = false;
      this._setGlpiStatus('offline');
      console.warn('[App] Backend indisponivel.', e);
      this.render();
    }
  },

  showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    window.State.resetFilters();
    window.State.setTab('home');
    window.State.setExpandedComputer(null);
  },

  go(tabId) {
    window.State.setTab(tabId);
    window.State.resetFilters();
    if (tabId !== 'computadores') {
      window.State.setExpandedComputer(null);
    }
    this.render();
  },

  render() {
    const tabsEl = document.getElementById('tabs-bar');
    const mainEl = document.getElementById('main-content');
    if (!tabsEl || !mainEl) return;

    tabsEl.innerHTML = this._renderTabs();
    mainEl.innerHTML = this._renderCurrentTabContent();

    this._bindTabEvents();
    this._bindSearchEvents();
    this._bindComputerCardEvents();
    this._renderComputerModal();
    this._bindTicketEvents();

  },

  _renderTabs() {
    return window.UI.renderTabs();
  },

  _renderCurrentTabContent() {
    switch (window.STATE.tab) {
      case 'home':
        if (this.assetsLoading && !this.assetsLoaded) {
          return window.UI.renderHomeLoading();
        }
        return window.UI.renderHome();
      case 'computadores':
        if (this.assetsLoading && !window.DATA.computadores.length) {
          return window.UI.renderSectionLoading('Carregando computadores...');
        }
        return window.UI.renderAssetList(window.DATA.computadores, 'Buscar computador por nome, serial ou patrimonio...', 'computer');
      case 'geekiees':
        if (this.assetsLoading && !window.DATA.chromebooksGeekiees.length) {
          return window.UI.renderSectionLoading('Carregando Chromebooks Geekiees...');
        }
        return window.UI.renderAssetList(window.DATA.chromebooksGeekiees, 'Buscar Chromebook Geekiee por nome ou serial...', 'geekie');
      case 'apoio':
        if (this.assetsLoading && !Object.keys(window.DATA.chromebooksApoio || {}).length) {
          return window.UI.renderSectionLoading('Carregando carrinhos...');
        }
        return window.UI.renderCarrinhos();
      case 'projetores':
        if (this.assetsLoading && !window.DATA.projetores.length) {
          return window.UI.renderSectionLoading('Carregando projetores...');
        }
        return window.UI.renderAssetList(window.DATA.projetores, 'Buscar projetor por nome ou serial...', 'projetor');
      case 'impressoras':
        if (this.assetsLoading && !window.DATA.impressoras.length) {
          return window.UI.renderSectionLoading('Carregando impressoras...');
        }
        return window.UI.renderAssetList(window.DATA.impressoras, 'Buscar impressora por nome ou serial...', 'impressora');
      case 'chamados':
        if (!window.STATE.ticketsLoaded && !window.STATE.ticketsLoading) {
          this._preloadTickets();
        }

        if (window.STATE.ticketsLoading && !window.STATE.ticketsLoaded) {
          return '<p class="result-count">Carregando chamados...</p>';
        }

        if (window.STATE.ticketsError && !window.STATE.ticketsLoaded) {
          return `<p class="empty-msg">${window.STATE.ticketsError}</p>`;
        }

        return window.UI.renderTickets(window.STATE.tickets);
      case 'assistente':
        return `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px;">
            <span style="font-size:48px;">🤖</span>
            <h3 style="margin:0;font-size:18px;">Assistente de Horarios</h3>
            <p style="margin:0;color:var(--text2,#9299b8);font-size:14px;text-align:center;">Tire duvidas sobre os horarios dos carrinhos de Chromebooks.</p>
            <button onclick="window.Chat.openPanel()" style="padding:12px 28px;background:var(--accent,#4f7ef7);border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Abrir chat</button>
          </div>
        `;
      default:
        return '<p class="empty-msg">Aba nao encontrada.</p>';
    }
  },

  _bindTabEvents() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => this.go(btn.dataset.tab));
    });
  },

  _bindSearchEvents() {
    const input = document.getElementById('global-search');
    const clearBtn = document.getElementById('search-clear');

    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
      input.addEventListener('input', () => {
        window.State.setSearch(input.value);
        this._renderContent();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.State.setSearch('');
        this._renderContent();
      });
    }

    document.querySelectorAll('.filter-btn[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.State.setStatus(btn.dataset.status);
        this._renderContent();
      });
    });
  },

  _bindComputerCardEvents() {
    document.querySelectorAll('[data-computer-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.toggleComputerPanel(Number(btn.dataset.computerToggle));
      });
    });
  },

  async toggleComputerPanel(glpiId, options = {}) {
    const sameCard = window.STATE.expandedComputerId === glpiId;
    if (sameCard && !options.forceReload) {
      window.State.setExpandedComputer(null);
      this._renderComputerModal();
      return;
    }

    window.State.setExpandedComputer(glpiId);
    const cached = window.STATE.computerDetailsById[glpiId];

    if (cached?.data && !options.forceReload) {
      this._renderComputerModal();
      return;
    }

    window.State.updateComputerDetails(glpiId, {
      loading: true,
      saving: false,
      error: '',
      successMessage: '',
    });
    this._renderComputerModal();

    try {
      const detail = await window.GlpiClient.fetchComputerDetails(glpiId);
      window.State.updateComputerDetails(glpiId, {
        loading: false,
        saving: false,
        error: '',
        successMessage: '',
        data: detail,
        draft: { ...(detail?.editableValues || {}) },
      });
    } catch (error) {
      window.State.updateComputerDetails(glpiId, {
        loading: false,
        saving: false,
        error: error.message || 'Falha ao carregar os detalhes do computador.',
      });
    }

    this._renderComputerModal();
  },

  async saveComputerDetails(glpiId, form) {
    const payload = Object.fromEntries(new FormData(form).entries());

    window.State.updateComputerDetails(glpiId, {
      saving: true,
      error: '',
      successMessage: '',
      draft: payload,
    });
    this._renderComputerModal();

    try {
      const detail = await window.GlpiClient.updateComputer(glpiId, payload);
      this._replaceComputerSummary(detail?.asset);
      window.State.updateComputerDetails(glpiId, {
        loading: false,
        saving: false,
        error: '',
        successMessage: 'Alteracoes salvas no GLPI e sincronizadas com a lista.',
        data: detail,
        draft: { ...(detail?.editableValues || {}) },
      });
    } catch (error) {
      window.State.updateComputerDetails(glpiId, {
        saving: false,
        error: error.message || 'Nao foi possivel salvar as alteracoes.',
        successMessage: '',
        draft: payload,
      });
    }

    this._renderComputerModal();
    this._renderContent();
  },

  async _preloadTickets() {
    if (window.STATE.ticketsLoading || window.STATE.ticketsLoaded) return;

    window.State.setTicketsLoading(true);

    try {
      const lista = await window.GlpiClient.fetchTickets();
      window.State.setTickets(lista);
    } catch (error) {
      window.State.setTicketsError(error.message || 'Falha ao carregar chamados.');
    }

    if (window.STATE.tab === 'chamados') {
      this._renderContent();
    }
  },


  _replaceComputerSummary(asset) {
    if (!asset?.glpiId) return;
    window.DATA.computadores = (window.DATA.computadores || []).map(item => item.glpiId === asset.glpiId ? { ...item, ...asset } : item);
  },

  _renderContent() {
    const mainEl = document.getElementById('main-content');
    if (!mainEl) return;
    mainEl.innerHTML = this._renderCurrentTabContent();
    this._bindSearchEvents();
    this._bindTicketEvents();
    this._bindComputerCardEvents();
  },

    _bindTicketEvents() {
    const input = document.getElementById('ticket-search');
    const clearBtn = document.getElementById('ticket-search-clear');

    if (input) {
      input.addEventListener('input', () => {
        window.State.setTicketSearch(input.value);
        this._renderContent();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.State.setTicketSearch('');
        this._renderContent();
      });
    }

    document.querySelectorAll('[data-ticket-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.State.setTicketStatus(btn.dataset.ticketStatus);
        this._renderContent();
      });
    });
  },

  
  _renderComputerModal() {
    const modalEl = document.getElementById('computer-details-modal');
    const contentEl = document.getElementById('computer-details-modal-content');
    if (!modalEl || !contentEl) return;

    const glpiId = window.STATE.expandedComputerId;
    if (!glpiId) {
      modalEl.style.display = 'none';
      contentEl.innerHTML = '';
      document.body.classList.remove('modal-open');
      return;
    }

    const asset = (window.DATA.computadores || []).find(item => item.glpiId === glpiId) || { glpiId };
    const state = window.STATE.computerDetailsById[glpiId] || null;

    contentEl.innerHTML = window.UI.renderComputerModal(asset, state);
    modalEl.style.display = 'flex';
    document.body.classList.add('modal-open');

    modalEl.querySelectorAll('[data-computer-modal-close]').forEach(element => {
      element.addEventListener('click', () => {
        window.State.setExpandedComputer(null);
        this._renderComputerModal();
      });
    });

    modalEl.querySelectorAll('[data-computer-retry]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.toggleComputerPanel(Number(btn.dataset.computerRetry), { forceReload: true });
      });
    });

    modalEl.querySelectorAll('[data-computer-form]').forEach(form => {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        await this.saveComputerDetails(Number(form.dataset.computerForm), form);
      });
    });

    modalEl.querySelectorAll('[data-computer-input]').forEach(input => {
      input.addEventListener('input', () => {
        const form = input.closest('[data-computer-form]');
        if (!form) return;
        window.State.setComputerDraftValue(Number(form.dataset.computerForm), input.name, input.value);
      });
    });
  },

  _setGlpiStatus(estado) {
    const el = document.getElementById('glpi-status');
    if (!el) return;
    const map = {
      carregando: { icon: '⟳', texto: 'Conectando ao GLPI...', cor: '#888' },
      conectado: { icon: '●', texto: 'Conectado ao GLPI', cor: '#4ade80' },
      parcial: { icon: '◐', texto: 'Parcialmente conectado', cor: '#facc15' },
      offline: { icon: '●', texto: 'Backend indisponivel', cor: '#f87171' },
    };
    const s = map[estado] || map.offline;
    const envLabel = window.CONFIG?.mode === 'local' ? 'Local' : 'Servidor';
    el.style.color = s.cor;
    el.textContent = `${s.icon} ${s.texto} · ${envLabel}`;
  },
};

document.addEventListener('DOMContentLoaded', () => window.App.init());
