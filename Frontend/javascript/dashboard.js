/**
 * GLPI Control Center - dashboard.js
 * -----------------------------------------------------------------------------
 * Módulo de dados do Dashboard Operacional.
 *
 * Responsabilidades:
 * - Carregar dados dos endpoints existentes (reutiliza GlpiClient)
 * - Calcular indicadores a partir dos dados brutos
 * - Preparar objetos para renderização
 * - Gerenciar estado do dashboard
 * - Emitir eventos quando dados estão prontos
 *
 * NÃO renderiza HTML. Consulte dashboard_ui.js.
 * NÃO contém configuração visual. Consulte dashboard.config.js.
 *
 * Sprint 5: Dashboard Operacional
 */

window.Dashboard = {
  // ── Estado ───────────────────────────────────────────────────────────────

  _state: {
    loaded: false,
    loading: false,
    error: '',
    indicators: {},
    widgets: {},
    analytics: {},
    loadedAt: null,
    lastRefresh: null,
    isStale: false,
  },

  // ── Timer de Auto-Refresh ──────────────────────────────────────────────

  _autoRefreshTimer: null,
  _visibilityChangeHandler: null,

  // ── Ciclo de Vida ────────────────────────────────────────────────────────

  /**
   * Inicializa o dashboard: carrega dados e calcula indicadores.
   * Reutiliza dados já carregados em window.DATA quando disponíveis.
   *
   * @returns {{ ok: boolean, error?: string }}
   */
  async load() {
    if (this._state.loading) return { ok: true };

    this._state.loading = true;
    this._state.error = '';

    console.log('[Dashboard] Inicialização iniciada');

    try {
      // 1. Garantir que os dados base existem
      console.log('[Dashboard] Buscando dados base...');
      await this._ensureData();
      console.log('[Dashboard] Dados base carregados');

      // 2. Calcular indicadores dos cards
      console.log('[Dashboard] Calculando indicadores...');
      this._state.indicators = this._calculateIndicators();

      // 3. Calcular widgets de resumo
      this._state.widgets = this._calculateWidgets();

      // 4. Calcular analytics
      console.log('[Dashboard] Calculando analytics...');
      this._state.analytics = window.DashboardAnalytics.calculate(this._state.indicators);

      // 5. Marcar como carregado
      this._state.loaded = true;
      this._state.loadedAt = new Date().toISOString();
      this._state.lastRefresh = new Date().toISOString();
      this._state.isStale = false;
      this._state.loading = false;

      console.log('[Dashboard] KPIs prontos, emitindo dashboard:loaded');

      this._emit('dashboard:loaded', {
        indicators: this._state.indicators,
        widgets: this._state.widgets,
        analytics: this._state.analytics,
      });

      // Registrar auditoria
      if (window.Audit) {
        window.Audit.register({
          action: 'dashboard_carregado',
          module: 'dashboard',
          descricao: 'Dashboard operacional carregado',
        });
      }

      // 6. Iniciar auto-refresh
      this._startAutoRefresh();

      console.log('[Dashboard] Finalizando loading — OK');
      return { ok: true };
    } catch (err) {
      this._state.error = err.message || 'Erro ao carregar dashboard.';
      this._state.loading = false;

      console.error('[Dashboard] Erro:', err);

      this._emit('dashboard:error', { error: this._state.error });

      return { ok: false, error: this._state.error };
    }
  },

  /**
   * Força recálculo dos indicadores (sem recarregar dados do backend).
   * Útil quando dados mudam externamente (ex: após criar chamado).
   */
  recalculate() {
    if (!this._state.loaded) return;

    this._state.indicators = this._calculateIndicators();
    this._state.widgets = this._calculateWidgets();
    this._state.analytics = window.DashboardAnalytics.calculate(this._state.indicators);
    this._state.loadedAt = new Date().toISOString();
    this._state.isStale = false;

    this._emit('dashboard:recalculated', {
      indicators: this._state.indicators,
      analytics: this._state.analytics,
    });
  },

  /**
   * Reseta o estado do dashboard.
   */
  reset() {
    this._stopAutoRefresh();
    window.DashboardAnalytics.reset();
    this._state = {
      loaded: false,
      loading: false,
      error: '',
      indicators: {},
      widgets: {},
      analytics: {},
      loadedAt: null,
      lastRefresh: null,
      isStale: false,
    };
  },

  // ── Auto-Refresh ─────────────────────────────────────────────────────────

  /**
   * Inicia o auto-refresh baseado na configuração.
   */
  _startAutoRefresh() {
    const config = window.DASHBOARD_CONFIG?.performance;
    if (!config?.enableAutoRefresh) return;

    this._stopAutoRefresh();

    this._autoRefreshTimer = setInterval(() => {
      if (this._state.loaded && !this._state.loading) {
        this._state.isStale = true;
        this._emit('dashboard:stale', { loadedAt: this._state.loadedAt });
        this.recalculate();
      }
    }, config.autoRefreshInterval);

    // Pausar quando aba estiver inativa
    if (config.pauseOnInactiveTab) {
      this._visibilityChangeHandler = () => {
        if (document.hidden) {
          this._stopAutoRefresh();
        } else {
          this._startAutoRefresh();
        }
      };
      document.addEventListener('visibilitychange', this._visibilityChangeHandler);
    }
  },

  /**
   * Para o auto-refresh.
   */
  _stopAutoRefresh() {
    if (this._autoRefreshTimer) {
      clearInterval(this._autoRefreshTimer);
      this._autoRefreshTimer = null;
    }
    if (this._visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this._visibilityChangeHandler);
      this._visibilityChangeHandler = null;
    }
  },

  /**
   * Verifica se os dados estão desatualizados.
   * @returns {boolean}
   */
  isStale() {
    if (!this._state.loadedAt) return false;
    const config = window.DASHBOARD_CONFIG?.performance;
    const threshold = config?.staleThreshold || 60000;
    return Date.now() - new Date(this._state.loadedAt).getTime() > threshold;
  },

  /**
   * Força refresh manual dos dados.
   */
  async forceRefresh() {
    this._state.isStale = false;
    this._state.loadedAt = new Date().toISOString();
    this._emit('dashboard:refreshing', {});

    if (window.Audit) {
      window.Audit.register({
        action: 'dashboard_atualizado',
        module: 'dashboard',
        descricao: 'Dashboard atualizado manualmente',
      });
    }

    await this.load();
  },

  // ── Garantia de Dados ────────────────────────────────────────────────────

  /**
   * Garante que window.DATA possui os dados necessários.
   * Se dados não existirem, busca do backend via GlpiClient.
   */
  async _ensureData() {
    const D = window.DATA;

    const needsLoad =
      !D.computadores?.length &&
      !D.chromebooksGeekiees?.length &&
      !D.projetores?.length;

    if (needsLoad) {
      const result = await window.GlpiClient.loadAll();
      if (!result.ok) {
        throw new Error('Falha ao carregar dados do GLPI.');
      }
    }

    // Garantir que tickets existam
    if (!window.STATE.ticketsLoaded && !window.STATE.ticketsLoading) {
      try {
        const tickets = await window.GlpiClient.fetchTickets();
        window.State.setTickets(tickets);
      } catch {
        // Tickets podem falhar — não é crítico para o dashboard
      }
    }

    // Garantir dados de projetores
    if (window.Projectors && !window.Projectors.isLoaded() && !window.Projectors.isLoading()) {
      try {
        await window.Projectors.load();
      } catch {
        // Projetores podem falhar — não é crítico para o dashboard
      }
    }
  },

  // ── Cálculo de Indicadores ───────────────────────────────────────────────

  /**
   * Calcula todos os indicadores a partir dos dados brutos.
   * @returns {object} Map de id → valor
   */
  _calculateIndicators() {
    const D = window.DATA;
    const indicators = {};

    // ── Ativos por Categoria ──────────────────────────────────────────────
    indicators.computadores = this._countArray(D.computadores);
    indicators.geekiees = this._countArray(D.chromebooksGeekiees);
    indicators.apoio = this._countFlat(D.chromebooksApoio);
    indicators.projetores = this._countArray(D.projetores);
    indicators.impressoras = this._countArray(D.impressoras);

    // ── Chamados ─────────────────────────────────────────────────────────
    const tickets = window.STATE.tickets || [];
    indicators.total_chamados = tickets.length;
    indicators.chamados_abertos = tickets.filter(t =>
      t.status === 'aberto' || t.status === 'em_andamento'
    ).length;
    indicators.chamados_fechados = tickets.filter(t =>
      t.status === 'resolvido' || t.status === 'fechado'
    ).length;

    // ── Status dos Ativos ────────────────────────────────────────────────
    const todosAtivos = [
      ...(D.computadores || []),
      ...(D.chromebooksGeekiees || []),
      ...(D.projetores || []),
      ...(D.impressoras || []),
    ];

    indicators.em_manutencao = todosAtivos.filter(a =>
      a.status === 'manutencao'
    ).length;

    indicators.disponiveis = todosAtivos.filter(a =>
      a.status === 'ativo'
    ).length;

    // ── Indicadores de Projetores ──────────────────────────────────────
    if (window.Projectors && window.Projectors.isLoaded()) {
      const pjInd = window.Projectors.getIndicators();
      indicators.projectors_operando = pjInd.operando || 0;
      indicators.projectors_atencao = pjInd.atencao || 0;
      indicators.projectors_lampWarning = pjInd.lampWarning || 0;
    } else {
      indicators.projectors_operando = 0;
      indicators.projectors_atencao = 0;
      indicators.projectors_lampWarning = 0;
    }

    return indicators;
  },

  /**
   * Calcula widgets de resumo operacional.
   * @returns {object} Map de widget id → dados
   */
  _calculateWidgets() {
    const widgets = {};

    // ── Último Chamado ───────────────────────────────────────────────────
    const tickets = window.STATE.tickets || [];
    const sortedTickets = [...tickets].sort((a, b) => {
      const dateA = a.abertura || '';
      const dateB = b.abertura || '';
      return dateB.localeCompare(dateA);
    });

    const ultimoTicket = sortedTickets[0] || null;
    widgets.ultimo_chamado = ultimoTicket
      ? {
          titulo: ultimoTicket.titulo || 'Sem título',
          id: ultimoTicket.id || '-',
          status: ultimoTicket.status || '-',
          abertura: ultimoTicket.abertura || '-',
        }
      : null;

    // ── Última Integração ────────────────────────────────────────────────
    const auditRecords = this._getAuditRecords();
    const sortedAudit = [...auditRecords].sort((a, b) => {
      const dateA = a.horario || '';
      const dateB = b.horario || '';
      return dateB.localeCompare(dateA);
    });

    const ultimaIntegracao = sortedAudit[0] || null;
    widgets.ultima_integracao = ultimaIntegracao
      ? {
          acao: ultimaIntegracao.acao || '-',
          resultado: ultimaIntegracao.resultado || '-',
          horario: ultimaIntegracao.horario || '-',
        }
      : null;

    // ── Último Fornecedor ────────────────────────────────────────────────
    const ultimoFornecedor = ultimaIntegracao
      ? { nome: ultimaIntegracao.fornecedor || '-' }
      : null;
    widgets.ultimo_fornecedor = ultimoFornecedor;

    // ── Última Atualização ───────────────────────────────────────────────
    widgets.ultima_atualizacao = {
      data: this._state.loadedAt || new Date().toISOString(),
    };

    // ── Auditoria: Últimos Eventos ──────────────────────────────────────
    if (window.Audit) {
      const auditResult = window.Audit.query({ pageSize: 5 });
      widgets.audit_ultimos_eventos = {
        events: auditResult.records,
        total: auditResult.total,
      };

      const errorResult = window.Audit.query({ severity: 'error', pageSize: 5 });
      widgets.audit_erros = {
        events: errorResult.records,
        total: errorResult.total,
      };

      const integrationResult = window.Audit.query({ category: 'integracoes', pageSize: 5 });
      widgets.audit_integracoes = {
        events: integrationResult.records,
        total: integrationResult.total,
      };

      const auditStats = window.Audit.getStats();
      widgets.audit_atividades_diarias = {
        today: auditStats.today,
        yesterday: auditStats.yesterday,
        thisWeek: auditStats.thisWeek,
      };
    }

    return widgets;
  },

  // ── Helpers de Dados ─────────────────────────────────────────────────────

  /**
   * Conta itens em um array.
   * @param {array|null} arr
   * @returns {number}
   */
  _countArray(arr) {
    return Array.isArray(arr) ? arr.length : 0;
  },

  /**
   * Conta itens em um objeto de carrinhos (flattened).
   * @param {object|null} obj
   * @returns {number}
   */
  _countFlat(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    return Object.values(obj).reduce((sum, arr) => {
      return sum + (Array.isArray(arr) ? arr.length : 0);
    }, 0);
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
      // Ignorar erros de leitura
    }
    return [];
  },

  // ── Getters Públicos ─────────────────────────────────────────────────────

  /**
   * Retorna o valor de um indicador.
   * @param {string} id
   * @returns {number}
   */
  getIndicator(id) {
    return this._state.indicators[id] ?? 0;
  },

  /**
   * Retorna todos os indicadores.
   * @returns {object}
   */
  getIndicators() {
    return { ...this._state.indicators };
  },

  /**
   * Retorna dados de um widget.
   * @param {string} id
   * @returns {object|null}
   */
  getWidget(id) {
    return this._state.widgets[id] ?? null;
  },

  /**
   * Retorna todos os widgets.
   * @returns {object}
   */
  getWidgets() {
    return { ...this._state.widgets };
  },

  /**
   * Retorna o valor de um analytic específico.
   * @param {string} id
   * @returns {any}
   */
  getAnalytic(id) {
    return this._state.analytics[id] ?? null;
  },

  /**
   * Retorna todos os analytics.
   * @returns {object}
   */
  getAnalytics() {
    return { ...this._state.analytics };
  },

  /**
   * Retorna snapshot completo do estado.
   * @returns {object}
   */
  getState() {
    return { ...this._state };
  },

  /**
   * Verifica se o dashboard está carregado.
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
