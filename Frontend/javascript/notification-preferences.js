/**
 * GLPI Control Center - notification-preferences.js
 * -----------------------------------------------------------------------------
 * Preferências de notificação do usuário.
 *
 * Permite configurar quais notificações o usuário deseja receber.
 *
 * Sprint 17: Central de Notificações
 */

window.NotificationPreferences = (function () {
  'use strict';

  const STORAGE_KEY = 'gcc_notification_preferences';

  // ════════════════════════════════════════════════════════════════════════════
  // PREFERÊNCIAS PADRÃO
  // ════════════════════════════════════════════════════════════════════════════

  const DEFAULT_PREFERENCES = {
    // Canais ativos
    channels: {
      in_app: true,
      email: false,
      push: false,
    },

    // Categorias habilitadas
    categories: {
      WORKFLOW: true,
      PROJECTORS: true,
      DASHBOARD: true,
      REPORTS: true,
      AUTH: true,
      INTEGRATIONS: true,
      SYSTEM: true,
      AUDIT: true,
    },

    // Prioridade mínima para receber notificação
    minPriority: 'LOW',

    // Horário de silêncio (não notificar)
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
    },

    // Som para notificações críticas
    sound: {
      enabled: false,
      criticalOnly: true,
    },
  };

  let _preferences = null;

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    _load();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todas as preferências.
   * @returns {object}
   */
  function getAll() {
    return { ..._preferences };
  }

  /**
   * Verifica se uma categoria está habilitada.
   * @param {string} category
   * @returns {boolean}
   */
  function isCategoryEnabled(category) {
    return _preferences.categories[category] !== false;
  }

  /**
   * Verifica se um canal está ativo.
   * @param {string} channel
   * @returns {boolean}
   */
  function isChannelEnabled(channel) {
    return _preferences.channels[channel] === true;
  }

  /**
   * Retorna a prioridade mínima configurada.
   * @returns {string}
   */
  function getMinPriority() {
    return _preferences.minPriority || 'LOW';
  }

  /**
   * Verifica se está no horário de silêncio.
   * @returns {boolean}
   */
  function isQuietHours() {
    if (!_preferences.quietHours?.enabled) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = _preferences.quietHours.start.split(':').map(Number);
    const [endH, endM] = _preferences.quietHours.end.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes > endMinutes) {
      // Cruza meia-noite
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SETTERS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Atualiza uma preferência específica.
   * @param {string} path - Caminho da preferência (ex: 'categories.WORKFLOW')
   * @param {*} value - Novo valor
   */
  function set(path, value) {
    const keys = path.split('.');
    let obj = _preferences;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }

    obj[keys[keys.length - 1]] = value;
    _save();
    _emit('preferences:changed', { path, value });
  }

  /**
   * Atualiza múltiplas preferências.
   * @param {object} updates
   */
  function update(updates) {
    _preferences = _mergeDeep(_preferences, updates);
    _save();
    _emit('preferences:changed', { updates });
  }

  /**
   * Reseta preferências para o padrão.
   */
  function reset() {
    _preferences = { ...DEFAULT_PREFERENCES };
    _save();
    _emit('preferences:reset', {});
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PERSISTÊNCIA
  // ════════════════════════════════════════════════════════════════════════════

  function _load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      _preferences = saved ? { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } : { ...DEFAULT_PREFERENCES };
    } catch {
      _preferences = { ...DEFAULT_PREFERENCES };
    }
  }

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_preferences));
    } catch {
      // Ignorar erros de storage
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  function _mergeDeep(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = _mergeDeep(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  function _emit(eventName, detail) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    getAll,
    isCategoryEnabled,
    isChannelEnabled,
    getMinPriority,
    isQuietHours,
    set,
    update,
    reset,
  };
})();
