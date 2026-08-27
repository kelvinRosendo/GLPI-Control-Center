/**
 * GLPI Control Center - dashboard_analytics.js
 * -----------------------------------------------------------------------------
 * Módulo de analytics do Dashboard Operacional — Sprint 30.
 *
 * Sprint 30: Dashboard Operacional Compacto
 */

window.DashboardAnalytics = {
  _state: {
    analytics: {},
    calculated: false,
    calculatedAt: null,
  },

  calculate(indicators) {
    if (!indicators) return {};
    const analytics = {};

    this._calculatePercentages(analytics, indicators);
    this._calculateDistributions(analytics, indicators);
    this._calculateChartData(analytics, indicators);
    this._calculateTimeSinceUpdate(analytics);

    this._state.analytics = analytics;
    this._state.calculated = true;
    this._state.calculatedAt = new Date().toISOString();

    return analytics;
  },

  getAnalytics() {
    return { ...this._state.analytics };
  },

  getAnalytic(id) {
    return this._state.analytics[id] ?? null;
  },

  isCalculated() {
    return this._state.calculated;
  },

  reset() {
    this._state = { analytics: {}, calculated: false, calculatedAt: null };
  },

  // ── Cálculos ─────────────────────────────────────────────────────────────

  _calculatePercentages(analytics, indicators) {
    const total = indicators.total_ativos || 1;

    analytics.percentual_manutencao = Math.round((indicators.em_manutencao / total) * 100);
    analytics.percentual_disponivel = Math.round((indicators.disponiveis / total) * 100);
    analytics.total_ativos = indicators.total_ativos;
  },

  _calculateDistributions(analytics, indicators) {
    analytics.distribuicao_categorias = [
      { nome: 'Computadores', quantidade: indicators.computadores, cor: '#4f7ef7' },
      { nome: 'Chromebooks Geekie', quantidade: indicators.geekiees, cor: '#00c896' },
      { nome: 'Chromebooks Apoio', quantidade: indicators.apoio, cor: '#6c5ce7' },
      { nome: 'Projetores', quantidade: indicators.projetores, cor: '#ffc107' },
      { nome: 'Impressoras', quantidade: indicators.impressoras, cor: '#ff5555' },
    ];

    analytics.distribuicao_status = [
      { nome: 'Disponível', quantidade: indicators.disponiveis, cor: '#22c55e' },
      { nome: 'Em Manutenção', quantidade: indicators.em_manutencao, cor: '#f59e0b' },
      { nome: 'Emprestado', quantidade: indicators.emprestados || 0, cor: '#4f7ef7' },
    ];
  },

  _calculateChartData(analytics, indicators) {
    const total = indicators.total_ativos || 1;

    // ── Ativos por Tipo (horizontal bar — gráfico principal) ────────────
    const categories = [
      { label: 'Computadores', count: indicators.computadores, color: '#4f7ef7', tab: 'computadores' },
      { label: 'Chromebooks Geekie', count: indicators.geekiees, color: '#00c896', tab: 'geekiees' },
      { label: 'Chromebooks Apoio', count: indicators.apoio, color: '#6c5ce7', tab: 'apoio' },
      { label: 'Projetores', count: indicators.projetores, color: '#ffc107', tab: 'projetores' },
      { label: 'Impressoras', count: indicators.impressoras, color: '#ff5555', tab: 'impressoras' },
    ].sort((a, b) => b.count - a.count);

    analytics.chart_ativos_por_tipo = {
      labels: categories.map(c => c.label),
      datasets: [{
        label: 'Quantidade',
        data: categories.map(c => c.count),
        backgroundColor: categories.map(c => c.color),
        borderWidth: 0,
        borderRadius: 4,
      }],
      _meta: categories.map(c => ({
        tab: c.tab,
        count: c.count,
        pct: Math.round((c.count / total) * 1000) / 10,
      })),
    };

    // ── Donut (Distribuição dos Ativos) ─────────────────────────────────
    analytics.chart_equipamentos_categoria = {
      labels: ['Computadores', 'Geekie', 'Apoio', 'Projetores', 'Impressoras'],
      datasets: [{
        data: [
          indicators.computadores,
          indicators.geekiees,
          indicators.apoio,
          indicators.projetores,
          indicators.impressoras,
        ],
        backgroundColor: ['#4f7ef7', '#00c896', '#6c5ce7', '#ffc107', '#ff5555'],
        borderWidth: 0,
      }],
    };

    // ── Status dos Ativos (horizontal bar) ──────────────────────────────
    analytics.chart_status_ativos = {
      labels: ['Disponível', 'Manutenção', 'Emprestado'],
      datasets: [{
        label: 'Quantidade',
        data: [
          indicators.disponiveis,
          indicators.em_manutencao,
          indicators.emprestados || 0,
        ],
        backgroundColor: ['#22c55e', '#f59e0b', '#4f7ef7'],
        borderWidth: 0,
        borderRadius: 4,
      }],
    };

    // ── Dados para gráfico de chamados (mantido para referência) ────────
    analytics.chart_chamados_status = {
      labels: ['Abertos', 'Fechados'],
      datasets: [{
        label: 'Quantidade',
        data: [indicators.chamados_abertos, indicators.chamados_fechados],
        backgroundColor: ['#f59e0b', '#22c55e'],
        borderWidth: 0,
        borderRadius: 4,
      }],
    };
  },

  _calculateTimeSinceUpdate(analytics) {
    const state = window.Dashboard.getState();
    if (!state.loadedAt) {
      analytics.tempo_desde_atualizacao = { texto: 'Nunca atualizado', isStale: true };
      return;
    }

    const loadedAt = new Date(state.loadedAt);
    const now = new Date();
    const diffMs = now - loadedAt;
    const diffMinutos = Math.floor(diffMs / 60000);
    const diffHoras = Math.floor(diffMinutos / 60);

    let texto;
    if (diffMinutos < 1) {
      texto = 'Agora mesmo';
    } else if (diffMinutos < 60) {
      texto = `Há ${diffMinutos} min`;
    } else {
      texto = `Há ${diffHoras}h`;
    }

    analytics.tempo_desde_atualizacao = {
      minutos: diffMinutos,
      texto,
      isStale: window.Dashboard.isStale(),
    };
  },
};
