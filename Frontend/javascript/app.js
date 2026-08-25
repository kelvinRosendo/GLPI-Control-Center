/**
 * GLPI Control Center - app.js
 * Sprint 9.5: Integrado com Auth, UserContext e AuthGuard.
 */

window.App = {
  assetsLoading: false,
  assetsLoaded: false,

  async init() {
    // Inicializar tema
    if (window.Theme) window.Theme.init();

    // Inicializar sidebar
    if (window.Sidebar) window.Sidebar.init();

    // Inicializar módulos de autenticação
    if (window.AuthGuard) window.AuthGuard.init();
    if (window.Auth) window.Auth.init();
    if (window.Audit) window.Audit.init();

    // Inicializar alerta de sessão
    if (window.SessionWarning) window.SessionWarning.init();

    // Inicializar sistema de notificações
    if (window.NotificationEvents) window.NotificationEvents.dispatch('system:init', { module: 'app' });
    if (window.NotificationsCenter) window.NotificationsCenter.init();
    if (window.Notifications) window.Notifications.init();
    if (window.NotificationPreferences) window.NotificationPreferences.init();
    if (window.Search) window.Search.init();
    if (window.SearchUI) window.SearchUI.init();
    if (window.KeyboardShortcuts) window.KeyboardShortcuts.init();
    if (window.Settings) window.Settings.init();
    if (window.SettingsUI) window.SettingsUI.init();
    if (window.ErrorHandler) window.ErrorHandler.init();
    if (window.ErrorUI) window.ErrorUI.init();
    if (window.NotificationsUI) window.NotificationsUI.init();

    // Verificar se há sessão válida
    const hasSession = window.UserContext?.isAuthenticated();

    if (hasSession) {
      // Sessão restaurada do localStorage
      const user = window.UserContext.getCurrentUser();
      this.onLoginSuccess(user?.nome || user?.email);
    } else {
      // Sem sessão, mostrar login
      this.showLoginScreen();
    }
  },

  async onLoginSuccess(username) {
    const user = window.UserContext?.getCurrentUser();

    // Atualizar avatar com foto do Google ou inicial
    const avatar = document.getElementById('user-avatar');
    if (avatar && user) {
      if (user.foto) {
        avatar.innerHTML = `<img src="${user.foto}" alt="${user.nome}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        avatar.textContent = user.nome?.charAt(0).toUpperCase() || username?.charAt(0).toUpperCase() || 'U';
      }
    }

    // Atualizar nome e perfil no header
    const userNameEl = document.getElementById('user-name');
    if (userNameEl && user) {
      userNameEl.textContent = user.nome || username;
    }

    const userRoleEl = document.getElementById('user-role');
    if (userRoleEl && user?.perfil) {
      const profileLabel = window.Permissions?.getProfileLabel(user.perfil) || user.perfil;
      const profileColor = window.Permissions?.getProfileColor(user.perfil) || '#6b7280';
      userRoleEl.textContent = profileLabel;
      userRoleEl.style.color = profileColor;
    }

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
      this._loadDashboard();
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
    window.State?.resetFilters();
    window.State?.setTab('home');
    window.State?.setExpandedComputer(null);
  },

  logout() {
    if (window.Auth) {
      window.Auth.logout();
    } else {
      window.UserContext?.invalidate();
      this.showLoginScreen();
    }
  },

  go(tabId) {
    // Verificar acesso ao módulo
    if (tabId !== 'home' && window.AuthGuard && !window.AuthGuard.checkModule(tabId)) {
      return;
    }

    window.State.setTab(tabId);
    window.State.resetFilters();
    if (tabId !== 'computadores') {
      window.State.setExpandedComputer(null);
    }
    this.render();
  },

  render() {
    const mainEl = document.getElementById('main-content');
    const breadcrumbEl = document.getElementById('breadcrumb-container');
    if (!mainEl) return;

    // Renderizar sidebar
    if (window.Sidebar) {
      window.Sidebar.render();
    }

    // Renderizar breadcrumb
    if (breadcrumbEl && window.Sidebar) {
      breadcrumbEl.innerHTML = window.Sidebar.renderBreadcrumb();
    }

    // Renderizar conteúdo
    if (window.STATE.tab === 'home' && window.Dashboard.isLoaded()) {
      mainEl.innerHTML = '';
      window.DashboardUI.render('main-content');
    } else {
      mainEl.innerHTML = this._renderCurrentTabContent();
    }

    this._animateTabContent(mainEl);

    this._bindSidebarEvents();
    if (window.STATE.tab !== 'home') {
      this._bindSearchEvents();
      this._bindComputerCardEvents();
    }
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
        if (!window.Dashboard.isLoaded()) {
          window.DashboardUI.render();
          return '';
        }
        return '';
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
        if (!window.Projectors.isLoaded() && !window.Projectors.isLoading()) {
          window.Projectors.load();
        }
        window.ProjectorsUI.render('main-content');
        return '';
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
      case 'relatorios':
        window.ReportsUI.render('main-content');
        return '';
      case 'auditoria':
        window.AuditUI.render('main-content');
        return '';
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

  _bindSidebarEvents() {
    // Mobile toggle
    const mobileToggle = document.getElementById('sidebar-mobile-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (mobileToggle) {
      mobileToggle.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
          sidebar.classList.toggle('sidebar--mobile-open');
          overlay?.classList.toggle('active');
        }
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar?.classList.remove('sidebar--mobile-open');
        overlay.classList.remove('active');
      });
    }

    // Breadcrumb links
    document.querySelectorAll('.breadcrumb-link[data-sidebar-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = link.dataset.sidebarTab;
        if (tabId && window.App?.go) {
          window.App.go(tabId);
        }
      });
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

  async _loadDashboard() {
    if (window.Dashboard.isLoading()) return;

    const result = await window.Dashboard.load();
    if (result.ok && window.STATE.tab === 'home') {
      window.DashboardUI.render();
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
    this._animateTabContent(mainEl);
    this._bindSearchEvents();
    this._bindTicketEvents();
    this._bindComputerCardEvents();
  },

  _animateTabContent(mainEl) {
    if (!mainEl) return;
    mainEl.classList.remove('tab-switching');
    void mainEl.offsetWidth;
    mainEl.classList.add('tab-switching');
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
