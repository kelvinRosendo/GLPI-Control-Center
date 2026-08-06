/**
 * GLPI Control Center - dashboard.config.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada do Dashboard Operacional.
 *
 * Define:
 * - Cards de indicadores (ordem, ícone, cor, descrição, fonte de dados)
 * - Widgets de resumo operacional
 * - Layout e comportamento visual
 *
 * PRINCÍPIO: Configuration Driven Design
 * - Nenhum dado hardcoded no dashboard.js ou dashboard_ui.js
 * - Todo comportamento visual vem desta configuração
 * - Novos cards são adicionados APENAS neste arquivo
 *
 * Sprint 5: Dashboard Operacional
 */

window.DASHBOARD_CONFIG = {

  // ══════════════════════════════════════════════════════════════════════════
  // CARDS DE INDICADORES
  // ══════════════════════════════════════════════════════════════════════════

  cards: [
    // ── Ativos por Categoria ──────────────────────────────────────────────

    {
      id: 'computadores',
      label: 'Computadores',
      icon: '&#128421;',
      color: '#4f7ef7',
      description: 'Total de computadores inventariados',
      source: 'computadores',
      order: 1,
      group: 'ativos',
      tab: 'computadores',
      clickable: true,
    },

    {
      id: 'geekiees',
      label: 'Chromebooks Geekie',
      icon: '&#128214;',
      color: '#00c896',
      description: 'Chromebooks do programa Geekie',
      source: 'chromebooksGeekiees',
      order: 2,
      group: 'ativos',
      tab: 'geekiees',
      clickable: true,
    },

    {
      id: 'apoio',
      label: 'Chromebooks de Apoio',
      icon: '&#128666;',
      color: '#6c5ce7',
      description: 'Carrinhos de Chromebooks de apoio',
      source: 'chromebooksApoio',
      order: 3,
      group: 'ativos',
      tab: 'apoio',
      clickable: true,
    },

    {
      id: 'projetores',
      label: 'Projetores',
      icon: '&#128249;',
      color: '#ffc107',
      description: 'Projetores cadastrados',
      source: 'projetores',
      order: 4,
      group: 'ativos',
      tab: 'projetores',
      clickable: true,
    },

    {
      id: 'impressoras',
      label: 'Impressoras',
      icon: '&#128424;',
      color: '#ff5555',
      description: 'Impressoras cadastradas',
      source: 'impressoras',
      order: 5,
      group: 'ativos',
      tab: 'impressoras',
      clickable: true,
    },

    // ── Chamados ─────────────────────────────────────────────────────────

    {
      id: 'total_chamados',
      label: 'Total de Chamados',
      icon: '&#128196;',
      color: '#4f7ef7',
      description: 'Total de chamados no GLPI',
      source: 'tickets',
      order: 6,
      group: 'chamados',
      tab: 'chamados',
      clickable: true,
    },

    {
      id: 'chamados_abertos',
      label: 'Chamados Abertos',
      icon: '&#128194;',
      color: '#f59e0b',
      description: 'Chamados com status aberto ou em andamento',
      source: 'tickets',
      filter: 'abertos',
      order: 7,
      group: 'chamados',
      tab: 'chamados',
      clickable: true,
    },

    {
      id: 'chamados_fechados',
      label: 'Chamados Fechados',
      icon: '&#9989;',
      color: '#22c55e',
      description: 'Chamados resolvidos ou fechados',
      source: 'tickets',
      filter: 'fechados',
      order: 8,
      group: 'chamados',
      tab: 'chamados',
      clickable: true,
    },

    // ── Status dos Ativos ────────────────────────────────────────────────

    {
      id: 'em_manutencao',
      label: 'Em Manutenção',
      icon: '&#128295;',
      color: '#f59e0b',
      description: 'Equipamentos com status de manutenção',
      source: 'todos_ativos',
      filter: 'manutencao',
      order: 9,
      group: 'status',
      clickable: false,
    },

    {
      id: 'disponiveis',
      label: 'Disponíveis',
      icon: '&#9989;',
      color: '#22c55e',
      description: 'Equipamentos com status ativo',
      source: 'todos_ativos',
      filter: 'ativo',
      order: 10,
      group: 'status',
      clickable: false,
    },

    // ── Status dos Projetores ────────────────────────────────────────────

    {
      id: 'pj_operando',
      label: 'Projetores Operando',
      icon: '&#9989;',
      color: '#00c896',
      description: 'Projetores funcionando normalmente',
      source: 'projectors_operando',
      order: 11,
      group: 'projetores',
      tab: 'projetores',
      clickable: true,
    },

    {
      id: 'pj_atencao',
      label: 'Projetores em Atenção',
      icon: '&#9888;',
      color: '#ffc107',
      description: 'Projetores com alerta pendente',
      source: 'projectors_atencao',
      order: 12,
      group: 'projetores',
      tab: 'projetores',
      clickable: true,
    },

    {
      id: 'pj_lampada',
      label: 'Lâmpadas no Limite',
      icon: '&#128161;',
      color: '#ff5555',
      description: 'Lâmpadas próximas do fim da vida útil',
      source: 'projectors_lampWarning',
      order: 13,
      group: 'projetores',
      tab: 'projetores',
      clickable: true,
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // WIDGETS DE RESUMO OPERACIONAL
  // ══════════════════════════════════════════════════════════════════════════

  widgets: [
    {
      id: 'ultimo_chamado',
      label: 'Último Chamado Criado',
      icon: '&#128196;',
      source: 'tickets',
      sort: 'recente',
      order: 1,
    },

    {
      id: 'ultima_integracao',
      label: 'Última Integração Utilizada',
      icon: '&#128279;',
      source: 'integration_audit',
      sort: 'recente',
      order: 2,
    },

    {
      id: 'ultimo_fornecedor',
      label: 'Último Fornecedor Acessado',
      icon: '&#128188;',
      source: 'integration_audit',
      sort: 'recente',
      order: 3,
    },

    {
      id: 'ultima_atualizacao',
      label: 'Última Atualização',
      icon: '&#128339;',
      source: 'system',
      order: 4,
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÃO DE GRÁFICOS
  // ══════════════════════════════════════════════════════════════════════════

  charts: [
    // ── Chamados por Status ───────────────────────────────────────────────
    {
      id: 'chamados_por_status',
      titulo: 'Chamados por Status',
      tipo: 'donut', // pie, bar, horizontalBar, donut, line
      source: 'chart_chamados_status',
      cores: ['#f59e0b', '#22c55e'],
      visible: true,
      order: 1,
      clickable: true,
      tab: 'chamados',
    },

    // ── Equipamentos por Categoria ────────────────────────────────────────
    {
      id: 'equipamentos_por_categoria',
      titulo: 'Equipamentos por Categoria',
      tipo: 'bar',
      source: 'chart_equipamentos_categoria',
      cores: ['#4f7ef7', '#00c896', '#6c5ce7', '#ffc107', '#ff5555'],
      visible: true,
      order: 2,
      clickable: true,
      tab: 'computadores',
    },

    // ── Status dos Equipamentos ───────────────────────────────────────────
    {
      id: 'equipamentos_manutencao',
      titulo: 'Status dos Equipamentos',
      tipo: 'donut',
      source: 'chart_status_ativos',
      cores: ['#22c55e', '#f59e0b'],
      visible: true,
      order: 3,
      clickable: false,
    },

    // ── Ações por Fornecedor ──────────────────────────────────────────────
    {
      id: 'equipamentos_por_fornecedor',
      titulo: 'Ações por Fornecedor',
      tipo: 'horizontalBar',
      source: 'chart_fornecedores',
      cores: ['#4f7ef7', '#00c896', '#6c5ce7', '#ffc107', '#ff5555'],
      visible: true,
      order: 4,
      clickable: false,
    },

    // ── Evolução de Chamados ─────────────────────────────────────────────
    {
      id: 'evolucao_chamados',
      titulo: 'Evolução de Chamados',
      tipo: 'line',
      source: 'chart_evolucao_chamados',
      cores: ['#f59e0b', '#22c55e'],
      visible: true,
      order: 5,
      clickable: false,
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÃO DE ANALYTICS
  // ══════════════════════════════════════════════════════════════════════════

  analytics: {
    enabled: true,
    showPercentages: true,
    showComparisons: true,
    showTrends: false, // Futuro - Sprint 7+
  },

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna cards ordenados por group e order.
   * @param {string} group - 'ativos', 'chamados', 'status' ou null (todos)
   * @returns {array}
   */
  getCards(group = null) {
    let cards = [...this.cards];
    if (group) {
      cards = cards.filter(c => c.group === group);
    }
    return cards.sort((a, b) => a.order - b.order);
  },

  /**
   * Retorna um card pelo ID.
   * @param {string} id
   * @returns {object|null}
   */
  getCard(id) {
    return this.cards.find(c => c.id === id) || null;
  },

  /**
   * Retorna widgets ordenados.
   * @returns {array}
   */
  getWidgets() {
    return [...this.widgets].sort((a, b) => a.order - b.order);
  },

  /**
   * Retorna um widget pelo ID.
   * @param {string} id
   * @returns {object|null}
   */
  getWidget(id) {
    return this.widgets.find(w => w.id === id) || null;
  },

  /**
   * Retorna gráficos ordenados.
   * @returns {array}
   */
  getCharts() {
    return [...this.charts].sort((a, b) => a.order - b.order);
  },

  /**
   * Retorna um gráfico pelo ID.
   * @param {string} id
   * @returns {object|null}
   */
  getChart(id) {
    return this.charts.find(c => c.id === id) || null;
  },

  /**
   * Retorna labels de grupo.
   */
  groupLabels: {
    ativos: 'Inventário',
    chamados: 'Chamados',
    status: 'Status dos Ativos',
    projetores: 'Projetores',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES DE PERFORMANCE
  // ══════════════════════════════════════════════════════════════════════════

  performance: {
    autoRefreshInterval: 300000, // 5 minutos em milissegundos
    staleThreshold: 60000, // 1 minuto para considerar dados desatualizados
    enableAutoRefresh: true,
    pauseOnInactiveTab: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PLACEHOLDERS PARA FUTURA INTEGRAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  placeholders: {
    ultimoChamado: 'Nenhum chamado registrado',
    ultimaIntegracao: 'Nenhuma integração realizada',
    ultimoFornecedor: 'Nenhum fornecedor acessado',
    ultimaAtualizacao: 'Aguardando primeira atualização',
  },
};
