/**
 * GLPI Control Center - module-registry.js
 * -----------------------------------------------------------------------------
 * Registro centralizado de módulos e suas dependências.
 *
 * Define quais scripts carregar para cada módulo.
 *
 * Sprint 27: Code Splitting
 */

window.ModuleRegistry = (function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════
  // DEFINIÇÃO DOS MÓDULOS
  // ════════════════════════════════════════════════════════════════════════════

  const MODULES = {
    // Módulos core (carregados sempre)
    core: {
      scripts: [
        'javascript/config.env.js',
        'javascript/theme.js',
        'javascript/utils.js',
        'javascript/cache.js',
        'javascript/mobile.js',
        'javascript/error-handler.js',
        'javascript/error-ui.js',
      ],
      critical: true,
    },

    auth: {
      scripts: [
        'javascript/auth.config.js',
        'javascript/permissions.js',
        'javascript/user_context.js',
        'javascript/auth_guard.js',
        'javascript/auth.js',
      ],
      critical: true,
    },

    ui: {
      scripts: [
        'javascript/mano-isa.js',
        'javascript/sidebar.js',
        'javascript/loading-states.js',
        'javascript/keyboard_shortcuts.js',
      ],
      critical: true,
    },

    // Módulos de feature (carregados sob demanda)
    dashboard: {
      scripts: [
        'javascript/dashboard.config.js',
        'javascript/dashboard.js',
        'javascript/dashboard_analytics.js',
        'javascript/dashboard_charts.js',
        'javascript/dashboard_ui.js',
      ],
      depends: ['core', 'ui'],
    },

    computadores: {
      scripts: [
        'javascript/data.js',
        'javascript/state.js',
        'javascript/glpi.client.js',
        'javascript/ui_render.js',
      ],
      depends: ['core'],
    },

    projetores: {
      scripts: [
        'javascript/projectors.config.js',
        'javascript/projectors.js',
        'javascript/projectors_maintenance.js',
        'javascript/projectors_ui.js',
      ],
      depends: ['core'],
    },

    relatorios: {
      scripts: [
        'javascript/reports.config.js',
        'javascript/reports.js',
        'javascript/report_export.js',
        'javascript/reports_ui.js',
      ],
      depends: ['core'],
    },

    chamados: {
      scripts: [
        'javascript/tickets.js',
        'javascript/workflow.config.js',
        'javascript/assistance_flows.js',
        'javascript/workflow.js',
        'javascript/workflow_ui.js',
        'javascript/chat.js',
      ],
      depends: ['core'],
    },

    audit: {
      scripts: [
        'javascript/audit.config.js',
        'javascript/audit_storage.js',
        'javascript/audit.js',
        'javascript/audit_ui.js',
        'javascript/audit_analytics.js',
      ],
      depends: ['core'],
    },

    notifications: {
      scripts: [
        'javascript/notifications.config.js',
        'javascript/notifications_events.js',
        'javascript/notifications_storage.js',
        'javascript/notifications_templates.js',
        'javascript/notifications.js',
        'javascript/notifications_center.js',
        'javascript/notifications_ui.js',
        'javascript/notification-preferences.js',
      ],
      depends: ['core'],
    },

    search: {
      scripts: [
        'javascript/search_events.js',
        'javascript/search_storage.js',
        'javascript/search.js',
        'javascript/search_ui.js',
      ],
      depends: ['core'],
    },

    settings: {
      scripts: [
        'javascript/settings.js',
        'javascript/settings_ui.js',
      ],
      depends: ['core'],
    },

    integrations: {
      scripts: [
        'javascript/integrations.config.js',
        'javascript/integration-engine.js',
        'javascript/integration-audit.js',
        'javascript/portal-viewer.utils.js',
        'javascript/portal-viewer.js',
      ],
      depends: ['core'],
    },

    api: {
      scripts: [
        'javascript/glpi.client.js',
        'javascript/api-client.js',
        'javascript/api-interceptors.js',
      ],
      depends: ['core'],
    },

    session: {
      scripts: [
        'javascript/session-warning.js',
        'javascript/access-denied.js',
        'javascript/permission-checker.js',
      ],
      depends: ['auth'],
    },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // CARREGAMENTO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Carrega um módulo e suas dependências.
   * @param {string} moduleName - Nome do módulo
   * @returns {Promise<void>}
   */
  async function loadModule(moduleName) {
    const module = MODULES[moduleName];
    if (!module) {
      console.warn(`[ModuleRegistry] Módulo desconhecido: ${moduleName}`);
      return;
    }

    // Carregar dependências primeiro
    if (module.depends) {
      for (const dep of module.depends) {
        await loadModule(dep);
      }
    }

    // Carregar scripts do módulo
    await window.LazyLoader.loadScripts(module.scripts);
  }

  /**
   * Carrega múltiplos módulos.
   * @param {string[]} moduleNames
   * @returns {Promise<void>}
   */
  async function loadModules(moduleNames) {
    await Promise.all(moduleNames.map(name => loadModule(name)));
  }

  /**
   * Retorna scripts de um módulo.
   * @param {string} moduleName
   * @returns {string[]}
   */
  function getModuleScripts(moduleName) {
    return MODULES[moduleName]?.scripts || [];
  }

  /**
   * Retorna todos os módulos.
   * @returns {object}
   */
  function getModules() {
    return { ...MODULES };
  }

  /**
   * Retorna módulos críticos.
   * @returns {string[]}
   */
  function getCriticalModules() {
    return Object.keys(MODULES).filter(name => MODULES[name].critical);
  }

  /**
   * Retorna módulos non-críticos.
   * @returns {string[]}
   */
  function getLazyModules() {
    return Object.keys(MODULES).filter(name => !MODULES[name].critical);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    loadModule,
    loadModules,
    getModuleScripts,
    getModules,
    getCriticalModules,
    getLazyModules,
  };
})();
