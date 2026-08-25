/**
 * GLPI Control Center - audit_analytics.js
 * -----------------------------------------------------------------------------
 * Analytics avançados para o sistema de auditoria.
 *
 * Fornece métricas, tendências e insights sobre os eventos.
 *
 * Sprint 21: Audit Enhancements
 */

window.AuditAnalytics = (function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════
  // MÉTRICAS BÁSICAS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Retorna métricas gerais do sistema.
   * @returns {object}
   */
  function getMetrics() {
    const records = window.AuditStorage?.getAll() || [];
    const now = new Date();

    return {
      total: records.length,
      today: _countByDateRange(records, _startOfDay(now), now),
      yesterday: _countByDateRange(records, _startOfDay(_addDays(now, -1)), _endOfDay(_addDays(now, -1))),
      thisWeek: _countByDateRange(records, _startOfWeek(now), now),
      lastWeek: _countByDateRange(records, _startOfWeek(_addDays(now, -7)), _endOfWeek(_addDays(now, -7))),
      thisMonth: _countByDateRange(records, _startOfMonth(now), now),
      errors: records.filter(r => r.severity === 'error').length,
      warnings: records.filter(r => r.severity === 'warning').length,
    };
  }

  /**
   * Retorna tendências (comparação com período anterior).
   * @returns {object}
   */
  function getTrends() {
    const records = window.AuditStorage?.getAll() || [];
    const now = new Date();
    const todayStart = _startOfDay(now);
    const yesterdayStart = _startOfDay(_addDays(now, -1));
    const yesterdayEnd = _endOfDay(_addDays(now, -1));

    const todayCount = _countByDateRange(records, todayStart, now);
    const yesterdayCount = _countByDateRange(records, yesterdayStart, yesterdayEnd);

    const thisWeekStart = _startOfWeek(now);
    const lastWeekStart = _startOfWeek(_addDays(now, -7));
    const lastWeekEnd = _endOfWeek(_addDays(now, -7));

    const thisWeekCount = _countByDateRange(records, thisWeekStart, now);
    const lastWeekCount = _countByDateRange(records, lastWeekStart, lastWeekEnd);

    return {
      today: {
        count: todayCount,
        previous: yesterdayCount,
        change: yesterdayCount > 0 ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100) : 0,
        direction: todayCount >= yesterdayCount ? 'up' : 'down',
      },
      thisWeek: {
        count: thisWeekCount,
        previous: lastWeekCount,
        change: lastWeekCount > 0 ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100) : 0,
        direction: thisWeekCount >= lastWeekCount ? 'up' : 'down',
      },
    };
  }

  /**
   * Retorna atividade por hora do dia (para heatmap).
   * @returns {array} [{hour: 0, count: 5}, ...]
   */
  function getActivityByHour() {
    const records = window.AuditStorage?.getAll() || [];
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));

    records.forEach(r => {
      const h = new Date(r.timestamp).getHours();
      hours[h].count++;
    });

    return hours;
  }

  /**
   * Retorna atividade por dia da semana.
   * @returns {array} [{day: 'Dom', count: 10}, ...]
   */
  function getActivityByDayOfWeek() {
    const records = window.AuditStorage?.getAll() || [];
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const counts = days.map((day, i) => ({ day, index: i, count: 0 }));

    records.forEach(r => {
      const d = new Date(r.timestamp).getDay();
      counts[d].count++;
    });

    return counts;
  }

  /**
   * Retorna timeline de eventos (eventos por dia nos últimos N dias).
   * @param {number} days - Número de dias
   * @returns {array} [{date: '2024-01-15', count: 25}, ...]
   */
  function getTimeline(days = 30) {
    const records = window.AuditStorage?.getAll() || [];
    const now = new Date();
    const timeline = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = _addDays(now, -i);
      const dayStr = _formatDate(date);
      const count = records.filter(r => _formatDate(new Date(r.timestamp)) === dayStr).length;
      timeline.push({ date: dayStr, count });
    }

    return timeline;
  }

  /**
   * Retorna top usuários por atividade.
   * @param {number} limit - Número de usuários
   * @returns {array}
   */
  function getTopUsers(limit = 10) {
    const records = window.AuditStorage?.getAll() || [];
    const userMap = {};

    records.forEach(r => {
      const user = r.usuario || 'desconhecido';
      if (!userMap[user]) {
        userMap[user] = { user, total: 0, errors: 0, warnings: 0 };
      }
      userMap[user].total++;
      if (r.severity === 'error') userMap[user].errors++;
      if (r.severity === 'warning') userMap[user].warnings++;
    });

    return Object.values(userMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  /**
   * Retorna distribuição de severidade ao longo do tempo.
   * @param {number} days
   * @returns {array}
   */
  function getSeverityTimeline(days = 14) {
    const records = window.AuditStorage?.getAll() || [];
    const now = new Date();
    const severities = ['info', 'success', 'warning', 'error'];
    const timeline = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = _addDays(now, -i);
      const dayStr = _formatDate(date);
      const dayRecords = records.filter(r => _formatDate(new Date(r.timestamp)) === dayStr);

      const entry = { date: dayStr };
      severities.forEach(s => {
        entry[s] = dayRecords.filter(r => r.severity === s).length;
      });
      timeline.push(entry);
    }

    return timeline;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXPORTAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Exporta registros como JSON.
   * @param {object} filters - Filtros opcionais
   * @returns {string}
   */
  function exportJSON(filters = {}) {
    const records = _getFilteredRecords(filters);
    return JSON.stringify(records, null, 2);
  }

  /**
   * Exporta registros como CSV.
   * @param {object} filters - Filtros opcionais
   * @returns {string}
   */
  function exportCSV(filters = {}) {
    const records = _getFilteredRecords(filters);
    const headers = ['ID', 'Timestamp', 'Usuário', 'Categoria', 'Módulo', 'Ação', 'Severidade', 'Descrição', 'Equipamento'];
    const rows = records.map(r => [
      r.id,
      r.timestamp,
      `"${(r.usuario || '').replace(/"/g, '""')}"`,
      r.category || r.categoria || '',
      r.module || r.modulo || '',
      `"${(r.acaoLabel || r.acao || '').replace(/"/g, '""')}"`,
      r.severity || r.severidade || '',
      `"${(r.descricao || '').replace(/"/g, '""')}"`,
      `"${(r.equipamento || '').replace(/"/g, '""')}"`,
    ]);

    return [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  }

  /**
   * Exporta e faz download.
   * @param {string} format - 'json' ou 'csv'
   * @param {object} filters - Filtros
   */
  function exportAndDownload(format = 'json', filters = {}) {
    let content, filename, mimeType;

    if (format === 'csv') {
      content = exportCSV(filters);
      filename = `auditoria_${_getDateStr()}.csv`;
      mimeType = 'text/csv;charset=utf-8;';
    } else {
      content = exportJSON(filters);
      filename = `auditoria_${_getDateStr()}.json`;
      mimeType = 'application/json;charset=utf-8;';
    }

    const blob = new Blob(['\ufeff' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function _getFilteredRecords(filters) {
    let records = window.AuditStorage?.getAll() || [];

    if (filters.category) {
      records = records.filter(r => (r.category || r.categoria) === filters.category);
    }
    if (filters.severity) {
      records = records.filter(r => (r.severity || r.severidade) === filters.severity);
    }
    if (filters.module) {
      records = records.filter(r => (r.module || r.modulo) === filters.module);
    }
    if (filters.dateFrom) {
      records = records.filter(r => new Date(r.timestamp) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      records = records.filter(r => new Date(r.timestamp) <= new Date(filters.dateTo));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      records = records.filter(r =>
        (r.descricao || '').toLowerCase().includes(q) ||
        (r.usuario || '').toLowerCase().includes(q) ||
        (r.equipamento || '').toLowerCase().includes(q)
      );
    }

    return records;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  function _countByDateRange(records, start, end) {
    return records.filter(r => {
      const t = new Date(r.timestamp);
      return t >= start && t <= end;
    }).length;
  }

  function _startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function _endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function _startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function _endOfWeek(date) {
    const d = _startOfWeek(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function _startOfMonth(date) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function _addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function _formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  function _getDateStr() {
    return _formatDate(new Date());
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    getMetrics,
    getTrends,
    getActivityByHour,
    getActivityByDayOfWeek,
    getTimeline,
    getTopUsers,
    getSeverityTimeline,
    exportJSON,
    exportCSV,
    exportAndDownload,
  };
})();
