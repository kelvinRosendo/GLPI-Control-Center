/**
 * GLPI Control Center - dashboard_charts.js
 * -----------------------------------------------------------------------------
 * Módulo de renderização de gráficos do Dashboard Operacional.
 *
 * Responsabilidades:
 * - Criar gráficos usando Chart.js
 * - Atualizar gráficos quando dados mudam
 * - Destruir gráficos para evitar memory leak
 * - Controlar ciclo de vida dos gráficos
 * - Gerenciar estados visuais (loading, vazio, erro)
 *
 * NÃO busca dados. Consulte dashboard.js.
 * NÃO calcula analytics. Consulte dashboard_analytics.js.
 * NÃO contém configuração. Consulte dashboard.config.js.
 *
 * Sprint 6: Analytics e Gráficos Operacionais
 */

window.DashboardCharts = {
  // ── Estado ───────────────────────────────────────────────────────────────

  _charts: {},
  _containerEl: null,

  // ── Ciclo de Vida ────────────────────────────────────────────────────────

  /**
   * Renderiza todos os gráficos configurados dentro do container especificado.
   * @param {string} containerId - ID do elemento container
   */
  render(containerId) {
    const config = window.DASHBOARD_CONFIG;
    const chartConfigs = config.getCharts();

    // Verificar se Chart.js está disponível
    if (typeof Chart === 'undefined') {
      console.error('[DashboardCharts] Chart.js não está disponível');
      for (const chartConfig of chartConfigs) {
        if (!chartConfig.visible) continue;
        this._renderChartError(chartConfig.id, 'Chart.js não está disponível');
      }
      return;
    }

    console.log('[DashboardCharts] Renderizando', chartConfigs.length, 'gráficos');

    // Renderizar cada gráfico
    for (const chartConfig of chartConfigs) {
      if (!chartConfig.visible) continue;
      this._renderChart(chartConfig);
    }

    // Vincular eventos
    this._bindChartEvents();
  },

  /**
   * Atualiza todos os gráficos com novos dados.
   */
  update() {
    const config = window.DASHBOARD_CONFIG;
    const chartConfigs = config.getCharts();
    const analytics = window.Dashboard.getAnalytics();

    for (const chartConfig of chartConfigs) {
      if (!chartConfig.visible) continue;
      this._updateChartData(chartConfig.id, analytics);
    }
  },

  /**
   * Destrói todos os gráficos e limpa referências.
   */
  destroy() {
    Object.keys(this._charts).forEach(chartId => {
      this._destroyChart(chartId);
    });
    this._charts = {};
    this._containerEl = null;
  },

  // ── Renderização de Gráficos ─────────────────────────────────────────────

  /**
   * Renderiza um gráfico individual.
   * @param {object} chartConfig - Configuração do gráfico
   */
  _renderChart(chartConfig) {
    const analytics = window.Dashboard.getAnalytics();
    const chartData = this._getChartData(chartConfig.id, analytics);

    // Verificar se há dados
    if (!chartData || this._isEmptyChartData(chartData)) {
      this._renderChartEmpty(chartConfig.id);
      return;
    }

    // Criar container para o gráfico
    const chartContainer = document.getElementById(`chart-container-${chartConfig.id}`);
    if (!chartContainer) return;

    // Verificar se Chart.js está disponível
    if (typeof Chart === 'undefined') {
      this._renderChartError(chartConfig.id, 'Chart.js não está disponível');
      return;
    }

    // Destruir gráfico existente antes de criar novo
    this._destroyChart(chartConfig.id);

    // Criar canvas para o gráfico
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${chartConfig.id}`;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    chartContainer.innerHTML = '';
    chartContainer.appendChild(canvas);

    // Criar gráfico Chart.js
    try {
      const ctx = canvas.getContext('2d');
      const options = this._getChartOptions(chartConfig);

      this._charts[chartConfig.id] = new Chart(ctx, {
        type: this._getChartType(chartConfig.tipo),
        data: chartData,
        options: options,
      });
    } catch (error) {
      console.error(`[DashboardCharts] Erro ao criar gráfico ${chartConfig.id}:`, error);
      chartContainer.innerHTML = this._renderChartError(error.message);
    }
  },

  /**
   * Atualiza os dados de um gráfico específico.
   * @param {string} chartId - ID do gráfico
   * @param {object} analytics - Dados de analytics
   */
  _updateChartData(chartId, analytics) {
    const chart = this._charts[chartId];
    if (!chart) return;

    const newData = this._getChartData(chartId, analytics);
    if (!newData) return;

    // Atualizar dados do gráfico
    chart.data = newData;
    chart.update('none'); // 'none' para evitar animação durante atualização
  },

  /**
   * Destrói um gráfico específico.
   * @param {string} chartId - ID do gráfico
   */
  _destroyChart(chartId) {
    if (this._charts[chartId]) {
      this._charts[chartId].destroy();
      delete this._charts[chartId];
    }
  },

  // ── Renderização de Estados ──────────────────────────────────────────────

  /**
   * Renderiza estado de loading para um gráfico.
   * @param {string} chartId - ID do gráfico
   */
  _renderChartLoading(chartId) {
    const container = document.getElementById(`chart-container-${chartId}`);
    if (container) {
      container.innerHTML = `
        <div class="dash-chart-loading">
          <div class="dash-skeleton-icon"></div>
          <span>Carregando gráfico...</span>
        </div>
      `;
    }
  },

  /**
   * Renderiza estado vazio para um gráfico.
   * @param {string} chartId - ID do gráfico
   */
  _renderChartEmpty(chartId) {
    const container = document.getElementById(`chart-container-${chartId}`);
    if (container) {
      container.innerHTML = `
        <div class="dash-chart-empty">
          <span>Nenhum dado disponível</span>
        </div>
      `;
    }
  },

  /**
   * Renderiza estado de erro para um gráfico.
   * @param {string} chartId - ID do gráfico
   * @param {string} error - Mensagem de erro
   */
  _renderChartError(chartId, error) {
    const container = document.getElementById(`chart-container-${chartId}`);
    if (container) {
      container.innerHTML = `
        <div class="dash-chart-error">
          <span class="dash-error-icon">&#9888;</span>
          <span>Erro ao carregar gráfico</span>
          <span>${error}</span>
        </div>
      `;
    }
  },

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Retorna o tipo de gráfico Chart.js baseado na configuração.
   * @param {string} tipo - Tipo do gráfico na configuração
   * @returns {string} Tipo do gráfico Chart.js
   */
  _getChartType(tipo) {
    const typeMap = {
      'pie': 'pie',
      'bar': 'bar',
      'horizontalBar': 'bar',
      'donut': 'doughnut',
      'line': 'line',
      'doughnut': 'doughnut',
    };
    return typeMap[tipo] || 'bar';
  },

  /**
   * Retorna os dados do gráfico baseado no ID e analytics.
   * @param {string} chartId - ID do gráfico
   * @param {object} analytics - Dados de analytics
   * @returns {object|null} Dados do gráfico
   */
  _getChartData(chartId, analytics) {
    const dataMap = {
      'chamados_por_periodo': analytics.chart_chamados_status,
      'distribuicao_ativos': analytics.chart_equipamentos_categoria,
      'status_ativos': analytics.chart_status_ativos,
      'evolucao_chamados': analytics.chart_evolucao_chamados,
    };
    return dataMap[chartId] || null;
  },

  /**
   * Retorna as opções do gráfico baseado na configuração.
   * @param {object} chartConfig - Configuração do gráfico
   * @returns {object} Opções do gráfico
   */
  _getChartOptions(chartConfig) {
    const isHorizontal = chartConfig.tipo === 'horizontalBar';
    const isDonut = chartConfig.tipo === 'donut' || chartConfig.tipo === 'doughnut';
    const isPie = chartConfig.tipo === 'pie';
    const isBar = chartConfig.tipo === 'bar' || isHorizontal;
    const isLine = chartConfig.tipo === 'line';

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: !isBar || isHorizontal,
          position: isDonut || isPie ? 'bottom' : 'bottom',
          labels: {
            color: '#9299b8',
            font: { size: 12 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 10,
          },
        },
        title: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(26, 29, 39, 0.95)',
          titleColor: '#e8eaf6',
          bodyColor: '#9299b8',
          borderColor: '#2e3347',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { weight: '600' },
        },
      },
    };

    // Opções específicas para gráficos de barra
    if (isBar) {
      options.indexAxis = isHorizontal ? 'y' : 'x';
      options.scales = {
        x: {
          ticks: { color: '#9299b8' },
          grid: { color: '#2e3347' },
        },
        y: {
          ticks: { color: '#9299b8' },
          grid: { color: '#2e3347' },
        },
      };
    }

    // Opções específicas para gráficos de linha
    if (isLine) {
      options.scales = {
        x: {
          ticks: { color: '#9299b8' },
          grid: { color: '#2e3347' },
        },
        y: {
          ticks: { color: '#9299b8' },
          grid: { color: '#2e3347' },
          beginAtZero: true,
        },
      };
      options.elements = {
        point: {
          radius: 4,
          hoverRadius: 6,
        },
        line: {
          borderWidth: 2,
        },
      };
    }

    // Opções para donut/pie (centralizar texto)
    if (isDonut || isPie) {
      options.cutout = isDonut ? '60%' : 0;
    }

    // Eventos de clique (se configurado)
    if (chartConfig.clickable && chartConfig.tab) {
      options.onClick = (event, elements) => {
        if (elements.length > 0 && window.App?.go) {
          window.App.go(chartConfig.tab);
        }
      };
      options.onHover = (event, elements) => {
        const canvas = event.native?.target;
        if (canvas) {
          canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        }
      };
    }

    return options;
  },

  /**
   * Verifica se os dados do gráfico estão vazios.
   * @param {object} chartData - Dados do gráfico
   * @returns {boolean}
   */
  _isEmptyChartData(chartData) {
    if (!chartData || !chartData.datasets) return true;

    return chartData.datasets.every(dataset => {
      if (!dataset.data) return true;
      return dataset.data.every(value => value === 0 || value === null);
    });
  },

  /**
   * Vincula eventos de interação com os gráficos.
   */
  _bindChartEvents() {
    // Eventos são vinculados via opções do Chart.js
    // Este método pode ser expandido para eventos adicionais
  },
};
