/**
 * GLPI Control Center - app.js
 * Sprint 9.5: Integrado com Auth, UserContext e AuthGuard.
 */

window.App = {
  assetsLoading: false,
  assetsLoaded: false,

  async init() {
    this._bindStaticActions();
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
    if (window.Mobile) window.Mobile.init();
    if (window.ApiClient) window.ApiClient.init();
    if (window.ApiInterceptors) window.ApiInterceptors.install();
    if (window.Preload) window.Preload.init();
    if (window.PerfMonitor) window.PerfMonitor.init();
    if (window.Security) window.Security.init();
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

  _bindStaticActions() {
    document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());
    document.getElementById('ticket-send-btn')?.addEventListener('click', () => window.Tickets?.send());
    document.getElementById('ticket-cancel-btn')?.addEventListener('click', () => window.Tickets?.closeModal());
    document.getElementById('chat-close-btn')?.addEventListener('click', () => window.Chat?.closePanel());
    document.getElementById('chat-send-btn')?.addEventListener('click', () => window.Chat?.send());
    document.getElementById('chat-input')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') window.Chat?.send();
    });
    document.addEventListener('click', event => {
      const action = event.target.closest('[data-app-action]')?.dataset.appAction;
      if (action === 'home') this.go('home');
      if (action === 'logout') window.Auth?.logout();
      if (action === 'open-chat') window.Chat?.openPanel();
    });
  },

  async onLoginSuccess(username) {
    const user = window.UserContext?.getCurrentUser();

    // Atualizar avatar com foto do Google ou inicial
    const avatar = document.getElementById('user-avatar');
    if (avatar && user) {
      if (user.foto) {
        const safeUrl = window.Sanitization?.sanitizeUrl(user.foto) || '';
        if (safeUrl) {
          const image = document.createElement('img');
          image.src = safeUrl;
          image.alt = user.nome || 'Usuário';
          image.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
          avatar.replaceChildren(image);
        } else {
          avatar.textContent = user.nome?.charAt(0).toUpperCase() || 'U';
        }
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

    await this._loadInitialData();
  },

  async _loadInitialData() {
    console.log('[App] _loadInitialData iniciado');
    try {
      const result = await window.GlpiClient.loadAll();
      this.assetsLoading = false;

      if (result.ok) {
        this.assetsLoaded = true;
        this._setGlpiStatus('conectado');
      } else if (result.noSync) {
        this.assetsLoaded = false;
        this._setGlpiStatus('sem_sync');
      } else if (result.partial) {
        this.assetsLoaded = true;
        this._setGlpiStatus('parcial', result.errors);
        console.warn('[App] Alguns endpoints falharam:', result.errors);
      } else {
        this.assetsLoaded = false;
        this._setGlpiStatus('offline', result.errors);
        console.warn('[App] Todos os endpoints falharam:', result.errors);
      }

      console.log('[App] Dados iniciais carregados, renderizando');
      this.render();

      // Dashboard e tickets em background — não bloqueiam renderização inicial
      this._preloadTickets();
      this._loadDashboard();

    } catch (e) {
      this.assetsLoading = false;
      this.assetsLoaded = false;
      this._setGlpiStatus('offline', [e.message]);
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

  go(tabId, options = {}) {
    // Verificar acesso ao módulo
    if (tabId !== 'home' && window.AuthGuard && !window.AuthGuard.checkModule(tabId)) {
      return;
    }

    window.State.setTab(tabId);

    // Aplicar filtros opcionais (navegação via cards/dashboard)
    if (options.search !== undefined) {
      window.State.setSearch(options.search);
    } else {
      window.State.resetFilters();
    }
    if (options.status !== undefined) {
      window.State.setStatus(options.status);
    }

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
      const html = this._renderCurrentTabContent();
      if (html !== '') {
        mainEl.innerHTML = html;
      }
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
        window.DashboardUI.render();
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
      case 'salas':
        if (this.assetsLoading && !Object.keys(window.DATA.chromebooksSalas || {}).length) {
          return window.UI.renderSectionLoading('Carregando salas/turmas...');
        }
        return window.UI.renderSalas();
      case 'exibicao':
        if (this.assetsLoading && !window.DATA.chromebooksExibicao.length) {
          return window.UI.renderSectionLoading('Carregando Chromebooks de Exibição...');
        }
        return window.UI.renderAssetList(window.DATA.chromebooksExibicao, 'Buscar Chromebook de exibição por nome ou serial...', 'chromebook');
      case 'projetores':
        if (this.assetsLoading && !window.DATA.projetores.length) {
          return window.UI.renderSectionLoading('Carregando projetores...');
        }
        if (!window.Projectors.isLoaded() && !window.Projectors.isLoading()) {
          this._loadProjectors();
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
          return `<p class="empty-msg">${window.Sanitization?.escapeHtml(window.STATE.ticketsError) || 'Falha ao carregar chamados.'}</p>`;
        }

        return window.UI.renderTickets(window.STATE.tickets);
      case 'inventario':
        if (this.assetsLoading && !window.DATA.classifiedAssets?.length) {
          return window.UI.renderSectionLoading('Carregando inventário...');
        }
        return window.UI.renderInventoryTable();
      case 'relatorios':
        window.ReportsUI.render('main-content');
        return '';
      case 'auditoria':
        window.AuditUI.render('main-content');
        return '';
      case 'admin-sync':
        if (window.AdminSync) window.AdminSync.render('main-content');
        return '';
      case 'assistente':
        return `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px;">
            <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(var(--color-accent-rgb),0.1);">
              <span class="gcc-icon gcc-icon--xl" style="color:var(--color-accent)"><img src="css/icons/assistance.svg" alt="" /></span>
            </div>
            <h3 style="margin:0;font-size:18px;">Assistente de Horários</h3>
            <p style="margin:0;color:var(--text2,#9299b8);font-size:14px;text-align:center;">Tire dúvidas sobre os horários dos carrinhos de Chromebooks.</p>
            <button data-app-action="open-chat" style="padding:12px 28px;background:var(--accent,#4f7ef7);border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Abrir chat</button>
          </div>
        `;
      default:
        return '<p class="empty-msg">Aba nao encontrada.</p>';
    }
  },

  async _loadProjectors() {
    try {
      const result = await window.Projectors.load();
      if (window.State?.getTab() === 'projetores') {
        window.ProjectorsUI.render('main-content');
      }
    } catch (e) {
      console.error('[App] Erro ao carregar projetores:', e);
      if (window.State?.getTab() === 'projetores') {
        window.ProjectorsUI.render('main-content');
      }
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

    // Inventory search
    const invSearch = document.getElementById('inventory-search');
    const invClear = document.getElementById('inventory-search-clear');

    if (invSearch) {
      invSearch.addEventListener('input', () => {
        window.State.setSearch(invSearch.value);
        window.State.setInventoryPage(1);
        this._renderContent();
      });
    }

    if (invClear) {
      invClear.addEventListener('click', () => {
        window.State.setSearch('');
        window.State.setInventoryPage(1);
        this._renderContent();
      });
    }

    document.querySelectorAll('.filter-btn[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.State.setStatus(btn.dataset.status);
        this._renderContent();
      });
    });

    // Inventory table filters
    const catFilter = document.getElementById('filter-category');
    const itemtypeFilter = document.getElementById('filter-itemtype');
    const stateFilter = document.getElementById('filter-state');

    if (catFilter) {
      catFilter.addEventListener('change', () => {
        window.State.setCategoryFilter(catFilter.value);
        this._renderContent();
      });
    }
    if (itemtypeFilter) {
      itemtypeFilter.addEventListener('change', () => {
        window.State.setItemtypeFilter(itemtypeFilter.value);
        this._renderContent();
      });
    }
    if (stateFilter) {
      stateFilter.addEventListener('change', () => {
        window.State.setStateFilter(stateFilter.value);
        this._renderContent();
      });
    }

    // Inventory pagination
    document.querySelectorAll('.btn-page[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.State.setInventoryPage(Number(btn.dataset.page));
        this._renderContent();
      });
    });

    // Inventory sort headers
    document.querySelectorAll('.sortable-th[data-sort-field]').forEach(th => {
      th.addEventListener('click', () => {
        window.State.setInventorySort(th.dataset.sortField);
        this._renderContent();
      });
    });

    // Clear filters button
    const clearFiltersBtn = document.getElementById('clear-inventory-filters');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        window.State.resetFilters();
        this._renderContent();
      });
    }
  },

  _bindComputerCardEvents() {
    document.querySelectorAll('[data-computer-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemtype = btn.dataset.itemtype || 'Computer';
        await this.toggleComputerPanel(Number(btn.dataset.computerToggle), { itemtype });
      });
    });
    document.querySelectorAll('[data-open-workflow]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.openWorkflow);
        const itemtype = btn.dataset.itemtype || 'Computer';
        const allAssets = [
          ...(window.DATA.computadores || []),
          ...(window.DATA.chromebooksGeekiees || []),
          ...(window.DATA.projetores || []),
          ...(window.DATA.impressoras || []),
          ...Object.values(window.DATA.chromebooksApoio || {}).flat(),
          ...Object.values(window.DATA.chromebooksSalas || {}).flat(),
        ];
        const asset = allAssets.find(item => Number(item.glpiId) === id && (item.itemtype || 'Computer') === itemtype);
        if (asset) window.Workflow.open(asset);
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
    const DETAIL_TTL = 300000;

    if (cached?.data && !options.forceReload && cached._fetchedAt && (Date.now() - cached._fetchedAt < DETAIL_TTL)) {
      this._renderComputerModal();
      return;
    }

    // Determinar itemtype do ativo
    const itemtype = options.itemtype || this._resolveItemtype(glpiId) || 'Computer';

    window.State.updateComputerDetails(glpiId, {
      loading: true,
      saving: false,
      error: '',
      successMessage: '',
      itemtype,
    });
    this._renderComputerModal();

    try {
      const detail = await window.GlpiClient.fetchAssetDetails(glpiId, itemtype);
      window.State.updateComputerDetails(glpiId, {
        loading: false,
        saving: false,
        error: '',
        successMessage: '',
        data: detail,
        itemtype,
        draft: { ...(detail?.editableValues || {}) },
        _fetchedAt: Date.now(),
      });
    } catch (error) {
      window.State.updateComputerDetails(glpiId, {
        loading: false,
        saving: false,
        error: error.message || 'Falha ao carregar os detalhes do ativo.',
        itemtype,
      });
    }

    this._renderComputerModal();
  },

  async saveComputerDetails(glpiId, form) {
    const payload = Object.fromEntries(new FormData(form).entries());
    const state = window.STATE.computerDetailsById[glpiId] || {};
    const itemtype = state.itemtype || 'Computer';

    window.State.updateComputerDetails(glpiId, {
      saving: true,
      error: '',
      successMessage: '',
      draft: payload,
    });
    this._renderComputerModal();

    try {
      const detail = await window.GlpiClient.updateAsset(glpiId, itemtype, payload);
      this._replaceComputerSummary(detail?.asset);
      window.State.updateComputerDetails(glpiId, {
        loading: false,
        saving: false,
        error: '',
        successMessage: 'Alterações salvas no GLPI e sincronizadas com a lista.',
        data: detail,
        draft: { ...(detail?.editableValues || {}) },
        _fetchedAt: Date.now(),
      });
    } catch (error) {
      window.State.updateComputerDetails(glpiId, {
        saving: false,
        error: error.message || 'Não foi possível salvar as alterações.',
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

    console.log('[App] _loadDashboard iniciado');
    try {
      const result = await window.Dashboard.load();
      if (result.ok && window.STATE.tab === 'home') {
        console.log('[App] Dashboard carregado com sucesso, renderizando UI');
        window.DashboardUI.render();
      } else if (!result.ok) {
        console.warn('[App] Dashboard falhou:', result.error);
        if (window.STATE.tab === 'home') {
          window.DashboardUI.render();
        }
      }
    } catch (error) {
      console.error('[App] _loadDashboard erro:', error);
      if (window.STATE.tab === 'home') {
        window.DashboardUI.render();
      }
    }
  },

  _replaceComputerSummary(asset) {
    if (!asset?.glpiId) return;
    window.DATA.computadores = (window.DATA.computadores || []).map(item => item.glpiId === asset.glpiId ? { ...item, ...asset } : item);
  },

  /**
   * Resolve itemtype de um ativo pelo glpiId.
   * Procura em TODAS as coleções com itemtype para desambiguar.
   */
  _resolveItemtype(glpiId) {
    const id = Number(glpiId);
    const classified = window.DATA.classifiedAssets || [];
    const found = classified.find(a => Number(a.id) === id);
    if (found?.itemtype) return found.itemtype;
    if ((window.DATA.computadores || []).some(a => Number(a.glpiId) === id)) return 'Computer';
    if ((window.DATA.impressoras || []).some(a => Number(a.glpiId) === id)) return 'Printer';
    return 'Computer';
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
      modalEl.classList.add('hidden');
      contentEl.innerHTML = '';
      document.body.classList.remove('modal-open');
      return;
    }

    // Buscar asset classificado por id
    const classified = window.DATA.classifiedAssets || [];
    const classifiedAsset = classified.find(a => Number(a.id) === Number(glpiId));
    const asset = classifiedAsset || (window.DATA.computadores || []).find(item => item.glpiId === glpiId) || { glpiId };
    const state = window.STATE.computerDetailsById[glpiId] || null;
    const itemtype = state?.itemtype || classifiedAsset?.itemtype || asset.itemtype || 'Computer';

    contentEl.innerHTML = window.UI.renderComputerModal(asset, state, itemtype);
    modalEl.classList.remove('hidden');
    document.body.classList.add('modal-open');

    // Injetar seção de classificação se disponível
    if (classifiedAsset && contentEl.querySelector('.computer-panel')) {
      const panel = contentEl.querySelector('.computer-panel');
      const classSection = window.UI.renderClassificationSection(classifiedAsset);
      const rawSection = window.UI.renderRawDataSection(classifiedAsset._raw);
      if (classSection) {
        panel.insertAdjacentHTML('beforeend', classSection);
      }
      if (rawSection) {
        panel.insertAdjacentHTML('beforeend', rawSection);
      }
    }

    modalEl.querySelectorAll('[data-computer-modal-close]').forEach(element => {
      element.addEventListener('click', () => {
        window.State.setExpandedComputer(null);
        this._renderComputerModal();
      });
    });

    modalEl.querySelectorAll('[data-computer-retry]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.toggleComputerPanel(Number(btn.dataset.computerRetry), { forceReload: true, itemtype });
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

  _setGlpiStatus(estado, errors) {
    const el = document.getElementById('glpi-status');
    if (!el) return;

    // Enriquecer com info de sync
    const D = window.DATA || {};

    const map = {
      carregando: { texto: 'Conectando...', cor: 'var(--color-text-muted)', bg: 'rgba(var(--color-text-muted-rgb), 0.08)' },
      conectado: { texto: 'Dados carregados', cor: 'var(--color-green)', bg: 'rgba(var(--color-green-rgb), 0.08)' },
      sem_sync: { texto: 'Sem dados — execute sincronização', cor: 'var(--color-yellow)', bg: 'rgba(var(--color-yellow-rgb), 0.08)' },
      parcial: { texto: 'Dados parciais (algumas fontes falharam)', cor: 'var(--color-yellow)', bg: 'rgba(var(--color-yellow-rgb), 0.08)' },
      offline: { texto: 'Backend indisponível', cor: 'var(--color-red)', bg: 'rgba(var(--color-red-rgb), 0.08)' },
    };

    // Enriquecer com info de sync se disponível
    if (D.syncStatus?.status === 'partial' && estado === 'conectado') {
      map.conectado.texto = 'Dados parciais (sync incompleta)';
      map.conectado.cor = 'var(--color-yellow)';
      map.conectado.bg = 'rgba(var(--color-yellow-rgb), 0.08)';
    }

    const s = map[estado] || map.offline;
    el.style.color = s.cor;
    el.style.background = s.bg;
    el.title = (errors && errors.length) ? 'Falhas: ' + errors.join('; ') : '';
    const dot = el.querySelector('.glpi-status-dot');
    if (dot) dot.style.background = s.cor;
    const text = el.querySelector('.glpi-status-text');
    if (text) text.textContent = s.texto;
  },
};

document.addEventListener('DOMContentLoaded', () => window.App.init());
