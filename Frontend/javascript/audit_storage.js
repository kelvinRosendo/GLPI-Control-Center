/**
 * GLPI Control Center - audit_storage.js
 * -----------------------------------------------------------------------------
 * Camada de persistência do Sistema de Auditoria.
 *
 * Responsabilidades:
 * - Persistir registros em localStorage
 * - Gerenciar cache em memória
 * - Limpeza automática de registros expirados
 * - Controle de capacidade máxima
 * - Preparar estrutura para sincronização com backend
 * - Repository pattern para acesso aos dados
 *
 * NÃO contém lógica de negócio. Consulte audit.js.
 * NÃO renderiza HTML. Consulte audit_ui.js.
 *
 * Sprint 9: Auditoria Avançada e Linha do Tempo Global
 */

window.AuditStorage = {

  // ── Cache ────────────────────────────────────────────────────────────────

  _cache: {
    records: null,
    timestamp: 0,
    queryCache: {},
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PERSISTÊNCIA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todos os registros do localStorage.
   * Utiliza cache em memória para performance.
   * @returns {array}
   */
  getAll() {
    const now = Date.now();
    const ttl = window.AUDIT_CONFIG.storage.cacheTTL;

    if (this._cache.records && (now - this._cache.timestamp) < ttl) {
      return this._cache.records;
    }

    try {
      const raw = localStorage.getItem(window.AUDIT_CONFIG.storage.key);
      const records = raw ? JSON.parse(raw) : [];
      this._cache.records = records;
      this._cache.timestamp = now;
      return records;
    } catch {
      return [];
    }
  },

  /**
   * Salva todos os registros no localStorage.
   * @param {array} records
   */
  _saveAll(records) {
    try {
      const max = window.AUDIT_CONFIG.storage.maxRecords;
      const trimmed = records.slice(-max);
      localStorage.setItem(window.AUDIT_CONFIG.storage.key, JSON.stringify(trimmed));
      this._cache.records = trimmed;
      this._cache.timestamp = Date.now();
    } catch (e) {
      console.warn('[AuditStorage] Erro ao salvar:', e);
      this._handleStorageFull(records);
    }
  },

  /**
   * Adiciona um registro.
   * @param {object} record
   * @returns {object} O registro salvo com ID
   */
  addRecord(record) {
    const all = this.getAll();
    all.push(record);

    // Limpar expirados periodicamente
    if (all.length % 100 === 0) {
      this._cleanExpired(all);
    } else {
      this._saveAll(all);
    }

    return record;
  },

  /**
   * Retorna registros paginados.
   * @param {number} page
   * @param {number} pageSize
   * @returns {{ records: array, total: number, page: number, totalPages: number }}
   */
  getPaginated(page = 1, pageSize = 50) {
    const all = this.getAll();
    const total = all.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const records = all.slice().reverse().slice(start, start + pageSize);

    return { records, total, page, totalPages };
  },

  /**
   * Busca registros com filtros.
   * @param {object} filters
   * @param {string} filters.search - Busca livre
   * @param {string} filters.category - Categoria
   * @param {string} filters.severity - Severidade
   * @param {string} filters.module - Módulo
   * @param {string} filters.user - Usuário
   * @param {string} filters.dateFrom - Data início
   * @param {string} filters.dateTo - Data fim
   * @param {number} filters.page - Página
   * @param {number} filters.pageSize - Tamanho da página
   * @returns {{ records: array, total: number, page: number, totalPages: number }}
   */
  query(filters = {}) {
    const cacheKey = JSON.stringify(filters);
    const now = Date.now();
    const ttl = window.AUDIT_CONFIG.storage.cacheTTL;

    if (this._cache.queryCache[cacheKey] && (now - this._cache.queryCache[cacheKey].timestamp) < ttl) {
      return this._cache.queryCache[cacheKey].result;
    }

    let records = this.getAll().slice().reverse();

    // Filtro por busca livre
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      records = records.filter(r =>
        (r.descricao || '').toLowerCase().includes(q) ||
        (r.usuario || '').toLowerCase().includes(q) ||
        (r.equipamento || '').toLowerCase().includes(q) ||
        (r.fornecedor || '').toLowerCase().includes(q) ||
        (r.acaoLabel || '').toLowerCase().includes(q)
      );
    }

    // Filtro por categoria
    if (filters.category && filters.category !== 'todos') {
      records = records.filter(r => r.categoria === filters.category);
    }

    // Filtro por severidade
    if (filters.severity && filters.severity !== 'todas') {
      records = records.filter(r => r.severity === filters.severity);
    }

    // Filtro por módulo
    if (filters.module && filters.module !== 'todos') {
      records = records.filter(r => r.modulo === filters.module);
    }

    // Filtro por usuário
    if (filters.user && filters.user.trim()) {
      const q = filters.user.toLowerCase().trim();
      records = records.filter(r => (r.usuario || '').toLowerCase().includes(q));
    }

    // Filtro por data início
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      records = records.filter(r => new Date(r.timestamp) >= from);
    }

    // Filtro por data fim
    if (filters.dateTo) {
      const to = new Date(filters.dateTo + 'T23:59:59');
      records = records.filter(r => new Date(r.timestamp) <= to);
    }

    // Paginação
    const page = filters.page || 1;
    const pageSize = filters.pageSize || window.AUDIT_CONFIG.ui.timelinePageSize;
    const total = records.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const paged = records.slice(start, start + pageSize);

    const result = { records: paged, total, page, totalPages };

    // Cache do resultado
    this._cache.queryCache[cacheKey] = { result, timestamp: now };

    // Limitar tamanho do cache de queries
    const cacheKeys = Object.keys(this._cache.queryCache);
    if (cacheKeys.length > 20) {
      const oldest = cacheKeys.sort((a, b) =>
        this._cache.queryCache[a].timestamp - this._cache.queryCache[b].timestamp
      )[0];
      delete this._cache.queryCache[oldest];
    }

    return result;
  },

  /**
   * Retorna estatísticas gerais.
   * @returns {object}
   */
  getStats() {
    const records = this.getAll();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 7);

    const byCategory = {};
    const bySeverity = {};
    const byModule = {};
    const byUser = {};

    records.forEach(r => {
      byCategory[r.categoria] = (byCategory[r.categoria] || 0) + 1;
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
      byModule[r.modulo] = (byModule[r.modulo] || 0) + 1;
      if (r.usuario) byUser[r.usuario] = (byUser[r.usuario] || 0) + 1;
    });

    const todayCount = records.filter(r => new Date(r.timestamp) >= today).length;
    const yesterdayCount = records.filter(r => {
      const d = new Date(r.timestamp);
      return d >= yesterday && d < today;
    }).length;
    const weekCount = records.filter(r => new Date(r.timestamp) >= lastWeek).length;

    return {
      total: records.length,
      today: todayCount,
      yesterday: yesterdayCount,
      thisWeek: weekCount,
      byCategory,
      bySeverity,
      byModule,
      byUser,
      topUsers: Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  },

  /**
   * Limpa registros expirados.
   * @param {array} records
   */
  _cleanExpired(records) {
    const expiryMs = window.AUDIT_CONFIG.storage.expiryDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - expiryMs;
    const filtered = records.filter(r => new Date(r.timestamp).getTime() > cutoff);
    this._saveAll(filtered);
  },

  /**
   * Trata erro de storage cheio.
   * @param {array} records
   */
  _handleStorageFull(records) {
    // Remover 20% mais antigos e tentar novamente
    const toKeep = records.slice(Math.floor(records.length * 0.2));
    try {
      localStorage.setItem(window.AUDIT_CONFIG.storage.key, JSON.stringify(toKeep));
      this._cache.records = toKeep;
      this._cache.timestamp = Date.now();
    } catch {
      console.error('[AuditStorage] Storage realmente cheio. Limpando tudo.');
      this.clear();
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // LIMPEZA E UTILIDADES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Limpa todos os registros.
   */
  clear() {
    localStorage.removeItem(window.AUDIT_CONFIG.storage.key);
    this._cache = { records: null, timestamp: 0, queryCache: {} };
  },

  /**
   * Retorna contagem total.
   * @returns {number}
   */
  count() {
    return this.getAll().length;
  },

  /**
   * Limpa cache.
   */
  invalidateCache() {
    this._cache = { records: null, timestamp: 0, queryCache: {} };
  },

  /**
   * Prepara payload para sincronização com backend (futuro).
   * @returns {object}
   */
  prepareSyncPayload() {
    const records = this.getAll();
    return {
      total: records.length,
      records: records.map(r => ({
        ...r,
        synced: false,
      })),
      preparedAt: new Date().toISOString(),
    };
  },
};
