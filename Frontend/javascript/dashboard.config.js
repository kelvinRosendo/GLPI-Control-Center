/**
 * GLPI Control Center - dashboard.config.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada do Dashboard Operacional — Visual Corporativo.
 *
 * Sprint 28: Dashboard Corporativo
 *
 * Define:
 * - KPIs compactos no topo
 * - Gráficos organizados em blocos
 * - Status da infraestrutura
 * - Área de atenção
 * - Acessos rápidos
 */

window.DASHBOARD_CONFIG = {

  // ══════════════════════════════════════════════════════════════════════════
  // KPIs NO TOPO (compactos, horizontais)
  // ══════════════════════════════════════════════════════════════════════════

  kpis: [
    {
      id: 'computadores',
      label: 'Computadores',
      description: 'Inventariados',
      icon: 'computer',
      color: '#4f7ef7',
      source: 'computadores',
      tab: 'computadores',
    },
    {
      id: 'geekiees',
      label: 'Chromebooks',
      description: 'Geekie',
      icon: 'chromebook',
      color: '#00c896',
      source: 'chromebooksGeekiees',
      tab: 'geekiees',
    },
    {
      id: 'projetores',
      label: 'Projetores',
      description: 'Cadastrados',
      icon: 'projector',
      color: '#ffc107',
      source: 'projetores',
      tab: 'projetores',
    },
    {
      id: 'chamados_abertos',
      label: 'Abertos',
      description: 'Requerem atendimento',
      icon: 'warning',
      color: '#f59e0b',
      source: 'tickets',
      filter: 'abertos',
      tab: 'chamados',
    },
    {
      id: 'chamados_fechados',
      label: 'Fechados',
      description: 'Resolvidos',
      icon: 'success',
      color: '#22c55e',
      source: 'tickets',
      filter: 'fechados',
      tab: 'chamados',
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // GRÁFICOS
  // ══════════════════════════════════════════════════════════════════════════

  charts: [
    {
      id: 'chamados_por_periodo',
      titulo: 'Chamados por Período',
      tipo: 'bar',
      source: 'chart_chamados_status',
      cores: ['#f59e0b', '#22c55e'],
      visible: true,
      order: 1,
      clickable: true,
      tab: 'chamados',
      size: 'large',
    },
    {
      id: 'distribuicao_ativos',
      titulo: 'Distribuição dos Ativos',
      tipo: 'donut',
      source: 'chart_equipamentos_categoria',
      cores: ['#4f7ef7', '#00c896', '#6c5ce7', '#ffc107', '#ff5555'],
      visible: true,
      order: 2,
      clickable: true,
      tab: 'computadores',
      size: 'medium',
    },
    {
      id: 'status_ativos',
      titulo: 'Status dos Ativos',
      tipo: 'horizontalBar',
      source: 'chart_status_ativos',
      cores: ['#22c55e', '#f59e0b', '#ff5555', '#4f7ef7'],
      visible: true,
      order: 3,
      clickable: false,
      size: 'medium',
    },
    {
      id: 'evolucao_chamados',
      titulo: 'Evolução de Chamados',
      tipo: 'line',
      source: 'chart_evolucao_chamados',
      cores: ['#f59e0b', '#22c55e'],
      visible: true,
      order: 4,
      clickable: false,
      size: 'large',
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS DA INFRAESTRUTURA
  // ══════════════════════════════════════════════════════════════════════════

  infrastructure: [
    { id: 'glpi', label: 'GLPI', source: 'glpi_status' },
    { id: 'backend', label: 'Backend', source: 'backend_status' },
    { id: 'oauth', label: 'Google OAuth', source: 'oauth_status' },
    { id: 'fornecedores', label: 'Fornecedores', source: 'fornecedores_status' },
    { id: 'notificacoes', label: 'Notificações', source: 'notificacoes_status' },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // ACESSOS RÁPIDOS
  // ══════════════════════════════════════════════════════════════════════════

  quickActions: [
    { id: 'novo_chamado', label: 'Abrir Chamado', icon: 'plus', tab: 'chamados' },
    { id: 'buscar_equipamento', label: 'Buscar Equipamento', icon: 'search', tab: 'computadores' },
    { id: 'projetores', label: 'Projetores', icon: 'projector', tab: 'projetores' },
    { id: 'relatorios', label: 'Relatórios', icon: 'reports', tab: 'relatorios' },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // PLACEHOLDERS
  // ══════════════════════════════════════════════════════════════════════════

  placeholders: {
    ultimoChamado: 'Nenhum chamado registrado',
    ultimaIntegracao: 'Nenhuma integração realizada',
    ultimoFornecedor: 'Nenhum fornecedor acessado',
    ultimaAtualizacao: 'Aguardando primeira atualização',
  },

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
};
