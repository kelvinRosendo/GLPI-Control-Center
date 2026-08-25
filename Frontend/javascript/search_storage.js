/**
 * GLPI Control Center - search_storage.js
 * -----------------------------------------------------------------------------
 * Persistência e cache do módulo de busca.
 *
 * Sprint 18: Search Global
 */

window.SearchStorage = (function () {
  'use strict';

  const HISTORY_KEY = 'gcc_search_history';
  const CACHE_KEY = 'gcc_search_cache';
  const MAX_HISTORY = 20;
  const CACHE_TTL = 300000; // 5 minutos

  // ════════════════════════════════════════════════════════════════════════════
  // HISTÓRICO
  // ════════════════════════════════════════════════════════════════════════════

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function addToHistory(query) {
    if (!query || query.trim().length < 2) return;
    const history = getHistory().filter(h => h.query !== query);
    history.unshift({ query, timestamp: Date.now() });
    if (history.length > MAX_HISTORY) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CACHE
  // ════════════════════════════════════════════════════════════════════════════

  function cacheResults(query, results) {
    try {
      const cache = _getCache();
      cache[query.toLowerCase()] = { results, timestamp: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Ignorar erros de storage
    }
  }

  function getCachedResults(query) {
    const cache = _getCache();
    const entry = cache[query.toLowerCase()];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      delete cache[query.toLowerCase()];
      return null;
    }
    return entry.results;
  }

  function invalidateCache() {
    localStorage.removeItem(CACHE_KEY);
  }

  function _getCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
    } catch {
      return {};
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BUSCA NOS DADOS
  // ════════════════════════════════════════════════════════════════════════════

  function searchAll(query) {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const results = [];

    _searchComputadores(q, results);
    _searchChromebooksGeekiees(q, results);
    _searchChromebooksApoio(q, results);
    _searchProjetores(q, results);
    _searchImpressoras(q, results);

    return results;
  }

  function _searchComputadores(q, results) {
    const items = window.DATA?.computadores || [];
    items.forEach(item => {
      if (_matchItem(item, q, ['nome', 'serial', 'patrimonio', 'ip', 'usuario', 'setor'])) {
        results.push(_normalizeResult(item, 'computadores', 'Computador'));
      }
    });
  }

  function _searchChromebooksGeekiees(q, results) {
    const items = window.DATA?.chromebooksGeekiees || [];
    items.forEach(item => {
      if (_matchItem(item, q, ['nome', 'serial', 'patrimonio', 'aluno'])) {
        results.push(_normalizeResult(item, 'chromebooks_geekiees', 'Chromebook Geekie'));
      }
    });
  }

  function _searchChromebooksApoio(q, results) {
    const data = window.DATA?.chromebooksApoio || {};
    const items = data.equipamentos || data.itens || [];
    items.forEach(item => {
      if (_matchItem(item, q, ['nome', 'serial', 'patrimonio'])) {
        results.push(_normalizeResult(item, 'chromebooks_apoio', 'Chromebook Apoio'));
      }
    });
  }

  function _searchProjetores(q, results) {
    const items = window.DATA?.projetores || [];
    items.forEach(item => {
      if (_matchItem(item, q, ['nome', 'patrimonio', 'modelo', 'sala'])) {
        results.push(_normalizeResult(item, 'projetores', 'Projetor'));
      }
    });
  }

  function _searchImpressoras(q, results) {
    const items = window.DATA?.impressoras || [];
    items.forEach(item => {
      if (_matchItem(item, q, ['nome', 'serial', 'patrimonio', 'modelo'])) {
        results.push(_normalizeResult(item, 'impressoras', 'Impressora'));
      }
    });
  }

  function _matchItem(item, query, fields) {
    return fields.some(field => {
      const value = item[field];
      if (value == null) return false;
      return String(value).toLowerCase().includes(query);
    });
  }

  function _normalizeResult(item, module, typeLabel) {
    return {
      id: item.id || item.ID || item.nome,
      name: item.nome || item.name || item.modelo || 'Sem nome',
      type: module,
      typeLabel,
      serial: item.serial || '',
      patrimonio: item.patrimonio || '',
      status: item.status || item.situacao || '',
      local: item.local || item.sala || item.setor || '',
      user: item.usuario || item.aluno || '',
      ip: item.ip || '',
      link: item.link || '',
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    getHistory,
    addToHistory,
    clearHistory,
    cacheResults,
    getCachedResults,
    invalidateCache,
    searchAll,
  };
})();
