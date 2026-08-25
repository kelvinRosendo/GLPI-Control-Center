/**
 * GLPI Control Center - preload.js
 * -----------------------------------------------------------------------------
 * Pré-carregamento de módulos com base em prioridade.
 *
 * Carrega módulos críticos imediatamente e
 * pré-carrega módulos prováveis em background.
 *
 * Sprint 27: Code Splitting
 */

window.Preload = (function () {
  'use strict';

  let _initialized = false;
  const _prefetchQueue = [];
  let _prefetchTimer = null;

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    if (_initialized) return;
    _initialized = true;

    _preloadCritical();
    _setupIdleCallback();
    _setupVisibilityChange();
  }

  /**
   * Carrega módulos críticos imediatamente.
   */
  function _preloadCritical() {
    const critical = window.ModuleRegistry?.getCriticalModules() || [];
    if (critical.length > 0) {
      window.ModuleRegistry.loadModules(critical).catch(err => {
        console.warn('[Preload] Erro ao carregar módulos críticos:', err);
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // IDLE CALLBACK
  // ════════════════════════════════════════════════════════════════════════════

  function _setupIdleCallback() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        _prefetchLikelyModules();
      }, { timeout: 5000 });
    } else {
      setTimeout(() => {
        _prefetchLikelyModules();
      }, 2000);
    }
  }

  /**
   * Pré-carrega módulos prováveis.
   */
  function _prefetchLikelyModules() {
    const likely = _getLikelyModules();
    likely.forEach(module => {
      _prefetch(module);
    });
  }

  function _getLikelyModules() {
    const currentTab = window.App?.getCurrentTab?.() || 'home';
    const modules = [];

    // Dashboard sempre é provável
    if (currentTab !== 'dashboard') {
      modules.push('dashboard');
    }

    // Módulos frequentemente usados
    modules.push('search', 'notifications');

    return modules;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PREFETCH
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Adiciona módulo à fila de prefetch.
   * @param {string} moduleName
   */
  function _prefetch(moduleName) {
    if (_prefetchQueue.includes(moduleName)) return;
    _prefetchQueue.push(moduleName);
    _processPrefetchQueue();
  }

  function _processPrefetchQueue() {
    if (_prefetchTimer) return;
    if (_prefetchQueue.length === 0) return;

    _prefetchTimer = setTimeout(() => {
      const module = _prefetchQueue.shift();
      _prefetchTimer = null;

      window.ModuleRegistry?.loadModule(module).catch(() => {}).finally(() => {
        _processPrefetchQueue();
      });
    }, 100);
  }

  /**
   * Pré-carrega um módulo específco.
   * @param {string} moduleName
   */
  function prefetch(moduleName) {
    _prefetch(moduleName);
  }

  /**
   * Pré-carrega múltiplos módulos.
   * @param {string[]} moduleNames
   */
  function prefetchAll(moduleNames) {
    moduleNames.forEach(m => _prefetch(m));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VISIBILITY CHANGE
  // ════════════════════════════════════════════════════════════════════════════

  function _setupVisibilityChange() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        _processPrefetchQueue();
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PREFETCH POR HOVER
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Registra hover para prefetch automático.
   * @param {string} selector - Seletor CSS
   * @param {string} moduleName - Módulo para prefetch
   */
  function onHoverPrefetch(selector, moduleName) {
    let prefetched = false;
    document.addEventListener('mouseenter', (e) => {
      if (e.target.closest(selector) && !prefetched) {
        prefetched = true;
        _prefetch(moduleName);
      }
    }, true);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    prefetch,
    prefetchAll,
    onHoverPrefetch,
  };
})();
