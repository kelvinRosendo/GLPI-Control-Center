/**
 * GLPI Control Center - cache.js
 * -----------------------------------------------------------------------------
 * Sistema centralizado de cache em memória.
 *
 * Fornece cache genérico com TTL, limite de entradas,
 * e invalidação automática.
 *
 * Sprint 22: Performance & Caching
 */

window.Cache = (function () {
  'use strict';

  const _stores = {};
  const DEFAULT_TTL = 300000; // 5 minutos
  const DEFAULT_MAX_ENTRIES = 100;

  // ════════════════════════════════════════════════════════════════════════════
  // CRIAÇÃO DE STORES
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Cria ou retorna um store de cache.
   * @param {string} name - Nome do store
   * @param {object} options - Opções: ttl, maxEntries
   * @returns {object}
   */
  function createStore(name, options = {}) {
    if (_stores[name]) return _stores[name];

    const store = {
      data: {},
      timestamps: {},
      ttl: options.ttl || DEFAULT_TTL,
      maxEntries: options.maxEntries || DEFAULT_MAX_ENTRIES,
      hits: 0,
      misses: 0,
    };

    _stores[name] = store;
    return store;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // OPERAÇÕES
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Obtém valor do cache.
   * @param {string} store - Nome do store
   * @param {string} key - Chave
   * @returns {*} valor ou null
   */
  function get(store, key) {
    const s = _stores[store];
    if (!s) return null;

    if (!_isValid(s, key)) {
      _evict(s, key);
      s.misses++;
      return null;
    }

    s.hits++;
    return s.data[key];
  }

  /**
   * Armazena valor no cache.
   * @param {string} store - Nome do store
   * @param {string} key - Chave
   * @param {*} value - Valor
   */
  function set(store, key, value) {
    const s = _stores[store];
    if (!s) return;

    // Verificar limite de entradas
    if (Object.keys(s.data).length >= s.maxEntries) {
      _evictOldest(s);
    }

    s.data[key] = value;
    s.timestamps[key] = Date.now();
  }

  /**
   * Remove valor do cache.
   * @param {string} store - Nome do store
   * @param {string} key - Chave
   */
  function del(store, key) {
    const s = _stores[store];
    if (!s) return;

    delete s.data[key];
    delete s.timestamps[key];
  }

  /**
   * Limpa todo o store.
   * @param {string} store - Nome do store
   */
  function clear(store) {
    const s = _stores[store];
    if (!s) return;

    s.data = {};
    s.timestamps = {};
    s.hits = 0;
    s.misses = 0;
  }

  /**
   * Limpa todos os stores.
   */
  function clearAll() {
    Object.keys(_stores).forEach(clear);
  }

  /**
   * Invalida entradas expiradas em um store.
   * @param {string} store - Nome do store
   */
  function invalidate(store) {
    const s = _stores[store];
    if (!s) return;

    const now = Date.now();
    Object.keys(s.data).forEach(key => {
      if (now - s.timestamps[key] > s.ttl) {
        delete s.data[key];
        delete s.timestamps[key];
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ESTATÍSTICAS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Retorna estatísticas de um store.
   * @param {string} store
   * @returns {object}
   */
  function getStats(store) {
    const s = _stores[store];
    if (!s) return null;

    return {
      entries: Object.keys(s.data).length,
      maxEntries: s.maxEntries,
      ttl: s.ttl,
      hits: s.hits,
      misses: s.misses,
      hitRate: s.hits + s.misses > 0
        ? Math.round((s.hits / (s.hits + s.misses)) * 100)
        : 0,
    };
  }

  /**
   * Retorna estatísticas de todos os stores.
   * @returns {object}
   */
  function getAllStats() {
    const stats = {};
    Object.keys(_stores).forEach(name => {
      stats[name] = getStats(name);
    });
    return stats;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  function _isValid(store, key) {
    if (!(key in store.data)) return false;
    return Date.now() - store.timestamps[key] <= store.ttl;
  }

  function _evict(store, key) {
    delete store.data[key];
    delete store.timestamps[key];
  }

  function _evictOldest(store) {
    let oldestKey = null;
    let oldestTime = Infinity;

    Object.keys(store.timestamps).forEach(key => {
      if (store.timestamps[key] < oldestTime) {
        oldestTime = store.timestamps[key];
        oldestKey = key;
      }
    });

    if (oldestKey) {
      _evict(store, oldestKey);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    createStore,
    get,
    set,
    del,
    clear,
    clearAll,
    invalidate,
    getStats,
    getAllStats,
  };
})();
