/**
 * GLPI Control Center - notifications.config.js
 * -----------------------------------------------------------------------------
 * Configuração do sistema de notificações inteligentes.
 *
 * Define categorias, tipos, ícones, prioridades, templates de eventos,
 * configurações de storage, UI e limites de performance.
 *
 * Sprint 10: Central de Notificações Inteligentes
 */

window.NOTIFICATIONS_CONFIG = {

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORIAS
  // ══════════════════════════════════════════════════════════════════════════

  categories: {
    INFO:         { label: 'Informação',   color: '#3b82f6', icon: 'ℹ️' },
    SUCCESS:      { label: 'Sucesso',      color: '#10b981', icon: '✅' },
    WARNING:      { label: 'Aviso',        color: '#f59e0b', icon: '⚠️' },
    ERROR:        { label: 'Erro',         color: '#ef4444', icon: '❌' },
    SYSTEM:       { label: 'Sistema',      color: '#6b7280', icon: '⚙️' },
    AUDIT:        { label: 'Auditoria',    color: '#8b5cf6', icon: '📋' },
    WORKFLOW:     { label: 'Workflow',     color: '#06b6d4', icon: '🎫' },
    PROJECTORS:   { label: 'Projetores',   color: '#f97316', icon: '📽️' },
    REPORTS:      { label: 'Relatórios',   color: '#14b8a6', icon: '📊' },
    AUTH:         { label: 'Autenticação', color: '#ec4899', icon: '🔐' },
    INTEGRATIONS: { label: 'Integrações',  color: '#a855f7', icon: '🔗' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TIPOS
  // ══════════════════════════════════════════════════════════════════════════

  types: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    ERROR:  'error',
    WARNING: 'warning',
    INFO:   'info',
    SUCCESS: 'success',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ÍCONES POR MÓDULO
  // ══════════════════════════════════════════════════════════════════════════

  icons: {
    workflow:     '🎫',
    projectors:   '📽️',
    dashboard:    '📊',
    reports:      '📈',
    auth:         '🔐',
    integrations: '🔗',
    audit:        '📋',
    system:       '⚙️',
    computer:     '💻',
    impressora:   '🖨️',
    geekie:       '📱',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PRIORIDADES
  // ══════════════════════════════════════════════════════════════════════════

  priorities: {
    LOW:      { label: 'Baixa',    color: '#6b7280', order: 0 },
    NORMAL:   { label: 'Normal',   color: '#3b82f6', order: 1 },
    HIGH:     { label: 'Alta',     color: '#f59e0b', order: 2 },
    CRITICAL: { label: 'Crítica',  color: '#ef4444', order: 3 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTOS AUTOMÁTICOS
  // ══════════════════════════════════════════════════════════════════════════

  events: {
    // Workflow
    WORKFLOW_CREATED:       { category: 'WORKFLOW',   type: 'create',  priority: 'NORMAL', icon: '🎫', title: 'Chamado Criado',           template: 'workflow_created' },
    WORKFLOW_CANCELLED:     { category: 'WORKFLOW',   type: 'delete',  priority: 'NORMAL', icon: '🚫', title: 'Chamado Cancelado',        template: 'workflow_cancelled' },
    WORKFLOW_COMPLETED:     { category: 'WORKFLOW',   type: 'success', priority: 'NORMAL', icon: '✅', title: 'Chamado Concluído',        template: 'workflow_completed' },
    WORKFLOW_ERROR:         { category: 'WORKFLOW',   type: 'error',   priority: 'HIGH',   icon: '❌', title: 'Erro no Chamado',          template: 'workflow_error' },

    // Portal Viewer
    PORTAL_OPENED:          { category: 'INTEGRATIONS', type: 'info',    priority: 'LOW',    icon: '🌐', title: 'Portal Aberto',            template: 'portal_opened' },
    PORTAL_IFRAME_BLOCKED:  { category: 'INTEGRATIONS', type: 'warning', priority: 'NORMAL', icon: '🚫', title: 'Iframe Bloqueado',         template: 'portal_iframe_blocked' },
    PORTAL_FALLBACK:        { category: 'INTEGRATIONS', type: 'info',    priority: 'LOW',    icon: '🔄', title: 'Fallback do Portal',        template: 'portal_fallback' },

    // Projetores
    PROJECTOR_LAMP_HIGH:    { category: 'PROJECTORS', type: 'warning', priority: 'HIGH',   icon: '📽️', title: 'Lâmpada Acima de 80%',     template: 'projector_lamp_high' },
    PROJECTOR_LAMP_CRITICAL:{ category: 'PROJECTORS', type: 'error',   priority: 'CRITICAL',icon: '📽️', title: 'Lâmpada Crítica',          template: 'projector_lamp_critical' },
    PROJECTOR_MAINT_OVERDUE:{ category: 'PROJECTORS', type: 'warning', priority: 'HIGH',   icon: '🔧', title: 'Manutenção Vencida',        template: 'projector_maint_overdue' },
    PROJECTOR_MAINT_DONE:   { category: 'PROJECTORS', type: 'success', priority: 'NORMAL', icon: '🔧', title: 'Manutenção Registrada',     template: 'projector_maint_done' },

    // Dashboard
    DASHBOARD_UPDATED:      { category: 'DASHBOARD',  type: 'info',    priority: 'LOW',    icon: '📊', title: 'Dashboard Atualizado',      template: 'dashboard_updated' },
    DASHBOARD_ERROR:        { category: 'DASHBOARD',  type: 'error',   priority: 'NORMAL', icon: '❌', title: 'Erro ao Carregar Dashboard',template: 'dashboard_error' },

    // Relatórios
    REPORT_EXPORTED:        { category: 'REPORTS',    type: 'success', priority: 'NORMAL', icon: '📊', title: 'Relatório Exportado',       template: 'report_exported' },
    REPORT_VIEWED:          { category: 'REPORTS',    type: 'info',    priority: 'LOW',    icon: '👁️', title: 'Relatório Visualizado',     template: 'report_viewed' },
    REPORT_ERROR:           { category: 'REPORTS',    type: 'error',   priority: 'NORMAL', icon: '❌', title: 'Erro no Relatório',         template: 'report_error' },

    // Auth
    AUTH_LOGIN:             { category: 'AUTH',        type: 'success', priority: 'LOW',    icon: '🔐', title: 'Login Realizado',           template: 'auth_login' },
    AUTH_LOGOUT:            { category: 'AUTH',        type: 'info',    priority: 'LOW',    icon: '🔐', title: 'Logout Realizado',          template: 'auth_logout' },
    AUTH_SESSION_EXPIRED:   { category: 'AUTH',        type: 'warning', priority: 'HIGH',   icon: '⏰', title: 'Sessão Expirada',           template: 'auth_session_expired' },
    AUTH_DOMAIN_DENIED:     { category: 'AUTH',        type: 'error',   priority: 'HIGH',   icon: '🚫', title: 'Domínio Negado',            template: 'auth_domain_denied' },

    // Integrações
    INTEGRATION_STARTED:    { category: 'INTEGRATIONS', type: 'info',    priority: 'LOW',    icon: '🔗', title: 'Integração Iniciada',       template: 'integration_started' },
    INTEGRATION_SUCCESS:    { category: 'INTEGRATIONS', type: 'success', priority: 'NORMAL', icon: '✅', title: 'Integração Concluída',      template: 'integration_success' },
    INTEGRATION_ERROR:      { category: 'INTEGRATIONS', type: 'error',   priority: 'HIGH',   icon: '❌', title: 'Erro na Integração',        template: 'integration_error' },
    INTEGRATION_CANCELLED:  { category: 'INTEGRATIONS', type: 'warning', priority: 'NORMAL', icon: '🚫', title: 'Integração Cancelada',      template: 'integration_cancelled' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // STORAGE
  // ══════════════════════════════════════════════════════════════════════════

  storage: {
    prefix: 'glpi.notifications',
    maxNotifications: 100,
    ttlDays: 30,
    cleanupIntervalMs: 3600000, // 1 hora
  },

  // ══════════════════════════════════════════════════════════════════════════
  // UI
  // ══════════════════════════════════════════════════════════════════════════

  ui: {
    badgeMax: 99,
    panelWidth: 400,
    animations: true,
    virtualScrollThreshold: 50,
    groupByDate: true,
    dateFormat: {
      today: 'HH:mm',
      yesterday: 'Ontem, HH:mm',
      thisWeek: 'DD/MM HH:mm',
      older: 'DD/MM/YYYY',
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // FILTROS
  // ══════════════════════════════════════════════════════════════════════════

  filters: {
    ALL:       { label: 'Todas',      filter: null },
    UNREAD:    { label: 'Não lidas',  filter: (n) => !n.lida },
    ERRORS:    { label: 'Erros',      filter: (n) => n.categoria === 'ERROR' },
    WARNINGS:  { label: 'Avisos',     filter: (n) => n.categoria === 'WARNING' },
    SYSTEM:    { label: 'Sistema',    filter: (n) => n.categoria === 'SYSTEM' },
    WORKFLOW:  { label: 'Workflow',   filter: (n) => n.categoria === 'WORKFLOW' },
    PROJECTORS:{ label: 'Projetores', filter: (n) => n.categoria === 'PROJECTORS' },
    REPORTS:   { label: 'Relatórios', filter: (n) => n.categoria === 'REPORTS' },
    INTEGRATIONS:{ label: 'Integrações', filter: (n) => n.categoria === 'INTEGRATIONS' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // AÇÕES
  // ══════════════════════════════════════════════════════════════════════════

  actions: {
    OPEN_WORKFLOW:     { label: 'Abrir Chamado',   route: 'chamados',     params: { id: true } },
    OPEN_PROJECTOR:    { label: 'Abrir Projetor',  route: 'projetores',   params: { id: true } },
    OPEN_REPORT:       { label: 'Baixar Relatório',route: 'relatorios',   params: { id: true } },
    OPEN_DASHBOARD:    { label: 'Ver Dashboard',   route: 'home',         params: {} },
    OPEN_AUDIT:        { label: 'Ver Auditoria',   route: 'auditoria',    params: {} },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CANAIS FUTUROS (preparação)
  // ══════════════════════════════════════════════════════════════════════════

  channels: {
    IN_APP:   { enabled: true,  label: 'In-App' },
    EMAIL:    { enabled: false, label: 'Email' },
    PUSH:     { enabled: false, label: 'Push Notification' },
    WHATSAPP: { enabled: false, label: 'WhatsApp' },
    TEAMS:    { enabled: false, label: 'Microsoft Teams' },
    SLACK:    { enabled: false, label: 'Slack' },
    TELEGRAM: { enabled: false, label: 'Telegram' },
    GOOGLE_CHAT: { enabled: false, label: 'Google Chat' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  getCategory(categoryKey) {
    return this.categories[categoryKey] || this.categories.INFO;
  },

  getIcon(moduleKey) {
    return this.icons[moduleKey] || '📌';
  },

  getPriority(priorityKey) {
    return this.priorities[priorityKey] || this.priorities.NORMAL;
  },

  getEventConfig(eventKey) {
    return this.events[eventKey] || null;
  },

  getFilter(filterKey) {
    return this.filters[filterKey] || this.filters.ALL;
  },

  getAction(actionKey) {
    return this.actions[actionKey] || null;
  },

};
