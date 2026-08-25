/**
 * GLPI Control Center - search.js
 * -----------------------------------------------------------------------------
 * Módulo principal de busca global.
 *
 * Coordena busca unificada em todos os tipos de ativo.
 *
 * Sprint 18: Search Global
 */

window.Search = (function () {
  'use strict';

  let _initialized = false;
  let _currentQuery = '';
  let _currentResults = [];
  let _activeFilter = 'all';
  let _debounceTimer = null;

  const DEBOUNCE_MS = 250;

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    if (_initialized) return;
    _initialized = true;
    _bindKeyboard();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BUSCA
  // ════════════════════════════════════════════════════════════════════════════

  function search(query) {
    _currentQuery = query.trim();

    if (!_currentQuery) {
      clear();
      return;
    }

    // Verificar cache
    const cached = window.SearchStorage.getCachedResults(_currentQuery);
    if (cached) {
      _currentResults = cached;
      _applyFilter();
      return;
    }

    // Buscar
    window.SearchEvents.emit(window.SearchEvents.EVENTS.SEARCH_START, { query: _currentQuery });
    window.SearchStorage.addToHistory(_currentQuery);

    _currentResults = window.SearchStorage.searchAll(_currentQuery);
    window.SearchStorage.cacheResults(_currentQuery, _currentResults);

    _applyFilter();
  }

  function searchDebounced(query) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => search(query), DEBOUNCE_MS);
  }

  function clear() {
    _currentQuery = '';
    _currentResults = [];
    _activeFilter = 'all';
    window.SearchEvents.emit(window.SearchEvents.EVENTS.SEARCH_CLEAR, {});
  }

  function setFilter(filter) {
    _activeFilter = filter;
    if (_currentQuery) _applyFilter();
  }

  function _applyFilter() {
    let filtered = _currentResults;

    if (_activeFilter !== 'all') {
      filtered = _currentResults.filter(r => r.type === _activeFilter);
    }

    if (filtered.length === 0 && _currentQuery) {
      window.SearchEvents.emit(window.SearchEvents.EVENTS.SEARCH_EMPTY, { query: _currentQuery });
    } else {
      window.SearchEvents.emit(window.SearchEvents.EVENTS.SEARCH_RESULTS, {
        query: _currentQuery,
        results: filtered,
        total: _currentResults.length,
        filtered: filtered.length,
        filter: _activeFilter,
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUT
  // ════════════════════════════════════════════════════════════════════════════

  function _bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      // Ctrl+K ou Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        window.SearchEvents.emit(window.SearchEvents.EVENTS.SEARCH_FOCUS, {});
      }
      // ESC
      if (e.key === 'Escape') {
        window.SearchEvents.emit(window.SearchEvents.EVENTS.SEARCH_BLUR, {});
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ════════════════════════════════════════════════════════════════════════════

  function getQuery() { return _currentQuery; }
  function getResults() { return _currentResults; }
  function getFilter() { return _activeFilter; }

  function getStats() {
    const byType = {};
    _currentResults.forEach(r => {
      byType[r.type] = (byType[r.type] || 0) + 1;
    });
    return { total: _currentResults.length, byType, query: _currentQuery, filter: _activeFilter };
  }

  function getHistory() { return window.SearchStorage.getHistory(); }
  function clearHistory() { window.SearchStorage.clearHistory(); }
  function invalidateCache() { window.SearchStorage.invalidateCache(); }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    search,
    searchDebounced,
    clear,
    setFilter,
    getQuery,
    getResults,
    getFilter,
    getStats,
    getHistory,
    clearHistory,
    invalidateCache,
  };
})();
