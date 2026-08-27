/**
 * GLPI Control Center - permission-checker.js
 * -----------------------------------------------------------------------------
 * Helper centralizado para verificação de permissões.
 *
 * Fornece API simples e consistente para verificar permissões
 * em qualquer lugar do frontend, evitando verificações espalhadas.
 *
 * Uso:
 *   if (window.PC.can('computadores', 'edit')) { ... }
 *   if (window.PC.canView('projetores')) { ... }
 *   if (window.PC.isAdmin()) { ... }
 *
 * Sprint 16: RBAC e Permissões
 */

window.PC = (function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════
  // HELPERS INTERNOS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Retorna o perfil do usuário atual.
   * @returns {string|null}
   */
  function _getProfile() {
    return window.UserContext?.getCurrentUser()?.perfil || null;
  }

  /**
   * Retorna a instância do Permissions.
   * @returns {object|null}
   */
  function _perms() {
    return window.Permissions || null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VERIFICAÇÕES DE MÓDULO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Verifica se o usuário pode acessar um módulo.
   * @param {string} moduleKey - Chave do módulo
   * @returns {boolean}
   */
  function canView(moduleKey) {
    const profile = _getProfile();
    if (!profile || !_perms()) return false;
    return _perms().hasModuleAccess(profile, moduleKey);
  }

  /**
   * Alias para canView.
   */
  function canAccess(moduleKey) {
    return canView(moduleKey);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VERIFICAÇÕES DE AÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Verifica se o usuário pode executar uma ação em um módulo.
   * @param {string} moduleKey - Chave do módulo
   * @param {string} action - Ação (view, edit, delete, create, export, etc.)
   * @returns {boolean}
   */
  function can(moduleKey, action) {
    const profile = _getProfile();
    if (!profile || !_perms()) return false;
    return _perms().canDo(profile, moduleKey, action);
  }

  /**
   * Verifica se o usuário pode criar em um módulo.
   */
  function canCreate(moduleKey) {
    return can(moduleKey, 'create');
  }

  /**
   * Verifica se o usuário pode editar em um módulo.
   */
  function canEdit(moduleKey) {
    return can(moduleKey, 'edit');
  }

  /**
   * Verifica se o usuário pode excluir em um módulo.
   */
  function canDelete(moduleKey) {
    return can(moduleKey, 'delete');
  }

  /**
   * Verifica se o usuário pode exportar de um módulo.
   */
  function canExport(moduleKey) {
    return can(moduleKey, 'export');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VERIFICAÇÕES DE PERFIL
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Verifica se o usuário é admin.
   */
  function isAdmin() {
    return _getProfile() === 'ADMIN';
  }

  /**
   * Verifica se o usuário tem nível mínimo.
   * @param {string} minProfile - Perfil mínimo exigido
   */
  function hasMinLevel(minProfile) {
    const profile = _getProfile();
    if (!profile || !_perms()) return false;
    return _perms().hasMinLevel(profile, minProfile);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MÓDULOS VISÍVEIS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Retorna módulos visíveis para o usuário atual.
   * @returns {array}
   */
  function getVisibleModules() {
    const profile = _getProfile();
    if (!profile || !_perms()) return [];
    return _perms().getVisibleModules(profile);
  }

  /**
   * Retorna array com apenas as chaves dos módulos visíveis.
   * @returns {array}
   */
  function getVisibleModuleKeys() {
    return getVisibleModules().map(m => m.key);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INFORMAÇÕES DO PERFIL
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Retorna o perfil do usuário atual.
   * @returns {string|null}
   */
  function getProfile() {
    return _getProfile();
  }

  /**
   * Retorna o label do perfil.
   * @returns {string|null}
   */
  function getProfileLabel() {
    const profile = _getProfile();
    if (!profile || !_perms()) return null;
    return _perms().getProfileLabel(profile);
  }

  /**
   * Retorna a cor do perfil.
   * @returns {string|null}
   */
  function getProfileColor() {
    const profile = _getProfile();
    if (!profile || !_perms()) return null;
    return _perms().getProfileColor(profile);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    // Verificações de módulo
    canView,
    canAccess,
    can,

    // Verificações de ação
    canCreate,
    canEdit,
    canDelete,
    canExport,

    // Verificações de perfil
    isAdmin,
    hasMinLevel,

    // Módulos
    getVisibleModules,
    getVisibleModuleKeys,

    // Informações
    getProfile,
    getProfileLabel,
    getProfileColor,
  };
})();
