/**
 * GLPI Control Center - asset_classifier.js
 * -----------------------------------------------------------------------------
 * Cliente para ativos classificados pelo backend.
 *
 * Fonte principal de dados: GET /api/assets/all
 * Status: GET /api/sync/status
 * Relatório: GET /api/sync/report
 * Sincronização: POST /api/sync/run, POST /api/sync/incremental
 *
 * Regras:
 * - Não duplica chamadas simultâneas.
 * - Preserva dados anteriores em caso de falha.
 * - Valida HTTP status e formato JSON.
 * - Timeout configurável.
 */

'use strict';

window.AssetClassifier = (() => {
  let _inFlight = null;
  let _lastFetch = 0;
  const MIN_INTERVAL_MS = 5000;

  function _normalizeForSearch(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  async function _guardedFetch(path, options = {}) {
    if (_inFlight && !options.force) {
      return _inFlight;
    }

    const timeout = options.timeout || 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      _inFlight = window.GlpiClient._fetch(path, {
        ...options,
        signal: controller.signal,
      });
      const result = await _inFlight;
      clearTimeout(timer);
      return result;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    } finally {
      _inFlight = null;
    }
  }

  return {
    /**
     * Busca todos os ativos classificados do cache do backend.
     * Preserva dados anteriores se a chamada falhar.
     */
    async fetchAllClassified() {
      try {
        const now = Date.now();
        if (now - _lastFetch < MIN_INTERVAL_MS && window.DATA.classifiedAssets?.length) {
          return { ok: true, data: window.DATA.classifiedAssets, cached: true };
        }

        const json = await _guardedFetch('/api/assets/all');
        const data = json.data ?? [];
        _lastFetch = Date.now();

        if (!Array.isArray(data)) {
          return { ok: false, error: 'Resposta inválida do backend', data: window.DATA.classifiedAssets ?? [] };
        }

        return { ok: true, data };
      } catch (e) {
        console.error('[AssetClassifier] fetchAllClassified:', e.message);
        return {
          ok: false,
          error: e.message || 'Erro ao buscar ativos classificados',
          data: window.DATA.classifiedAssets ?? [],
          partial: (window.DATA.classifiedAssets ?? []).length > 0,
        };
      }
    },

    /**
     * Busca status da sincronização.
     */
    async fetchSyncStatus() {
      try {
        const json = await _guardedFetch('/api/sync/status');
        return { ok: true, data: json.data ?? {} };
      } catch (e) {
        return { ok: false, error: e.message, data: {} };
      }
    },

    /**
     * Busca relatório da última sincronização.
     */
    async fetchSyncReport() {
      try {
        const json = await _guardedFetch('/api/sync/report');
        return { ok: true, data: json.data ?? {} };
      } catch (e) {
        return { ok: false, error: e.message, data: {} };
      }
    },

    /**
     * Executa sincronização completa (requer ADMIN).
     */
    async runFullSync() {
      try {
        const json = await _guardedFetch('/api/sync/run', {
          method: 'POST',
          body: {},
          force: true,
          timeout: 120000,
        });
        return { ok: true, data: json.data ?? {} };
      } catch (e) {
        return { ok: false, error: e.message, data: null };
      }
    },

    /**
     * Executa sincronização incremental (requer ADMIN).
     */
    async runIncrementalSync() {
      try {
        const json = await _guardedFetch('/api/sync/incremental', {
          method: 'POST',
          body: {},
          force: true,
          timeout: 120000,
        });
        return { ok: true, data: json.data ?? {} };
      } catch (e) {
        return { ok: false, error: e.message, data: null };
      }
    },

    /**
     * Filtra ativos por múltiplos critérios.
     * Todos opcionais. Retorna apenas ativos que correspondam a TODOS.
     */
    filterAssets(items, filters = {}) {
      if (!Array.isArray(items)) return [];
      return items.filter(item => {
        if (filters.category && item.category !== filters.category) return false;
        if (filters.purpose && item.purpose !== filters.purpose) return false;
        if (filters.itemtype && item.itemtype !== filters.itemtype) return false;
        if (filters.stateSummary && item.stateSummary !== filters.stateSummary) return false;
        if (filters.manufacturer && (item.manufacturer ?? '') !== filters.manufacturer) return false;
        if (filters.model && (item.model ?? '') !== filters.model) return false;
        if (filters.location) {
          const loc = (item.location ?? '').toLowerCase();
          if (!loc.includes(filters.location.toLowerCase())) return false;
        }
        if (filters.cart && item.cart !== filters.cart) return false;
        if (filters.groupPath) {
          const gp = (item.groupPath ?? '').toLowerCase();
          if (!gp.includes(filters.groupPath.toLowerCase())) return false;
        }
        if (filters.hideUnclassified && item.category === 'unclassified') return false;
        if (filters.onlyUnclassified && item.category !== 'unclassified') return false;
        if (filters.lowConfidence && (item.classificationConfidence ?? 1) >= 0.7) return false;
        if (filters.search) {
          const q = _normalizeForSearch(filters.search);
          const haystack = _normalizeForSearch([
            item.name ?? '',
            String(item.id ?? ''),
            item.serial ?? '',
            item.otherserial ?? '',
            item.manufacturer ?? '',
            item.model ?? '',
            item.groupPath ?? '',
            item.stateRaw ?? '',
            item.stateSummary ?? '',
            item.comments ?? '',
            item.location ?? '',
            item.itemtype ?? '',
            item.category ?? '',
            item.categoryLabel ?? '',
          ].join(' '));
          if (!haystack.includes(q)) return false;
        }
        return true;
      });
    },

    /**
     * Conta ativos por campo agrupador.
     */
    groupBy(items, field, emptyLabel = '(vazio)') {
      if (!Array.isArray(items)) return {};
      const groups = {};
      for (const item of items) {
        const key = item[field] || emptyLabel;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      }
      return groups;
    },

    /**
     * Estatísticas locais.
     */
    computeStats(items) {
      if (!Array.isArray(items)) {
        return { total: 0, byCategory: {}, byItemtype: {}, byState: {}, byPurpose: {}, unclassified: 0, warnings: 0 };
      }
      const stats = {
        total: items.length,
        byCategory: {},
        byItemtype: {},
        byState: {},
        byPurpose: {},
        unclassified: 0,
        warnings: 0,
      };

      for (const item of items) {
        const cat = item.category ?? 'unknown';
        const it = item.itemtype ?? 'unknown';
        const st = item.stateSummary ?? 'desconhecido';
        const purp = item.purpose ?? '(sem purpose)';

        stats.byCategory[cat] = (stats.byCategory[cat] ?? 0) + 1;
        stats.byItemtype[it] = (stats.byItemtype[it] ?? 0) + 1;
        stats.byState[st] = (stats.byState[st] ?? 0) + 1;
        stats.byPurpose[purp] = (stats.byPurpose[purp] ?? 0) + 1;

        if (cat === 'unclassified') stats.unclassified++;
        stats.warnings += (item.classificationWarnings ?? []).length;
      }

      return stats;
    },

    /**
     * Renderiza badge de confiança.
     */
    renderConfidenceBadge(confidence) {
      if (confidence >= 0.9) return '<span class="badge badge-success">Alta</span>';
      if (confidence >= 0.7) return '<span class="badge badge-warning">Média</span>';
      return '<span class="badge badge-danger">Baixa</span>';
    },

    /**
     * Renderiza avisos de classificação.
     */
    renderWarnings(warnings) {
      if (!warnings || warnings.length === 0) return '';
      return '<div class="classification-warnings">' +
        warnings.map(w => '<div class="warning-item">\u26A0 ' + this._esc(w) + '</div>').join('') +
        '</div>';
    },

    /**
     * Retorna lista de valores únicos de um campo.
     */
    getUniqueValues(items, field) {
      if (!Array.isArray(items)) return [];
      const set = new Set(items.map(i => i[field]).filter(Boolean));
      return [...set].sort();
    },

    /**
     * Escapa HTML.
     */
    _esc(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },
  };
})();
