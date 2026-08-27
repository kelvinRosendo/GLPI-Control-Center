/**
 * GLPI Control Center - dashboard_charts.js
 * -----------------------------------------------------------------------------
 * Módulo de renderização de gráficos do Dashboard — Sprint 30.
 *
 * Sprint 30: Dashboard Operacional Compacto
 */

window.DashboardCharts = {
  _charts: {},

  destroy() {
    Object.keys(this._charts).forEach(chartId => this._destroyChart(chartId));
    this._charts = {};
  },

  _renderChart(chartConfig) {
    const analytics = window.Dashboard.getAnalytics();
    const chartData = this._getChartData(chartConfig.id, analytics);

    if (!chartData || this._isEmptyChartData(chartData)) {
      this._renderChartEmpty(chartConfig.id);
      return;
    }

    const chartContainer = document.getElementById(`chart-container-${chartConfig.id}`);
    if (!chartContainer) return;

    if (typeof Chart === 'undefined') {
      this._renderChartError(chartConfig.id, 'Chart.js não está disponível');
      return;
    }

    this._destroyChart(chartConfig.id);

    const canvas = document.createElement('canvas');
    canvas.id = `chart-${chartConfig.id}`;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    chartContainer.innerHTML = '';
    chartContainer.appendChild(canvas);

    try {
      const ctx = canvas.getContext('2d');
      const options = this._getChartOptions(chartConfig, analytics);

      this._charts[chartConfig.id] = new Chart(ctx, {
        type: this._getChartType(chartConfig.tipo),
        data: chartData,
        options: options,
      });
    } catch (error) {
      console.error(`[DashboardCharts] Erro ao criar gráfico ${chartConfig.id}:`, error);
      chartContainer.innerHTML = `<div class="dash-chart-error"><span>Erro ao carregar gráfico</span></div>`;
    }
  },

  _destroyChart(chartId) {
    if (this._charts[chartId]) {
      this._charts[chartId].destroy();
      delete this._charts[chartId];
    }
  },

  _renderChartEmpty(chartId) {
    const container = document.getElementById(`chart-container-${chartId}`);
    if (container) {
      container.innerHTML = `<div class="dash-chart-empty"><span>Nenhum dado disponível</span></div>`;
    }
  },

  _renderChartError(chartId, error) {
    const container = document.getElementById(`chart-container-${chartId}`);
    if (container) {
      container.innerHTML = `<div class="dash-chart-error"><span>Erro: ${error}</span></div>`;
    }
  },

  _getChartType(tipo) {
    const typeMap = {
      'bar': 'bar',
      'horizontalBar': 'bar',
      'donut': 'doughnut',
      'doughnut': 'doughnut',
      'line': 'line',
      'pie': 'pie',
    };
    return typeMap[tipo] || 'bar';
  },

  _getChartData(chartId, analytics) {
    const dataMap = {
      'ativos_por_tipo': analytics.chart_ativos_por_tipo,
      'distribuicao_ativos': analytics.chart_equipamentos_categoria,
      'status_ativos': analytics.chart_status_ativos,
    };
    return dataMap[chartId] || null;
  },

  _getChartOptions(chartConfig, analytics) {
    const isHorizontal = chartConfig.tipo === 'horizontalBar';
    const isDonut = chartConfig.tipo === 'donut' || chartConfig.tipo === 'doughnut';
    const isBar = chartConfig.tipo === 'bar' || isHorizontal;

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: isDonut,
          position: 'bottom',
          labels: {
            color: '#9299b8',
            font: { size: 11 },
            padding: 10,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        title: { display: false },
        tooltip: this._getTooltipConfig(chartConfig, analytics),
      },
    };

    if (isBar) {
      options.indexAxis = isHorizontal ? 'y' : 'x';
      options.scales = {
        x: {
          ticks: { color: '#9299b8', font: { size: 11 } },
          grid: { color: 'rgba(46,51,71,0.5)' },
        },
        y: {
          ticks: { color: '#9299b8', font: { size: 11 } },
          grid: { display: false },
        },
      };
    }

    if (isDonut) {
      options.cutout = '60%';
    }

    // Click handlers
    if (chartConfig.id === 'ativos_por_tipo') {
      const meta = analytics.chart_ativos_por_tipo?._meta;
      options.onClick = (event, elements) => {
        if (elements.length > 0 && meta && meta[elements[0].index]) {
          const tab = meta[elements[0].index].tab;
          if (tab && window.App?.go) window.App.go(tab);
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

  _getTooltipConfig(chartConfig, analytics) {
    const total = analytics.total_ativos || 1;
    const meta = analytics.chart_ativos_por_tipo?._meta;

    const base = {
      backgroundColor: 'rgba(26, 29, 39, 0.95)',
      titleColor: '#e8eaf6',
      bodyColor: '#9299b8',
      borderColor: '#2e3347',
      borderWidth: 1,
      padding: 12,
      cornerRadius: 8,
      titleFont: { weight: '600' },
    };

    if (chartConfig.id === 'ativos_por_tipo' && meta) {
      base.callbacks = {
        label: function(context) {
          const idx = context.dataIndex;
          const item = meta[idx];
          if (!item) return `${context.parsed.x} ativos`;
          return `${item.count} ativos (${item.pct}%)`;
        },
      };
    }

    return base;
  },

  _isEmptyChartData(chartData) {
    if (!chartData || !chartData.datasets) return true;
    return chartData.datasets.every(dataset => {
      if (!dataset.data) return true;
      return dataset.data.every(value => value === 0 || value === null);
    });
  },

  _updateChartData(chartId, analytics) {
    const chart = this._charts[chartId];
    if (!chart) return;
    const newData = this._getChartData(chartId, analytics);
    if (!newData) return;
    chart.data = newData;
    chart.update('none');
  },

  update() {
    const chartConfigs = window.DASHBOARD_CONFIG.getCharts();
    const analytics = window.Dashboard.getAnalytics();
    for (const chartConfig of chartConfigs) {
      if (!chartConfig.visible) continue;
      this._updateChartData(chartConfig.id, analytics);
    }
  },
};
