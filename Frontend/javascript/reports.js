/**
 * GLPI Control Center - reports.js
 * -----------------------------------------------------------------------------
 * Módulo de dados e lógica de negócio da Central de Relatórios.
 *
 * Responsabilidades:
 * - Carregar dados dos endpoints existentes (reutiliza GlpiClient + DATA)
 * - Aplicar filtros reutilizáveis sobre os dados
 * - Agrupar informações por campos configuráveis
 * - Preparar dados para exportação
 * - Gerenciar cache interno de dados processados
 * - Emitir eventos CustomEvent para comunicação entre módulos
 *
 * NÃO renderiza HTML. Consulte reports_ui.js.
 * NÃO exporta arquivos. Consulte report_export.js.
 * NÃO contém configuração visual. Consulte reports.config.js.
 *
 * Sprint 7: Central de Relatórios
 */

window.Reports = {

  // ── Estado ───────────────────────────────────────────────────────────────

  _state: {
    loaded: false,
    loading: false,
    error: '',
    activeReportId: null,
    filters: {},
    processedData: null,
    filteredData: null,
    groupedData: null,
    previewData: null,
    totalRecords: 0,
    filteredRecords: 0,
    loadedAt: null,
  },

  // ── Cache ────────────────────────────────────────────────────────────────

  _cache: {
    data: {},       // reportId -> { data, timestamp }
    filterResults: {}, // hashKey -> { data, timestamp }
  },

  // ── Ciclo de Vida ────────────────────────────────────────────────────────

  /**
   * Garante que os dados base existem (reutiliza DATA do GlpiClient).
   * @returns {{ ok: boolean, error?: string }}
   */
  async _ensureData() {
    const D = window.DATA;
    const hasData =
      D.computadores?.length ||
      D.chromebooksGeekiees?.length ||
      D.projetores?.length ||
      D.impressoras?.length;

    if (!hasData) {
      try {
        const result = await window.GlpiClient.loadAll();
        if (!result.ok) throw new Error('Falha ao carregar dados do GLPI.');
      } catch (e) {
        throw new Error('Falha ao carregar dados do GLPI.');
      }
    }

    // Garantir tickets
    if (!window.STATE.ticketsLoaded && !window.STATE.ticketsLoading) {
      try {
        const tickets = await window.GlpiClient.fetchTickets();
        window.State.setTickets(tickets);
      } catch {
        // Tickets podem falhar
      }
    }
  },

  /**
   * Retorna os dados brutos conforme o endpoint do relatório.
   * @param {object} reportConfig - Configuração do relatório
   * @returns {array}
   */
  _getRawData(reportConfig) {
    const D = window.DATA;

    switch (reportConfig.endpoint) {
      case 'inventario':
        return this._getAllAssets();

      case 'chamados':
        return window.STATE.tickets || [];

      case 'integracoes':
        return this._getAuditRecords();

      default:
        return [];
    }
  },

  /**
   * Agrega todos os ativos em um único array com campo categoria.
   * @returns {array}
   */
  _getAllAssets() {
    const D = window.DATA;
    const assets = [];

    (D.computadores || []).forEach(a =>
      assets.push({ ...a, categoria: 'computadores' })
    );
    (D.chromebooksGeekiees || []).forEach(a =>
      assets.push({ ...a, categoria: 'chromebooks_geekiees' })
    );
    (D.projetores || []).forEach(a =>
      assets.push({ ...a, categoria: 'projetores' })
    );
    (D.impressoras || []).forEach(a =>
      assets.push({ ...a, categoria: 'impressoras' })
    );

    // Chromebooks de apoio (flattened)
    const apoio = D.chromebooksApoio || {};
    Object.entries(apoio).forEach(([carrinho, lista]) => {
      (Array.isArray(lista) ? lista : []).forEach(a =>
        assets.push({ ...a, categoria: 'chromebooks_apoio', carrinho })
      );
    });

    return assets;
  },

  /**
   * Retorna registros de auditoria do localStorage.
   * @returns {array}
   */
  _getAuditRecords() {
    try {
      if (window.IntegrationAudit?.getAll) {
        return window.IntegrationAudit.getAll();
      }
    } catch {
      // Ignorar erros
    }
    return [];
  },

  // ── Processamento ────────────────────────────────────────────────────────

  /**
   * Carrega e processa dados para um relatório específico.
   * Utiliza cache quando disponível.
   *
   * @param {string} reportId
   * @param {object} filters - Objeto com chaves de filtro e valores
   * @returns {{ ok: boolean, data?: array, total?: number, error?: string }}
   */
  async loadReport(reportId, filters = {}) {
    const config = window.REPORTS_CONFIG.getReport(reportId);
    if (!config) {
      return { ok: false, error: `Relatório '${reportId}' não encontrado.` };
    }

    this._state.loading = true;
    this._state.error = '';
    this._state.activeReportId = reportId;
    this._state.filters = { ...filters };

    try {
      // 1. Garantir dados base
      await this._ensureData();

      // 2. Buscar dados brutos
      const rawData = this._getRawData(config);

      // 3. Aplicar filtro de status pré-definido (ex: manutenção)
      let data = rawData;
      if (config.statusFilter) {
        data = data.filter(item => item.status === config.statusFilter);
      }

      // 4. Aplicar filtros do usuário
      data = this._applyFilters(data, filters, config);

      // 5. Processar conforme tipo
      let processed;
      if (config.tipo.includes('grouped')) {
        processed = this._groupData(data, config);
      } else {
        processed = this._prepareRows(data, config);
      }

      // 6. Atualizar estado
      this._state.processedData = processed;
      this._state.filteredData = data;
      this._state.previewData = processed.slice(
        0,
        window.REPORTS_CONFIG.performance.previewMaxRows
      );
      this._state.totalRecords = rawData.length;
      this._state.filteredRecords = data.length;
      this._state.loaded = true;
      this._state.loadedAt = new Date().toISOString();

      // 7. Cache
      this._setCache(reportId, filters, processed);

      // 8. Emitir evento
      this._emit('reports:loaded', {
        reportId,
        total: this._state.totalRecords,
        filtered: this._state.filteredRecords,
        count: processed.length,
      });

      this._state.loading = false;

      return {
        ok: true,
        data: processed,
        preview: this._state.previewData,
        total: this._state.totalRecords,
        filtered: this._state.filteredRecords,
        count: processed.length,
      };

    } catch (err) {
      this._state.loading = false;
      this._state.error = err.message || 'Erro ao processar relatório.';
      this._emit('reports:error', { reportId, error: this._state.error });
      return { ok: false, error: this._state.error };
    }
  },

  /**
   * Aplica filtros reutilizáveis sobre os dados.
   * @param {array} data
   * @param {object} filters
   * @param {object} config
   * @returns {array}
   */
  _applyFilters(data, filters, config) {
    let result = [...data];

    // Filtro por categoria
    if (filters.categoria && filters.categoria !== 'todos') {
      result = result.filter(item => item.categoria === filters.categoria);
    }

    // Filtro por fornecedor
    if (filters.fornecedor && filters.fornecedor !== 'todos') {
      result = result.filter(item => {
        const fornecedor = (item.fornecedor || '').toLowerCase();
        return fornecedor === filters.fornecedor.toLowerCase();
      });
    }

    // Filtro por status
    if (filters.status && filters.status !== 'todos') {
      result = result.filter(item => item.status === filters.status);
    }

    // Filtro por período
    if (filters.periodo_inicio || filters.periodo_fim) {
      result = this._applyDateFilter(result, filters, config);
    }

    // Filtro por responsável
    if (filters.responsavel && filters.responsavel.trim()) {
      const q = filters.responsavel.toLowerCase().trim();
      result = result.filter(item =>
        (item.responsavel || '').toLowerCase().includes(q)
      );
    }

    // Filtro por texto livre
    if (filters.texto_livre && filters.texto_livre.trim()) {
      const q = filters.texto_livre.toLowerCase().trim();
      result = result.filter(item => {
        const campos = config.campos
          .filter(c => c.tipo === 'texto' || c.tipo === 'numero')
          .map(c => String(item[c.key] || '').toLowerCase());
        return campos.some(c => c.includes(q));
      });
    }

    return result;
  },

  /**
   * Aplica filtro de período sobre os dados.
   * @param {array} data
   * @param {object} filters
   * @param {object} config
   * @returns {array}
   */
  _applyDateFilter(data, filters, config) {
    const inicio = filters.periodo_inicio ? new Date(filters.periodo_inicio) : null;
    const fim = filters.periodo_fim ? new Date(filters.periodo_fim + 'T23:59:59') : null;

    // Encontrar campo de data do relatório
    const dateField = config.campos.find(c => c.tipo === 'data' || c.tipo === 'data_hora');
    if (!dateField) return data;

    return data.filter(item => {
      const rawDate = item[dateField.key];
      if (!rawDate) return false;
      const itemDate = new Date(rawDate);
      if (isNaN(itemDate.getTime())) return false;
      if (inicio && itemDate < inicio) return false;
      if (fim && itemDate > fim) return false;
      return true;
    });
  },

  /**
   * Prepara linhas para exibição/exportação (sem agrupamento).
   * @param {array} data
   * @param {object} config
   * @returns {array}
   */
  _prepareRows(data, config) {
    return data.map(item => {
      const row = {};
      config.campos.forEach(campo => {
        row[campo.key] = item[campo.key] ?? '';
      });
      row._raw = item;
      return row;
    });
  },

  /**
   * Agrupa dados por campo configurado.
   * @param {array} data
   * @param {object} config
   * @returns {array}
   */
  _groupData(data, config) {
    const groupKey = config.groupBy;
    const groups = {};

    data.forEach(item => {
      const key = item[groupKey] || 'Sem informação';
      if (!groups[key]) {
        groups[key] = { items: [], counts: {} };
      }
      groups[key].items.push(item);

      // Contar por status
      const status = item.status || 'desconhecido';
      groups[key].counts[status] = (groups[key].counts[status] || 0) + 1;
    });

    return Object.entries(groups).map(([key, group]) => {
      const row = {};
      row[groupKey] = key;
      row.quantidade = group.items.length;
      row.ativos = group.counts.ativo || 0;
      row.manutencao = group.counts.manutencao || 0;
      row.emprestados = group.counts.emprestado || 0;

      // Para chamados agrupados
      if (group.counts.aberto || group.counts.em_andamento || group.counts.resolvido || group.counts.fechado) {
        row.quantidade = group.items.length;
        const total = data.length || 1;
        row.percentual = ((group.items.length / total) * 100).toFixed(1) + '%';
      }

      // Para integrações
      if (config.endpoint === 'integracoes') {
        row.integracoes = group.items.length;
        row.fornecedor = key;
      }

      row._items = group.items;
      return row;
    });
  },

  // ── Cache ────────────────────────────────────────────────────────────────

  /**
   * Gera chave de cache para filtros.
   * @param {string} reportId
   * @param {object} filters
   * @returns {string}
   */
  _cacheKey(reportId, filters) {
    return `${reportId}:${JSON.stringify(filters)}`;
  },

  /**
   * Recupera dados do cache se válido.
   * @param {string} reportId
   * @param {object} filters
   * @returns {array|null}
   */
  _getCache(reportId, filters) {
    const key = this._cacheKey(reportId, filters);
    const cached = this._cache.filterResults[key];
    if (!cached) return null;

    const ttl = window.REPORTS_CONFIG.performance.cacheTTL;
    if (Date.now() - cached.timestamp > ttl) {
      delete this._cache.filterResults[key];
      return null;
    }

    return cached.data;
  },

  /**
   * Armazena dados no cache.
   * @param {string} reportId
   * @param {object} filters
   * @param {array} data
   */
  _setCache(reportId, filters, data) {
    const key = this._cacheKey(reportId, filters);
    this._cache.filterResults[key] = {
      data,
      timestamp: Date.now(),
    };

    // Limpar cache excedente
    const keys = Object.keys(this._cache.filterResults);
    if (keys.length > window.REPORTS_CONFIG.performance.maxCacheSize) {
      const oldest = keys.sort((a, b) =>
        this._cache.filterResults[a].timestamp - this._cache.filterResults[b].timestamp
      )[0];
      delete this._cache.filterResults[oldest];
    }
  },

  /**
   * Limpa todo o cache.
   */
  clearCache() {
    this._cache.data = {};
    this._cache.filterResults = {};
  },

  // ── Getters Públicos ─────────────────────────────────────────────────────

  /**
   * Retorna o relatório ativo.
   * @returns {object|null}
   */
  getActiveReport() {
    if (!this._state.activeReportId) return null;
    return window.REPORTS_CONFIG.getReport(this._state.activeReportId);
  },

  /**
   * Retorna dados processados do relatório ativo.
   * @returns {array}
   */
  getData() {
    return this._state.processedData || [];
  },

  /**
   * Retorna dados para preview (limitados).
   * @returns {array}
   */
  getPreviewData() {
    return this._state.previewData || [];
  },

  /**
   * Retorna total de registros brutos.
   * @returns {number}
   */
  getTotalRecords() {
    return this._state.totalRecords;
  },

  /**
   * Retorna total de registros filtrados.
   * @returns {number}
   */
  getFilteredRecords() {
    return this._state.filteredRecords;
  },

  /**
   * Retorna filtros ativos.
   * @returns {object}
   */
  getFilters() {
    return { ...this._state.filters };
  },

  /**
   * Retorna snapshot do estado.
   * @returns {object}
   */
  getState() {
    return { ...this._state };
  },

  /**
   * Verifica se dados estão carregados.
   * @returns {boolean}
   */
  isLoaded() {
    return this._state.loaded;
  },

  /**
   * Verifica se está carregando.
   * @returns {boolean}
   */
  isLoading() {
    return this._state.loading;
  },

  /**
   * Retorna erro atual.
   * @returns {string}
   */
  getError() {
    return this._state.error;
  },

  // ── Reset ────────────────────────────────────────────────────────────────

  /**
   * Reseta estado do módulo.
   */
  reset() {
    this._state = {
      loaded: false,
      loading: false,
      error: '',
      activeReportId: null,
      filters: {},
      processedData: null,
      filteredData: null,
      groupedData: null,
      previewData: null,
      totalRecords: 0,
      filteredRecords: 0,
      loadedAt: null,
    };
  },

  // ── Eventos ──────────────────────────────────────────────────────────────

  /**
   * Emite um CustomEvent no document.
   * @param {string} eventName
   * @param {object} detail
   */
  _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  },
};
