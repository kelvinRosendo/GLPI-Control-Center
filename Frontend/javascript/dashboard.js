/**
 * GLPI Control Center - dashboard.js
 * -----------------------------------------------------------------------------
 * Módulo de dados do Dashboard Operacional — Sprint 30.
 *
 * Sprint 30: Dashboard Operacional Compacto
 */

window.Dashboard = {
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

  _autoRefreshTimer: null,
  _visibilityChangeHandler: null,

  // ── Ciclo de Vida ────────────────────────────────────────────────────────

  async load() {
    if (this._state.loading) return { ok: true };
    this._state.loading = true;
    this._state.error = '';

    try {
      await this._ensureData();
      this._state.indicators = this._calculateIndicators();
      this._state.widgets = this._calculateWidgets();
      this._state.analytics = window.DashboardAnalytics.calculate(this._state.indicators);

      this._state.loaded = true;
      this._state.loadedAt = new Date().toISOString();
      this._state.lastRefresh = new Date().toISOString();
      this._state.isStale = false;
      this._state.loading = false;

      this._emit('dashboard:loaded', {
        indicators: this._state.indicators,
        widgets: this._state.widgets,
        analytics: this._state.analytics,
      });

      if (window.Audit) {
        window.Audit.register({
          action: 'dashboard_carregado',
          module: 'dashboard',
          descricao: 'Dashboard operacional carregado',
        });
      }

      this._startAutoRefresh();
      return { ok: true };
    } catch (err) {
      this._state.error = err.message || 'Erro ao carregar dashboard.';
      this._state.loading = false;
      this._emit('dashboard:error', { error: this._state.error });
      return { ok: false, error: this._state.error };
    }
  },

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

  isStale() {
    if (!this._state.loadedAt) return false;
    const config = window.DASHBOARD_CONFIG?.performance;
    const threshold = config?.staleThreshold || 60000;
    return Date.now() - new Date(this._state.loadedAt).getTime() > threshold;
  },

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

    if (!window.STATE.ticketsLoaded && !window.STATE.ticketsLoading) {
      try {
        const tickets = await window.GlpiClient.fetchTickets();
        window.State.setTickets(tickets);
      } catch {
        // Tickets podem falhar — não é crítico
      }
    }

    if (window.Projectors && !window.Projectors.isLoaded() && !window.Projectors.isLoading()) {
      try {
        await window.Projectors.load();
      } catch {
        // Projetores podem falhar — não é crítico
      }
    }
  },

  // ── Cálculo de Indicadores ───────────────────────────────────────────────

  _calculateIndicators() {
    const D = window.DATA;
    const indicators = {};

    // ── Contagem por Categoria ──────────────────────────────────────────
    indicators.computadores = this._countArray(D.computadores);
    indicators.geekiees = this._countArray(D.chromebooksGeekiees);
    indicators.apoio = this._countFlat(D.chromebooksApoio);
    indicators.projetores = this._countArray(D.projetores);
    indicators.impressoras = this._countArray(D.impressoras);

    // ── Chromebooks combinados ──────────────────────────────────────────
    indicators.chromebooks_total = indicators.geekiees + indicators.apoio;

    // ── Total de Ativos ────────────────────────────────────────────────
    indicators.total_ativos =
      indicators.computadores +
      indicators.geekiees +
      indicators.apoio +
      indicators.projetores +
      indicators.impressoras;

    // ── Percentuais por categoria ───────────────────────────────────────
    const total = indicators.total_ativos || 1;
    indicators.pct_computadores = Math.round((indicators.computadores / total) * 1000) / 10;
    indicators.pct_chromebooks = Math.round((indicators.chromebooks_total / total) * 1000) / 10;
    indicators.pct_projetores = Math.round((indicators.projetores / total) * 1000) / 10;
    indicators.pct_impressoras = Math.round((indicators.impressoras / total) * 1000) / 10;

    // ── Chamados (todos) ────────────────────────────────────────────────
    const tickets = window.STATE.tickets || [];
    indicators.total_chamados = tickets.length;

    // ── Chamados por status ─────────────────────────────────────────────
    indicators.chamados_novos = tickets.filter(t => t.status === 'aberto').length;
    indicators.chamados_em_andamento = tickets.filter(t => t.status === 'em_andamento').length;
    indicators.chamados_pendentes = tickets.filter(t => t.status === 'pendente').length;
    indicators.chamados_resolvidos = tickets.filter(t => t.status === 'resolvido').length;
    indicators.chamados_fechados = tickets.filter(t => t.status === 'fechado').length;

    // ── Chamados abertos (somente os que precisam de ação) ──────────────
    indicators.chamados_abertos =
      indicators.chamados_novos +
      indicators.chamados_em_andamento +
      indicators.chamados_pendentes;

    // ── Chamados por período (se filtro ativo) ──────────────────────────
    const period = window.STATE?.ticketPeriod || 'all';
    const customStart = window.STATE?.ticketCustomStart || null;
    const customEnd = window.STATE?.ticketCustomEnd || null;

    indicators.chamados_periodo = this._filterTicketsByPeriod(
      tickets, period, customStart, customEnd
    );

    // ── Status dos Ativos ──────────────────────────────────────────────
    const todosAtivos = [
      ...(D.computadores || []),
      ...(D.chromebooksGeekiees || []),
      ...(D.projetores || []),
      ...(D.impressoras || []),
    ];

    indicators.em_manutencao = todosAtivos.filter(a => a.status === 'manutencao').length;
    indicators.disponiveis = todosAtivos.filter(a => a.status === 'ativo').length;
    indicators.emprestados = todosAtivos.filter(a => a.status === 'emprestado').length;

    // ── Indicadores de Projetores ──────────────────────────────────────
    if (window.Projectors && window.Projectors.isLoaded()) {
      const pjInd = window.Projectors.getIndicators();
      indicators.projectors_operando = pjInd.operando || 0;
      indicators.projectors_atencao = pjInd.atencao || 0;
      indicators.projectors_lampWarning = pjInd.lampWarning || 0;

      // Avisos extraídos dos comentários
      const noticesSummary = window.Projectors.getNoticesSummary();
      indicators.projectors_notices_total = noticesSummary.total || 0;
      indicators.projectors_notices_criticos = noticesSummary.bySeverity?.critico || 0;
      indicators.projectors_notices_atencao = noticesSummary.bySeverity?.atencao || 0;
      indicators.projectors_notices_defeito = noticesSummary.byType?.defeito || 0;
    } else {
      indicators.projectors_operando = 0;
      indicators.projectors_atencao = 0;
      indicators.projectors_lampWarning = 0;
      indicators.projectors_notices_total = 0;
      indicators.projectors_notices_criticos = 0;
      indicators.projectors_notices_atencao = 0;
      indicators.projectors_notices_defeito = 0;
    }

    return indicators;
  },

  _filterTicketsByPeriod(tickets, period, customStart, customEnd) {
    if (period === 'all') {
      return {
        abertos: tickets.filter(t =>
          t.status === 'aberto' || t.status === 'em_andamento' || t.status === 'pendente'
        ).length,
        novos: tickets.filter(t => t.status === 'aberto').length,
        em_andamento: tickets.filter(t => t.status === 'em_andamento').length,
        pendentes: tickets.filter(t => t.status === 'pendente').length,
      };
    }

    let startDate;
    const now = new Date();
    if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (period === 'custom' && customStart) {
      startDate = new Date(customStart);
    }

    let endDate = now;
    if (period === 'custom' && customEnd) {
      endDate = new Date(customEnd);
      endDate.setHours(23, 59, 59, 999);
    }

    const filtered = tickets.filter(t => {
      if (!t.abertura) return false;
      const d = new Date(t.abertura);
      if (startDate && d < startDate) return false;
      if (d > endDate) return false;
      return true;
    });

    return {
      abertos: filtered.filter(t =>
        t.status === 'aberto' || t.status === 'em_andamento' || t.status === 'pendente'
      ).length,
      novos: filtered.filter(t => t.status === 'aberto').length,
      em_andamento: filtered.filter(t => t.status === 'em_andamento').length,
      pendentes: filtered.filter(t => t.status === 'pendente').length,
    };
  },

  _calculateWidgets() {
    const widgets = {};
    const tickets = window.STATE.tickets || [];
    const sortedTickets = [...tickets].sort((a, b) => {
      return (b.abertura || '').localeCompare(a.abertura || '');
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

    widgets.ultima_atualizacao = {
      data: this._state.loadedAt || new Date().toISOString(),
    };

    return widgets;
  },

  // ── Helpers ──────────────────────────────────────────────────────────────

  _countArray(arr) {
    return Array.isArray(arr) ? arr.length : 0;
  },

  _countFlat(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    return Object.values(obj).reduce((sum, arr) => {
      return sum + (Array.isArray(arr) ? arr.length : 0);
    }, 0);
  },

  // ── Getters Públicos ─────────────────────────────────────────────────────

  getIndicator(id) {
    return this._state.indicators[id] ?? 0;
  },

  getIndicators() {
    return { ...this._state.indicators };
  },

  getWidget(id) {
    return this._state.widgets[id] ?? null;
  },

  getWidgets() {
    return { ...this._state.widgets };
  },

  getAnalytic(id) {
    return this._state.analytics[id] ?? null;
  },

  getAnalytics() {
    return { ...this._state.analytics };
  },

  getState() {
    return { ...this._state };
  },

  isLoaded() {
    return this._state.loaded;
  },

  isLoading() {
    return this._state.loading;
  },

  _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  },
};
