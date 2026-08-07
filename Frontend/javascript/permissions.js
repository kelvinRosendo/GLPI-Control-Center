/**
 * GLPI Control Center - permissions.js
 * -----------------------------------------------------------------------------
 * Sistema de Controle de Acesso Baseado em Papéis (RBAC).
 *
 * Responsabilidades:
 * - Definir perfis de usuário (roles)
 * - Mapear permissões por perfil
 * - Verificar acesso a módulos
 * - Verificar acesso a ações específicas
 * - Gerenciar hierarquia de perfis
 *
 * PRINCÍPIO: Configuration Driven Design
 * - Perfis e permissões definidos centralmente
 * - Novas permissões são adicionadas APENAS neste arquivo
 *
 * Sprint 9.5: Google OAuth, Controle de Acesso e Perfis de Usuário
 */

window.Permissions = (function () {

  // ══════════════════════════════════════════════════════════════════════════
  // PERFIS DE USUÁRIO (ROLES)
  // ══════════════════════════════════════════════════════════════════════════

  const PROFILES = {
    ADMIN: {
      key: 'ADMIN',
      label: 'Administrador',
      description: 'Acesso total ao sistema',
      level: 100,
      color: '#ff5555',
    },
    TI: {
      key: 'TI',
      label: 'Técnico de TI',
      description: 'Acesso técnico completo',
      level: 80,
      color: '#4f7ef7',
    },
    COORDENADORA: {
      key: 'COORDENADORA',
      label: 'Coordenadora',
      description: 'Acesso pedagógico e administrativo',
      level: 60,
      color: '#00c896',
    },
    VICE_DIRETORA: {
      key: 'VICE_DIRETORA',
      label: 'Vice-Diretora',
      description: 'Acesso gerencial e indicadores',
      level: 50,
      color: '#6c5ce7',
    },
    DIRETORA: {
      key: 'DIRETORA',
      label: 'Diretora',
      description: 'Acesso estratégico e indicadores',
      level: 55,
      color: '#ffc107',
    },
    SUPORTE: {
      key: 'SUPORTE',
      label: 'Suporte',
      description: 'Acesso operacional limitado',
      level: 40,
      color: '#9299b8',
    },
    VISUALIZADOR: {
      key: 'VISUALIZADOR',
      label: 'Visualizador',
      description: 'Somente leitura',
      level: 10,
      color: '#5a6080',
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MÓDULOS DO SISTEMA
  // ══════════════════════════════════════════════════════════════════════════

  const MODULES = {
    home: { key: 'home', label: 'Dashboard', icon: '&#128200;', order: 1 },
    computadores: { key: 'computadores', label: 'Computadores', icon: '&#128421;', order: 2 },
    geekiees: { key: 'geekiees', label: 'Geekiees', icon: '&#128214;', order: 3 },
    apoio: { key: 'apoio', label: 'Carrinhos', icon: '&#128666;', order: 4 },
    projetores: { key: 'projetores', label: 'Projetores', icon: '&#128249;', order: 5 },
    impressoras: { key: 'impressoras', label: 'Impressoras', icon: '&#128424;', order: 6 },
    chamados: { key: 'chamados', label: 'Chamados', icon: '&#128196;', order: 7 },
    relatorios: { key: 'relatorios', label: 'Relatórios', icon: '&#128203;', order: 8 },
    auditoria: { key: 'auditoria', label: 'Auditoria', icon: '&#128737;', order: 9 },
    assistente: { key: 'assistente', label: 'Assistente', icon: '&#129302;', order: 10 },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PERMISSÕES POR PERFIL
  // ══════════════════════════════════════════════════════════════════════════

  const ROLE_PERMISSIONS = {
    ADMIN: {
      modules: Object.keys(MODULES),
      actions: ['create', 'read', 'update', 'delete', 'export', 'configure', 'audit'],
    },

    TI: {
      modules: ['home', 'computadores', 'geekiees', 'apoio', 'projetores', 'impressoras', 'chamados', 'relatorios', 'auditoria', 'assistente'],
      actions: ['create', 'read', 'update', 'delete', 'export', 'audit'],
    },

    COORDENADORA: {
      modules: ['home', 'chamados', 'relatorios', 'computadores', 'geekiees', 'apoio'],
      actions: ['create', 'read', 'update'],
    },

    DIRETORA: {
      modules: ['home', 'relatorios', 'chamados'],
      actions: ['read', 'export'],
    },

    VICE_DIRETORA: {
      modules: ['home', 'relatorios', 'chamados'],
      actions: ['read', 'export'],
    },

    SUPORTE: {
      modules: ['home', 'computadores', 'geekiees', 'apoio', 'chamados'],
      actions: ['create', 'read', 'update'],
    },

    VISUALIZADOR: {
      modules: ['home'],
      actions: ['read'],
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PERMISSÕES POR MÓDULO (ações específicas)
  // ══════════════════════════════════════════════════════════════════════════

  const MODULE_ACTIONS = {
    home: {
      view: ['ADMIN', 'TI', 'COORDENADORA', 'DIRETORA', 'VICE_DIRETORA', 'SUPORTE', 'VISUALIZADOR'],
      refresh: ['ADMIN', 'TI', 'COORDENADORA', 'DIRETORA', 'VICE_DIRETORA', 'SUPORTE'],
    },
    computadores: {
      view: ['ADMIN', 'TI', 'COORDENADORA', 'SUPORTE'],
      search: ['ADMIN', 'TI', 'COORDENADORA', 'SUPORTE'],
      edit: ['ADMIN', 'TI'],
      openTicket: ['ADMIN', 'TI', 'COORDENADORA', 'SUPORTE'],
    },
    projetores: {
      view: ['ADMIN', 'TI', 'SUPORTE'],
      edit: ['ADMIN', 'TI'],
      maintenance: ['ADMIN', 'TI'],
    },
    chamados: {
      view: ['ADMIN', 'TI', 'COORDENADORA', 'DIRETORA', 'VICE_DIRETORA', 'SUPORTE'],
      create: ['ADMIN', 'TI', 'COORDENADORA', 'SUPORTE'],
      edit: ['ADMIN', 'TI'],
    },
    relatorios: {
      view: ['ADMIN', 'TI', 'COORDENADORA', 'DIRETORA', 'VICE_DIRETORA'],
      export: ['ADMIN', 'TI', 'COORDENADORA', 'DIRETORA', 'VICE_DIRETORA'],
      configure: ['ADMIN'],
    },
    auditoria: {
      view: ['ADMIN', 'TI'],
      export: ['ADMIN', 'TI'],
      clear: ['ADMIN'],
    },
    assistente: {
      view: ['ADMIN', 'TI', 'COORDENADORA', 'SUPORTE'],
      chat: ['ADMIN', 'TI', 'COORDENADORA', 'SUPORTE'],
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todas as definições de perfil.
   * @returns {object}
   */
  function getProfiles() {
    return { ...PROFILES };
  }

  /**
   * Retorna definição de um perfil.
   * @param {string} profileKey
   * @returns {object|null}
   */
  function getProfile(profileKey) {
    return PROFILES[profileKey] || null;
  }

  /**
   * Retorna todos os módulos do sistema.
   * @returns {object}
   */
  function getModules() {
    return { ...MODULES };
  }

  /**
   * Retorna módulos ordenados.
   * @returns {array}
   */
  function getOrderedModules() {
    return Object.values(MODULES).sort((a, b) => a.order - b.order);
  }

  /**
   * Retorna módulos permitidos para um perfil.
   * @param {string} profileKey
   * @returns {array}
   */
  function getAllowedModules(profileKey) {
    const perms = ROLE_PERMISSIONS[profileKey];
    if (!perms) return [];
    return perms.modules || [];
  }

  /**
   * Retorna módulos visíveis (com ícones e labels) para um perfil.
   * @param {string} profileKey
   * @returns {array}
   */
  function getVisibleModules(profileKey) {
    const allowed = getAllowedModules(profileKey);
    return getOrderedModules().filter(m => allowed.includes(m.key));
  }

  /**
   * Verifica se um perfil tem acesso a um módulo.
   * @param {string} profileKey
   * @param {string} moduleKey
   * @returns {boolean}
   */
  function hasModuleAccess(profileKey, moduleKey) {
    const allowed = getAllowedModules(profileKey);
    return allowed.includes(moduleKey);
  }

  /**
   * Verifica se um perfil tem uma ação permitida.
   * @param {string} profileKey
   * @param {string} action
   * @returns {boolean}
   */
  function hasAction(profileKey, action) {
    const perms = ROLE_PERMISSIONS[profileKey];
    if (!perms) return false;
    return (perms.actions || []).includes(action);
  }

  /**
   * Verifica se um perfil pode executar uma ação em um módulo.
   * @param {string} profileKey
   * @param {string} moduleKey
   * @param {string} action
   * @returns {boolean}
   */
  function canDo(profileKey, moduleKey, action) {
    const modulePerms = MODULE_ACTIONS[moduleKey];
    if (!modulePerms) return false;

    const actionRoles = modulePerms[action];
    if (!actionRoles) return false;

    return actionRoles.includes(profileKey);
  }

  /**
   * Retorna a hierarquia de perfis (maior nível = mais acesso).
   * @param {string} profileKey
   * @returns {number}
   */
  function getLevel(profileKey) {
    return PROFILES[profileKey]?.level || 0;
  }

  /**
   * Verifica se um perfil tem nível superior ou igual a outro.
   * @param {string} profileKey
   * @param {string} requiredProfile
   * @returns {boolean}
   */
  function hasMinLevel(profileKey, requiredProfile) {
    return getLevel(profileKey) >= getLevel(requiredProfile);
  }

  /**
   * Retorna a cor de um perfil.
   * @param {string} profileKey
   * @returns {string}
   */
  function getProfileColor(profileKey) {
    return PROFILES[profileKey]?.color || '#9299b8';
  }

  /**
   * Retorna label de um perfil.
   * @param {string} profileKey
   * @returns {string}
   */
  function getProfileLabel(profileKey) {
    return PROFILES[profileKey]?.label || profileKey;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORTAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  return {
    getProfiles,
    getProfile,
    getModules,
    getOrderedModules,
    getAllowedModules,
    getVisibleModules,
    hasModuleAccess,
    hasAction,
    canDo,
    getLevel,
    hasMinLevel,
    getProfileColor,
    getProfileLabel,
  };

})();
