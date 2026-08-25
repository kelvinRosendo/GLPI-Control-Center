/**
 * GLPI Control Center - settings.js
 * -----------------------------------------------------------------------------
 * Módulo centralizado de configurações do sistema.
 *
 * Gerencia preferências do usuário, configurações da aplicação
 * e integração com módulos existentes (Theme, Notifications, etc.)
 *
 * Sprint 20: Settings
 */

window.Settings = (function () {
  'use strict';

  const STORAGE_KEY = 'gcc_settings';
  let _initialized = false;
  let _settings = {};

  // ════════════════════════════════════════════════════════════════════════════
  // CATEGORIAS DE CONFIGURAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  const CATEGORIES = {
    appearance: {
      key: 'appearance',
      label: 'Aparência',
      icon: '&#127912;',
      description: 'Tema, idioma e visual',
    },
    notifications: {
      key: 'notifications',
      label: 'Notificações',
      icon: '&#128276;',
      description: 'Preferências de notificação',
    },
    behavior: {
      key: 'behavior',
      label: 'Comportamento',
      icon: '&#9881;',
      description: 'Atalhos, auto-refresh, idioma',
    },
    privacy: {
      key: 'privacy',
      label: 'Privacidade',
      icon: '&#128274;',
      description: 'Dados, cache e sessão',
    },
    about: {
      key: 'about',
      label: 'Sobre',
      icon: '&#8505;',
      description: 'Versão e informações do sistema',
    },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES PADRÃO
  // ════════════════════════════════════════════════════════════════════════════

  const DEFAULTS = {
    appearance: {
      theme: 'dark',
      compactMode: false,
      animationsEnabled: true,
      fontSize: 'normal',
    },
    notifications: {
      enabled: true,
      soundEnabled: false,
      desktopEnabled: false,
      minPriority: 'LOW',
    },
    behavior: {
      shortcutsEnabled: true,
      autoRefresh: true,
      autoRefreshInterval: 300,
      sidebarCollapsed: false,
      defaultTab: 'home',
    },
    privacy: {
      saveHistory: true,
      historyDays: 30,
      analyticsEnabled: false,
    },
    about: {
      version: '1.0.0',
      build: '2024.01',
    },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    if (_initialized) return;
    _initialized = true;
    _load();
    _applySettings();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ════════════════════════════════════════════════════════════════════════════

  function get(path) {
    if (!path) return { ..._settings };
    const keys = path.split('.');
    let value = _settings;
    for (const key of keys) {
      value = value?.[key];
    }
    return value;
  }

  function getDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function getCategories() {
    return Object.values(CATEGORIES);
  }

  function getCategory(key) {
    return CATEGORIES[key] || null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SETTERS
  // ════════════════════════════════════════════════════════════════════════════

  function set(path, value) {
    const keys = path.split('.');
    let obj = _settings;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }

    const oldValue = obj[keys[keys.length - 1]];
    obj[keys[keys.length - 1]] = value;

    _save();
    _applySetting(path, value, oldValue);
    _emit('settings:changed', { path, value, oldValue });
  }

  function update(category, values) {
    if (!_settings[category]) _settings[category] = {};
    const oldValues = { ..._settings[category] };
    _settings[category] = { ..._settings[category], ...values };

    _save();
    _applyCategory(category);
    _emit('settings:categoryChanged', { category, values, oldValues });
  }

  function reset(category) {
    if (category) {
      _settings[category] = { ...DEFAULTS[category] };
      _applyCategory(category);
    } else {
      _settings = JSON.parse(JSON.stringify(DEFAULTS));
      _applySettings();
    }
    _save();
    _emit('settings:reset', { category });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // APLICAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function _applySettings() {
    _applyAppearance();
    _applyNotifications();
    _applyBehavior();
  }

  function _applySetting(path, value, oldValue) {
    if (path.startsWith('appearance.')) _applyAppearance();
    if (path.startsWith('notifications.')) _applyNotifications();
    if (path.startsWith('behavior.')) _applyBehavior();
  }

  function _applyCategory(category) {
    if (category === 'appearance') _applyAppearance();
    if (category === 'notifications') _applyNotifications();
    if (category === 'behavior') _applyBehavior();
  }

  function _applyAppearance() {
    const a = _settings.appearance || {};

    // Temo
    if (window.Theme) {
      window.Theme.apply(a.theme || 'dark');
    }

    // Modo compacto
    document.documentElement.classList.toggle('compact-mode', a.compactMode);

    // Animações
    document.documentElement.classList.toggle('no-animations', !a.animationsEnabled);

    // Tamanho da fonte
    document.documentElement.setAttribute('data-font-size', a.fontSize || 'normal');
  }

  function _applyNotifications() {
    const n = _settings.notifications || {};
    if (window.NotificationPreferences) {
      window.NotificationPreferences.update({
        channels: { in_app: n.enabled },
        sound: { enabled: n.soundEnabled, criticalOnly: true },
      });
    }
  }

  function _applyBehavior() {
    const b = _settings.behavior || {};

    // Atalhos
    if (window.KeyboardShortcuts) {
      b.shortcutsEnabled ? window.KeyboardShortcuts.enable() : window.KeyboardShortcuts.disable();
    }

    // Sidebar
    if (window.Sidebar) {
      b.sidebarCollapsed ? window.Sidebar.collapse() : window.Sidebar.expand();
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PERSISTÊNCIA
  // ════════════════════════════════════════════════════════════════════════════

  function _load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      _settings = saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
    } catch {
      _settings = { ...DEFAULTS };
    }
  }

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings));
    } catch {
      // Ignorar erros de storage
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXPORTAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function exportSettings() {
    return JSON.stringify(_settings, null, 2);
  }

  function importSettings(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      _settings = { ...DEFAULTS, ...imported };
      _save();
      _applySettings();
      _emit('settings:imported', {});
      return true;
    } catch {
      return false;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  function _emit(eventName, detail) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    get,
    set,
    update,
    reset,
    getDefaults,
    getCategories,
    getCategory,
    exportSettings,
    importSettings,
  };
})();
