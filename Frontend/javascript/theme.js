/**
 * GLPI Control Center - theme.js
 * -----------------------------------------------------------------------------
 * Gerenciamento de tema (claro/escuro) com persistencia no localStorage.
 *
 * Sprint 12: Design System
 */

window.Theme = (function () {
  'use strict';

  const STORAGE_KEY = 'gcc_theme';
  const DEFAULT_THEME = 'dark';

  /**
   * Inicializa o tema salvo ou detecta preferencia do sistema.
   */
  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const theme = saved || _getSystemPreference();
    apply(theme);
  }

  /**
   * Aplica o tema no documento.
   * @param {'dark'|'light'} theme
   */
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    _emitChange(theme);
  }

  /**
   * Alterna entre claro e escuro.
   */
  function toggle() {
    const current = get();
    const next = current === 'dark' ? 'light' : 'dark';
    apply(next);
  }

  /**
   * Retorna o tema atual.
   * @returns {'dark'|'light'}
   */
  function get() {
    return document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
  }

  /**
   * Detecta preferencia do sistema operacional.
   * @returns {'dark'|'light'}
   */
  function _getSystemPreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return DEFAULT_THEME;
  }

  /**
   * Emite evento de mudanca de tema.
   * @param {'dark'|'light'} theme
   */
  function _emitChange(theme) {
    document.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme } }));
  }

  return { init, apply, toggle, get };
})();
