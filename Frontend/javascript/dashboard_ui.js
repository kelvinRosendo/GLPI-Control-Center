/**
 * GLPI Control Center - dashboard_ui.js
 * -----------------------------------------------------------------------------
 * Módulo de renderização do Dashboard Operacional.
 *
 * Responsabilidades:
 * - Renderizar cards de indicadores a partir de DASHBOARD_CONFIG
 * - Renderizar widgets de resumo operacional
 * - Gerenciar estados visuais (loading, vazio, erro)
 * - Animations e hover states
 *
 * NÃO contém lógica de negócio. Consulte dashboard.js.
 * NÃO contém configuração. Consulte dashboard.config.js.
 *
 * Sprint 5: Dashboard Operacional
 */

window.DashboardUI = {
  // ── Estado da UI ─────────────────────────────────────────────────────────

  _containerEl: null,

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza o dashboard completo dentro do container especificado.
   * @param {string} containerId - ID do elemento container
   */
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

  /**
   * Atualiza apenas os valores dos cards (sem re-render completo).
   * Mais performático que render() completo.
   */
  updateCards() {
    if (!this._containerEl) return;

    const cards = this._containerEl.querySelectorAll('.dash-card-value');
    const config = window.DASHBOARD_CONFIG;
    const indicators = window.Dashboard.getIndicators();

    cards.forEach(el => {
      const cardId = el.dataset.cardId;
      if (cardId) {
        const value = indicators[cardId] ?? 0;
        el.textContent = this._formatNumber(value);
        el.classList.add('dash-card-value-updated');
        setTimeout(() => el.classList.remove('dash-card-value-updated'), 600);
      }
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO: DASHBOARD COMPLETO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza o HTML completo do dashboard.
   * @returns {string}
   */
  _renderDashboard() {
    const config = window.DASHBOARD_CONFIG;
    const indicators = window.Dashboard.getIndicators();
    const widgets = window.Dashboard.getWidgets();

    const groups = this._groupBy(config.getCards(), 'group');
    const groupLabels = config.groupLabels;

    let html = '<div class="dash-container">';

    // Header
    const staleClass = window.Dashboard.isStale() ? 'dash-stale' : '';
    const staleIndicator = window.Dashboard.isStale() 
      ? '<span class="dash-stale-indicator">&#9888; Dados podem estar desatualizados</span>' 
      : '';
    
    html += `
      <div class="dash-header">
        <div class="dash-header-left">
          <h1 class="dash-title">Dashboard Operacional</h1>
          <p class="dash-subtitle ${staleClass}">Visão geral dos ativos e chamados ${staleIndicator}</p>
        </div>
        <div class="dash-header-right">
          <button class="dash-refresh-btn" id="dash-refresh" title="Atualizar dados">
            &#8635; Atualizar
          </button>
        </div>
      </div>
    `;

    // Cards por grupo
    for (const [groupKey, cards] of Object.entries(groups)) {
      const label = groupLabels[groupKey] || groupKey;
      html += `
        <div class="dash-section">
          <h2 class="dash-section-title">${this._esc(label)}</h2>
          <div class="dash-cards-grid">
            ${cards.map(card => this._renderCard(card, indicators[card.id] ?? 0)).join('')}
          </div>
        </div>
      `;
    }

    // Widgets
    html += this._renderWidgetsSection(widgets);

    // Gráficos e Analytics
    html += this._renderChartsSection();

    html += '</div>';
    return html;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO: CARDS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza um card de indicador.
   * @param {object} card - config do card
   * @param {number} value - valor calculado
   * @returns {string}
   */
  _renderCard(card, value) {
    const clickableClass = card.clickable ? 'dash-card-clickable' : '';
    const dataAttr = card.clickable && card.tab ? `data-dash-tab="${this._esc(card.tab)}"` : '';
    const titleAttr = card.clickable ? `title="Clique para ir para ${this._esc(card.label)}"` : '';
    const ariaLabel = card.clickable ? `aria-label="Navegar para ${this._esc(card.label)}"` : '';
    const roleAttr = card.clickable ? 'role="button" tabindex="0"' : '';
    
    return `
      <div class="dash-card ${clickableClass}" 
           style="--card-accent: ${this._esc(card.color)}" 
           data-card-id="${this._esc(card.id)}"
           ${dataAttr}
           ${titleAttr}
           ${ariaLabel}
           ${roleAttr}>
        <div class="dash-card-icon" style="color: ${this._esc(card.color)}">
          ${card.icon}
        </div>
        <div class="dash-card-body">
          <span class="dash-card-value" data-card-id="${this._esc(card.id)}">
            ${this._formatNumber(value)}
          </span>
          <span class="dash-card-label">${this._esc(card.label)}</span>
        </div>
        <div class="dash-card-description">
          ${this._esc(card.description)}
        </div>
      </div>
    `;
  },

  /**
   * Renderiza skeleton de loading para cards.
   * @returns {string}
   */
  _renderCardsSkeleton(count = 5) {
    return Array(count).fill('').map(() => `
      <div class="dash-card dash-card-skeleton">
        <div class="dash-skeleton-icon"></div>
        <div class="dash-card-body">
          <div class="dash-skeleton-value"></div>
          <div class="dash-skeleton-label"></div>
        </div>
        <div class="dash-skeleton-description"></div>
      </div>
    `).join('');
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO: WIDGETS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza a seção de widgets de resumo.
   * @param {object} widgets
   * @returns {string}
   */
  _renderWidgetsSection(widgets) {
    const config = window.DASHBOARD_CONFIG;
    const widgetConfigs = config.getWidgets();

    let html = `
      <div class="dash-section">
        <h2 class="dash-section-title">Resumo Operacional</h2>
        <div class="dash-widgets-grid">
    `;

    for (const wc of widgetConfigs) {
      const data = widgets[wc.id] || null;
      html += this._renderWidget(wc, data);
    }

    html += '</div></div>';
    return html;
  },

  /**
   * Renderiza um widget individual.
   * @param {object} widgetConfig
   * @param {object|null} data
   * @returns {string}
   */
  _renderWidget(widgetConfig, data) {
    const content = this._getWidgetContent(widgetConfig.id, data);

    return `
      <div class="dash-widget" data-widget-id="${this._esc(widgetConfig.id)}">
        <div class="dash-widget-icon">${widgetConfig.icon}</div>
        <div class="dash-widget-body">
          <span class="dash-widget-label">${this._esc(widgetConfig.label)}</span>
          <div class="dash-widget-value">${content}</div>
        </div>
      </div>
    `;
  },

  /**
   * Retorna o conteúdo HTML de um widget.
   * @param {string} widgetId
   * @param {object|null} data
   * @returns {string}
   */
  _getWidgetContent(widgetId, data) {
    if (!data) {
      return '<span class="dash-widget-empty">Nenhum dado disponível</span>';
    }

    switch (widgetId) {
      case 'ultimo_chamado':
        return `
          <span class="dash-widget-main">${this._esc(data.titulo)}</span>
          <span class="dash-widget-meta">#${this._esc(String(data.id))} · ${this._esc(data.status)}</span>
        `;

      case 'ultima_integracao':
        return `
          <span class="dash-widget-main">${this._esc(data.acao)}</span>
          <span class="dash-widget-meta">${this._esc(data.resultado)} · ${this._esc(this._formatDate(data.horario))}</span>
        `;

      case 'ultimo_fornecedor':
        return `
          <span class="dash-widget-main">${this._esc(data.nome)}</span>
        `;

      case 'ultima_atualizacao':
        return `
          <span class="dash-widget-main">${this._esc(this._formatDateTime(data.data))}</span>
        `;

      case 'audit_ultimos_eventos':
        if (!data.events || !data.events.length) {
          return '<span class="dash-widget-empty">Nenhum evento</span>';
        }
        return data.events.slice(0, 3).map(e =>
          `<div class="dash-widget-audit-item"><span class="dash-widget-audit-icon" style="color:${e.categoryColor}">${e.categoryIcon}</span><span class="dash-widget-audit-desc">${this._esc(e.acaoLabel)}</span></div>`
        ).join('') + `<span class="dash-widget-meta">${data.total} evento(s) no total</span>`;

      case 'audit_erros':
        if (!data.events || !data.events.length) {
          return '<span class="dash-widget-empty">Nenhum erro registrado</span>';
        }
        return data.events.slice(0, 3).map(e =>
          `<div class="dash-widget-audit-item"><span class="dash-widget-audit-icon" style="color:#ff5555">&#10060;</span><span class="dash-widget-audit-desc">${this._esc(e.acaoLabel)}</span></div>`
        ).join('') + `<span class="dash-widget-meta">${data.total} erro(s) no total</span>`;

      case 'audit_integracoes':
        if (!data.events || !data.events.length) {
          return '<span class="dash-widget-empty">Nenhuma integração</span>';
        }
        return data.events.slice(0, 3).map(e =>
          `<div class="dash-widget-audit-item"><span class="dash-widget-audit-icon" style="color:${e.categoryColor}">${e.categoryIcon}</span><span class="dash-widget-audit-desc">${this._esc(e.acaoLabel)}</span></div>`
        ).join('') + `<span class="dash-widget-meta">${data.total} integração(ões) no total</span>`;

      case 'audit_atividades_diarias':
        return `
          <div class="dash-widget-audit-stats">
            <div class="dash-widget-audit-stat"><span class="dash-widget-audit-stat-value">${data.today || 0}</span><span class="dash-widget-audit-stat-label">Hoje</span></div>
            <div class="dash-widget-audit-stat"><span class="dash-widget-audit-stat-value">${data.yesterday || 0}</span><span class="dash-widget-audit-stat-label">Ontem</span></div>
            <div class="dash-widget-audit-stat"><span class="dash-widget-audit-stat-value">${data.thisWeek || 0}</span><span class="dash-widget-audit-stat-label">Semana</span></div>
          </div>
        `;

      default:
        return '<span class="dash-widget-empty">-</span>';
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADOS VISUAIS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza estado de loading.
   * @returns {string}
   */
  _renderLoading() {
    return `
      <div class="dash-container">
        <div class="dash-header">
          <div class="dash-header-left">
            <h1 class="dash-title">Dashboard Operacional</h1>
            <p class="dash-subtitle">Carregando dados...</p>
          </div>
        </div>

        <div class="dash-section">
          <h2 class="dash-section-title">Inventário</h2>
          <div class="dash-cards-grid">
            ${this._renderCardsSkeleton(5)}
          </div>
        </div>

        <div class="dash-section">
          <h2 class="dash-section-title">Chamados</h2>
          <div class="dash-cards-grid">
            ${this._renderCardsSkeleton(3)}
          </div>
        </div>

        <div class="dash-section">
          <h2 class="dash-section-title">Status dos Ativos</h2>
          <div class="dash-cards-grid">
            ${this._renderCardsSkeleton(2)}
          </div>
        </div>

        <div class="dash-section">
          <h2 class="dash-section-title">Resumo Operacional</h2>
          <div class="dash-widgets-grid">
            ${this._renderWidgetsSkeleton(4)}
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Renderiza skeleton para widgets.
   * @param {number} count
   * @returns {string}
   */
  _renderWidgetsSkeleton(count = 4) {
    return Array(count).fill('').map(() => `
      <div class="dash-widget dash-widget-skeleton">
        <div class="dash-skeleton-icon small"></div>
        <div class="dash-widget-body">
          <div class="dash-skeleton-label"></div>
          <div class="dash-skeleton-value"></div>
        </div>
      </div>
    `).join('');
  },

  /**
   * Renderiza estado de erro.
   * @param {string} message
   * @returns {string}
   */
  _renderError(message) {
    return `
      <div class="dash-container">
        <div class="dash-header">
          <div class="dash-header-left">
            <h1 class="dash-title">Dashboard Operacional</h1>
            <p class="dash-subtitle dash-error">Erro ao carregar dados</p>
          </div>
        </div>

        <div class="dash-error-card">
          <div class="dash-error-icon">&#9888;</div>
          <p class="dash-error-message">${this._esc(message)}</p>
          <button class="dash-refresh-btn" id="dash-retry">
            &#8635; Tentar novamente
          </button>
        </div>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Vincula eventos interativos do dashboard.
   */
  _bindEvents() {
    // Botão de refresh
    const refreshBtn = document.getElementById('dash-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Atualizando...';

        await window.Dashboard.forceRefresh();
        this.render();

        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '&#8635; Atualizar';
      });
    }

    // Botão de retry (estado de erro)
    const retryBtn = document.getElementById('dash-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        window.Dashboard.reset();
        this.render();
        await window.Dashboard.load();
        this.render();
      });
    }

    // Cards clicáveis - navegação para abas
    document.querySelectorAll('.dash-card-clickable[data-dash-tab]').forEach(card => {
      card.addEventListener('click', () => {
        const tab = card.dataset.dashTab;
        if (tab && window.App && window.App.go) {
          window.App.go(tab);
        }
      });

      // Navegação por teclado
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const tab = card.dataset.dashTab;
          if (tab && window.App && window.App.go) {
            window.App.go(tab);
          }
        }
      });
    });

    // Escutar eventos de stale data
    document.addEventListener('dashboard:stale', () => {
      this._updateStaleIndicator();
    });

    // Escutar eventos de refresh
    document.addEventListener('dashboard:refreshing', () => {
      const refreshBtn = document.getElementById('dash-refresh');
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '&#8635; Atualizando...';
      }
    });

    document.addEventListener('dashboard:loaded', () => {
      const refreshBtn = document.getElementById('dash-refresh');
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '&#8635; Atualizar';
      }
      // Renderizar gráficos após dados carregados
      this._renderCharts();
    });

    // Escutar eventos de recalculo
    document.addEventListener('dashboard:recalculated', () => {
      // Atualizar gráficos quando dados são recalculados
      this._updateCharts();
    });

    // Destruir gráficos ao sair da página
    window.addEventListener('beforeunload', () => {
      window.DashboardCharts.destroy();
    });

    // Gráficos clicáveis
    document.querySelectorAll('.dash-chart-clickable[data-dash-tab]').forEach(chart => {
      chart.addEventListener('click', () => {
        const tab = chart.dataset.dashTab;
        if (tab && window.App && window.App.go) {
          window.App.go(tab);
        }
      });
    });
  },

  /**
   * Renderiza os gráficos após o dashboard carregar.
   */
  _renderCharts() {
    setTimeout(() => {
      window.DashboardCharts.render('dash-charts-container');
    }, 100); // Pequeno delay para garantir que o DOM está pronto
  },

  /**
   * Atualiza os gráficos quando dados são recalculados.
   */
  _updateCharts() {
    window.DashboardCharts.update();
  },

  /**
   * Atualiza o indicador de dados desatualizados.
   */
  _updateStaleIndicator() {
    const subtitle = document.querySelector('.dash-subtitle');
    if (subtitle && !subtitle.classList.contains('dash-stale')) {
      subtitle.classList.add('dash-stale');
      const staleIndicator = document.createElement('span');
      staleIndicator.className = 'dash-stale-indicator';
      staleIndicator.innerHTML = '&#9888; Dados podem estar desatualizados';
      subtitle.appendChild(staleIndicator);
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO: GRÁFICOS E ANALYTICS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza a seção de gráficos e analytics.
   * @returns {string}
   */
  _renderChartsSection() {
    const config = window.DASHBOARD_CONFIG;
    const analytics = window.Dashboard.getAnalytics();
    const chartConfigs = config.getCharts();

    let html = `
      <div class="dash-section">
        <h2 class="dash-section-title">Visualizações</h2>
        <div class="dash-charts-grid" id="dash-charts-container">
    `;

    // Renderizar cada gráfico
    for (const cc of chartConfigs) {
      if (!cc.visible) continue;
      html += this._renderChartCard(cc);
    }

    html += '</div>';

    // Renderizar analytics se habilitado
    if (config.analytics?.enabled) {
      html += this._renderAnalyticsSection(analytics);
    }

    html += '</div>';
    return html;
  },

  /**
   * Renderiza um card de gráfico.
   * @param {object} chartConfig - Configuração do gráfico
   * @returns {string}
   */
  _renderChartCard(chartConfig) {
    const clickableClass = chartConfig.clickable ? 'dash-chart-clickable' : '';
    const dataAttr = chartConfig.clickable && chartConfig.tab ? `data-dash-tab="${this._esc(chartConfig.tab)}"` : '';
    const titleAttr = chartConfig.clickable ? `title="Clique para ir para mais detalhes"` : '';

    return `
      <div class="dash-chart-card ${clickableClass}"
           data-chart-id="${this._esc(chartConfig.id)}"
           ${dataAttr}
           ${titleAttr}>
        <div class="dash-chart-header">
          <h3 class="dash-chart-title">${this._esc(chartConfig.titulo)}</h3>
        </div>
        <div class="dash-chart-container" id="chart-container-${this._esc(chartConfig.id)}">
          <div class="dash-chart-loading">
            <div class="dash-skeleton-icon"></div>
            <span>Carregando gráfico...</span>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Renderiza a seção de analytics.
   * @param {object} analytics - Dados de analytics
   * @returns {string}
   */
  _renderAnalyticsSection(analytics) {
    const config = window.DASHBOARD_CONFIG;
    if (!config.analytics?.enabled) return '';

    let html = `
      <div class="dash-section">
        <h2 class="dash-section-title">Analytics</h2>
        <div class="dash-analytics-grid">
    `;

    // Card: Total de Ativos
    html += this._renderAnalyticsCard({
      valor: this._formatNumber(analytics.total_ativos || 0),
      label: 'Total de Ativos',
      icon: '&#128202;',
    });

    // Card: Percentual Disponível
    html += this._renderAnalyticsCard({
      valor: `${analytics.percentual_disponivel || 0}%`,
      label: 'Disponíveis',
      icon: '&#9989;',
      cor: '#22c55e',
    });

    // Card: Percentual em Manutenção
    html += this._renderAnalyticsCard({
      valor: `${analytics.percentual_manutencao || 0}%`,
      label: 'Em Manutenção',
      icon: '&#128295;',
      cor: '#f59e0b',
    });

    // Card: Categoria Maior
    if (analytics.categoria_maior) {
      html += this._renderAnalyticsCard({
        valor: analytics.categoria_maior.nome,
        label: 'Maior Categoria',
        icon: '&#128200;',
      });
    }

    // Card: Fornecedor Mais Utilizado
    if (analytics.fornecedor_mais_utilizado) {
      html += this._renderAnalyticsCard({
        valor: analytics.fornecedor_mais_utilizado.nome,
        label: 'Fornecedor Top',
        icon: '&#128188;',
      });
    }

    // Card: Tipo de Chamado Predominante
    if (analytics.tipo_chamado_predominante) {
      html += this._renderAnalyticsCard({
        valor: this._capitalizeFirst(analytics.tipo_chamado_predominante.nome),
        label: 'Chamado Predominante',
        icon: '&#128196;',
      });
    }

    // Card: Tempo desde Atualização
    if (analytics.tempo_desde_atualizacao) {
      html += this._renderAnalyticsCard({
        valor: analytics.tempo_desde_atualizacao.texto,
        label: 'Última Atualização',
        icon: '&#128339;',
        cor: analytics.tempo_desde_atualizacao.isStale ? '#f59e0b' : '#22c55e',
      });
    }

    // Card: Chamados Abertos
    html += this._renderAnalyticsCard({
      valor: `${analytics.percentual_chamados_abertos || 0}%`,
      label: 'Chamados Abertos',
      icon: '&#128194;',
      cor: '#f59e0b',
    });

    html += '</div></div>';
    return html;
  },

  /**
   * Renderiza um card de analytics individual.
   * @param {object} data - Dados do card (valor, label, icon, cor)
   * @returns {string}
   */
  _renderAnalyticsCard(data) {
    const corStyle = data.cor ? `style="color: ${data.cor}"` : '';

    return `
      <div class="dash-analytics-card">
        <div class="dash-analytics-icon">${data.icon}</div>
        <div class="dash-analytics-value" ${corStyle}>${data.valor}</div>
        <div class="dash-analytics-label">${this._esc(data.label)}</div>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Agrupa array por propriedade.
   * @param {array} arr
   * @param {string} key
   * @returns {object}
   */
  _groupBy(arr, key) {
    return arr.reduce((groups, item) => {
      const group = item[key] || 'outros';
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
      return groups;
    }, {});
  },

  /**
   * Formata número com separadores de milhar.
   * @param {number} num
   * @returns {string}
   */
  _formatNumber(num) {
    return new Intl.NumberFormat('pt-BR').format(num);
  },

  /**
   * Formata data ISO para formato legível.
   * @param {string} isoString
   * @returns {string}
   */
  _formatDate(isoString) {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  },

  /**
   * Formata data/hora ISO para formato legível.
   * @param {string} isoString
   * @returns {string}
   */
  _formatDateTime(isoString) {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  },

  /**
   * Escape HTML.
   * @param {string} text
   * @returns {string}
   */
  _esc(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Capitaliza a primeira letra de uma string.
   * @param {string} text
   * @returns {string}
   */
  _capitalizeFirst(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  },
};
