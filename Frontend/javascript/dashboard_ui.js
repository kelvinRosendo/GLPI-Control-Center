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
    html += `
      <div class="dash-header">
        <div class="dash-header-left">
          <h1 class="dash-title">Dashboard Operacional</h1>
          <p class="dash-subtitle">Visão geral dos ativos e chamados</p>
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
    return `
      <div class="dash-card" style="--card-accent: ${this._esc(card.color)}" data-card-id="${this._esc(card.id)}">
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

        window.Dashboard.reset();
        await window.Dashboard.load();
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
};
