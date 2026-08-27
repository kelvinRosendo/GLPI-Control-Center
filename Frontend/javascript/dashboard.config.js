/**
 * GLPI Control Center - dashboard.config.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada do Dashboard Operacional — Sprint 30.
 *
 * Define:
 * - KPI: Total de Ativos + 4 cards de categoria
 * - Gráfico principal: Ativos por Tipo (horizontal bar)
 * - Gráfico secundário: Distribuição (donut)
 * - Status da infraestrutura
 * - Área de atenção
 * - Acessos rápidos
 */

window.DASHBOARD_CONFIG = {

  // ══════════════════════════════════════════════════════════════════════════
  // KPIs — Total + Categorias
  // ══════════════════════════════════════════════════════════════════════════

  kpis: [
    {
      id: 'total_ativos',
      label: 'Total de Ativos',
      description: 'Infraestrutura cadastrada',
      icon: 'dashboard',
      color: '#4f7ef7',
      tab: null,
    },
    {
      id: 'computadores',
      label: 'Computadores',
      description: '',
      icon: 'computer',
      color: '#4f7ef7',
      tab: 'computadores',
    },
    {
      id: 'chromebooks_total',
      label: 'Chromebooks',
      description: '',
      icon: 'chromebook',
      color: '#00c896',
      tab: 'geekiees',
    },
    {
      id: 'projetores',
      label: 'Projetores',
      description: '',
      icon: 'projector',
      color: '#ffc107',
      tab: 'projetores',
    },
    {
      id: 'impressoras',
      label: 'Impressoras',
      description: '',
      icon: 'printer',
      color: '#ff5555',
      tab: 'impressoras',
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORIAS DE ATIVOS
  // ══════════════════════════════════════════════════════════════════════════

  assetCategories: [
    { id: 'computadores', label: 'Computadores', color: '#4f7ef7', tab: 'computadores', searchPrefix: '' },
    { id: 'chromebooks_geekiees', label: 'Chromebooks Geekie', color: '#00c896', tab: 'geekiees', searchPrefix: '' },
    { id: 'chromebooks_apoio', label: 'Chromebooks Apoio', color: '#6c5ce7', tab: 'apoio', searchPrefix: '' },
    { id: 'projetores', label: 'Projetores', color: '#ffc107', tab: 'projetores', searchPrefix: '' },
    { id: 'impressoras', label: 'Impressoras', color: '#ff5555', tab: 'impressoras', searchPrefix: '' },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // GRÁFICOS
  // ══════════════════════════════════════════════════════════════════════════

  charts: [
    {
      id: 'ativos_por_tipo',
      titulo: 'Ativos por Tipo',
      tipo: 'horizontalBar',
      source: 'chart_ativos_por_tipo',
      visible: true,
      order: 1,
      clickable: true,
      size: 'large',
    },
    {
      id: 'distribuicao_ativos',
      titulo: 'Distribuição',
      tipo: 'donut',
      source: 'chart_equipamentos_categoria',
      visible: true,
      order: 2,
      clickable: false,
      size: 'medium',
    },
    {
      id: 'status_ativos',
      titulo: 'Status dos Ativos',
      tipo: 'horizontalBar',
      source: 'chart_status_ativos',
      visible: true,
      order: 3,
      clickable: false,
      size: 'medium',
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS DA INFRAESTRUTURA
  // ══════════════════════════════════════════════════════════════════════════

  infrastructure: [
    { id: 'glpi', label: 'GLPI', source: 'glpi_status' },
    { id: 'backend', label: 'Backend', source: 'backend_status' },
    { id: 'oauth', label: 'OAuth', source: 'oauth_status' },
    { id: 'integracoes', label: 'Integrações', source: 'fornecedores_status' },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // ACESSOS RÁPIDOS
  // ══════════════════════════════════════════════════════════════════════════

  quickActions: [
    { id: 'novo_chamado', label: 'Abrir Chamado', icon: 'plus', tab: 'chamados' },
    { id: 'buscar_equipamento', label: 'Buscar Ativo', icon: 'search', tab: 'computadores' },
    { id: 'projetores', label: 'Projetores', icon: 'projector', tab: 'projetores' },
    { id: 'relatorios', label: 'Relatórios', icon: 'reports', tab: 'relatorios' },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // CHAMADOS — PERÍODOS
  // ══════════════════════════════════════════════════════════════════════════

  ticketPeriods: [
    { id: 'all', label: 'Todos' },
    { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' },
    { id: '90d', label: '90 dias' },
    { id: 'custom', label: 'Personalizado' },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE
  // ══════════════════════════════════════════════════════════════════════════

  performance: {
    autoRefreshInterval: 300000,
    staleThreshold: 60000,
    enableAutoRefresh: true,
    pauseOnInactiveTab: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  getKPIs() {
    return [...this.kpis];
  },

  getKPI(id) {
    return this.kpis.find(k => k.id === id) || null;
  },

  getCharts() {
    return [...this.charts].sort((a, b) => a.order - b.order);
  },

  getChart(id) {
    return this.charts.find(c => c.id === id) || null;
  },

  getInfrastructure() {
    return [...this.infrastructure];
  },

  getQuickActions() {
    return [...this.quickActions];
  },

  getTicketPeriods() {
    return [...this.ticketPeriods];
  },

  getAssetCategories() {
    return [...this.assetCategories];
  },
};
