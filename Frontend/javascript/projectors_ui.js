/**
 * GLPI Control Center - projectors_ui.js
 * -----------------------------------------------------------------------------
 * Módulo de renderização da interface de Gestão de Projetores.
 *
 * Responsabilidades:
 * - Renderizar grid de cards dos projetores
 * - Renderizar indicadores e alertas
 * - Renderizar detalhes de um projetor
 * - Renderizar formulário de manutenção
 * - Renderizar timeline de histórico
 * - Gerenciar estados Loading, Empty, Error
 * - Bind de eventos da interface
 *
 * NÃO contém regras de negócio. Consulte projectors.js.
 * NÃO registra manutenções. Consulte projectors_maintenance.js.
 *
 * Sprint 8: Módulo de Gestão de Projetores
 */

window.ProjectorsUI = {

  // ── Estado da UI ─────────────────────────────────────────────────────────

  _uiState: {
    view: 'grid',           // 'grid' | 'detail' | 'maintenance_form'
    selectedProjector: null,
    searchQuery: '',
    statusFilter: 'todos',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza o conteúdo do módulo de projetores.
   * @param {string} containerId
   */
  async render(containerId = 'main-content') {
    const container = document.getElementById(containerId);
    if (!container) return;

    switch (this._uiState.view) {
      case 'grid':
        container.innerHTML = this._renderGridView();
        break;
      case 'detail':
        container.innerHTML = await this._renderDetailView();
        break;
      case 'maintenance_form':
        container.innerHTML = this._renderMaintenanceFormView();
        break;
      default:
        container.innerHTML = this._renderGridView();
    }

    this._bindEvents();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: GRID DE PROJETORES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza a view principal com grid de cards.
   * @returns {string} HTML
   */
  _renderGridView() {
    const state = window.Projectors.getState();

    if (state.loading) return this._renderLoading();
    if (state.error) return this._renderError(state.error);
    if (!state.loaded) return this._renderLoading();

    return `
      <div class="pj-container">
        ${this._renderHeader()}
        ${this._renderIndicators()}
        ${this._renderAlertsBanner()}
        ${this._renderSearchBar()}
        ${this._renderProjectorGrid()}
      </div>
    `;
  },

  /**
   * Renderiza cabeçalho do módulo.
   */
  _renderHeader() {
    return `
      <div class="pj-header">
        <div class="pj-header-left">
          <h1 class="pj-title">&#128249; Gestão de Projetores</h1>
          <p class="pj-subtitle">Controle de vida útil, manutenções e alertas</p>
        </div>
        <div class="pj-header-right">
          <button class="pj-btn pj-btn-secondary" id="pj-diagnostic" title="Diagnosticar problemas" aria-label="Diagnosticar">
            &#128269; Diagnóstico
          </button>
          <button class="pj-btn pj-btn-secondary" id="pj-refresh" aria-label="Atualizar dados">
            &#8635; Atualizar
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Renderiza indicadores gerais.
   */
  _renderIndicators() {
    const ind = window.Projectors.getIndicators();
    return `
      <div class="pj-indicators-grid">
        <div class="pj-indicator-card">
          <span class="pj-indicator-icon" style="color: var(--accent)">&#128249;</span>
          <div class="pj-indicator-body">
            <span class="pj-indicator-value">${ind.total || 0}</span>
            <span class="pj-indicator-label">Total</span>
          </div>
        </div>
        <div class="pj-indicator-card">
          <span class="pj-indicator-icon" style="color: #00c896">&#9989;</span>
          <div class="pj-indicator-body">
            <span class="pj-indicator-value">${ind.operando || 0}</span>
            <span class="pj-indicator-label">Operando</span>
          </div>
        </div>
        <div class="pj-indicator-card">
          <span class="pj-indicator-icon" style="color: #ffc107">&#9888;</span>
          <div class="pj-indicator-body">
            <span class="pj-indicator-value">${ind.atencao || 0}</span>
            <span class="pj-indicator-label">Atenção</span>
          </div>
        </div>
        <div class="pj-indicator-card">
          <span class="pj-indicator-icon" style="color: #f59e0b">&#128295;</span>
          <div class="pj-indicator-body">
            <span class="pj-indicator-value">${ind.manutencao || 0}</span>
            <span class="pj-indicator-label">Manutenção</span>
          </div>
        </div>
        <div class="pj-indicator-card">
          <span class="pj-indicator-icon" style="color: #ff5555">&#128161;</span>
          <div class="pj-indicator-body">
            <span class="pj-indicator-value">${ind.lampWarning || 0}</span>
            <span class="pj-indicator-label">Lâmpadas Atenção</span>
          </div>
        </div>
        <div class="pj-indicator-card">
          <span class="pj-indicator-icon" style="color: var(--text2)">&#9200;</span>
          <div class="pj-indicator-body">
            <span class="pj-indicator-value">${ind.mediaHoras || 0}h</span>
            <span class="pj-indicator-label">Média Horas</span>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Renderiza banner de alertas.
   */
  _renderAlertsBanner() {
    const alerts = window.Projectors.getAlerts();
    if (!alerts.length) return '';

    const critical = alerts.filter(a => a.highestSeverity === 'critical').length;
    const warning = alerts.filter(a => a.highestSeverity === 'warning').length;

    return `
      <div class="pj-alerts-banner" role="alert">
        <span class="pj-alerts-icon">&#9888;</span>
        <span class="pj-alerts-text">
          ${critical > 0 ? `<strong>${critical}</strong> crítico${critical > 1 ? 's' : ''}` : ''}
          ${critical > 0 && warning > 0 ? ' · ' : ''}
          ${warning > 0 ? `<strong>${warning}</strong> com atenção` : ''}
          ${alerts.length === 1 ? '1 alerta ativo' : `${alerts.length} alertas ativos`}
        </span>
      </div>
    `;
  },

  /**
   * Renderiza barra de busca e filtros.
   */
  _renderSearchBar() {
    const config = window.PROJECTORS_CONFIG;
    return `
      <div class="pj-search-bar">
        <div class="pj-search-input-wrap">
          <span class="pj-search-icon">&#128269;</span>
          <input
            class="pj-search-input"
            id="pj-search"
            type="text"
            placeholder="Buscar por nome, patrimônio ou serial..."
            value="${this._escapeAttr(this._uiState.searchQuery)}"
            autocomplete="off"
            aria-label="Buscar projetor"
          />
          ${this._uiState.searchQuery
            ? '<button class="pj-search-clear" id="pj-search-clear" title="Limpar busca" aria-label="Limpar busca">&#10005;</button>'
            : ''}
        </div>
        <div class="pj-status-filters">
          <button class="pj-status-btn ${this._uiState.statusFilter === 'todos' ? 'active' : ''}" data-pj-status="todos">
            Todos
          </button>
          ${Object.values(config.status).map(s => `
            <button class="pj-status-btn ${this._uiState.statusFilter === s.key ? 'active' : ''}"
                    data-pj-status="${s.key}"
                    style="--status-color: ${s.color}">
              <span>${s.icon}</span> ${s.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },

  /**
   * Renderiza grid de cards dos projetores.
   */
  _renderProjectorGrid() {
    const projectors = window.Projectors.getProjectors();
    const query = this._uiState.searchQuery.toLowerCase().trim();
    const statusFilter = this._uiState.statusFilter;

    let filtered = projectors;

    if (query) {
      filtered = filtered.filter(p =>
        (p.nome || '').toLowerCase().includes(query) ||
        (p.patrimonio || '').toLowerCase().includes(query) ||
        (p.serial || '').toLowerCase().includes(query)
      );
    }

    if (statusFilter !== 'todos') {
      filtered = filtered.filter(p => p.calculatedStatus === statusFilter);
    }

    if (!projectors.length) {
      return this._renderEmptyState('Nenhum projetor encontrado', 'Verifique se há projetores cadastrados no GLPI.');
    }

    if (!filtered.length) {
      return this._renderEmptyState('Nenhum resultado', 'Tente buscar por outros termos ou ajustar os filtros.');
    }

    return `
      <p class="pj-result-count">${filtered.length} de ${projectors.length} projetor${projectors.length !== 1 ? 'es' : ''}</p>
      <div class="pj-grid">
        ${filtered.map(p => this._renderProjectorCard(p)).join('')}
      </div>
    `;
  },

  /**
   * Renderiza card de um projetor.
   * @param {object} projector
   * @returns {string} HTML
   */
  _renderProjectorCard(projector) {
    const config = window.PROJECTORS_CONFIG;
    const statusConfig = config.getStatus(projector.calculatedStatus) || config.status.operando;
    const lampPct = window.Projectors.getLampPercentage(projector);
    const lampColor = window.Projectors.getLampColor(lampPct);
    const lampRemaining = window.Projectors.getLampRemaining(projector);

    // Alertas deste projetor
    const alerts = window.Projectors.getAlerts().find(a => a.projector.glpiId === projector.glpiId);
    const hasAlerts = !!alerts;

    return `
      <div class="pj-card ${hasAlerts ? 'pj-card-alert' : ''}"
           data-pj-select="${projector.glpiId}"
           tabindex="0" role="button"
           aria-label="Ver detalhes de ${this._escapeAttr(projector.nome)}"
           style="--card-accent: ${statusConfig.color}">
        <div class="pj-card-header">
          <span class="pj-card-icon">&#128249;</span>
          <span class="pj-card-status" style="color: ${statusConfig.color}">
            ${statusConfig.icon} ${statusConfig.label}
          </span>
        </div>

        <div class="pj-card-body">
          <h3 class="pj-card-name">${this._escapeHtml(projector.nome)}</h3>
          <div class="pj-card-meta">
            ${projector.patrimonio ? `<span class="pj-card-meta-item"><strong>Pat.</strong> ${this._escapeHtml(projector.patrimonio)}</span>` : ''}
            ${projector.modelo ? `<span class="pj-card-meta-item"><strong>Mod.</strong> ${this._escapeHtml(projector.modelo)}</span>` : ''}
            ${projector.reparticao ? `<span class="pj-card-meta-item"><strong>Local.</strong> ${this._escapeHtml(projector.reparticao)}</span>` : ''}
          </div>
        </div>

        <div class="pj-card-lamp">
          <div class="pj-lamp-header">
            <span class="pj-lamp-label">&#128161; Lâmpada</span>
            <span class="pj-lamp-pct" style="color: ${lampColor}">${lampPct}%</span>
          </div>
          <div class="pj-lamp-bar">
            <div class="pj-lamp-fill" style="width: ${lampPct}%; background: ${lampColor}"></div>
          </div>
          <div class="pj-lamp-detail">
            <span>${projector.horas_lampada || 0}h / ${projector.vida_util_estimada || config.lamp.lifeHours}h</span>
            ${lampRemaining > 0 ? `<span>${lampRemaining}h restantes</span>` : ''}
          </div>
        </div>

        ${hasAlerts ? `
          <div class="pj-card-alerts">
            ${alerts.alerts.slice(0, 2).map(a => `
              <span class="pj-card-alert-tag pj-alert-${a.severity}">${a.message}</span>
            `).join('')}
            ${alerts.alerts.length > 2 ? `<span class="pj-card-alert-more">+${alerts.alerts.length - 2}</span>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: DETALHES DO PROJETOR
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza a view de detalhes de um projetor.
   * @returns {string} HTML
   */
  async _renderDetailView() {
    const projector = this._uiState.selectedProjector;
    if (!projector) return this._renderGridView();

    const config = window.PROJECTORS_CONFIG;
    const statusConfig = config.getStatus(projector.calculatedStatus) || config.status.operando;
    const lampPct = window.Projectors.getLampPercentage(projector);
    const lampColor = window.Projectors.getLampColor(lampPct);
    const history = await window.ProjectorsMaintenance.getHistory(projector.glpiId);
    const stats = await window.ProjectorsMaintenance.getStats(projector.glpiId);

    return `
      <div class="pj-container">
        <div class="pj-detail-header">
          <button class="pj-back-btn" id="pj-back-grid" aria-label="Voltar para lista">
            &#8592; Projetores
          </button>
          <div class="pj-detail-title-group">
            <span class="pj-detail-icon">&#128249;</span>
            <div>
              <h2 class="pj-detail-title">${this._escapeHtml(projector.nome)}</h2>
              <p class="pj-detail-subtitle">
                <span class="pj-card-status" style="color: ${statusConfig.color}">${statusConfig.icon} ${statusConfig.label}</span>
                ${projector.patrimonio ? ` · Pat. ${this._escapeHtml(projector.patrimonio)}` : ''}
              </p>
            </div>
          </div>
          <div class="pj-detail-actions">
            <button class="pj-btn pj-btn-primary" id="pj-add-maintenance" data-pj-maint-projector="${projector.glpiId}">
              &#128295; Registrar Manutenção
            </button>
          </div>
        </div>

        <!-- Lamp Bar -->
        <div class="pj-detail-lamp-section">
          <div class="pj-detail-lamp-header">
            <span class="pj-detail-lamp-title">&#128161; Vida Útil da Lâmpada</span>
            <span class="pj-detail-lamp-pct" style="color: ${lampColor}; font-size: 24px; font-weight: 700">${lampPct}%</span>
          </div>
          <div class="pj-detail-lamp-bar">
            <div class="pj-detail-lamp-fill" style="width: ${lampPct}%; background: ${lampColor}"></div>
          </div>
          <div class="pj-detail-lamp-stats">
            <span>${projector.horas_lampada || 0}h utilizadas</span>
            <span>${projector.vida_util_estimada || config.lamp.lifeHours}h vida útil estimada</span>
            <span>${window.Projectors.getLampRemaining(projector)}h restantes</span>
          </div>
        </div>

        <div class="pj-detail-grid">
          <!-- Informações -->
          <div class="pj-detail-section">
            <h3 class="pj-detail-section-title">&#128196; Informações</h3>
            <div class="pj-detail-fields">
              ${config.fields.map(f => `
                <div class="pj-detail-field">
                  <span class="pj-detail-field-label">${f.label}</span>
                  <span class="pj-detail-field-value">${this._escapeHtml(this._formatFieldValue(projector[f.key], f))}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Histórico -->
          <div class="pj-detail-section">
            <h3 class="pj-detail-section-title">&#128203; Histórico de Manutenções</h3>
            ${stats.total > 0 ? `
              <div class="pj-history-stats">
                ${config.maintenanceTypes.map(t => `
                  <span class="pj-history-stat">
                    <span style="color: ${t.color}">${t.icon}</span>
                    ${stats.byType[t.key] || 0} ${t.label}
                  </span>
                `).join('')}
              </div>
            ` : ''}
            ${history.length
              ? this._renderTimeline(history)
              : '<p class="pj-empty-inline">Nenhuma manutenção registrada.</p>'}
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Renderiza timeline de manutenções.
   * @param {array} history
   * @returns {string} HTML
   */
  _renderTimeline(history) {
    const config = window.PROJECTORS_CONFIG;
    const maxItems = config.visuals.timelineMaxItems;
    const items = history.slice(0, maxItems);

    return `
      <div class="pj-timeline">
        ${items.map(record => {
          const typeConfig = config.getMaintenanceType(record.type) || {};
          return `
            <div class="pj-timeline-item">
              <div class="pj-timeline-dot" style="background: ${typeConfig.color || '#9299b8'}"></div>
              <div class="pj-timeline-content">
                <div class="pj-timeline-header">
                  <span class="pj-timeline-type" style="color: ${typeConfig.color || '#9299b8'}">
                    ${typeConfig.icon || '&#128221;'} ${typeConfig.label || record.type}
                  </span>
                  <span class="pj-timeline-date">${this._formatDateBR(record.date)}</span>
                </div>
                ${record.description ? `<p class="pj-timeline-desc">${this._escapeHtml(record.description)}</p>` : ''}
                ${record.responsible ? `<span class="pj-timeline-responsible">Responsável: ${this._escapeHtml(record.responsible)}</span>` : ''}
                ${record.hoursAtMaintenance ? `<span class="pj-timeline-hours">Horas na troca: ${record.hoursAtMaintenance}h</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
        ${history.length > maxItems ? `<p class="pj-timeline-more">+${history.length - maxItems} registros anteriores</p>` : ''}
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: FORMULÁRIO DE MANUTENÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza formulário de registro de manutenção.
   * @returns {string} HTML
   */
  _renderMaintenanceFormView() {
    const projector = this._uiState.selectedProjector;
    if (!projector) return this._renderGridView();

    const config = window.PROJECTORS_CONFIG;

    return `
      <div class="pj-container">
        <div class="pj-detail-header">
          <button class="pj-back-btn" id="pj-back-detail" data-pj-back-detail="${projector.glpiId}" aria-label="Voltar aos detalhes">
            &#8592; Voltar
          </button>
          <div class="pj-detail-title-group">
            <span class="pj-detail-icon">&#128295;</span>
            <div>
              <h2 class="pj-detail-title">Registrar Manutenção</h2>
              <p class="pj-detail-subtitle">${this._escapeHtml(projector.nome)}</p>
            </div>
          </div>
        </div>

        <form class="pj-maintenance-form" id="pj-maintenance-form" data-pj-form-projector="${projector.glpiId}">
          <div class="pj-form-group">
            <label class="pj-form-label" for="pj-maint-type">Tipo de Manutenção *</label>
            <select class="pj-form-select" id="pj-maint-type" required>
              <option value="">Selecione...</option>
              ${config.maintenanceTypes.map(t => `
                <option value="${t.key}">${t.icon} ${t.label}</option>
              `).join('')}
            </select>
          </div>

          <div class="pj-form-group">
            <label class="pj-form-label" for="pj-maint-date">Data *</label>
            <input class="pj-form-input" type="date" id="pj-maint-date"
                   value="${new Date().toISOString().slice(0, 10)}" required />
          </div>

          <div class="pj-form-group">
            <label class="pj-form-label" for="pj-maint-responsible">Responsável</label>
            <input class="pj-form-input" type="text" id="pj-maint-responsible"
                   placeholder="Nome do responsável" />
          </div>

          <div class="pj-form-group">
            <label class="pj-form-label" for="pj-maint-hours">Horas da Lâmpada no Momento</label>
            <input class="pj-form-input" type="number" id="pj-maint-hours"
                   min="0" max="10000" placeholder="${projector.horas_lampada || 0}"
                   value="${projector.horas_lampada || ''}" />
          </div>

          <div class="pj-form-group">
            <label class="pj-form-label" for="pj-maint-description">Descrição / Observações</label>
            <textarea class="pj-form-textarea" id="pj-maint-description"
                      rows="4" placeholder="Descreva o que foi feito..."></textarea>
          </div>

          <div class="pj-form-actions">
            <button type="submit" class="pj-btn pj-btn-primary">
              &#10003; Registrar
            </button>
            <button type="button" class="pj-btn pj-btn-secondary" id="pj-cancel-maintenance"
                    data-pj-back-detail="${projector.glpiId}">
              Cancelar
            </button>
          </div>

          <div id="pj-maint-feedback" class="pj-form-feedback" style="display:none;"></div>
        </form>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // COMPONENTES COMPARTILHADOS
  // ══════════════════════════════════════════════════════════════════════════

  _renderLoading() {
    return `
      <div class="pj-container">
        <div class="pj-loading" role="status" aria-label="Carregando">
          <div class="pj-spinner"></div>
          <p class="pj-loading-text">Carregando projetores...</p>
        </div>
      </div>
    `;
  },

  _renderEmptyState(title, message) {
    return `
      <div class="pj-empty-state" role="status">
        <span class="pj-empty-icon">&#128249;</span>
        <h3 class="pj-empty-title">${title}</h3>
        ${message ? `<p class="pj-empty-message">${message}</p>` : ''}
      </div>
    `;
  },

  _renderError(message) {
    const isConfigError = message.includes('Configuracao') || message.includes('GLPI') || message.includes('conexao');
    return `
      <div class="pj-container">
        <div class="pj-error-state" role="alert">
          <span class="pj-error-icon">&#9888;</span>
          <h3 class="pj-error-title">Erro ao carregar projetores</h3>
          <p class="pj-error-message">${this._escapeHtml(message)}</p>
          ${isConfigError ? `
            <div class="pj-error-help">
              <p><strong>Verifique:</strong></p>
              <ul>
                <li>O backend esta rodando? (http://localhost:8080)</li>
                <li>As configuracoes do GLPI estao corretas no arquivo .env</li>
                <li>Ha projetores cadastrados no GLPI? (nome deve comecar com "Projetor")</li>
              </ul>
            </div>
          ` : ''}
          <button class="pj-btn pj-btn-primary" id="pj-retry">Tentar novamente</button>
        </div>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  _bindEvents() {
    // Re-render quando dados carregarem
    const onLoaded = () => {
      if (window.State?.getTab() === 'projetores') {
        this.render();
      }
    };
    document.addEventListener('projectors:loaded', onLoaded);
    document.addEventListener('projectors:error', onLoaded);

    // Busca
    const searchInput = document.getElementById('pj-search');
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', () => {
        this._uiState.searchQuery = searchInput.value;
        this.render();
      });
    }

    const searchClear = document.getElementById('pj-search-clear');
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        this._uiState.searchQuery = '';
        this.render();
      });
    }

    // Filtros de status
    document.querySelectorAll('[data-pj-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._uiState.statusFilter = btn.dataset.pjStatus;
        this.render();
      });
    });

    // Seleção de projetor
    document.querySelectorAll('[data-pj-select]').forEach(card => {
      const handler = () => {
        const glpiId = Number(card.dataset.pjSelect);
        const projector = window.Projectors.getProjector(glpiId);
        if (projector) {
          this._uiState.selectedProjector = projector;
          this._uiState.view = 'detail';
          this.render();
        }
      };
      card.addEventListener('click', handler);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });

    // Botão voltar (grid)
    const backGrid = document.getElementById('pj-back-grid');
    if (backGrid) {
      backGrid.addEventListener('click', () => {
        this._uiState.view = 'grid';
        this._uiState.selectedProjector = null;
        this.render();
      });
    }

    // Botão voltar (detail -> grid, ou form -> detail)
    document.querySelectorAll('[id="pj-back-detail"], [data-pj-back-detail]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._uiState.view === 'maintenance_form') {
          this._uiState.view = 'detail';
        } else {
          this._uiState.view = 'grid';
          this._uiState.selectedProjector = null;
        }
        this.render();
      });
    });

    // Botão adicionar manutenção
    const addMaint = document.getElementById('pj-add-maintenance');
    if (addMaint) {
      addMaint.addEventListener('click', () => {
        this._uiState.view = 'maintenance_form';
        this.render();
      });
    }

    // Cancelar manutenção
    const cancelMaint = document.getElementById('pj-cancel-maintenance');
    if (cancelMaint) {
      cancelMaint.addEventListener('click', () => {
        this._uiState.view = 'detail';
        this.render();
      });
    }

    // Formulário de manutenção
    const maintForm = document.getElementById('pj-maintenance-form');
    if (maintForm) {
      maintForm.addEventListener('submit', e => {
        e.preventDefault();
        this._onSubmitMaintenance(maintForm);
      });
    }

    // Retry
    const retryBtn = document.getElementById('pj-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        await window.Projectors.load();
        this.render();
      });
    }

    // Refresh
    const refreshBtn = document.getElementById('pj-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await window.Projectors.load();
        this.render();
      });
    }

    // Diagnostic
    const diagBtn = document.getElementById('pj-diagnostic');
    if (diagBtn) {
      diagBtn.addEventListener('click', async () => {
        await this._runDiagnostic();
      });
    }
  },

  /**
   * Handler: Submeter formulário de manutenção.
   */
  async _onSubmitMaintenance(form) {
    const glpiId = Number(form.dataset.pjFormProjector);
    const type = document.getElementById('pj-maint-type').value;
    const date = document.getElementById('pj-maint-date').value;
    const responsible = document.getElementById('pj-maint-responsible').value;
    const hours = document.getElementById('pj-maint-hours').value;
    const description = document.getElementById('pj-maint-description').value;
    const feedback = document.getElementById('pj-maint-feedback');

    if (!type || !date) {
      if (feedback) {
        feedback.style.display = 'block';
        feedback.className = 'pj-form-feedback pj-form-feedback-error';
        feedback.textContent = 'Preencha os campos obrigatórios.';
      }
      return;
    }

    const result = await window.ProjectorsMaintenance.register(glpiId, {
      type,
      date,
      responsible,
      hoursAtMaintenance: hours ? Number(hours) : undefined,
      description,
    });

    if (result.ok) {
      // Atualizar projetor selecionado
      this._uiState.selectedProjector = window.Projectors.getProjector(glpiId);
      this._uiState.view = 'detail';
      this.render();
    } else {
      if (feedback) {
        feedback.style.display = 'block';
        feedback.className = 'pj-form-feedback pj-form-feedback-error';
        feedback.textContent = result.error;
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ══════════════════════════════════════════════════════════════════════════

  _escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  _escapeAttr(value) {
    return this._escapeHtml(value);
  },

  _formatDateBR(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  },

  _formatFieldValue(value, field) {
    if (!value && value !== 0) return '-';
    if (field.tipo === 'data' && value) return this._formatDateBR(value);
    if (field.tipo === 'numero') return String(value);
    return String(value);
  },

  /**
   * Executa diagnóstico do sistema de projetores.
   */
  async _runDiagnostic() {
    const container = document.getElementById('main-content');
    if (!container) return;

    container.innerHTML = `
      <div class="pj-container">
        <div class="pj-loading" role="status">
          <div class="pj-spinner"></div>
          <p class="pj-loading-text">Executando diagnóstico...</p>
        </div>
      </div>
    `;

    try {
      const baseUrl = (window.CONFIG?.backendUrl ?? 'http://localhost:8080').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/api/projetors/diagnostic`);
      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error || 'Erro ao executar diagnóstico');
      }

      const diag = json.data;
      const isOk = diag.glpi_test === 'OK' && diag.projectors_found > 0;

      container.innerHTML = `
        <div class="pj-container">
          <div class="pj-detail-header">
            <button class="pj-back-btn" id="pj-back-grid" aria-label="Voltar">
              &#8592; Voltar
            </button>
            <div class="pj-detail-title-group">
              <span class="pj-detail-icon">&#128269;</span>
              <div>
                <h2 class="pj-detail-title">Diagnóstico do Sistema</h2>
                <p class="pj-detail-subtitle">${isOk ? '<span style="color:var(--green,#00c896)">&#10003; Tudo funcionando</span>' : '<span style="color:var(--red,#ff5555)">&#9888; Problemas detectados</span>'}</p>
              </div>
            </div>
          </div>

          <div class="pj-detail-grid">
            <div class="pj-detail-section">
              <h3 class="pj-detail-section-title">&#9881; Configuração</h3>
              <div class="pj-detail-fields">
                <div class="pj-detail-field">
                  <span class="pj-detail-field-label">Backend URL</span>
                  <span class="pj-detail-field-value">${this._escapeHtml(diag.config?.glpi_url || 'N/A')}</span>
                </div>
                <div class="pj-detail-field">
                  <span class="pj-detail-field-label">App Token</span>
                  <span class="pj-detail-field-value">${diag.config?.has_app_token ? '&#10003; Configurado' : '&#10007; Nao configurado'}</span>
                </div>
                <div class="pj-detail-field">
                  <span class="pj-detail-field-label">User Token</span>
                  <span class="pj-detail-field-value">${diag.config?.has_user_token ? '&#10003; Configurado' : '&#10007; Nao configurado'}</span>
                </div>
              </div>
            </div>

            <div class="pj-detail-section">
              <h3 class="pj-detail-section-title">&#128196; Conexao GLPI</h3>
              <div class="pj-detail-fields">
                <div class="pj-detail-field">
                  <span class="pj-detail-field-label">Status</span>
                  <span class="pj-detail-field-value" style="color:${diag.glpi_test === 'OK' ? 'var(--green,#00c896)' : 'var(--red,#ff5555)'}">${this._escapeHtml(diag.glpi_test || 'N/A')}</span>
                </div>
                <div class="pj-detail-field">
                  <span class="pj-detail-field-label">Total Computadores</span>
                  <span class="pj-detail-field-value">${diag.total_computers || 0}</span>
                </div>
                <div class="pj-detail-field">
                  <span class="pj-detail-field-label">Projetores Encontrados</span>
                  <span class="pj-detail-field-value" style="color:${diag.projectors_found > 0 ? 'var(--green,#00c896)' : 'var(--red,#ff5555)'}">${diag.projectors_found}</span>
                </div>
              </div>
            </div>

            ${diag.projectors_names?.length > 0 ? `
              <div class="pj-detail-section" style="grid-column: 1 / -1">
                <h3 class="pj-detail-section-title">&#128249; Projetores Detectados</h3>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
                  ${diag.projectors_names.map(name => `
                    <span style="background:var(--surface2,#222535);padding:8px 12px;border-radius:var(--radius-md,8px);border:1px solid var(--border,#2e3347);">
                      ${this._escapeHtml(name)}
                    </span>
                  `).join('')}
                </div>
              </div>
            ` : `
              <div class="pj-detail-section" style="grid-column: 1 / -1">
                <h3 class="pj-detail-section-title">&#9888; Nenhum Projetor Encontrado</h3>
                <div style="margin-top:12px;">
                  <p style="color:var(--text-secondary,#9299b8);margin-bottom:12px;">
                    Nenhum computador com nome comecando por <strong>"Projetor"</strong> foi encontrado no GLPI.
                  </p>
                  <p style="color:var(--text-secondary,#9299b8);">
                    <strong>Para resolver:</strong><br>
                    1. Acesse o GLPI e cadastre os projetores como "Computador"<br>
                    2. O nome deve comecar com "Projetor" (ex: "Projetor Sala 01")<br>
                    3. Configure os tokens de acesso no arquivo .env do backend
                  </p>
                </div>
              </div>
            `}

            <div class="pj-detail-section" style="grid-column: 1 / -1">
              <h3 class="pj-detail-section-title">&#128190; Dados Salvos</h3>
              <div class="pj-detail-fields">
                <div class="pj-detail-field">
                  <span class="pj-detail-field-label">Projetores Salvos</span>
                  <span class="pj-detail-field-value">${diag.saved_projectors_count}</span>
                </div>
                <div class="pj-detail-field">
                  <span class="pj-detail-field-label">Arquivo de Dados</span>
                  <span class="pj-detail-field-value">${diag.data_file?.exists ? '&#10003; Existe' : '&#10007; Nao encontrado'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      // Bind back button
      document.getElementById('pj-back-grid')?.addEventListener('click', () => {
        this._uiState.view = 'grid';
        this.render();
      });

    } catch (err) {
      container.innerHTML = `
        <div class="pj-container">
          <div class="pj-error-state" role="alert">
            <span class="pj-error-icon">&#9888;</span>
            <h3 class="pj-error-title">Erro ao executar diagnóstico</h3>
            <p class="pj-error-message">${this._escapeHtml(err.message)}</p>
            <button class="pj-btn pj-btn-primary" id="pj-retry-diag">Tentar novamente</button>
            <button class="pj-btn pj-btn-secondary" id="pj-back-grid" style="margin-left:8px;">Voltar</button>
          </div>
        </div>
      `;
      document.getElementById('pj-retry-diag')?.addEventListener('click', () => this._runDiagnostic());
      document.getElementById('pj-back-grid')?.addEventListener('click', () => {
        this._uiState.view = 'grid';
        this.render();
      });
    }
  },

  /**
   * Navega para o módulo de projetores.
   */
  async open() {
    this._uiState.view = 'grid';
    this._uiState.selectedProjector = null;
    this._uiState.searchQuery = '';
    this._uiState.statusFilter = 'todos';
    await window.ProjectorsUI.render();
  },
};
