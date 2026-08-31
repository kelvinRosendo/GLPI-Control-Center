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
    view: 'grid',           // 'grid' | 'detail' | 'maintenance_form' | 'notices'
    selectedProjector: null,
    searchQuery: '',
    statusFilter: 'todos',
    noticeFilters: {
      type: '',
      severity: '',
      projectorId: null,
      dateFrom: '',
      dateTo: '',
      search: '',
    },
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
      case 'notices':
        container.innerHTML = this._renderNoticesView();
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
    const summary = window.Projectors.getNoticesSummary();
    return `
      <div class="pj-header">
        <div class="pj-header-left">
          <h1 class="pj-title">&#128249; Gestão de Projetores</h1>
          <p class="pj-subtitle">Controle de vida útil, manutenções e alertas</p>
        </div>
        <div class="pj-header-right">
          <button class="pj-btn pj-btn-secondary" id="pj-view-notices" title="Ver avisos dos projetores" aria-label="Avisos">
            &#128276; Avisos ${summary.total > 0 ? `<span style="background:#ff5555;color:#fff;border-radius:10px;padding:1px 6px;font-size:11px;margin-left:4px;">${summary.total}</span>` : ''}
          </button>
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

    const criticalAlerts = alerts.filter(a => a.highestSeverity === 'critical');
    const warningAlerts = alerts.filter(a => a.highestSeverity === 'warning');

    // Coletar projectores únicos com alertas críticos
    const criticalProjectors = [...new Set(criticalAlerts.map(a => a.projector.glpiId))]
      .map(glpiId => {
        const projector = window.Projectors.getProjector(glpiId);
        return projector ? { glpiId, name: projector.nome } : null;
      }).filter(p => p);

    // Coletar projectores únicos com alertas de aviso
    const warningProjectors = [...new Set(warningAlerts.map(a => a.projector.glpiId))]
      .map(glpiId => {
        const projector = window.Projectors.getProjector(glpiId);
        return projector ? { glpiId, name: projector.nome } : null;
      }).filter(p => p);

    let items = '';

    if (criticalAlerts.length > 0) {
      items += `<div>
        <strong>${criticalAlerts.length} crítico${criticalAlerts.length > 1 ? 's' : ''}</strong>
        ${criticalProjectors.length > 0 ? `
        <div style="margin-top:4px;">
          ${criticalProjectors.slice(0, 3).map(p => `
            <a href="#pj-detail-${p.glpiId}" style="font-size:12px;color:var(--color-red);text-decoration:underline;">
              ${this._escapeHtml(p.name)}
            </a>
          `).join(' ')}
          ${criticalProjectors.length > 3 ? `+${criticalProjectors.length - 3} mais` : ''}
        </div>` : ''}
      </div>`;
    }

    if (criticalAlerts.length > 0 && warningAlerts.length > 0) {
      items += `· `;
    }

    if (warningAlerts.length > 0) {
      items += `<div>
        <strong>${warningAlerts.length} com atenção</strong>
        ${warningProjectors.length > 0 ? `
        <div style="margin-top:4px;">
          ${warningProjectors.slice(0, 3).map(p => `
            <a href="#pj-detail-${p.glpiId}" style="font-size:12px;color:var(--color-yellow);text-decoration:underline;">
              ${this._escapeHtml(p.name)}
            </a>
          `).join(' ')}
          ${warningProjectors.length > 3 ? `+${warningProjectors.length - 3} mais` : ''}
        </div>` : ''}
      </div>`;
    }

    return `
      <div class="pj-alerts-banner" role="alert">
        <span class="pj-alerts-icon">&#9888;</span>
        <span class="pj-alerts-text">
          ${items}
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

    const statusKey = projector.calculatedStatus || 'operando';
    const statusColors = {
      operando: 'var(--color-green)',
      atencao: 'var(--color-yellow)',
      manutencao: 'var(--color-orange)',
      fora_de_uso: 'var(--color-red)',
    };
    const cardAccent = statusColors[statusKey] || statusColors.operando;

    // Calcular dias desde última manutenção e limpeza
    const daysSinceMaint = projector.ultima_manutencao
      ? Math.floor((Date.now() - new Date(projector.ultima_manutencao)) / (1000 * 60 * 60 * 24))
      : null;
    const daysSinceCleaning = projector.ultima_limpeza
      ? Math.floor((Date.now() - new Date(projector.ultima_limpeza)) / (1000 * 60 * 60 * 24))
      : null;

    // Badge de limpeza com cor baseada em dias
    let cleaningBadge = '';
    if (daysSinceCleaning !== null) {
      let cleaningColor, cleaningLabel;
      if (daysSinceCleaning < 30) {
        cleaningColor = 'var(--color-green)';
        cleaningLabel = `${daysSinceCleaning} dias`;
      } else if (daysSinceCleaning < 60) {
        cleaningColor = 'var(--color-yellow)';
        cleaningLabel = `Há ${daysSinceCleaning} dias`;
      } else {
        cleaningColor = 'var(--color-red)';
        cleaningLabel = 'EM MANUTENÇÃO';
      }
      cleaningBadge = `<div class="pj-cleaning-badge" style="color: ${cleaningColor}">${cleaningLabel}</div>`;
    }

    return `
      <div class="pj-card ${hasAlerts ? 'pj-card-alert' : ''}"
           data-pj-select="${projector.glpiId}"
           tabindex="0" role="button"
           aria-label="Ver detalhes de ${this._escapeAttr(projector.nome)}">
        <div class="pj-card-header">
          <span class="pj-card-icon">&#128249;</span>
          <span class="pj-card-status ds-badge ds-badge--neutral"
                style="color: ${cardAccent};">
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
          ${cleaningBadge}
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
    const parser = window.ProjectorsParser;
    const detail = window.Projectors.getProjectorDetail(projector.glpiId);
    const statusConfig = config.getStatus(projector.calculatedStatus) || config.status.operando;
    const history = await window.ProjectorsMaintenance.getHistory(projector.glpiId);
    const stats = await window.ProjectorsMaintenance.getStats(projector.glpiId);

    const notices = (projector.notices || []).slice(0, 5);
    const confidenceLabel = {
      confirmado: '<span style="color:var(--green,#00c896)">&#10003; Confirmado</span>',
      parcial: '<span style="color:var(--yellow,#ffc107)">&#9888; Parcial</span>',
      nao_encontrado: '<span style="color:var(--text2,#9299b8)">N/A</span>',
    };

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

        <!-- INFORMAÇÕES GERAIS -->
        <div class="pj-detail-section" style="margin-bottom:16px;">
          <h3 class="pj-detail-section-title">&#128196; Informações Gerais</h3>
          <div class="pj-detail-fields">
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Nome</span>
              <span class="pj-detail-field-value">${this._escapeHtml(projector.nome)}</span>
            </div>
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Modelo</span>
              <span class="pj-detail-field-value">${this._escapeHtml(projector.modelo || '-')}</span>
            </div>
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Número de Série</span>
              <span class="pj-detail-field-value">${this._escapeHtml(projector.serial || '-')}</span>
            </div>
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Localização</span>
              <span class="pj-detail-field-value">${this._escapeHtml(projector.reparticao || '-')}</span>
            </div>
            ${projector.patrimonio ? `
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Patrimônio</span>
              <span class="pj-detail-field-value">${this._escapeHtml(projector.patrimonio)}</span>
            </div>` : ''}
            ${projector.fabricante ? `
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Fabricante</span>
              <span class="pj-detail-field-value">${this._escapeHtml(projector.fabricante)}</span>
            </div>` : ''}
          </div>
        </div>

        <!-- LÂMPADA -->
        <div class="pj-detail-section" style="margin-bottom:16px;">
          <h3 class="pj-detail-section-title">&#128161; Lâmpada</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Horas Atuais</span>
              <span class="pj-detail-field-value" style="font-size:20px;font-weight:700;color:${detail.lampSeverity === 'critico' ? '#ff5555' : detail.lampSeverity === 'atencao' ? '#ffc107' : '#00c896'}">
                ${projector.horas_lampada || 0} h
              </span>
            </div>
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Vida Útil Estimada</span>
              <span class="pj-detail-field-value" style="font-size:20px;font-weight:700">${projector.vida_util_estimada || config.lamp.lifeHours} h</span>
            </div>
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Uso Estimado</span>
              <span class="pj-detail-field-value" style="font-size:20px;font-weight:700;color:${detail.lampSeverity === 'critico' ? '#ff5555' : detail.lampSeverity === 'atencao' ? '#ffc107' : '#00c896'}">
                ${detail.lampPercentage}%
                ${detail.lampPercentage > 100 ? ' <span style="font-size:12px;font-weight:400;color:var(--text2,#9299b8)">(Verificar informação)</span>' : ''}
              </span>
            </div>
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Última Leitura</span>
              <span class="pj-detail-field-value">${detail.lastHoursDate ? this._formatDateBR(detail.lastHoursDate) : '-'}</span>
            </div>
          </div>
          <div class="pj-detail-lamp-bar" style="margin-bottom:8px;">
            <div class="pj-detail-lamp-fill" style="width: ${Math.min(100, detail.lampPercentage)}%; background: ${detail.lampSeverity === 'critico' ? '#ff5555' : detail.lampSeverity === 'atencao' ? '#ffc107' : '#00c896'}"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2,#9299b8);">
            <span>Origem: ${projector.horas_lampada_source === 'comentario' ? 'Comentário do GLPI' : projector.horas_lampada_source === 'estruturado' ? 'Campo estruturado' : 'Não informado'}</span>
            <span>${confidenceLabel[detail.confidence] || ''}</span>
          </div>
          ${detail.needsReview ? `
          <div style="margin-top:8px;padding:8px 12px;background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);border-radius:6px;font-size:13px;color:#ffc107;">
            &#9888; Verificar informação — pode haver troca de lâmpada não registrada no campo de horas.
          </div>` : ''}
          ${detail.lastLampReplacement ? `
          <div style="margin-top:8px;padding:8px 12px;background:rgba(79,126,247,0.1);border:1px solid rgba(79,126,247,0.3);border-radius:6px;font-size:13px;color:#4f7ef7;">
            &#128161; Última troca de lâmpada: ${this._formatDateBR(detail.lastLampReplacement)}
          </div>` : ''}
          ${projector.hourRecords && projector.hourRecords.length > 1 ? `
          <div style="margin-top:12px;">
            <span class="pj-detail-field-label">Histórico de Horas</span>
            <div style="margin-top:6px;">
              ${projector.hourRecords.map(r => `
                <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid var(--border,#2e3347);">
                  <span>${r.hours} h</span>
                  <span style="color:var(--text2,#9299b8)">${r.date ? this._formatDateBR(r.date) : 'sem data'}</span>
                </div>
              `).join('')}
            </div>
          </div>` : ''}
        </div>

        <!-- MANUTENÇÃO -->
        <div class="pj-detail-section" style="margin-bottom:16px;">
          <h3 class="pj-detail-section-title">&#128295; Manutenção</h3>
          <div class="pj-detail-fields">
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Última Manutenção</span>
              <span class="pj-detail-field-value">${projector.ultima_manutencao ? this._formatDateBR(projector.ultima_manutencao) : '-'}</span>
            </div>
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Última Limpeza</span>
              <span class="pj-detail-field-value">${projector.ultima_limpeza ? this._formatDateBR(projector.ultima_limpeza) : '-'}</span>
            </div>
            <div class="pj-detail-field">
              <span class="pj-detail-field-label">Horas Totais de Uso</span>
              <span class="pj-detail-field-value">${projector.horas_totais || 0} h</span>
            </div>
          </div>
        </div>

        <!-- AVISOS RECENTES -->
        ${notices.length > 0 ? `
        <div class="pj-detail-section" style="margin-bottom:16px;">
          <h3 class="pj-detail-section-title">&#128276; Avisos Recentes</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${notices.map(n => {
              const typeConfig = this._getNoticeTypeConfig(n.type);
              const sevColor = n.severity === 'critico' ? '#ff5555' : n.severity === 'atencao' ? '#ffc107' : '#9299b8';
              return `
                <div style="padding:8px 12px;background:var(--surface2,#222535);border-radius:6px;border-left:3px solid ${sevColor};">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="font-size:12px;font-weight:600;color:${typeConfig.color}">${typeConfig.icon} ${typeConfig.label}</span>
                    <span style="font-size:11px;color:var(--text2,#9299b8)">${n.date ? this._formatDateBR(n.date) : ''}</span>
                  </div>
                  <p style="margin:0;font-size:13px;color:var(--text,#e0e0e0);">${this._escapeHtml(n.message)}</p>
                </div>
              `;
            }).join('')}
          </div>
          ${(projector.notices || []).length > 5 ? `
            <button class="pj-btn pj-btn-secondary" id="pj-view-all-notices" style="margin-top:8px;width:100%;">
              Ver todos os ${(projector.notices || []).length} avisos
            </button>
          ` : ''}
        </div>` : ''}

        <!-- HISTÓRICO DE MANUTENÇÕES -->
        <div class="pj-detail-section" style="margin-bottom:16px;">
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
  // VIEW: AVISOS
  // ══════════════════════════════════════════════════════════════════════════

  _renderNoticesView() {
    const parser = window.ProjectorsParser;
    const filters = this._uiState.noticeFilters;
    const notices = window.Projectors.getAllNotices(filters);
    const summary = window.Projectors.getNoticesSummary();
    const projectors = window.Projectors.getProjectors();

    const typeOptions = [
      { value: '', label: 'Todos' },
      { value: 'horas', label: '&#9200; Horas' },
      { value: 'manutencao', label: '&#128295; Manutenção' },
      { value: 'defeito', label: '&#9888; Defeito' },
      { value: 'movimentacao', label: '&#128666; Movimentação' },
      { value: 'lampada', label: '&#128161; Lâmpada' },
      { value: 'instalacao', label: '&#128230; Instalação' },
      { value: 'informativo', label: '&#128172; Informativo' },
      { value: 'outro', label: '&#128196; Outro' },
    ];

    const severityOptions = [
      { value: '', label: 'Todas' },
      { value: 'informativo', label: 'Informativo' },
      { value: 'atencao', label: 'Atenção' },
      { value: 'critico', label: 'Crítico' },
    ];

    return `
      <div class="pj-container">
        <div class="pj-detail-header">
          <button class="pj-back-btn" id="pj-back-grid" aria-label="Voltar para lista">
            &#8592; Projetores
          </button>
          <div class="pj-detail-title-group">
            <span class="pj-detail-icon">&#128276;</span>
            <div>
              <h2 class="pj-detail-title">Avisos dos Projetores</h2>
              <p class="pj-detail-subtitle">${summary.total} aviso${summary.total !== 1 ? 's' : ''} · ${summary.projectorCount} projetor${summary.projectorCount !== 1 ? 'es' : ''}</p>
            </div>
          </div>
        </div>

        <!-- Resumo -->
        <div class="pj-indicators-grid" style="margin-bottom:16px;">
          <div class="pj-indicator-card">
            <span class="pj-indicator-icon" style="color: var(--accent)">&#128276;</span>
            <div class="pj-indicator-body">
              <span class="pj-indicator-value">${summary.total}</span>
              <span class="pj-indicator-label">Total</span>
            </div>
          </div>
          <div class="pj-indicator-card">
            <span class="pj-indicator-icon" style="color: #ff5555">&#9888;</span>
            <div class="pj-indicator-body">
              <span class="pj-indicator-value">${summary.bySeverity.critico || 0}</span>
              <span class="pj-indicator-label">Críticos</span>
            </div>
          </div>
          <div class="pj-indicator-card">
            <span class="pj-indicator-icon" style="color: #ffc107">&#9888;</span>
            <div class="pj-indicator-body">
              <span class="pj-indicator-value">${summary.bySeverity.atencao || 0}</span>
              <span class="pj-indicator-label">Atenção</span>
            </div>
          </div>
          <div class="pj-indicator-card">
            <span class="pj-indicator-icon" style="color: #9299b8">&#128172;</span>
            <div class="pj-indicator-body">
              <span class="pj-indicator-value">${summary.bySeverity.informativo || 0}</span>
              <span class="pj-indicator-label">Informativos</span>
            </div>
          </div>
        </div>

        <!-- Filtros -->
        <div class="pj-search-bar" style="margin-bottom:16px;">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
            <input class="pj-search-input" id="pj-notice-search" type="text"
                   placeholder="Buscar nos avisos..." value="${this._escapeAttr(filters.search)}" style="flex:1;min-width:200px;" />
            <select class="pj-form-select" id="pj-notice-type" style="width:auto;">
              ${typeOptions.map(o => `<option value="${o.value}" ${filters.type === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
            <select class="pj-form-select" id="pj-notice-severity" style="width:auto;">
              ${severityOptions.map(o => `<option value="${o.value}" ${filters.severity === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
            <select class="pj-form-select" id="pj-notice-projector" style="width:auto;">
              <option value="">Todos projetores</option>
              ${projectors.map(p => `<option value="${p.glpiId}" ${filters.projectorId == p.glpiId ? 'selected' : ''}>${this._escapeHtml(p.nome)}</option>`).join('')}
            </select>
            <input class="pj-form-input" type="date" id="pj-notice-date-from" value="${filters.dateFrom || ''}" style="width:auto;" title="Data inicial" />
            <input class="pj-form-input" type="date" id="pj-notice-date-to" value="${filters.dateTo || ''}" style="width:auto;" title="Data final" />
          </div>
        </div>

        <!-- Lista -->
        ${notices.length === 0 ? `
          <div class="pj-empty-state">
            <span class="pj-empty-icon">&#128276;</span>
            <h3 class="pj-empty-title">Nenhum aviso encontrado</h3>
            <p class="pj-empty-message">Ajuste os filtros ou verifique os comentários dos projetores no GLPI.</p>
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${notices.map(n => {
              const typeConfig = this._getNoticeTypeConfig(n.type);
              const sevColor = n.severity === 'critico' ? '#ff5555' : n.severity === 'atencao' ? '#ffc107' : '#9299b8';
              return `
                <div style="padding:12px;background:var(--surface2,#222535);border-radius:8px;border-left:3px solid ${sevColor};">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                    <div>
                      <span style="font-size:12px;font-weight:600;color:${typeConfig.color}">${typeConfig.icon} ${typeConfig.label}</span>
                      <span style="font-size:12px;color:var(--text2,#9299b8);margin-left:8px;">${this._escapeHtml(n.projectorName)}</span>
                    </div>
                    <span style="font-size:11px;color:var(--text2,#9299b8);white-space:nowrap;">${n.date ? this._formatDateBR(n.date) : ''}</span>
                  </div>
                  <p style="margin:0 0 4px 0;font-size:13px;color:var(--text,#e0e0e0);">${this._escapeHtml(n.message)}</p>
                  <div style="display:flex;gap:12px;font-size:11px;color:var(--text2,#9299b8);">
                    <span>${this._escapeHtml(n.projectorModel || '')}</span>
                    <span>${this._escapeHtml(n.projectorLocation || '')}</span>
                    ${n.lampHours > 0 ? `<span>${n.lampHours}h / ${n.lampLifeHours}h</span>` : ''}
                  </div>
                  ${n.rawText !== n.message ? `
                    <div style="margin-top:6px;padding:4px 8px;background:rgba(255,255,255,0.03);border-radius:4px;font-size:11px;color:var(--text2,#9299b8);font-style:italic;">
                      "${this._escapeHtml(n.rawText)}"
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}
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

    // View Notices
    const noticesBtn = document.getElementById('pj-view-notices');
    if (noticesBtn) {
      noticesBtn.addEventListener('click', () => {
        this._uiState.view = 'notices';
        this.render();
      });
    }

    // View all notices from detail
    const viewAllNotices = document.getElementById('pj-view-all-notices');
    if (viewAllNotices) {
      viewAllNotices.addEventListener('click', () => {
        this._uiState.noticeFilters.projectorId = this._uiState.selectedProjector?.glpiId || null;
        this._uiState.view = 'notices';
        this.render();
      });
    }

    // Notices filters
    const noticeSearch = document.getElementById('pj-notice-search');
    if (noticeSearch) {
      noticeSearch.addEventListener('input', () => {
        this._uiState.noticeFilters.search = noticeSearch.value;
        this.render();
      });
    }
    const noticeType = document.getElementById('pj-notice-type');
    if (noticeType) {
      noticeType.addEventListener('change', () => {
        this._uiState.noticeFilters.type = noticeType.value;
        this.render();
      });
    }
    const noticeSeverity = document.getElementById('pj-notice-severity');
    if (noticeSeverity) {
      noticeSeverity.addEventListener('change', () => {
        this._uiState.noticeFilters.severity = noticeSeverity.value;
        this.render();
      });
    }
    const noticeProjector = document.getElementById('pj-notice-projector');
    if (noticeProjector) {
      noticeProjector.addEventListener('change', () => {
        this._uiState.noticeFilters.projectorId = noticeProjector.value || null;
        this.render();
      });
    }
    const noticeDateFrom = document.getElementById('pj-notice-date-from');
    if (noticeDateFrom) {
      noticeDateFrom.addEventListener('change', () => {
        this._uiState.noticeFilters.dateFrom = noticeDateFrom.value;
        this.render();
      });
    }
    const noticeDateTo = document.getElementById('pj-notice-date-to');
    if (noticeDateTo) {
      noticeDateTo.addEventListener('change', () => {
        this._uiState.noticeFilters.dateTo = noticeDateTo.value;
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

  _getNoticeTypeConfig(type) {
    var types = {
      horas:        { label: 'Horas',        icon: '&#9200;',  color: '#4f7ef7' },
      manutencao:   { label: 'Manutenção',   icon: '&#128295;', color: '#f59e0b' },
      defeito:      { label: 'Defeito',      icon: '&#9888;',  color: '#ff5555' },
      movimentacao: { label: 'Movimentação', icon: '&#128666;', color: '#9299b8' },
      lampada:      { label: 'Lâmpada',      icon: '&#128161;', color: '#ffc107' },
      instalacao:   { label: 'Instalação',   icon: '&#128230;', color: '#00c896' },
      informativo:  { label: 'Informativo',  icon: '&#128172;', color: '#9299b8' },
      outro:        { label: 'Outro',        icon: '&#128196;', color: '#9299b8' },
    };
    return types[type] || types.outro;
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
    this._uiState.noticeFilters = { type: '', severity: '', projectorId: null, dateFrom: '', dateTo: '', search: '' };
    await window.ProjectorsUI.render();
  },
};
