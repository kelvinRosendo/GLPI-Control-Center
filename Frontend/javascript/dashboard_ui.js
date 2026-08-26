/**
 * GLPI Control Center - dashboard_ui.js
 * -----------------------------------------------------------------------------
 * Módulo de renderização do Dashboard Operacional — Visual Corporativo.
 *
 * Sprint 28: Dashboard Corporativo
 */

window.DashboardUI = {
  _containerEl: null,

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════

  render(containerId = 'main-content') {
    const container = document.getElementById(containerId);
    if (!container) return;
    this._containerEl = container;

    const state = window.Dashboard.getState();

    if (state.loading && !state.loaded) {
      console.log('[DashboardUI] Renderizando skeleton de loading');
      container.innerHTML = this._renderLoading();
      return;
    }
    if (state.error && !state.loaded) {
      console.log('[DashboardUI] Renderizando estado de erro:', state.error);
      container.innerHTML = this._renderError(state.error);
      return;
    }
    if (!state.loaded) {
      console.log('[DashboardUI] Dashboard não carregado, renderizando loading');
      container.innerHTML = this._renderLoading();
      return;
    }

    console.log('[DashboardUI] Renderizando dashboard completo');
    container.innerHTML = this._renderDashboard();
    this._bindEvents();
  },

  updateCards() {
    if (!this._containerEl) return;
    const kpiEls = this._containerEl.querySelectorAll('.kpi-value');
    const indicators = window.Dashboard.getIndicators();
    kpiEls.forEach(el => {
      const kpiId = el.dataset.kpiId;
      if (kpiId) {
        const value = indicators[kpiId] ?? 0;
        el.textContent = this._formatNumber(value);
      }
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD COMPLETO
  // ══════════════════════════════════════════════════════════════════════════

  _renderDashboard() {
    const config = window.DASHBOARD_CONFIG;
    const indicators = window.Dashboard.getIndicators();

    let html = '<div class="dash-container">';

    // Header
    html += this._renderHeader();

    // KPIs
    html += this._renderKPIs(config.getKPIs(), indicators);

    // Grid principal: Charts
    html += '<div class="dash-grid">';
    html += '<div class="dash-grid-main">';

    // Chamados por período (large)
    html += this._renderChartPlaceholder('chamados_por_periodo');

    // Evolução de chamados (large)
    html += this._renderChartPlaceholder('evolucao_chamados');

    html += '</div>'; // dash-grid-main

    html += '<div class="dash-grid-side">';

    // Distribuição dos ativos (donut)
    html += this._renderChartPlaceholder('distribuicao_ativos');

    html += '</div>'; // dash-grid-side
    html += '</div>'; // dash-grid

    // Segunda linha: Status dos Ativos + Infraestrutura
    html += '<div class="dash-row-2">';
    html += '<div class="dash-col-2-3">';
    html += this._renderChartPlaceholder('status_ativos');
    html += '</div>';
    html += '<div class="dash-col-1-3">';
    html += this._renderInfrastructure();
    html += '</div>';
    html += '</div>';

    // Atenção necessária
    html += this._renderAttention(indicators);

    // Acessos rápidos
    html += this._renderQuickActions(config.getQuickActions());

    html += '</div>'; // dash-container
    return html;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ══════════════════════════════════════════════════════════════════════════

  _renderHeader() {
    const staleClass = window.Dashboard.isStale() ? 'dash-stale' : '';
    return `
      <div class="dash-header">
        <div class="dash-header-left">
          <h1 class="dash-title">Dashboard Operacional</h1>
          <p class="dash-subtitle ${staleClass}">Visão geral da infraestrutura e operação de TI</p>
        </div>
        <div class="dash-header-right">
          <span class="dash-updated">Atualizado agora</span>
          <button class="dash-refresh-btn" id="dash-refresh" title="Atualizar dados">
            <span class="gcc-icon gcc-icon--sm"><img src="css/icons/refresh.svg" alt="" /></span>
            Atualizar
          </button>
        </div>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // KPIs
  // ══════════════════════════════════════════════════════════════════════════

  _renderKPIs(kpis, indicators) {
    let html = '<div class="kpi-grid">';
    for (const kpi of kpis) {
      const value = indicators[kpi.id] ?? 0;
      const iconHtml = window.gccIcon ? window.gccIcon(kpi.icon, 'lg') : '';
      html += `
        <div class="kpi-card" style="--kpi-accent: ${kpi.color}" data-kpi-tab="${kpi.tab || ''}">
          <div class="kpi-icon" style="color: ${kpi.color}">${iconHtml}</div>
          <div class="kpi-body">
            <span class="kpi-value" data-kpi-id="${kpi.id}">${this._formatNumber(value)}</span>
            <span class="kpi-label">${this._esc(kpi.label)}</span>
            <span class="kpi-description">${this._esc(kpi.description)}</span>
          </div>
        </div>
      `;
    }
    html += '</div>';
    return html;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GRÁFICOS
  // ══════════════════════════════════════════════════════════════════════════

  _renderChartPlaceholder(chartId) {
    const config = window.DASHBOARD_CONFIG.getChart(chartId);
    if (!config) return '';
    const sizeClass = config.size === 'large' ? 'dash-chart-card--large' : '';
    const clickableClass = config.clickable ? 'dash-chart-clickable' : '';
    const dataAttr = config.clickable && config.tab ? `data-dash-tab="${this._esc(config.tab)}"` : '';

    return `
      <div class="dash-chart-card ${sizeClass} ${clickableClass}"
           data-chart-id="${this._esc(chartId)}"
           ${dataAttr}>
        <div class="dash-chart-header">
          <h3 class="dash-chart-title">${this._esc(config.titulo)}</h3>
        </div>
        <div class="dash-chart-container" id="chart-container-${this._esc(chartId)}">
          <div class="dash-chart-loading">
            <div class="ds-spinner ds-spinner--sm"></div>
            <span>Carregando...</span>
          </div>
        </div>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // INFRAESTRUTURA
  // ══════════════════════════════════════════════════════════════════════════

  _renderInfrastructure() {
    const infra = window.DASHBOARD_CONFIG.getInfrastructure();
    let html = `
      <div class="dash-card dash-infra-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">Infraestrutura</h3>
        </div>
        <div class="dash-infra-list">
    `;

    for (const item of infra) {
      const status = this._getInfraStatus(item.id);
      html += `
        <div class="dash-infra-item">
          <span class="dash-infra-dot" style="background: ${status.color}"></span>
          <span class="dash-infra-label">${this._esc(item.label)}</span>
          <span class="dash-infra-status" style="color: ${status.color}">${status.text}</span>
        </div>
      `;
    }

    html += '</div></div>';
    return html;
  },

  _getInfraStatus(id) {
    const glpiConnected = window.App?.assetsLoaded;
    const map = {
      glpi: glpiConnected
        ? { text: 'Online', color: 'var(--color-green)' }
        : { text: 'Offline', color: 'var(--color-red)' },
      backend: glpiConnected
        ? { text: 'Online', color: 'var(--color-green)' }
        : { text: 'Offline', color: 'var(--color-red)' },
      oauth: { text: 'Online', color: 'var(--color-green)' },
      fornecedores: { text: '3/4', color: 'var(--color-yellow)' },
      notificacoes: { text: 'Online', color: 'var(--color-green)' },
    };
    return map[id] || { text: '—', color: 'var(--color-text-muted)' };
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ATENÇÃO NECESSÁRIA
  // ══════════════════════════════════════════════════════════════════════════

  _renderAttention(indicators) {
    const items = [];

    if (indicators.chamados_abertos > 0) {
      items.push({
        type: 'warning',
        text: `${indicators.chamados_abertos} chamados aguardando atendimento`,
        tab: 'chamados',
      });
    }

    if (indicators.projectors_lampWarning > 0) {
      items.push({
        type: 'warning',
        text: `${indicators.projectors_lampWarning} projetores com lâmpada no limite`,
        tab: 'projetores',
      });
    }

    if (indicators.em_manutencao > 0) {
      items.push({
        type: 'warning',
        text: `${indicators.em_manutencao} equipamentos em manutenção`,
        tab: 'computadores',
      });
    }

    // Sempre mostrar status OK se não houver problemas
    if (items.length === 0) {
      items.push({
        type: 'success',
        text: 'Nenhum erro crítico detectado',
        tab: '',
      });
    }

    let html = `
      <div class="dash-card dash-attention-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">Atenção Necessária</h3>
        </div>
        <div class="dash-attention-list">
    `;

    for (const item of items) {
      const iconHtml = window.gccIcon
        ? window.gccIcon(item.type === 'success' ? 'success' : 'warning', 'sm')
        : '';
      const clickableClass = item.tab ? 'dash-attention-item--clickable' : '';
      const dataAttr = item.tab ? `data-dash-tab="${this._esc(item.tab)}"` : '';

      html += `
        <div class="dash-attention-item ${clickableClass}" ${dataAttr}>
          <span class="dash-attention-icon" style="color: ${item.type === 'success' ? 'var(--color-green)' : 'var(--color-yellow)'}">${iconHtml}</span>
          <span class="dash-attention-text">${this._esc(item.text)}</span>
        </div>
      `;
    }

    html += '</div></div>';
    return html;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACESSOS RÁPIDOS
  // ══════════════════════════════════════════════════════════════════════════

  _renderQuickActions(actions) {
    let html = '<div class="dash-quick-actions">';
    for (const action of actions) {
      const iconHtml = window.gccIcon ? window.gccIcon(action.icon, 'sm') : '';
      html += `
        <button class="dash-quick-btn" data-dash-tab="${this._esc(action.tab)}">
          ${iconHtml}
          <span>${this._esc(action.label)}</span>
        </button>
      `;
    }
    html += '</div>';
    return html;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADOS VISUAIS
  // ══════════════════════════════════════════════════════════════════════════

  _renderLoading() {
    return `
      <div class="dash-container">
        <div class="dash-header">
          <div class="dash-header-left">
            <h1 class="dash-title">Dashboard Operacional</h1>
            <p class="dash-subtitle">Carregando dados...</p>
          </div>
        </div>
        <div class="kpi-grid">
          ${Array(5).fill('').map(() => `
            <div class="kpi-card kpi-card--skeleton">
              <div class="kpi-icon"><div class="ds-skeleton" style="width:32px;height:32px;border-radius:8px;"></div></div>
              <div class="kpi-body">
                <div class="ds-skeleton" style="width:48px;height:28px;border-radius:6px;margin-bottom:4px;"></div>
                <div class="ds-skeleton" style="width:80px;height:12px;border-radius:4px;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  _renderError(message) {
    return `
      <div class="dash-container">
        <div class="dash-header">
          <div class="dash-header-left">
            <h1 class="dash-title">Dashboard Operacional</h1>
            <p class="dash-subtitle" style="color: var(--color-red)">Erro ao carregar dados</p>
          </div>
        </div>
        <div class="dash-error-card">
          <div class="dash-error-icon">
            <span class="gcc-icon gcc-icon--2xl" style="color: var(--color-red)"><img src="css/icons/error.svg" alt="" /></span>
          </div>
          <p class="dash-error-message">${this._esc(message)}</p>
          <button class="ds-btn ds-btn--secondary" id="dash-retry">Tentar novamente</button>
        </div>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  _bindEvents() {
    // Refresh
    const refreshBtn = document.getElementById('dash-refresh');
    if (refreshBtn) {
      refreshBtn.replaceWith(refreshBtn.cloneNode(true));
      document.getElementById('dash-refresh').addEventListener('click', async () => {
        const btn = document.getElementById('dash-refresh');
        btn.disabled = true;
        await window.Dashboard.forceRefresh();
        this.render();
      });
    }

    // Retry
    const retryBtn = document.getElementById('dash-retry');
    if (retryBtn) {
      retryBtn.replaceWith(retryBtn.cloneNode(true));
      document.getElementById('dash-retry').addEventListener('click', async () => {
        window.Dashboard.reset();
        this.render();
        await window.Dashboard.load();
        this.render();
      });
    }

    // KPI clicks
    document.querySelectorAll('.kpi-card[data-kpi-tab]').forEach(card => {
      card.addEventListener('click', () => {
        const tab = card.dataset.kpiTab;
        if (tab && window.App?.go) window.App.go(tab);
      });
    });

    // Chart clicks
    document.querySelectorAll('.dash-chart-clickable[data-dash-tab]').forEach(el => {
      el.addEventListener('click', () => {
        const tab = el.dataset.dashTab;
        if (tab && window.App?.go) window.App.go(tab);
      });
    });

    // Attention clicks
    document.querySelectorAll('.dash-attention-item--clickable[data-dash-tab]').forEach(el => {
      el.addEventListener('click', () => {
        const tab = el.dataset.dashTab;
        if (tab && window.App?.go) window.App.go(tab);
      });
    });

    // Quick action clicks
    document.querySelectorAll('.dash-quick-btn[data-dash-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.dashTab;
        if (tab && window.App?.go) window.App.go(tab);
      });
    });

    // Dashboard events — only bind once
    if (!this._eventsBound) {
      document.addEventListener('dashboard:loaded', () => this._renderCharts());
      document.addEventListener('dashboard:recalculated', () => this._updateCharts());
      window.addEventListener('beforeunload', () => window.DashboardCharts.destroy());
      this._eventsBound = true;
    }
  },

  _renderCharts() {
    console.log('[DashboardUI] Inicializando gráficos');
    setTimeout(() => {
      const config = window.DASHBOARD_CONFIG;
      const chartConfigs = config.getCharts();
      for (const chartConfig of chartConfigs) {
        if (!chartConfig.visible) continue;
        const containerId = 'chart-container-' + chartConfig.id;
        const container = document.getElementById(containerId);
        if (container) {
          window.DashboardCharts._renderChart(chartConfig);
        }
      }
    }, 100);
  },

  _updateCharts() {
    window.DashboardCharts.update();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  _formatNumber(num) {
    return new Intl.NumberFormat('pt-BR').format(num);
  },

  _esc(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};
