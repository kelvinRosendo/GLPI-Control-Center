/**
 * GLPI Control Center - dashboard_ui.js
 * -----------------------------------------------------------------------------
 * Módulo de renderização do Dashboard Operacional — Sprint 30.
 *
 * Layout: visão operacional compacta, zero scroll.
 * KPI Total → Cards de categoria → Gráfico Ativos por Tipo + Chamados → Atenção + Status + Acessos
 */

window.DashboardUI = {
  _containerEl: null,
  _eventsBound: false,

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════

  render(containerId = 'main-content') {
    const container = document.getElementById(containerId);
    if (!container) return;
    this._containerEl = container;

    const state = window.Dashboard.getState();

    if (state.loading && !state.loaded) {
      container.innerHTML = this._renderLoading();
      return;
    }
    if (state.error && !state.loaded) {
      container.innerHTML = this._renderError(state.error);
      return;
    }
    if (!state.loaded) {
      container.innerHTML = this._renderLoading();
      return;
    }

    container.innerHTML = this._renderDashboard();
    this._bindEvents();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD COMPLETO
  // ══════════════════════════════════════════════════════════════════════════

  _renderDashboard() {
    const config = window.DASHBOARD_CONFIG;
    const indicators = window.Dashboard.getIndicators();
    const period = window.STATE.ticketPeriod || 'all';

    let html = '<div class="dash-container">';

    // Header
    html += this._renderHeader();

    // KPI Strip: Total + 4 categorias
    html += this._renderKPIs(config.getKPIs(), indicators);

    // Grid principal: [Gráfico Ativos por Tipo] [Chamados]
    html += '<div class="dash-main-grid">';

    // Coluna esquerda: Gráfico de ativos
    html += '<div class="dash-main-col">';
    html += this._renderAssetChart();
    html += '</div>';

    // Coluna direita: Chamados compactos
    html += '<div class="dash-side-col">';
    html += this._renderTicketsCompact(indicators, period);
    html += '</div>';

    html += '</div>'; // dash-main-grid

    // Grid inferior: [Atenção] [Status] [Acessos Rápidos]
    html += '<div class="dash-bottom-grid">';

    html += '<div class="dash-bottom-cell">';
    html += this._renderAttention(indicators);
    html += '</div>';

    html += '<div class="dash-bottom-cell">';
    html += this._renderStatusCompact();
    html += '</div>';

    html += '<div class="dash-bottom-cell">';
    html += this._renderQuickActions(config.getQuickActions());
    html += '</div>';

    html += '</div>'; // dash-bottom-grid

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
  // KPIs — Total + Categorias
  // ══════════════════════════════════════════════════════════════════════════

  _renderKPIs(kpis, indicators) {
    let html = '<div class="kpi-grid">';
    for (const kpi of kpis) {
      const value = indicators[kpi.id] ?? 0;
      const iconHtml = window.gccIcon ? window.gccIcon(kpi.icon, 'md') : '';
      const tabAttr = kpi.tab ? `data-dash-tab="${this._esc(kpi.tab)}"` : '';
      const clickableClass = kpi.tab ? 'kpi-card--clickable' : '';

      html += `
        <div class="kpi-card ${clickableClass}" style="--kpi-accent: ${kpi.color}" ${tabAttr}>
          <div class="kpi-icon" style="color: ${kpi.color}">${iconHtml}</div>
          <div class="kpi-body">
            <span class="kpi-value" data-kpi-id="${kpi.id}">${this._formatNumber(value)}</span>
            <span class="kpi-label">${this._esc(kpi.label)}</span>
          </div>
        </div>
      `;
    }
    html += '</div>';
    return html;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GRÁFICO PRINCIPAL — ATIVOS POR TIPO
  // ══════════════════════════════════════════════════════════════════════════

  _renderAssetChart() {
    let html = `
      <div class="dash-chart-card dash-chart-card--large">
        <div class="dash-chart-header">
          <h3 class="dash-chart-title">Ativos por Tipo</h3>
        </div>
        <div class="dash-chart-container" id="chart-container-ativos_por_tipo">
          <div class="dash-chart-loading">
            <div class="ds-spinner ds-spinner--sm"></div>
            <span>Carregando...</span>
          </div>
        </div>
      </div>
    `;
    return html;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CHAMADOS COMPACTOS
  // ══════════════════════════════════════════════════════════════════════════

  _renderTicketsCompact(indicators, period) {
    const periodo = indicators.chamados_periodo || {
      abertos: indicators.chamados_abertos,
      novos: indicators.chamados_novos,
      em_andamento: indicators.chamados_em_andamento,
      pendentes: indicators.chamados_pendentes,
    };

    let html = `
      <div class="dash-card dash-tickets-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">Chamados</h3>
        </div>

        <div class="tickets-total">
          <span class="tickets-total-number">${periodo.abertos}</span>
          <span class="tickets-total-label">ABERTOS</span>
        </div>

        <div class="tickets-breakdown">
          <div class="tickets-row">
            <span class="tickets-dot" style="background: #f59e0b"></span>
            <span class="tickets-label">Novos</span>
            <span class="tickets-count">${periodo.novos}</span>
          </div>
          <div class="tickets-row">
            <span class="tickets-dot" style="background: #4f7ef7"></span>
            <span class="tickets-label">Em andamento</span>
            <span class="tickets-count">${periodo.em_andamento}</span>
          </div>
          <div class="tickets-row">
            <span class="tickets-dot" style="background: #ff9f43"></span>
            <span class="tickets-label">Pendentes</span>
            <span class="tickets-count">${periodo.pendentes}</span>
          </div>
        </div>

        <div class="tickets-filters">
          ${window.DASHBOARD_CONFIG.getTicketPeriods().map(p => `
            <button class="tickets-filter-btn ${p.id === period ? 'active' : ''}"
                    data-ticket-period="${p.id}">${p.label}</button>
          `).join('')}
        </div>

        <div class="tickets-custom-range" id="tickets-custom-range" style="display: ${period === 'custom' ? 'flex' : 'none'}">
          <input type="date" id="ticket-date-start" class="tickets-date-input"
                 value="${window.STATE.ticketCustomStart || ''}" />
          <span class="tickets-date-sep">até</span>
          <input type="date" id="ticket-date-end" class="tickets-date-input"
                 value="${window.STATE.ticketCustomEnd || ''}" />
        </div>
      </div>
    `;
    return html;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ATENÇÃO NECESSÁRIA (máx 3)
  // ══════════════════════════════════════════════════════════════════════════

  _renderAttention(indicators) {
    const items = [];

    if (indicators.chamados_abertos > 0) {
      items.push({
        type: 'warning',
        text: `${indicators.chamados_abertos} chamados aguardando`,
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
    if (indicators.projectors_notices_criticos > 0) {
      items.push({
        type: 'danger',
        text: `${indicators.projectors_notices_criticos} projetores com alerta crítico`,
        tab: 'projetores',
      });
    }
    if (indicators.projectors_notices_defeito > 0) {
      items.push({
        type: 'warning',
        text: `${indicators.projectors_notices_defeito} projetores com defeito registrado`,
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

    // Limitar a 3 itens
    const visible = items.slice(0, 3);

    let html = `
      <div class="dash-card dash-attention-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">Atenção Necessária</h3>
        </div>
        <div class="dash-attention-list">
    `;

    if (visible.length === 0) {
      html += `
        <div class="dash-attention-item">
          <span class="dash-attention-icon" style="color: var(--color-green)">
            <span class="gcc-icon gcc-icon--sm"><img src="css/icons/success.svg" alt="" /></span>
          </span>
          <span class="dash-attention-text">Nenhum problema detectado</span>
        </div>
      `;
    } else {
      for (const item of visible) {
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
    }

    html += '</div></div>';
    return html;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS COMPACTO
  // ══════════════════════════════════════════════════════════════════════════

  _renderStatusCompact() {
    const infra = window.DASHBOARD_CONFIG.getInfrastructure();
    let html = `
      <div class="dash-card dash-status-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">Status</h3>
        </div>
        <div class="dash-status-list">
    `;

    for (const item of infra) {
      const status = this._getInfraStatus(item.id);
      html += `
        <div class="dash-status-item">
          <span class="dash-status-dot" style="background: ${status.color}"></span>
          <span class="dash-status-label">${this._esc(item.label)}</span>
          <span class="dash-status-value" style="color: ${status.color}">${status.text}</span>
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
      integracoes: { text: '3/4', color: 'var(--color-yellow)' },
    };
    return map[id] || { text: '—', color: 'var(--color-text-muted)' };
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACESSOS RÁPIDOS
  // ══════════════════════════════════════════════════════════════════════════

  _renderQuickActions(actions) {
    let html = `
      <div class="dash-card dash-quickactions-card">
        <div class="dash-card-header">
          <h3 class="dash-card-title">Acessos Rápidos</h3>
        </div>
        <div class="dash-quick-actions">
    `;
    for (const action of actions) {
      const iconHtml = window.gccIcon ? window.gccIcon(action.icon, 'sm') : '';
      html += `
        <button class="dash-quick-btn" data-dash-tab="${this._esc(action.tab)}">
          ${iconHtml}
          <span>${this._esc(action.label)}</span>
        </button>
      `;
    }
    html += '</div></div>';
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
              <div class="kpi-icon"><div class="ds-skeleton" style="width:28px;height:28px;border-radius:6px;"></div></div>
              <div class="kpi-body">
                <div class="ds-skeleton" style="width:40px;height:22px;border-radius:4px;margin-bottom:2px;"></div>
                <div class="ds-skeleton" style="width:60px;height:10px;border-radius:3px;"></div>
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
          <span class="gcc-icon gcc-icon--xl" style="color: var(--color-red)"><img src="css/icons/error.svg" alt="" /></span>
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
    this._replaceBtn('dash-refresh', async () => {
      const btn = document.getElementById('dash-refresh');
      if (btn) btn.disabled = true;
      await window.Dashboard.forceRefresh();
      this.render();
    });

    // Retry
    this._replaceBtn('dash-retry', async () => {
      window.Dashboard.reset();
      this.render();
      await window.Dashboard.load();
      this.render();
    });

    // KPI card clicks
    document.querySelectorAll('.kpi-card[data-dash-tab]').forEach(card => {
      card.addEventListener('click', () => {
        const tab = card.dataset.dashTab;
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

    // Ticket period filter clicks
    document.querySelectorAll('.tickets-filter-btn[data-ticket-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        const period = btn.dataset.ticketPeriod;
        window.State.setTicketPeriod(period);

        const customRange = document.getElementById('tickets-custom-range');
        if (customRange) {
          customRange.style.display = period === 'custom' ? 'flex' : 'none';
        }

        // Update active state
        document.querySelectorAll('.tickets-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Recalculate
        window.Dashboard.recalculate();
        this._updateTicketSection();
      });
    });

    // Custom date range
    const dateStart = document.getElementById('ticket-date-start');
    const dateEnd = document.getElementById('ticket-date-end');
    if (dateStart) {
      dateStart.addEventListener('change', () => {
        window.State.setTicketCustomDates(dateStart.value, dateEnd?.value);
        window.Dashboard.recalculate();
        this._updateTicketSection();
      });
    }
    if (dateEnd) {
      dateEnd.addEventListener('change', () => {
        window.State.setTicketCustomDates(dateStart?.value, dateEnd.value);
        window.Dashboard.recalculate();
        this._updateTicketSection();
      });
    }

    // Dashboard events — bind once
    if (!this._eventsBound) {
      document.addEventListener('dashboard:loaded', () => this._initCharts());
      document.addEventListener('dashboard:recalculated', () => this._updateCharts());
      window.addEventListener('beforeunload', () => window.DashboardCharts.destroy());
      this._eventsBound = true;
    }
  },

  _replaceBtn(id, handler) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
    clone.addEventListener('click', handler);
  },

  _initCharts() {
    setTimeout(() => {
      const chartConfigs = window.DASHBOARD_CONFIG.getCharts();
      for (const chartConfig of chartConfigs) {
        if (!chartConfig.visible) continue;
        const container = document.getElementById('chart-container-' + chartConfig.id);
        if (container) {
          window.DashboardCharts._renderChart(chartConfig);
        }
      }
    }, 50);
  },

  _updateCharts() {
    window.DashboardCharts.update();
  },

  _updateTicketSection() {
    const indicators = window.Dashboard.getIndicators();
    const period = window.STATE.ticketPeriod || 'all';
    const card = document.querySelector('.dash-tickets-card');
    if (!card) return;

    const periodo = indicators.chamados_periodo || {
      abertos: indicators.chamados_abertos,
      novos: indicators.chamados_novos,
      em_andamento: indicators.chamados_em_andamento,
      pendentes: indicators.chamados_pendentes,
    };

    const totalEl = card.querySelector('.tickets-total-number');
    if (totalEl) totalEl.textContent = periodo.abertos;

    const counts = card.querySelectorAll('.tickets-count');
    if (counts[0]) counts[0].textContent = periodo.novos;
    if (counts[1]) counts[1].textContent = periodo.em_andamento;
    if (counts[2]) counts[2].textContent = periodo.pendentes;
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
