/**
 * GLPI Control Center - notifications_storage.js
 * -----------------------------------------------------------------------------
 * Camada de persistência para notificações.
 *
 * Implementa Repository Pattern para permitir troca futura de localStorage
 * por backend/API sem refatoração dos módulos consumidores.
 *
 * Storage atual: localStorage
 * Chave: glpi.notifications.items
 * Prefixo: glpi.notifications
 *
 * Sprint 10: Central de Notificações Inteligentes
 */

window.NotificationsStorage = (function () {

  // ── Config ───────────────────────────────────────────────────────────────

  const CONFIG = window.NOTIFICATIONS_CONFIG?.storage || {};
  const STORAGE_KEY = `${CONFIG.prefix || 'glpi.notifications'}.items`;
  const MAX_ITEMS = CONFIG.maxNotifications || 100;
  const TTL_DAYS = CONFIG.ttlDays || 30;

  // ── Estado ───────────────────────────────────────────────────────────────

  let _cache = null;
  let _dirty = false;

  // ══════════════════════════════════════════════════════════════════════════
  // OPERAÇÕES CRUD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todas as notificações.
   * @returns {Array}
   */
  function findAll() {
    return _load();
  }

  /**
   * Retorna uma notificação por ID.
   * @param {string} id
   * @returns {object|null}
   */
  function findById(id) {
    const items = _load();
    return items.find(function (n) { return n.id === id; }) || null;
  }

  /**
   * Salva uma notificação (create ou update).
   * @param {object} notification
   * @returns {object}
   */
  function save(notification) {
    const items = _load();
    const index = items.findIndex(function (n) { return n.id === notification.id; });

    if (index >= 0) {
      items[index] = { ...items[index], ...notification };
    } else {
      items.unshift(notification);
    }

    _save(items);
    return notification;
  }

  /**
   * Salva múltiplas notificações.
   * @param {Array} notifications
   */
  function saveAll(notifications) {
    const items = _load();
    const itemsMap = new Map(items.map(function (n) { return [n.id, n]; }));

    notifications.forEach(function (n) {
      itemsMap.set(n.id, n);
    });

    _save(Array.from(itemsMap.values()));
  }

  /**
   * Remove uma notificação por ID.
   * @param {string} id
   * @returns {boolean}
   */
  function remove(id) {
    const items = _load();
    const filtered = items.filter(function (n) { return n.id !== id; });

    if (filtered.length < items.length) {
      _save(filtered);
      return true;
    }
    return false;
  }

  /**
   * Remove múltiplas notificações.
   * @param {Array<string>} ids
   */
  function removeMany(ids) {
    const idSet = new Set(ids);
    const items = _load();
    const filtered = items.filter(function (n) { return !idSet.has(n.id); });
    _save(filtered);
  }

  /**
   * Remove todas as notificações.
   */
  function clear() {
    _save([]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSULTAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Conta notificações não lidas.
   * @returns {number}
   */
  function countUnread() {
    return _load().filter(function (n) { return !n.lida; }).length;
  }

  /**
   * Retorna notificações não lidas.
   * @returns {Array}
   */
  function findUnread() {
    return _load().filter(function (n) { return !n.lida; });
  }

  /**
   * Retorna notificações por categoria.
   * @param {string} category
   * @returns {Array}
   */
  function findByCategory(category) {
    return _load().filter(function (n) { return n.categoria === category; });
  }

  /**
   * Retorna notificações por origem.
   * @param {string} source
   * @returns {Array}
   */
  function findBySource(source) {
    return _load().filter(function (n) { return n.origem === source; });
  }

  /**
   * Busca notificações por texto.
   * @param {string} query
   * @returns {Array}
   */
  function search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return _load();

    return _load().filter(function (n) {
      return (n.titulo || '').toLowerCase().includes(q) ||
             (n.mensagem || '').toLowerCase().includes(q) ||
             (n.usuario || '').toLowerCase().includes(q) ||
             (n.origem || '').toLowerCase().includes(q) ||
             (n.categoria || '').toLowerCase().includes(q);
    });
  }

  /**
   * Retorna notificações agrupadas por data.
   * @returns {object}
   */
  function findByDateGroups() {
    const items = _load();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const groups = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    items.forEach(function (n) {
      const date = new Date(n.dataHora);
      if (date >= today) {
        groups.today.push(n);
      } else if (date >= yesterday) {
        groups.yesterday.push(n);
      } else if (date >= weekAgo) {
        groups.thisWeek.push(n);
      } else {
        groups.older.push(n);
      }
    });

    return groups;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MANUTENÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Remove notificações expiradas.
   * @returns {number} Quantidade removida
   */
  function cleanupExpired() {
    const items = _load();
    const now = new Date();
    const ttlMs = TTL_DAYS * 24 * 60 * 60 * 1000;

    const valid = items.filter(function (n) {
      if (n.expiracao) {
        return new Date(n.expiracao) > now;
      }
      // Remover notificações mais antigas que TTL
      return (now - new Date(n.dataHora)) < ttlMs;
    });

    const removed = items.length - valid.length;
    if (removed > 0) {
      _save(valid);
    }
    return removed;
  }

  /**
   * Limita notificações ao máximo configurado.
   * Remove as mais antigas primeiro.
   */
  function enforceMaxLimit() {
    const items = _load();
    if (items.length > MAX_ITEMS) {
      _save(items.slice(0, MAX_ITEMS));
    }
  }

  /**
   * Executa manutenção completa.
   */
  function maintenance() {
    cleanupExpired();
    enforceMaxLimit();
    _dirty = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PERSISTÊNCIA INTERNA
  // ══════════════════════════════════════════════════════════════════════════

  function _load() {
    if (_cache && !_dirty) return _cache;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _cache = raw ? JSON.parse(raw) : [];
      _dirty = false;
      return _cache;
    } catch (e) {
      console.error('[NotificationsStorage] Erro ao ler:', e);
      _cache = [];
      return _cache;
    }
  }

  function _save(items) {
    try {
      _cache = items;
      _dirty = false;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('[NotificationsStorage] Erro ao salvar:', e);
    }
  }

  /**
   * Força reload do cache.
   */
  function reload() {
    _dirty = true;
    _load();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ESTATÍSTICAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna estatísticas do storage.
   */
  function getStats() {
    const items = _load();
    const unread = items.filter(function (n) { return !n.lida; }).length;
    const byCategory = {};

    items.forEach(function (n) {
      byCategory[n.categoria] = (byCategory[n.categoria] || 0) + 1;
    });

    return {
      total: items.length,
      unread: unread,
      read: items.length - unread,
      byCategory: byCategory,
      maxItems: MAX_ITEMS,
      ttlDays: TTL_DAYS,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORTAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Exporta notificações como JSON.
   * @returns {string}
   */
  function exportData() {
    return JSON.stringify(_load(), null, 2);
  }

  /**
   * Importa notificações de JSON.
   * @param {string} json
   * @returns {number} Quantidade importada
   */
  function importData(json) {
    try {
      const data = JSON.parse(json);
      if (!Array.isArray(data)) return 0;
      saveAll(data);
      return data.length;
    } catch (e) {
      console.error('[NotificationsStorage] Erro ao importar:', e);
      return 0;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    // CRUD
    findAll,
    findById,
    save,
    saveAll,
    remove,
    removeMany,
    clear,

    // Consultas
    countUnread,
    findUnread,
    findByCategory,
    findBySource,
    search,
    findByDateGroups,

    // Manutenção
    cleanupExpired,
    enforceMaxLimit,
    maintenance,
    reload,

    // Stats
    getStats,

    // Export/Import
    exportData,
    importData,
  };

})();
