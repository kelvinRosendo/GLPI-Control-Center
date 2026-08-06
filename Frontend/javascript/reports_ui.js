/**
 * GLPI Control Center - reports_ui.js
 * -----------------------------------------------------------------------------
 * Módulo de renderização da interface da Central de Relatórios.
 *
 * Responsabilidades:
 * - Renderizar a lista de relatórios disponíveis
 * - Renderizar filtros reutilizáveis
 * - Renderizar preview dos dados
 * - Renderizar barra de progresso de exportação
 * - Gerenciar estados Loading, Empty, Error
 * - Bind de eventos da interface
 *
 * NÃO contém regras de negócio. Consulte reports.js.
 * NÃO exporta arquivos. Consulte report_export.js.
 *
 * Sprint 7: Central de Relatórios
 */

window.ReportsUI = {

  // ── Estado da UI ─────────────────────────────────────────────────────────

  _uiState: {
    view: 'list',        // 'list' | 'report' | 'preview'
    selectedReport: null,
    searchQuery: '',
    categoryFilter: null,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza o conteúdo principal da Central de Relatórios.
   * @param {string} containerId - ID do elemento container
   */
  render(containerId = 'main-content') {
    const container = document.getElementById(containerId);
    if (!container) return;

    switch (this._uiState.view) {
      case 'list':
        container.innerHTML = this._renderReportList();
        break;
      case 'report':
        container.innerHTML = this._renderReportView();
        break;
      case 'preview':
        container.innerHTML = this._renderPreviewView();
        break;
      default:
        container.innerHTML = this._renderReportList();
    }

    this._bindEvents();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: LISTA DE RELATÓRIOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza a lista de todos os relatórios disponíveis.
   * @returns {string} HTML
   */
  _renderReportList() {
    const reports = window.REPORTS_CONFIG.getReports();
    const categories = window.REPORTS_CONFIG.getCategories();
    const query = this._uiState.searchQuery.toLowerCase().trim();
    const activeCat = this._uiState.categoryFilter;

    // Filtrar por busca
    let filtered = reports;
    if (query) {
      filtered = filtered.filter(r =>
        r.titulo.toLowerCase().includes(query) ||
        r.descricao.toLowerCase().includes(query)
      );
    }

    // Filtrar por categoria
    if (activeCat) {
      filtered = filtered.filter(r => r.categoria === activeCat);
    }

    return `
      <div class="rpt-container">
        ${this._renderHeader()}

        <div class="rpt-search-bar">
          <div class="rpt-search-input-wrap">
            <span class="rpt-search-icon">&#128269;</span>
            <input
              class="rpt-search-input"
              id="rpt-search"
              type="text"
              placeholder="Buscar relatório..."
              value="${this._escapeAttr(this._uiState.searchQuery)}"
              autocomplete="off"
              spellcheck="false"
              aria-label="Buscar relatório"
            />
            ${this._uiState.searchQuery
              ? '<button class="rpt-search-clear" id="rpt-search-clear" title="Limpar busca" aria-label="Limpar busca">&#10005;</button>'
              : ''}
          </div>
        </div>

        <div class="rpt-categories">
          <button class="rpt-category-btn ${!activeCat ? 'active' : ''}" data-rpt-category="all" aria-pressed="${!activeCat}">
            Todos
          </button>
          ${categories.map(cat => `
            <button
              class="rpt-category-btn ${activeCat === cat.key ? 'active' : ''}"
              data-rpt-category="${cat.key}"
              aria-pressed="${activeCat === cat.key}"
            >
              <span>${cat.icone}</span> ${cat.label}
            </button>
          `).join('')}
        </div>

        <div class="rpt-reports-grid">
          ${filtered.length
            ? filtered.map(r => this._renderReportCard(r)).join('')
            : this._renderEmptyState('Nenhum relatório encontrado', 'Tente buscar por outros termos ou categorias.')}
        </div>
      </div>
    `;
  },

  /**
   * Renderiza card de um relatório.
   * @param {object} report
   * @returns {string} HTML
   */
  _renderReportCard(report) {
    const catConfig = window.REPORTS_CONFIG.categorias[report.categoria] || {};
    return `
      <div class="rpt-card" data-rpt-select="${report.id}" tabindex="0" role="button"
           aria-label="Abrir relatório: ${this._escapeAttr(report.titulo)}">
        <div class="rpt-card-header">
          <span class="rpt-card-icon">${report.icone}</span>
          <span class="rpt-card-badge">${catConfig.label || report.categoria}</span>
        </div>
        <div class="rpt-card-body">
          <h3 class="rpt-card-title">${this._escapeHtml(report.titulo)}</h3>
          <p class="rpt-card-desc">${this._escapeHtml(report.descricao)}</p>
        </div>
        <div class="rpt-card-footer">
          <span class="rpt-card-fields">${report.campos.length} campos</span>
          <span class="rpt-card-exporters">${report.exportadores.map(e => e.toUpperCase()).join(', ')}</span>
        </div>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: RELATÓRIO (FILTROS + AÇÕES)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza a view de um relatório com filtros.
   * @returns {string} HTML
   */
  _renderReportView() {
    const report = this._uiState.selectedReport;
    if (!report) return this._renderReportList();

    const state = window.Reports.getState();
    const filters = window.Reports.getFilters();

    return `
      <div class="rpt-container">
        <div class="rpt-report-header">
          <button class="rpt-back-btn" id="rpt-back" aria-label="Voltar para lista">
            &#8592; Relatórios
          </button>
          <div class="rpt-report-title-group">
            <span class="rpt-report-icon">${report.icone}</span>
            <div>
              <h2 class="rpt-report-title">${this._escapeHtml(report.titulo)}</h2>
              <p class="rpt-report-desc">${this._escapeHtml(report.descricao)}</p>
            </div>
          </div>
        </div>

        <div class="rpt-filters-panel">
          <h3 class="rpt-filters-title">Filtros</h3>
          <div class="rpt-filters-grid">
            ${report.filtros.map(fk => this._renderFilter(fk, filters, report)).join('')}
          </div>
          <div class="rpt-filters-actions">
            <button class="rpt-btn rpt-btn-primary" id="rpt-apply-filters" aria-label="Aplicar filtros">
              &#128269; Buscar
            </button>
            <button class="rpt-btn rpt-btn-secondary" id="rpt-clear-filters" aria-label="Limpar filtros">
              Limpar
            </button>
          </div>
        </div>

        ${state.loading ? this._renderLoading() : ''}

        ${state.error ? this._renderError(state.error) : ''}

        ${state.loaded && !state.loading ? this._renderReportSummary(report) : ''}

        ${state.loaded && !state.loading ? this._renderExportBar(report) : ''}
      </div>
    `;
  },

  /**
   * Renderiza um filtro individual.
   * @param {string} filterKey
   * @param {object} filters - Valores atuais
   * @param {object} report - Config do relatório
   * @returns {string} HTML
   */
  _renderFilter(filterKey, filters, report) {
    const def = window.REPORTS_CONFIG.getFilterDef(filterKey);
    if (!def) return '';

    const currentValue = filters[filterKey] || '';

    switch (def.tipo) {
      case 'select':
        return this._renderSelectFilter(filterKey, def, currentValue, report);
      case 'text':
        return this._renderTextFilter(filterKey, def, currentValue);
      case 'date_range':
        return this._renderDateRangeFilter(filterKey, def, filters);
      default:
        return '';
    }
  },

  /**
   * Renderiza filtro select.
   */
  _renderSelectFilter(key, def, value, report) {
    // Para status de tickets, usar opções específicas
    let options = def.options;
    if (key === 'status' && report.tipo.includes('ticket')) {
      options = def.ticketOptions || def.options;
    }

    return `
      <div class="rpt-filter-group">
        <label class="rpt-filter-label" for="rpt-filter-${key}">${def.label}</label>
        <select class="rpt-filter-select" id="rpt-filter-${key}" data-rpt-filter="${key}">
          ${options.map(opt => `
            <option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>
              ${opt.label}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  },

  /**
   * Renderiza filtro de texto.
   */
  _renderTextFilter(key, def, value) {
    return `
      <div class="rpt-filter-group">
        <label class="rpt-filter-label" for="rpt-filter-${key}">${def.label}</label>
        <input
          class="rpt-filter-input"
          id="rpt-filter-${key}"
          type="text"
          data-rpt-filter="${key}"
          placeholder="${def.placeholder}"
          value="${this._escapeAttr(value)}"
          autocomplete="off"
        />
      </div>
    `;
  },

  /**
   * Renderiza filtro de período.
   */
  _renderDateRangeFilter(key, def, filters) {
    return `
      <div class="rpt-filter-group rpt-filter-date-range">
        <label class="rpt-filter-label">${def.label}</label>
        <div class="rpt-date-range-row">
          <input
            class="rpt-filter-input rpt-filter-date"
            type="date"
            data-rpt-filter="periodo_inicio"
            value="${filters.periodo_inicio || ''}"
            aria-label="Data início"
          />
          <span class="rpt-date-separator">até</span>
          <input
            class="rpt-filter-input rpt-filter-date"
            type="date"
            data-rpt-filter="periodo_fim"
            value="${filters.periodo_fim || ''}"
            aria-label="Data fim"
          />
        </div>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: PREVIEW
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza a view de preview.
   * @returns {string} HTML
   */
  _renderPreviewView() {
    const report = this._uiState.selectedReport;
    if (!report) return this._renderReportList();

    const data = window.Reports.getPreviewData();
    const total = window.Reports.getTotalRecords();
    const filtered = window.Reports.getFilteredRecords();

    return `
      <div class="rpt-container">
        <div class="rpt-report-header">
          <button class="rpt-back-btn" id="rpt-back-report" aria-label="Voltar ao relatório">
            &#8592; Voltar
          </button>
          <div class="rpt-report-title-group">
            <span class="rpt-report-icon">${report.icone}</span>
            <div>
              <h2 class="rpt-report-title">Preview: ${this._escapeHtml(report.titulo)}</h2>
              <p class="rpt-report-desc">${filtered} de ${total} registros${data.length < filtered ? ` (mostrando ${data.length})` : ''}</p>
            </div>
          </div>
        </div>

        <div class="rpt-preview-table-wrap">
          ${data.length
            ? this._renderDataTable(data, report)
            : this._renderEmptyState('Nenhum registro para preview', 'Ajuste os filtros para visualizar dados.')}
        </div>

        <div class="rpt-preview-footer">
          <button class="rpt-btn rpt-btn-secondary" id="rpt-back-to-report">
            &#8592; Voltar aos Filtros
          </button>
          <button class="rpt-btn rpt-btn-primary" id="rpt-export-csv-preview" data-rpt-export="csv">
            &#128190; Exportar CSV
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Renderiza tabela de dados.
   * @param {array} data
   * @param {object} report
   * @returns {string} HTML
   */
  _renderDataTable(data, report) {
    const headers = report.campos;

    const rows = data.map(row => {
      const cells = headers.map(campo => {
        let value = row[campo.key] ?? '';
        if (campo.tipo === 'status') {
          return `<td class="rpt-td">${this._renderStatusBadge(String(value))}</td>`;
        }
        if (campo.tipo === 'data' || campo.tipo === 'data_hora') {
          return `<td class="rpt-td rpt-td-date">${this._escapeHtml(this._formatDate(value, campo.tipo))}</td>`;
        }
        return `<td class="rpt-td">${this._escapeHtml(String(value))}</td>`;
      }).join('');
      return `<tr class="rpt-tr">${cells}</tr>`;
    }).join('');

    const headerCells = headers.map(h =>
      `<th class="rpt-th">${this._escapeHtml(h.label)}</th>`
    ).join('');

    return `
      <div class="rpt-table-container">
        <table class="rpt-table" role="grid">
          <thead>
            <tr class="rpt-tr rpt-tr-header">${headerCells}</tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // COMPONENTES COMPARTILHADOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza cabeçalho da Central de Relatórios.
   */
  _renderHeader() {
    return `
      <div class="rpt-header">
        <div class="rpt-header-left">
          <h1 class="rpt-title">&#128203; Central de Relatórios</h1>
          <p class="rpt-subtitle">Gere relatórios gerenciais a partir dos dados do GLPI</p>
        </div>
      </div>
    `;
  },

  /**
   * Renderiza resumo do relatório com estatísticas.
   * @param {object} report
   */
  _renderReportSummary(report) {
    const total = window.Reports.getTotalRecords();
    const filtered = window.Reports.getFilteredRecords();
    const previewData = window.Reports.getPreviewData();

    return `
      <div class="rpt-summary">
        <div class="rpt-summary-stats">
          <div class="rpt-stat">
            <span class="rpt-stat-value">${total}</span>
            <span class="rpt-stat-label">Total de registros</span>
          </div>
          <div class="rpt-stat">
            <span class="rpt-stat-value">${filtered}</span>
            <span class="rpt-stat-label">Registros filtrados</span>
          </div>
          <div class="rpt-stat">
            <span class="rpt-stat-value">${previewData.length}</span>
            <span class="rpt-stat-label">No preview</span>
          </div>
          <div class="rpt-stat">
            <span class="rpt-stat-value">${report.campos.length}</span>
            <span class="rpt-stat-label">Campos exportáveis</span>
          </div>
        </div>

        <div class="rpt-summary-columns">
          <h4 class="rpt-summary-columns-title">Colunas que serão exportadas:</h4>
          <div class="rpt-column-tags">
            ${report.campos.map(c => `
              <span class="rpt-column-tag">${this._escapeHtml(c.label)}</span>
            `).join('')}
          </div>
        </div>

        ${previewData.length ? `
          <div class="rpt-summary-preview">
            <button class="rpt-btn rpt-btn-secondary rpt-btn-sm" id="rpt-view-preview" aria-label="Visualizar dados">
              &#128065; Visualizar Dados
            </button>
          </div>
        ` : ''}
      </div>
    `;
  },

  /**
   * Renderiza barra de exportação.
   * @param {object} report
   */
  _renderExportBar(report) {
    const exporters = window.REPORTS_CONFIG.getEnabledExporters();
    const isExporting = window.ReportExport.isExporting();
    const progress = window.ReportExport.getProgress();

    return `
      <div class="rpt-export-bar">
        <h3 class="rpt-export-title">Exportar</h3>
        <div class="rpt-export-buttons">
          ${exporters.map(exp => `
            <button
              class="rpt-btn rpt-btn-export"
              data-rpt-export="${exp.key}"
              ${isExporting ? 'disabled' : ''}
              aria-label="Exportar para ${exp.label}"
            >
              <span>${exp.icone}</span> ${exp.label}
            </button>
          `).join('')}
        </div>
        ${isExporting ? `
          <div class="rpt-progress-bar" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
            <div class="rpt-progress-fill" style="width: ${progress}%"></div>
            <span class="rpt-progress-text">${progress}%</span>
          </div>
        ` : ''}
      </div>
    `;
  },

  /**
   * Renderiza estado de loading.
   */
  _renderLoading() {
    return `
      <div class="rpt-loading" role="status" aria-label="Carregando">
        <div class="rpt-spinner"></div>
        <p class="rpt-loading-text">Processando relatório...</p>
      </div>
    `;
  },

  /**
   * Renderiza estado vazio.
   * @param {string} title
   * @param {string} message
   */
  _renderEmptyState(title = 'Nenhum dado disponível', message = '') {
    return `
      <div class="rpt-empty-state" role="status">
        <span class="rpt-empty-icon">&#128196;</span>
        <h3 class="rpt-empty-title">${title}</h3>
        ${message ? `<p class="rpt-empty-message">${message}</p>` : ''}
      </div>
    `;
  },

  /**
   * Renderiza estado de erro.
   * @param {string} message
   */
  _renderError(message) {
    return `
      <div class="rpt-error-state" role="alert">
        <span class="rpt-error-icon">&#9888;</span>
        <h3 class="rpt-error-title">Erro ao processar</h3>
        <p class="rpt-error-message">${this._escapeHtml(message)}</p>
        <button class="rpt-btn rpt-btn-secondary" id="rpt-retry" aria-label="Tentar novamente">
          Tentar novamente
        </button>
      </div>
    `;
  },

  /**
   * Renderiza badge de status.
   * @param {string} status
   * @returns {string} HTML
   */
  _renderStatusBadge(status) {
    const map = {
      ativo: { label: 'Ativo', cls: 'rpt-status-active' },
      manutencao: { label: 'Manutenção', cls: 'rpt-status-maintenance' },
      emprestado: { label: 'Emprestado', cls: 'rpt-status-loaned' },
      aberto: { label: 'Aberto', cls: 'rpt-status-open' },
      em_andamento: { label: 'Em andamento', cls: 'rpt-status-progress' },
      pendente: { label: 'Pendente', cls: 'rpt-status-pending' },
      resolvido: { label: 'Resolvido', cls: 'rpt-status-resolved' },
      fechado: { label: 'Fechado', cls: 'rpt-status-closed' },
      sucesso: { label: 'Sucesso', cls: 'rpt-status-active' },
      falha: { label: 'Falha', cls: 'rpt-status-maintenance' },
    };
    const s = map[status] || { label: status, cls: '' };
    return `<span class="rpt-status-badge ${s.cls}">${s.label}</span>`;
  },

  /**
   * Formata data para exibição.
   * @param {string} value
   * @param {string} tipo
   * @returns {string}
   */
  _formatDate(value, tipo) {
    if (!value) return '-';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return value;
      if (tipo === 'data_hora') {
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('pt-BR');
    } catch {
      return value;
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Bind de todos os eventos da interface.
   */
  _bindEvents() {
    // Busca
    const searchInput = document.getElementById('rpt-search');
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', () => {
        this._uiState.searchQuery = searchInput.value;
        this.render();
      });
    }

    const searchClear = document.getElementById('rpt-search-clear');
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        this._uiState.searchQuery = '';
        this.render();
      });
    }

    // Categorias
    document.querySelectorAll('[data-rpt-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.rptCategory;
        this._uiState.categoryFilter = cat === 'all' ? null : cat;
        this.render();
      });
    });

    // Seleção de relatório
    document.querySelectorAll('[data-rpt-select]').forEach(card => {
      const handler = () => {
        const reportId = card.dataset.rptSelect;
        const config = window.REPORTS_CONFIG.getReport(reportId);
        if (config) {
          this._uiState.selectedReport = config;
          this._uiState.view = 'report';
          this.render();
        }
      };
      card.addEventListener('click', handler);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handler();
        }
      });
    });

    // Botão voltar (lista)
    const backBtn = document.getElementById('rpt-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.Reports.reset();
        this._uiState.view = 'list';
        this._uiState.selectedReport = null;
        this.render();
      });
    }

    // Botão voltar (preview para relatório)
    const backReport = document.getElementById('rpt-back-report');
    if (backReport) {
      backReport.addEventListener('click', () => {
        this._uiState.view = 'report';
        this.render();
      });
    }

    const backToReport = document.getElementById('rpt-back-to-report');
    if (backToReport) {
      backToReport.addEventListener('click', () => {
        this._uiState.view = 'report';
        this.render();
      });
    }

    // Aplicar filtros
    const applyBtn = document.getElementById('rpt-apply-filters');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this._onApplyFilters());
    }

    // Limpar filtros
    const clearBtn = document.getElementById('rpt-clear-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this._onClearFilters());
    }

    // Retry
    const retryBtn = document.getElementById('rpt-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this._onApplyFilters());
    }

    // Preview
    const previewBtn = document.getElementById('rpt-view-preview');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        this._uiState.view = 'preview';
        this.render();
      });
    }

    // Exportação
    document.querySelectorAll('[data-rpt-export]').forEach(btn => {
      btn.addEventListener('click', () => this._onExport(btn.dataset.rptExport));
    });

    // Keyboard navigation para cards
    document.querySelectorAll('.rpt-card').forEach(card => {
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
  },

  /**
   * Handler: Aplicar filtros.
   */
  async _onApplyFilters() {
    const report = this._uiState.selectedReport;
    if (!report) return;

    const filters = this._collectFilters();
    const result = await window.Reports.loadReport(report.id, filters);

    if (result.ok) {
      this.render();
    } else {
      this.render();
    }
  },

  /**
   * Handler: Limpar filtros.
   */
  _onClearFilters() {
    const report = this._uiState.selectedReport;
    if (!report) return;

    // Resetar valores dos campos
    report.filtros.forEach(fk => {
      const el = document.getElementById(`rpt-filter-${fk}`);
      if (el) {
        if (el.tagName === 'SELECT') {
          el.value = el.querySelector('option')?.value || 'todos';
        } else {
          el.value = '';
        }
      }
    });

    // Limpar datas
    document.querySelectorAll('[data-rpt-filter="periodo_inicio"], [data-rpt-filter="periodo_fim"]').forEach(el => {
      el.value = '';
    });

    // Limpar busca de texto
    const textFilter = document.getElementById('rpt-filter-texto_livre');
    if (textFilter) textFilter.value = '';

    // Resetar estado
    window.Reports.reset();
    this.render();
  },

  /**
   * Handler: Exportar.
   * @param {string} format
   */
  async _onExport(format) {
    const data = window.Reports.getData();
    const config = this._uiState.selectedReport;
    if (!data.length || !config) return;

    const filters = window.Reports.getFilters();
    const result = await window.ReportExport.export(format, data, config, { filters });

    if (!result.ok && result.error) {
      alert(result.error);
    }
  },

  /**
   * Coleta valores dos filtros da interface.
   * @returns {object}
   */
  _collectFilters() {
    const filters = {};
    const report = this._uiState.selectedReport;
    if (!report) return filters;

    report.filtros.forEach(fk => {
      const el = document.getElementById(`rpt-filter-${fk}`);
      if (el) {
        filters[fk] = el.value;
      }
    });

    // Datas
    const inicio = document.querySelector('[data-rpt-filter="periodo_inicio"]');
    const fim = document.querySelector('[data-rpt-filter="periodo_fim"]');
    if (inicio) filters.periodo_inicio = inicio.value;
    if (fim) filters.periodo_fim = fim.value;

    return filters;
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

  /**
   * Navega para a Central de Relatórios.
   */
  open() {
    this._uiState.view = 'list';
    this._uiState.selectedReport = null;
    this._uiState.searchQuery = '';
    this._uiState.categoryFilter = null;
    window.Reports.reset();
    window.ReportsUI.render();
  },
};
