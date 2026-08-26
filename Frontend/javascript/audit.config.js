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
      icon: 'user',
      color: '#4f7ef7',
      order: 1,
    },
    workflow: {
      key: 'workflow',
      label: 'Workflow',
      icon: 'tickets',
      color: '#6c5ce7',
      order: 2,
    },
    integracoes: {
      key: 'integracoes',
      label: 'Integrações',
      icon: 'integrations',
      color: '#00c896',
      order: 3,
    },
    portal: {
      key: 'portal',
      label: 'Portal',
      icon: 'info',
      color: '#4f7ef7',
      order: 4,
    },
    projetores: {
      key: 'projetores',
      label: 'Projetores',
      icon: 'projector',
      color: '#ffc107',
      order: 5,
    },
    relatorios: {
      key: 'relatorios',
      label: 'Relatórios',
      icon: 'reports',
      color: '#ff5555',
      order: 6,
    },
    dashboard: {
      key: 'dashboard',
      label: 'Dashboard',
      icon: 'analytics',
      color: '#00c896',
      order: 7,
    },
    sistema: {
      key: 'sistema',
      label: 'Sistema',
      icon: 'settings',
      color: '#9299b8',
      order: 8,
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TIPOS DE AÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  actions: {
    // Auth
    login: { key: 'login', label: 'Login', category: 'auth', icon: 'user', defaultSeverity: 'info' },
    login_falha: { key: 'login_falha', label: 'Falha de Login', category: 'auth', icon: 'error', defaultSeverity: 'warning' },
    logout: { key: 'logout', label: 'Logout', category: 'auth', icon: 'logout', defaultSeverity: 'info' },

    // Workflow
    chamado_aberto: { key: 'chamado_aberto', label: 'Chamado Aberto', category: 'workflow', icon: 'tickets', defaultSeverity: 'success' },
    chamado_falha: { key: 'chamado_falha', label: 'Falha ao Abrir Chamado', category: 'workflow', icon: 'error', defaultSeverity: 'error' },
    workflow_iniciado: { key: 'workflow_iniciado', label: 'Workflow Iniciado', category: 'workflow', icon: 'tickets', defaultSeverity: 'info' },

    // Integrações
    integracao_iniciada: { key: 'integracao_iniciada', label: 'Integração Iniciada', category: 'integracoes', icon: 'integrations', defaultSeverity: 'info' },
    integracao_sucesso: { key: 'integracao_sucesso', label: 'Integração Concluída', category: 'integracoes', icon: 'success', defaultSeverity: 'success' },
    integracao_falha: { key: 'integracao_falha', label: 'Falha na Integração', category: 'integracoes', icon: 'error', defaultSeverity: 'error' },
    integracao_cancelada: { key: 'integracao_cancelada', label: 'Integração Cancelada', category: 'integracoes', icon: 'warning', defaultSeverity: 'warning' },

    // Portal
    portal_aberto: { key: 'portal_aberto', label: 'Portal Aberto', category: 'portal', icon: 'info', defaultSeverity: 'info' },
    portal_bloqueado: { key: 'portal_bloqueado', label: 'Portal Bloqueado', category: 'portal', icon: 'error', defaultSeverity: 'warning' },
    portal_fallback: { key: 'portal_fallback', label: 'Fallback do Portal', category: 'portal', icon: 'refresh', defaultSeverity: 'info' },

    // Projetores
    manutencao_registrada: { key: 'manutencao_registrada', label: 'Manutenção Registrada', category: 'projetores', icon: 'success', defaultSeverity: 'success' },
    manutencao_excluida: { key: 'manutencao_excluida', label: 'Manutenção Excluída', category: 'projetores', icon: 'error', defaultSeverity: 'warning' },
    projetor_atualizado: { key: 'projetor_atualizado', label: 'Projetor Atualizado', category: 'projetores', icon: 'projector', defaultSeverity: 'info' },

    // Relatórios
    relatorio_visualizado: { key: 'relatorio_visualizado', label: 'Relatório Visualizado', category: 'relatorios', icon: 'reports', defaultSeverity: 'info' },
    relatorio_exportado: { key: 'relatorio_exportado', label: 'Relatório Exportado', category: 'relatorios', icon: 'success', defaultSeverity: 'success' },
    relatorio_filtro: { key: 'relatorio_filtro', label: 'Filtros Aplicados', category: 'relatorios', icon: 'search', defaultSeverity: 'info' },

    // Dashboard
    dashboard_carregado: { key: 'dashboard_carregado', label: 'Dashboard Carregado', category: 'dashboard', icon: 'analytics', defaultSeverity: 'info' },
    dashboard_erro: { key: 'dashboard_erro', label: 'Erro no Dashboard', category: 'dashboard', icon: 'error', defaultSeverity: 'error' },
    dashboard_atualizado: { key: 'dashboard_atualizado', label: 'Dashboard Atualizado', category: 'dashboard', icon: 'refresh', defaultSeverity: 'info' },

    // Sistema
    sessao_iniciada: { key: 'sessao_iniciada', label: 'Sessão Iniciada', category: 'sistema', icon: 'info', defaultSeverity: 'info' },
    navegacao: { key: 'navegacao', label: 'Navegação', category: 'sistema', icon: 'dashboard', defaultSeverity: 'info' },
    dados_carregados: { key: 'dados_carregados', label: 'Dados Carregados', category: 'sistema', icon: 'info', defaultSeverity: 'info' },
    erro: { key: 'erro', label: 'Erro', category: 'sistema', icon: 'error', defaultSeverity: 'error' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SEVERIDADES
  // ══════════════════════════════════════════════════════════════════════════

  severities: {
    info: { key: 'info', label: 'Info', color: '#4f7ef7', icon: 'info', order: 1 },
    success: { key: 'success', label: 'Sucesso', color: '#00c896', icon: 'success', order: 2 },
    warning: { key: 'warning', label: 'Aviso', color: '#ffc107', icon: 'warning', order: 3 },
    error: { key: 'error', label: 'Erro', color: '#ff5555', icon: 'error', order: 4 },
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
