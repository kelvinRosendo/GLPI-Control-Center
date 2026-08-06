/**
 * GLPI Control Center - reports.config.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada da Central de Relatórios.
 *
 * Define:
 * - Catálogo completo de relatórios disponíveis
 * - Tipos de dados e campos exportáveis
 * - Filtros reutilizáveis por relatório
 * - Exportadores habilitados
 * - Categorias e permissões
 *
 * PRINCÍPIO: Configuration Driven Design
 * - Nenhum relatório hardcoded no reports.js ou reports_ui.js
 * - Todo comportamento visual vem desta configuração
 * - Novos relatórios são adicionados APENAS neste arquivo
 *
 * Sprint 7: Central de Relatórios
 */

window.REPORTS_CONFIG = {

  // ══════════════════════════════════════════════════════════════════════════
  // CATÁLOGO DE RELATÓRIOS
  // ══════════════════════════════════════════════════════════════════════════

  reports: [
    // ── Inventário ─────────────────────────────────────────────────────────

    {
      id: 'inventario_geral',
      titulo: 'Inventário Geral',
      descricao: 'Relatório completo de todos os equipamentos inventariados no sistema.',
      icone: '&#128203;',
      categoria: 'inventario',
      endpoint: 'inventario',
      tipo: 'assets',
      campos: [
        { key: 'nome', label: 'Nome', tipo: 'texto' },
        { key: 'serial', label: 'Serial', tipo: 'texto' },
        { key: 'patrimonio', label: 'Patrimônio', tipo: 'texto' },
        { key: 'status', label: 'Status', tipo: 'status' },
        { key: 'modelo', label: 'Modelo', tipo: 'texto' },
        { key: 'reparticao', label: 'Localização', tipo: 'texto' },
        { key: 'categoria', label: 'Categoria', tipo: 'texto' },
      ],
      filtros: ['categoria', 'status', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 1,
    },

    {
      id: 'equipamentos_por_categoria',
      titulo: 'Equipamentos por Categoria',
      descricao: 'Quantidade de equipamentos agrupados por categoria (Computadores, Chromebooks, etc).',
      icone: '&#128196;',
      categoria: 'inventario',
      endpoint: 'inventario',
      tipo: 'assets_grouped',
      groupBy: 'categoria',
      campos: [
        { key: 'categoria', label: 'Categoria', tipo: 'texto' },
        { key: 'quantidade', label: 'Quantidade', tipo: 'numero' },
        { key: 'ativos', label: 'Ativos', tipo: 'numero' },
        { key: 'manutencao', label: 'Manutenção', tipo: 'numero' },
        { key: 'emprestados', label: 'Emprestados', tipo: 'numero' },
      ],
      filtros: ['categoria', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 2,
    },

    {
      id: 'equipamentos_por_fornecedor',
      titulo: 'Equipamentos por Fornecedor',
      descricao: 'Distribuição de equipamentos e ações de integração por fornecedor.',
      icone: '&#128188;',
      categoria: 'inventario',
      endpoint: 'integracoes',
      tipo: 'assets_grouped',
      groupBy: 'fornecedor',
      campos: [
        { key: 'fornecedor', label: 'Fornecedor', tipo: 'texto' },
        { key: 'quantidade', label: 'Quantidade', tipo: 'numero' },
        { key: 'integracoes', label: 'Integrações', tipo: 'numero' },
      ],
      filtros: ['fornecedor', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 3,
    },

    {
      id: 'equipamentos_manutencao',
      titulo: 'Equipamentos em Manutenção',
      descricao: 'Lista de todos os equipamentos com status de manutenção.',
      icone: '&#128295;',
      categoria: 'inventario',
      endpoint: 'inventario',
      tipo: 'assets',
      statusFilter: 'manutencao',
      campos: [
        { key: 'nome', label: 'Nome', tipo: 'texto' },
        { key: 'serial', label: 'Serial', tipo: 'texto' },
        { key: 'patrimonio', label: 'Patrimônio', tipo: 'texto' },
        { key: 'modelo', label: 'Modelo', tipo: 'texto' },
        { key: 'reparticao', label: 'Localização', tipo: 'texto' },
        { key: 'categoria', label: 'Categoria', tipo: 'texto' },
      ],
      filtros: ['categoria', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 4,
    },

    // ── Chamados ─────────────────────────────────────────────────────────

    {
      id: 'chamados_geral',
      titulo: 'Chamados',
      descricao: 'Relatório completo de todos os chamados registrados no GLPI.',
      icone: '&#128196;',
      categoria: 'chamados',
      endpoint: 'chamados',
      tipo: 'tickets',
      campos: [
        { key: 'id', label: 'Nº', tipo: 'numero' },
        { key: 'titulo', label: 'Título', tipo: 'texto' },
        { key: 'status', label: 'Status', tipo: 'status' },
        { key: 'ativo', label: 'Ativo', tipo: 'texto' },
        { key: 'categoria', label: 'Categoria', tipo: 'texto' },
        { key: 'abertura', label: 'Data Abertura', tipo: 'data' },
      ],
      filtros: ['status', 'periodo', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 5,
    },

    {
      id: 'chamados_por_status',
      titulo: 'Chamados por Status',
      descricao: 'Quantidade de chamados agrupados por status (Aberto, Em andamento, etc).',
      icone: '&#128202;',
      categoria: 'chamados',
      endpoint: 'chamados',
      tipo: 'tickets_grouped',
      groupBy: 'status',
      campos: [
        { key: 'status', label: 'Status', tipo: 'status' },
        { key: 'quantidade', label: 'Quantidade', tipo: 'numero' },
        { key: 'percentual', label: 'Percentual', tipo: 'percentual' },
      ],
      filtros: ['periodo', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 6,
    },

    {
      id: 'chamados_por_periodo',
      titulo: 'Chamados por Período',
      descricao: 'Chamados filtrados por período de abertura específico.',
      icone: '&#128197;',
      categoria: 'chamados',
      endpoint: 'chamados',
      tipo: 'tickets',
      campos: [
        { key: 'id', label: 'Nº', tipo: 'numero' },
        { key: 'titulo', label: 'Título', tipo: 'texto' },
        { key: 'status', label: 'Status', tipo: 'status' },
        { key: 'ativo', label: 'Ativo', tipo: 'texto' },
        { key: 'abertura', label: 'Data Abertura', tipo: 'data' },
      ],
      filtros: ['periodo', 'status', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 7,
    },

    // ── Integrações ──────────────────────────────────────────────────────

    {
      id: 'integracoes_utilizadas',
      titulo: 'Integrações Utilizadas',
      descricao: 'Histórico de todas as integrações realizadas com fornecedores.',
      icone: '&#128279;',
      categoria: 'integracoes',
      endpoint: 'integracoes',
      tipo: 'audit',
      campos: [
        { key: 'horario', label: 'Data/Hora', tipo: 'data_hora' },
        { key: 'usuario', label: 'Usuário', tipo: 'texto' },
        { key: 'equipamento', label: 'Equipamento', tipo: 'texto' },
        { key: 'fornecedor', label: 'Fornecedor', tipo: 'texto' },
        { key: 'acao', label: 'Ação', tipo: 'texto' },
        { key: 'resultado', label: 'Resultado', tipo: 'status' },
      ],
      filtros: ['fornecedor', 'periodo', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 8,
    },

    // ── Projetores ─────────────────────────────────────────────────────

    {
      id: 'projectors_geral',
      titulo: 'Projetores',
      descricao: 'Relatório completo de todos os projetores com informações de vida útil e manutenção.',
      icone: '&#128249;',
      categoria: 'projetores',
      endpoint: 'projetores',
      tipo: 'projectors',
      campos: [
        { key: 'nome', label: 'Nome', tipo: 'texto' },
        { key: 'patrimonio', label: 'Patrimônio', tipo: 'texto' },
        { key: 'serial', label: 'Serial', tipo: 'texto' },
        { key: 'modelo', label: 'Modelo', tipo: 'texto' },
        { key: 'reparticao', label: 'Localização', tipo: 'texto' },
        { key: 'horas_lampada', label: 'Horas Lâmpada', tipo: 'numero' },
        { key: 'vida_util_estimada', label: 'Vida Útil', tipo: 'numero' },
        { key: 'status_calculado', label: 'Status', tipo: 'status' },
      ],
      filtros: ['status', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 9,
    },

    {
      id: 'projectors_manutencoes',
      titulo: 'Manutenções de Projetores',
      descricao: 'Histórico de todas as manutenções registradas nos projetores.',
      icone: '&#128295;',
      categoria: 'projetores',
      endpoint: 'projector_maintenance',
      tipo: 'maintenance',
      campos: [
        { key: 'nome_projetor', label: 'Projetor', tipo: 'texto' },
        { key: 'typeLabel', label: 'Tipo', tipo: 'texto' },
        { key: 'date', label: 'Data', tipo: 'data' },
        { key: 'description', label: 'Descrição', tipo: 'texto' },
        { key: 'responsible', label: 'Responsável', tipo: 'texto' },
        { key: 'hoursAtMaintenance', label: 'Horas na Troca', tipo: 'numero' },
      ],
      filtros: ['periodo', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 10,
    },

    {
      id: 'projectors_trocas_lampada',
      titulo: 'Trocas de Lâmpada',
      descricao: 'Histórico de todas as trocas de lâmpada realizadas.',
      icone: '&#128161;',
      categoria: 'projetores',
      endpoint: 'projector_maintenance',
      tipo: 'maintenance',
      maintenanceTypeFilter: 'lampada',
      campos: [
        { key: 'nome_projetor', label: 'Projetor', tipo: 'texto' },
        { key: 'date', label: 'Data da Troca', tipo: 'data' },
        { key: 'description', label: 'Descrição', tipo: 'texto' },
        { key: 'responsible', label: 'Responsável', tipo: 'texto' },
        { key: 'hoursAtMaintenance', label: 'Horas na Troca', tipo: 'numero' },
      ],
      filtros: ['periodo', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 11,
    },

    {
      id: 'projectors_vida_util',
      titulo: 'Vida Útil das Lâmpadas',
      descricao: 'Situação atual da vida útil de todas as lâmpadas dos projetores.',
      icone: '&#128200;',
      categoria: 'projetores',
      endpoint: 'projetores',
      tipo: 'projectors',
      campos: [
        { key: 'nome', label: 'Projetor', tipo: 'texto' },
        { key: 'patrimonio', label: 'Patrimônio', tipo: 'texto' },
        { key: 'horas_lampada', label: 'Horas Utilizadas', tipo: 'numero' },
        { key: 'vida_util_estimada', label: 'Vida Útil Estimada', tipo: 'numero' },
        { key: 'percentual_vida', label: '% Vida Útil', tipo: 'percentual' },
        { key: 'status_calculado', label: 'Status', tipo: 'status' },
      ],
      filtros: ['status', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 12,
    },

    // ── Auditoria ─────────────────────────────────────────────────────────

    {
      id: 'audit_geral',
      titulo: 'Auditoria Geral',
      descricao: 'Relatório completo de todos os eventos de auditoria do sistema.',
      icone: '&#128737;',
      categoria: 'auditoria',
      endpoint: 'audit',
      tipo: 'audit',
      campos: [
        { key: 'timestamp', label: 'Data/Hora', tipo: 'data_hora' },
        { key: 'usuario', label: 'Usuário', tipo: 'texto' },
        { key: 'acaoLabel', label: 'Ação', tipo: 'texto' },
        { key: 'categoria', label: 'Categoria', tipo: 'texto' },
        { key: 'modulo', label: 'Módulo', tipo: 'texto' },
        { key: 'severity', label: 'Severidade', tipo: 'status' },
        { key: 'descricao', label: 'Descrição', tipo: 'texto' },
        { key: 'equipamento', label: 'Equipamento', tipo: 'texto' },
        { key: 'fornecedor', label: 'Fornecedor', tipo: 'texto' },
      ],
      filtros: ['audit_category', 'audit_severity', 'audit_module', 'periodo', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 13,
    },

    {
      id: 'audit_por_usuario',
      titulo: 'Eventos por Usuário',
      descricao: 'Quantidade de eventos de auditoria agrupados por usuário.',
      icone: '&#128101;',
      categoria: 'auditoria',
      endpoint: 'audit',
      tipo: 'audit_grouped',
      groupBy: 'usuario',
      campos: [
        { key: 'usuario', label: 'Usuário', tipo: 'texto' },
        { key: 'quantidade', label: 'Quantidade', tipo: 'numero' },
        { key: 'erros', label: 'Erros', tipo: 'numero' },
      ],
      filtros: ['periodo', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 14,
    },

    {
      id: 'audit_por_equipamento',
      titulo: 'Eventos por Equipamento',
      descricao: 'Quantidade de eventos de auditoria agrupados por equipamento.',
      icone: '&#128421;',
      categoria: 'auditoria',
      endpoint: 'audit',
      tipo: 'audit_grouped',
      groupBy: 'equipamento',
      campos: [
        { key: 'equipamento', label: 'Equipamento', tipo: 'texto' },
        { key: 'quantidade', label: 'Quantidade', tipo: 'numero' },
        { key: 'erros', label: 'Erros', tipo: 'numero' },
      ],
      filtros: ['periodo', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 15,
    },

    {
      id: 'audit_erros',
      titulo: 'Eventos com Erro',
      descricao: 'Lista de todos os eventos com severidade de erro.',
      icone: '&#10060;',
      categoria: 'auditoria',
      endpoint: 'audit',
      tipo: 'audit',
      severityFilter: 'error',
      campos: [
        { key: 'timestamp', label: 'Data/Hora', tipo: 'data_hora' },
        { key: 'usuario', label: 'Usuário', tipo: 'texto' },
        { key: 'acaoLabel', label: 'Ação', tipo: 'texto' },
        { key: 'categoria', label: 'Categoria', tipo: 'texto' },
        { key: 'descricao', label: 'Descrição', tipo: 'texto' },
        { key: 'equipamento', label: 'Equipamento', tipo: 'texto' },
      ],
      filtros: ['periodo', 'texto_livre'],
      exportadores: ['csv'],
      visible: true,
      order: 16,
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORIAS
  // ══════════════════════════════════════════════════════════════════════════

  categorias: {
    inventario: { label: 'Inventário', icone: '&#128230;', ordem: 1 },
    chamados: { label: 'Chamados', icone: '&#128196;', ordem: 2 },
    integracoes: { label: 'Integrações', icone: '&#128279;', ordem: 3 },
    projetores: { label: 'Projetores', icone: '&#128249;', ordem: 4 },
    auditoria: { label: 'Auditoria', icone: '&#128737;', ordem: 5 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // FILTROS DISPONÍVEIS
  // ══════════════════════════════════════════════════════════════════════════

  filterDefinitions: {
    categoria: {
      label: 'Categoria',
      tipo: 'select',
      placeholder: 'Todas as categorias',
      options: [
        { value: 'todos', label: 'Todas' },
        { value: 'computadores', label: 'Computadores' },
        { value: 'chromebooks_geekiees', label: 'Chromebooks Geekie' },
        { value: 'chromebooks_apoio', label: 'Chromebooks de Apoio' },
        { value: 'projetores', label: 'Projetores' },
        { value: 'impressoras', label: 'Impressoras' },
      ],
    },

    fornecedor: {
      label: 'Fornecedor',
      tipo: 'select',
      placeholder: 'Todos os fornecedores',
      options: [
        { value: 'todos', label: 'Todos' },
        { value: 'torino', label: 'Torino' },
        { value: 'hbb', label: 'HBB' },
        { value: 'acer_geek', label: 'Acer Geek' },
        { value: 'samsung', label: 'Samsung' },
        { value: 'acer', label: 'Acer' },
      ],
    },

    status: {
      label: 'Status',
      tipo: 'select',
      placeholder: 'Todos os status',
      options: [
        { value: 'todos', label: 'Todos' },
        { value: 'ativo', label: 'Ativo' },
        { value: 'manutencao', label: 'Manutenção' },
        { value: 'emprestado', label: 'Emprestado' },
      ],
      ticketOptions: [
        { value: 'todos', label: 'Todos' },
        { value: 'aberto', label: 'Aberto' },
        { value: 'em_andamento', label: 'Em andamento' },
        { value: 'pendente', label: 'Pendente' },
        { value: 'resolvido', label: 'Resolvido' },
        { value: 'fechado', label: 'Fechado' },
      ],
    },

    periodo: {
      label: 'Período',
      tipo: 'date_range',
      placeholder: 'Filtrar por período',
    },

    responsavel: {
      label: 'Responsável',
      tipo: 'text',
      placeholder: 'Nome do responsável',
    },

    texto_livre: {
      label: 'Busca',
      tipo: 'text',
      placeholder: 'Buscar...',
    },

    audit_category: {
      label: 'Categoria',
      tipo: 'select',
      placeholder: 'Todas as categorias',
      options: [
        { value: 'todos', label: 'Todas' },
        { value: 'auth', label: 'Autenticação' },
        { value: 'workflow', label: 'Workflow' },
        { value: 'integracoes', label: 'Integrações' },
        { value: 'portal', label: 'Portal' },
        { value: 'projetores', label: 'Projetores' },
        { value: 'relatorios', label: 'Relatórios' },
        { value: 'dashboard', label: 'Dashboard' },
        { value: 'sistema', label: 'Sistema' },
      ],
    },

    audit_severity: {
      label: 'Severidade',
      tipo: 'select',
      placeholder: 'Todas as severidades',
      options: [
        { value: 'todas', label: 'Todas' },
        { value: 'info', label: 'Info' },
        { value: 'success', label: 'Sucesso' },
        { value: 'warning', label: 'Aviso' },
        { value: 'error', label: 'Erro' },
      ],
    },

    audit_module: {
      label: 'Módulo',
      tipo: 'select',
      placeholder: 'Todos os módulos',
      options: [
        { value: 'todos', label: 'Todos' },
        { value: 'auth', label: 'Autenticação' },
        { value: 'workflow', label: 'Workflow' },
        { value: 'integration_engine', label: 'Integration Engine' },
        { value: 'portal_viewer', label: 'Portal Viewer' },
        { value: 'dashboard', label: 'Dashboard' },
        { value: 'reports', label: 'Relatórios' },
        { value: 'projectors', label: 'Projetores' },
        { value: 'app', label: 'Aplicação' },
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORTADORES
  // ══════════════════════════════════════════════════════════════════════════

  exportadores: {
    csv: {
      label: 'CSV',
      icone: '&#128190;',
      extension: 'csv',
      mimeType: 'text/csv;charset=utf-8;',
      enabled: true,
    },
    excel: {
      label: 'Excel',
      icone: '&#128202;',
      extension: 'xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      enabled: false,
    },
    pdf: {
      label: 'PDF',
      icone: '&#128196;',
      extension: 'pdf',
      mimeType: 'application/pdf',
      enabled: false,
    },
    json: {
      label: 'JSON',
      icone: '&#128196;',
      extension: 'json',
      mimeType: 'application/json',
      enabled: false,
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES DE PERFORMANCE
  // ══════════════════════════════════════════════════════════════════════════

  performance: {
    cacheTTL: 300000,       // 5 minutos
    maxCacheSize: 50,       // Máximo de relatórios em cache
    debounceMs: 300,        // Debounce para filtros
    previewMaxRows: 100,    // Máximo de linhas no preview
  },

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todos os relatórios visíveis, ordenados.
   * @returns {array}
   */
  getReports() {
    return this.reports
      .filter(r => r.visible)
      .sort((a, b) => a.order - b.order);
  },

  /**
   * Retorna um relatório pelo ID.
   * @param {string} id
   * @returns {object|null}
   */
  getReport(id) {
    return this.reports.find(r => r.id === id) || null;
  },

  /**
   * Retorna relatórios por categoria.
   * @param {string} categoria
   * @returns {array}
   */
  getReportsByCategory(categoria) {
    return this.getReports().filter(r => r.categoria === categoria);
  },

  /**
   * Retorna categorias ordenadas.
   * @returns {array}
   */
  getCategories() {
    return Object.entries(this.categorias)
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => a.ordem - b.ordem);
  },

  /**
   * Retorna definição de um filtro.
   * @param {string} filterKey
   * @returns {object|null}
   */
  getFilterDef(filterKey) {
    return this.filterDefinitions[filterKey] || null;
  },

  /**
   * Retorna exportadores habilitados.
   * @returns {array}
   */
  getEnabledExporters() {
    return Object.entries(this.exportadores)
      .filter(([, exp]) => exp.enabled)
      .map(([key, exp]) => ({ key, ...exp }));
  },
};
