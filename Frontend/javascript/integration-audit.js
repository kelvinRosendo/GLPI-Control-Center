/**
 * GLPI Control Center - integration-audit.js
 * -----------------------------------------------------------------------------
 * Sistema de auditoria de integrações.
 *
 * Responsabilidades:
 * - Registrar ações executadas no localStorage
 * - Cada registro contém:
 *     horário, usuário, equipamento, fornecedor, ação, resultado
 * - Fornecer interface para consulta de histórico
 * - Preparar dados para sincronização futura com backend
 *
 * Sprint 3: localStorage como armazenamento primário
 * Sprint 5: Sync com backend quando persistência estiver disponível
 *
 * Arquitetura:
 * - Gravação: localStorage (rápido, offline-first)
 * - Sincronização: POST /api/integration/audit (futuro)
 * - Limpeza: expiração automática após 30 dias
 */

window.IntegrationAudit = {
  // ── Constantes ───────────────────────────────────────────────────────────

  STORAGE_KEY: 'glpi:integration_audit',
  MAX_RECORDS: 500,
  EXPIRY_DAYS: 30,

  // ── Gravação ─────────────────────────────────────────────────────────────

  /**
   * Registra uma ação de integração no localStorage.
   *
   * @param {object} record
   *   integrationKey  - chave da integração (torino, hbb, etc.)
   *   fornecedor      - nome do fornecedor
   *   usuario         - usuário que executou a ação
   *   equipamento     - { nome, patrimonio, serial, glpiId }
   *   acao            - ID da ação executada
   *   resultado       - 'sucesso' | 'falha'
   *   auditEvent      - evento de auditoria
   *   timestamp       - horário da ação
   *   data            - dados adicionais
   *
   * @returns {{ ok: boolean, id: string }}
   */
  recordAction(record) {
    const entry = {
      id: this._generateId(),
      horario: record.timestamp || new Date().toISOString(),
      usuario: record.usuario || 'sistema',
      equipamento: {
        nome: record.equipamento?.nome || '',
        patrimonio: record.equipamento?.patrimonio || '',
        serial: record.equipamento?.serial || '',
        glpiId: record.equipamento?.glpiId || null,
      },
      fornecedor: record.fornecedor || '',
      integrationKey: record.integrationKey || '',
      acao: record.acao || '',
      resultado: record.resultado || 'sucesso',
      auditEvent: record.auditEvent || '',
      data: record.data || {},
      synced: false,
    };

    const records = this._loadRecords();
    records.push(entry);

    const cleaned = this._cleanExpired(records);
    const trimmed = cleaned.length > this.MAX_RECORDS
      ? cleaned.slice(cleaned.length - this.MAX_RECORDS)
      : cleaned;

    this._saveRecords(trimmed);

    return { ok: true, id: entry.id };
  },

  // ── Consulta ─────────────────────────────────────────────────────────────

  /**
   * Retorna todos os registros de auditoria.
   * @param {object} filters - { integrationKey, fornecedor, acao, resultado, since, until }
   * @returns {array}
   */
  getAll(filters = {}) {
    let records = this._loadRecords();

    if (filters.integrationKey) {
      records = records.filter(r => r.integrationKey === filters.integrationKey);
    }

    if (filters.fornecedor) {
      records = records.filter(r => r.fornecedor === filters.fornecedor);
    }

    if (filters.acao) {
      records = records.filter(r => r.acao === filters.acao);
    }

    if (filters.resultado) {
      records = records.filter(r => r.resultado === filters.resultado);
    }

    if (filters.since) {
      const since = new Date(filters.since).getTime();
      records = records.filter(r => new Date(r.horario).getTime() >= since);
    }

    if (filters.until) {
      const until = new Date(filters.until).getTime();
      records = records.filter(r => new Date(r.horario).getTime() <= until);
    }

    return records;
  },

  /**
   * Retorna registros não sincronizados.
   * @returns {array}
   */
  getUnsynced() {
    return this._loadRecords().filter(r => !r.synced);
  },

  /**
   * Retorna contagem de registros por fornecedor.
   * @returns {object}
   */
  getCountByFornecedor() {
    const records = this._loadRecords();
    const counts = {};
    records.forEach(r => {
      counts[r.fornecedor] = (counts[r.fornecedor] || 0) + 1;
    });
    return counts;
  },

  /**
   * Retorna estatísticas gerais.
   * @returns {object}
   */
  getStats() {
    const records = this._loadRecords();
    const sucessos = records.filter(r => r.resultado === 'sucesso').length;
    const falhas = records.filter(r => r.resultado === 'falha').length;

    return {
      total: records.length,
      sucessos,
      falhas,
      byFornecedor: this.getCountByFornecedor(),
      unsynced: records.filter(r => !r.synced).length,
    };
  },

  // ── Sincronização (preparação para Sprint 5) ─────────────────────────────

  /**
   * Marca registros como sincronizados.
   * @param {string[]} ids
   */
  markSynced(ids) {
    const records = this._loadRecords();
    const idSet = new Set(ids);

    const updated = records.map(r => {
      if (idSet.has(r.id)) {
        return { ...r, synced: true };
      }
      return r;
    });

    this._saveRecords(updated);
  },

  /**
   * Prepara payload para envio ao backend.
   * @returns {{ records: array, metadata: object }}
   */
  prepareSyncPayload() {
    const unsynced = this.getUnsynced();

    return {
      records: unsynced.map(r => ({
        id: r.id,
        horario: r.horario,
        usuario: r.usuario,
        equipamento: r.equipamento,
        fornecedor: r.fornecedor,
        integrationKey: r.integrationKey,
        acao: r.acao,
        resultado: r.resultado,
        auditEvent: r.auditEvent,
        data: r.data,
      })),
      metadata: {
        total: unsynced.length,
        generatedAt: new Date().toISOString(),
        version: '1.0',
      },
    };
  },

  // ── Limpeza ──────────────────────────────────────────────────────────────

  /**
   * Remove todos os registros de auditoria.
   */
  clear() {
    this._saveRecords([]);
  },

  /**
   * Remove registros expirados.
   */
  cleanExpired() {
    const records = this._loadRecords();
    const cleaned = this._cleanExpired(records);
    this._saveRecords(cleaned);
    return { removed: records.length - cleaned.length };
  },

  // ── Helpers Internos ─────────────────────────────────────────────────────

  _loadRecords() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  _saveRecords(records) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.warn('[IntegrationAudit] Falha ao salvar no localStorage:', err.message);
    }
  },

  _cleanExpired(records) {
    const cutoff = Date.now() - (this.EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    return records.filter(r => new Date(r.horario).getTime() >= cutoff);
  },

  _generateId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  },
};
