/**
 * GLPI Control Center - audit.config.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada do Sistema de Auditoria.
 *
 * Define:
 * - Categorias de eventos
 * - Tipos de ação
 * - Severidades
 * - Ícones visuais
 * - Módulos do sistema
 * - Limites de armazenamento
 * - Configurações de UI
 *
 * PRINCÍPIO: Configuration Driven Design
 * - Novos eventos são adicionados APENAS neste arquivo
 * - UI e lógica consomem esta configuração
 *
 * Sprint 9: Auditoria Avançada e Linha do Tempo Global
 */

window.AUDIT_CONFIG = {

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORIAS DE EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  categories: {
    auth: {
      key: 'auth',
      label: 'Autenticação',
      icon: '&#128274;',
      color: '#4f7ef7',
      order: 1,
    },
    workflow: {
      key: 'workflow',
      label: 'Workflow',
      icon: '&#128736;',
      color: '#6c5ce7',
      order: 2,
    },
    integracoes: {
      key: 'integracoes',
      label: 'Integrações',
      icon: '&#128279;',
      color: '#00c896',
      order: 3,
    },
    portal: {
      key: 'portal',
      label: 'Portal',
      icon: '&#127760;',
      color: '#4f7ef7',
      order: 4,
    },
    projetores: {
      key: 'projetores',
      label: 'Projetores',
      icon: '&#128249;',
      color: '#ffc107',
      order: 5,
    },
    relatorios: {
      key: 'relatorios',
      label: 'Relatórios',
      icon: '&#128203;',
      color: '#ff5555',
      order: 6,
    },
    dashboard: {
      key: 'dashboard',
      label: 'Dashboard',
      icon: '&#128200;',
      color: '#00c896',
      order: 7,
    },
    sistema: {
      key: 'sistema',
      label: 'Sistema',
      icon: '&#9881;',
      color: '#9299b8',
      order: 8,
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TIPOS DE AÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  actions: {
    // Auth
    login: { key: 'login', label: 'Login', category: 'auth', icon: '&#128274;', defaultSeverity: 'info' },
    login_falha: { key: 'login_falha', label: 'Falha de Login', category: 'auth', icon: '&#10060;', defaultSeverity: 'warning' },
    logout: { key: 'logout', label: 'Logout', category: 'auth', icon: '&#128682;', defaultSeverity: 'info' },

    // Workflow
    chamado_aberto: { key: 'chamado_aberto', label: 'Chamado Aberto', category: 'workflow', icon: '&#128196;', defaultSeverity: 'success' },
    chamado_falha: { key: 'chamado_falha', label: 'Falha ao Abrir Chamado', category: 'workflow', icon: '&#10060;', defaultSeverity: 'error' },
    workflow_iniciado: { key: 'workflow_iniciado', label: 'Workflow Iniciado', category: 'workflow', icon: '&#128736;', defaultSeverity: 'info' },

    // Integrações
    integracao_iniciada: { key: 'integracao_iniciada', label: 'Integração Iniciada', category: 'integracoes', icon: '&#128279;', defaultSeverity: 'info' },
    integracao_sucesso: { key: 'integracao_sucesso', label: 'Integração Concluída', category: 'integracoes', icon: '&#9989;', defaultSeverity: 'success' },
    integracao_falha: { key: 'integracao_falha', label: 'Falha na Integração', category: 'integracoes', icon: '&#10060;', defaultSeverity: 'error' },
    integracao_cancelada: { key: 'integracao_cancelada', label: 'Integração Cancelada', category: 'integracoes', icon: '&#9888;', defaultSeverity: 'warning' },

    // Portal
    portal_aberto: { key: 'portal_aberto', label: 'Portal Aberto', category: 'portal', icon: '&#127760;', defaultSeverity: 'info' },
    portal_bloqueado: { key: 'portal_bloqueado', label: 'Portal Bloqueado', category: 'portal', icon: '&#128274;', defaultSeverity: 'warning' },
    portal_fallback: { key: 'portal_fallback', label: 'Fallback do Portal', category: 'portal', icon: '&#128194;', defaultSeverity: 'info' },

    // Projetores
    manutencao_registrada: { key: 'manutencao_registrada', label: 'Manutenção Registrada', category: 'projetores', icon: '&#128295;', defaultSeverity: 'success' },
    manutencao_excluida: { key: 'manutencao_excluida', label: 'Manutenção Excluída', category: 'projetores', icon: '&#128465;', defaultSeverity: 'warning' },
    projetor_atualizado: { key: 'projetor_atualizado', label: 'Projetor Atualizado', category: 'projetores', icon: '&#128249;', defaultSeverity: 'info' },

    // Relatórios
    relatorio_visualizado: { key: 'relatorio_visualizado', label: 'Relatório Visualizado', category: 'relatorios', icon: '&#128203;', defaultSeverity: 'info' },
    relatorio_exportado: { key: 'relatorio_exportado', label: 'Relatório Exportado', category: 'relatorios', icon: '&#128190;', defaultSeverity: 'success' },
    relatorio_filtro: { key: 'relatorio_filtro', label: 'Filtros Aplicados', category: 'relatorios', icon: '&#128269;', defaultSeverity: 'info' },

    // Dashboard
    dashboard_carregado: { key: 'dashboard_carregado', label: 'Dashboard Carregado', category: 'dashboard', icon: '&#128200;', defaultSeverity: 'info' },
    dashboard_erro: { key: 'dashboard_erro', label: 'Erro no Dashboard', category: 'dashboard', icon: '&#10060;', defaultSeverity: 'error' },
    dashboard_atualizado: { key: 'dashboard_atualizado', label: 'Dashboard Atualizado', category: 'dashboard', icon: '&#8635;', defaultSeverity: 'info' },

    // Sistema
    sessao_iniciada: { key: 'sessao_iniciada', label: 'Sessão Iniciada', category: 'sistema', icon: '&#128640;', defaultSeverity: 'info' },
    navegacao: { key: 'navegacao', label: 'Navegação', category: 'sistema', icon: '&#128194;', defaultSeverity: 'info' },
    dados_carregados: { key: 'dados_carregados', label: 'Dados Carregados', category: 'sistema', icon: '&#128229;', defaultSeverity: 'info' },
    erro: { key: 'erro', label: 'Erro', category: 'sistema', icon: '&#10060;', defaultSeverity: 'error' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SEVERIDADES
  // ══════════════════════════════════════════════════════════════════════════

  severities: {
    info: { key: 'info', label: 'Info', color: '#4f7ef7', icon: '&#8505;', order: 1 },
    success: { key: 'success', label: 'Sucesso', color: '#00c896', icon: '&#9989;', order: 2 },
    warning: { key: 'warning', label: 'Aviso', color: '#ffc107', icon: '&#9888;', order: 3 },
    error: { key: 'error', label: 'Erro', color: '#ff5555', icon: '&#10060;', order: 4 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULOS DO SISTEMA
  // ══════════════════════════════════════════════════════════════════════════

  modules: {
    auth: { key: 'auth', label: 'Autenticação' },
    workflow: { key: 'workflow', label: 'Workflow' },
    integration_engine: { key: 'integration_engine', label: 'Integration Engine' },
    portal_viewer: { key: 'portal_viewer', label: 'Portal Viewer' },
    dashboard: { key: 'dashboard', label: 'Dashboard' },
    reports: { key: 'reports', label: 'Relatórios' },
    projectors: { key: 'projectors', label: 'Projetores' },
    app: { key: 'app', label: 'Aplicação' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES DE ARMAZENAMENTO
  // ══════════════════════════════════════════════════════════════════════════

  storage: {
    key: 'glpi:audit',
    maxRecords: 1000,
    expiryDays: 90,
    cacheTTL: 30000,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES DE UI
  // ══════════════════════════════════════════════════════════════════════════

  ui: {
    timelinePageSize: 50,
    searchDebounceMs: 200,
    maxDescriptionLength: 120,
    showTimestamp: true,
    groupByDate: true,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna configuração de uma categoria.
   * @param {string} key
   * @returns {object|null}
   */
  getCategory(key) {
    return this.categories[key] || null;
  },

  /**
   * Retorna todas as categorias ordenadas.
   * @returns {array}
   */
  getCategories() {
    return Object.values(this.categories).sort((a, b) => a.order - b.order);
  },

  /**
   * Retorna configuração de uma ação.
   * @param {string} key
   * @returns {object|null}
   */
  getAction(key) {
    return this.actions[key] || null;
  },

  /**
   * Retorna configuração de uma severidade.
   * @param {string} key
   * @returns {object|null}
   */
  getSeverity(key) {
    return this.severities[key] || null;
  },

  /**
   * Retorna todas as severidades ordenadas.
   * @returns {array}
   */
  getSeverities() {
    return Object.values(this.severities).sort((a, b) => a.order - b.order);
  },

  /**
   * Retorna label de um módulo.
   * @param {string} key
   * @returns {string}
   */
  getModuleLabel(key) {
    return this.modules[key]?.label || key;
  },
};
