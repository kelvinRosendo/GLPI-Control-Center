/**
 * GLPI Control Center - lazy-loader.js
 * -----------------------------------------------------------------------------
 * Carregador sob demanda de scripts e módulos.
 *
 * Permite carregar JavaScript apenas quando necessário,
 * melhorando o tempo de carregamento inicial.
 *
 * Sprint 27: Code Splitting
 */

window.LazyLoader = (function () {
  'use strict';

  const _loaded = new Set();
  const _loading = new Map();
  const _callbacks = new Map();

  // ════════════════════════════════════════════════════════════════════════════
  // CARREGAMENTO DE SCRIPTS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Carrega um script JavaScript dinamicamente.
   * @param {string} src - URL ou caminho do script
   * @param {object} options - Opções: async, defer, callback
   * @returns {Promise<void>}
   */
  function loadScript(src, options = {}) {
    if (_loaded.has(src)) {
      return Promise.resolve();
    }

    if (_loading.has(src)) {
      return _loading.get(src);
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = options.async !== false;
      script.defer = options.defer || false;

      script.onload = () => {
        _loaded.add(src);
        _loading.delete(src);
        _executeCallbacks(src);
        resolve();
      };

      script.onerror = () => {
        _loading.delete(src);
        reject(new Error(`Falha ao carregar script: ${src}`));
      };

      document.head.appendChild(script);
    });

    _loading.set(src, promise);
    return promise;
  }

  /**
   * Carrega múltiplos scripts em paralelo.
   * @param {string[]} srcs - Array de URLs
   * @returns {Promise<void>}
   */
  function loadScripts(srcs) {
    return Promise.all(srcs.map(src => loadScript(src))).then(() => {});
  }

  /**
   * Carrega scripts sequencialmente.
   * @param {string[]} srcs - Array de URLs
   * @returns {Promise<void>}
   */
  async function loadScriptsSequential(srcs) {
    for (const src of srcs) {
      await loadScript(src);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MÓDULOS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Registra callback para quando um módulo é carregado.
   * @param {string} moduleName - Nome do módulo
   * @param {Function} callback
   */
  function onModule(moduleName, callback) {
    if (!_callbacks.has(moduleName)) {
      _callbacks.set(moduleName, []);
    }
    _callbacks.get(moduleName).push(callback);
  }

  function _executeCallbacks(moduleName) {
    const cbs = _callbacks.get(moduleName) || [];
    cbs.forEach(cb => {
      try { cb(); } catch (e) { console.warn('[LazyLoader] Callback error:', e); }
    });
    _callbacks.delete(moduleName);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VERIFICAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Verifica se um script já foi carregado.
   * @param {string} src
   * @returns {boolean}
   */
  function isLoaded(src) {
    return _loaded.has(src);
  }

  /**
   * Retorna scripts carregados.
   * @returns {string[]}
   */
  function getLoaded() {
    return [..._loaded];
  }

  /**
   * Retorna scripts sendo carregados.
   * @returns {string[]}
   */
  function getLoading() {
    return [..._loading.keys()];
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    loadScript,
    loadScripts,
    loadScriptsSequential,
    onModule,
    isLoaded,
    getLoaded,
    getLoading,
  };
})();
