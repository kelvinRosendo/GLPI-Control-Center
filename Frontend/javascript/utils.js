/**
 * GLPI Control Center - utils.js
 * -----------------------------------------------------------------------------
 * Utilitários gerais de performance.
 *
 * Funções de debounce, throttle, deep merge, e helpers.
 *
 * Sprint 22: Performance & Caching
 */

window.Utils = (function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════
  // DEBOUNCE & THROTTLE
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Debounce - espera N ms após última chamada.
   * @param {Function} fn - Função
   * @param {number} ms - Milissegundos
   * @returns {Function}
   */
  function debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /**
   * Throttle - executa no máximo 1x a cada N ms.
   * @param {Function} fn - Função
   * @param {number} ms - Milissegundos
   * @returns {Function}
   */
  function throttle(fn, ms = 300) {
    let lastCall = 0;
    let timer;
    return function (...args) {
      const now = Date.now();
      const remaining = ms - (now - lastCall);

      if (remaining <= 0) {
        clearTimeout(timer);
        lastCall = now;
        fn.apply(this, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          lastCall = Date.now();
          timer = null;
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DEEP MERGE
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Merge profundo de objetos.
   * @param {object} target
   * @param {object} source
   * @returns {object}
   */
  function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CLONE
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Clone profundo via JSON.
   * @param {*} obj
   * @returns {*}
   */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ESCAPE HTML
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Escapa HTML para prevenir XSS.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FORMATADORES
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Formata número com separadores de milhar.
   * @param {number} num
   * @returns {string}
   */
  function formatNumber(num) {
    return num.toLocaleString('pt-BR');
  }

  /**
   * Formata data relativa (há X minutos).
   * @param {Date|string} date
   * @returns {string}
   */
  function timeAgo(date) {
    const now = new Date();
    const d = new Date(date);
    const diff = Math.floor((now - d) / 1000);

    if (diff < 60) return 'Agora';
    if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `há ${Math.floor(diff / 86400)}d`;

    return d.toLocaleDateString('pt-BR');
  }

  /**
   * Formata bytes para formato legível.
   * @param {number} bytes
   * @returns {string}
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VALIDAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Verifica se valor não está vazio.
   * @param {*} value
   * @returns {boolean}
   */
  function isEmpty(value) {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    debounce,
    throttle,
    deepMerge,
    deepClone,
    escapeHtml,
    formatNumber,
    timeAgo,
    formatBytes,
    isEmpty,
  };
})();
