/**
 * GLPI Control Center - dashboard_analytics.js
 * -----------------------------------------------------------------------------
 * Módulo de analytics do Dashboard Operacional.
 *
 * Responsabilidades:
 * - Calcular indicadores derivados a partir dos dados brutos
 * - Calcular percentuais e distribuições
 * - Calcular tendências e comparações
 * - Preparar dados para gráficos
 *
 * NÃO renderiza HTML. Consulte dashboard_charts.js ou dashboard_ui.js.
 * NÃO busca dados. Consulte dashboard.js.
 * NÃO contém configuração. Consulte dashboard.config.js.
 *
 * Sprint 6: Analytics e Gráficos Operacionais
 */

window.DashboardAnalytics = {
  // ── Estado ───────────────────────────────────────────────────────────────

  _state: {
    analytics: {},
    calculated: false,
    calculatedAt: null,
  },

  // ── Ciclo de Vida ────────────────────────────────────────────────────────

  /**
   * Calcula todos os analytics a partir dos indicadores.
   * @param {object} indicators - Indicadores calculados pelo Dashboard
   * @returns {object} Map de id → valor do analytic
   */
  calculate(indicators) {
    if (!indicators) return {};

    const analytics = {};

    // ── Percentuais ──────────────────────────────────────────────────────
    this._calculatePercentages(analytics, indicators);

    // ── Distribuições ────────────────────────────────────────────────────
    this._calculateDistributions(analytics, indicators);

    // ── Top Rankings ─────────────────────────────────────────────────────
    this._calculateRankings(analytics, indicators);

    // ── Tempo ────────────────────────────────────────────────────────────
    this._calculateTimeSinceUpdate(analytics);

    // ── Dados para Gráficos ──────────────────────────────────────────────
    this._calculateChartData(analytics, indicators);

    // ── Marcar como calculado ────────────────────────────────────────────
    this._state.analytics = analytics;
    this._state.calculated = true;
    this._state.calculatedAt = new Date().toISOString();

    return analytics;
  },

  /**
   * Retorna todos os analytics calculados.
   * @returns {object}
   */
  getAnalytics() {
    return { ...this._state.analytics };
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
   * Verifica se os analytics foram calculados.
   * @returns {boolean}
   */
  isCalculated() {
    return this._state.calculated;
  },

  /**
   * Reseta o estado dos analytics.
   */
  reset() {
    this._state = {
      analytics: {},
      calculated: false,
      calculatedAt: null,
    };
  },

  // ── Cálculos ─────────────────────────────────────────────────────────────

  /**
   * Calcula percentuais de manutenção e disponibilidade.
   * @param {object} analytics - Objeto de analytics (mutável)
   * @param {object} indicators - Indicadores calculados
   */
  _calculatePercentages(analytics, indicators) {
    const totalAtivos =
      indicators.computadores +
      indicators.geekiees +
      indicators.apoio +
      indicators.projetores +
      indicators.impressoras;

    // Percentual em manutenção
    analytics.percentual_manutencao = totalAtivos > 0
      ? Math.round((indicators.em_manutencao / totalAtivos) * 100)
      : 0;

    // Percentual disponível
    analytics.percentual_disponivel = totalAtivos > 0
      ? Math.round((indicators.disponiveis / totalAtivos) * 100)
      : 0;

    // Percentual de chamados abertos
    analytics.percentual_chamados_abertos = indicators.total_chamados > 0
      ? Math.round((indicators.chamados_abertos / indicators.total_chamados) * 100)
      : 0;

    // Percentual de chamados fechados
    analytics.percentual_chamados_fechados = indicators.total_chamados > 0
      ? Math.round((indicators.chamados_fechados / indicators.total_chamados) * 100)
      : 0;

    // Total de ativos
    analytics.total_ativos = totalAtivos;
  },

  /**
   * Calcula distribuições por categoria e status.
   * @param {object} analytics - Objeto de analytics (mutável)
   * @param {object} indicators - Indicadores calculados
   */
  _calculateDistributions(analytics, indicators) {
    // Distribuição de ativos por categoria
    analytics.distribuicao_categorias = [
      { nome: 'Computadores', quantidade: indicators.computadores, cor: '#4f7ef7' },
      { nome: 'Chromebooks Geekie', quantidade: indicators.geekiees, cor: '#00c896' },
      { nome: 'Chromebooks de Apoio', quantidade: indicators.apoio, cor: '#6c5ce7' },
      { nome: 'Projetores', quantidade: indicators.projetores, cor: '#ffc107' },
      { nome: 'Impressoras', quantidade: indicators.impressoras, cor: '#ff5555' },
    ];

    // Distribuição de status
    analytics.distribuicao_status = [
      { nome: 'Disponível', quantidade: indicators.disponiveis, cor: '#22c55e' },
      { nome: 'Em Manutenção', quantidade: indicators.em_manutencao, cor: '#f59e0b' },
    ];

    // Distribuição de chamados
    analytics.distribuicao_chamados = [
      { nome: 'Abertos', quantidade: indicators.chamados_abertos, cor: '#f59e0b' },
      { nome: 'Fechados', quantidade: indicators.chamados_fechados, cor: '#22c55e' },
    ];
  },

  /**
   * Calcula rankings (top categorias, fornecedores, etc).
   * @param {object} analytics - Objeto de analytics (mutável)
   * @param {object} indicators - Indicadores calculados
   */
  _calculateRankings(analytics, indicators) {
    // Categoria com maior quantidade
    const categorias = [
      { nome: 'Computadores', quantidade: indicators.computadores },
      { nome: 'Chromebooks Geekie', quantidade: indicators.geekiees },
      { nome: 'Chromebooks de Apoio', quantidade: indicators.apoio },
      { nome: 'Projetores', quantidade: indicators.projetores },
      { nome: 'Impressoras', quantidade: indicators.impressoras },
    ].sort((a, b) => b.quantidade - a.quantidade);

    analytics.categoria_maior = categorias[0] || null;
    analytics.categoria_menor = categorias[categorias.length - 1] || null;
    analytics.ranking_categorias = categorias;

    // Fornecedor mais utilizado (via auditoria)
    const auditRecords = this._getAuditRecords();
    const fornecedorCounts = {};
    auditRecords.forEach(r => {
      if (r.fornecedor) {
        fornecedorCounts[r.fornecedor] = (fornecedorCounts[r.fornecedor] || 0) + 1;
      }
    });

    const fornecedores = Object.entries(fornecedorCounts)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);

    analytics.fornecedor_mais_utilizado = fornecedores[0] || null;
    analytics.ranking_fornecedores = fornecedores;

    // Tipo de chamado predominante
    const chamados = window.STATE.tickets || [];
    const statusCounts = {};
    chamados.forEach(t => {
      const status = t.status || 'desconhecido';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const statusChamados = Object.entries(statusCounts)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);

    analytics.tipo_chamado_predominante = statusChamados[0] || null;
    analytics.ranking_status_chamados = statusChamados;
  },

  /**
   * Calcula tempo desde a última atualização.
   * @param {object} analytics - Objeto de analytics (mutável)
   */
  _calculateTimeSinceUpdate(analytics) {
    const state = window.Dashboard.getState();
    if (!state.loadedAt) {
      analytics.tempo_desde_atualizacao = {
        minutos: 0,
        texto: 'Nunca atualizado',
        isStale: true,
      };
      return;
    }

    const loadedAt = new Date(state.loadedAt);
    const now = new Date();
    const diffMs = now - loadedAt;
    const diffMinutos = Math.floor(diffMs / 60000);
    const diffHoras = Math.floor(diffMinutos / 60);
    const diffDias = Math.floor(diffHoras / 24);

    let texto;
    if (diffMinutos < 1) {
      texto = 'Agora mesmo';
    } else if (diffMinutos < 60) {
      texto = `Há ${diffMinutos} minuto${diffMinutos > 1 ? 's' : ''}`;
    } else if (diffHoras < 24) {
      texto = `Há ${diffHoras} hora${diffHoras > 1 ? 's' : ''}`;
    } else {
      texto = `Há ${diffDias} dia${diffDias > 1 ? 's' : ''}`;
    }

    analytics.tempo_desde_atualizacao = {
      minutos: diffMinutos,
      horas: diffHoras,
      dias: diffDias,
      texto,
      isStale: window.Dashboard.isStale(),
    };
  },

  /**
   * Calcula dados formatados para gráficos.
   * @param {object} analytics - Objeto de analytics (mutável)
   * @param {object} indicators - Indicadores calculados
   */
  _calculateChartData(analytics, indicators) {
    // ── Dados para gráfico de Barras (Chamados por Status) ────────────────
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

    // ── Dados para gráfico de Donut (Distribuição dos Ativos) ────────────
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

    // ── Dados para gráfico de Barras Horizontais (Status dos Ativos) ─────
    analytics.chart_status_ativos = {
      labels: ['Operacional', 'Manutenção', 'Indisponível', 'Reserva'],
      datasets: [{
        label: 'Quantidade',
        data: [
          indicators.disponiveis,
          indicators.em_manutencao,
          Math.max(0, (indicators.computadores + indicators.geekiees + indicators.apoio + indicators.projetores + indicators.impressoras) - indicators.disponiveis - indicators.em_manutencao),
          0,
        ],
        backgroundColor: ['#22c55e', '#f59e0b', '#ff5555', '#4f7ef7'],
        borderWidth: 0,
        borderRadius: 4,
      }],
    };

    // ── Dados para gráfico de Linha (Evolução de Chamados) ───────────────
    analytics.chart_evolucao_chamados = {
      labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
      datasets: [
        {
          label: 'Abertos',
          data: [0, 0, 0, 0, 0, indicators.chamados_abertos],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Fechados',
          data: [0, 0, 0, 0, 0, indicators.chamados_fechados],
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.4,
        },
      ],
    };
  },

  // ── Helpers ──────────────────────────────────────────────────────────────

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
};
