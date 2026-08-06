/**
 * GLPI Control Center - projectors_maintenance.js
 * -----------------------------------------------------------------------------
 * Módulo de registro de manutenções dos projetores.
 *
 * Responsabilidades:
 * - Registrar trocas de lâmpada
 * - Registrar limpezas
 * - Registrar manutenções gerais
 * - Registrar reparos e observações
 * - Gerenciar histórico em localStorage
 * - Atualizar metadados do projetor
 * - Validar dados antes de salvar
 *
 * NÃO renderiza HTML. Consulte projectors_ui.js.
 * NÃO contém lógica de cálculo. Consulte projectors.js.
 *
 * Sprint 8: Módulo de Gestão de Projetores
 */

window.ProjectorsMaintenance = {

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Registra uma manutenção para um projetor.
   * @param {number} glpiId
   * @param {object} maintenanceData
   * @param {string} maintenanceData.type - Tipo: 'lampada', 'limpeza', 'manutencao', 'reparo', 'observacao'
   * @param {string} maintenanceData.description - Descrição da manutenção
   * @param {string} maintenanceData.responsible - Nome do responsável
   * @param {number} [maintenanceData.hoursAtMaintenance] - Horas da lâmpada no momento
   * @param {string} [maintenanceData.date] - Data (default: hoje)
   * @returns {{ ok: boolean, record?: object, error?: string }}
   */
  register(glpiId, maintenanceData) {
    if (!glpiId) {
      return { ok: false, error: 'ID do projetor não informado.' };
    }

    const config = window.PROJECTORS_CONFIG;
    const typeConfig = config.getMaintenanceType(maintenanceData.type);
    if (!typeConfig) {
      return { ok: false, error: `Tipo de manutenção '${maintenanceData.type}' inválido.` };
    }

    // Criar registro
    const record = {
      id: this._generateId(),
      glpiId: glpiId,
      type: maintenanceData.type,
      typeLabel: typeConfig.label,
      description: maintenanceData.description || '',
      responsible: maintenanceData.responsible || '',
      date: maintenanceData.date || new Date().toISOString().slice(0, 10),
      hoursAtMaintenance: Number(maintenanceData.hoursAtMaintenance) || 0,
      createdAt: new Date().toISOString(),
    };

    // Validar
    const validation = this._validate(record);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    // Salvar no histórico
    this._addRecord(glpiId, record);

    // Atualizar metadados do projetor
    this._updateProjectorMeta(glpiId, record);

    // Emitir evento
    this._emit('projectors:maintenance:registered', {
      glpiId,
      record,
    });

    return { ok: true, record };
  },

  /**
   * Registra uma troca de lâmpada (atalho).
   * Reseta as horas da lâmpada e registra a data da troca.
   * @param {number} glpiId
   * @param {object} data - Dados adicionais
   * @returns {{ ok: boolean, record?: object, error?: string }}
   */
  registerLampReplacement(glpiId, data = {}) {
    const result = this.register(glpiId, {
      type: 'lampada',
      description: data.description || 'Troca de lâmpada realizada',
      responsible: data.responsible || '',
      hoursAtMaintenance: 0,
      date: data.date,
    });

    if (result.ok) {
      // Resetar horas da lâmpada e atualizar data da troca
      window.Projectors.updateProjector(glpiId, {
        horas_lampada: 0,
        data_troca_lampada: data.date || new Date().toISOString().slice(0, 10),
      });
    }

    return result;
  },

  /**
   * Registra uma limpeza (atalho).
   * @param {number} glpiId
   * @param {object} data
   * @returns {{ ok: boolean, record?: object, error?: string }}
   */
  registerCleaning(glpiId, data = {}) {
    const result = this.register(glpiId, {
      type: 'limpeza',
      description: data.description || 'Limpeza realizada',
      responsible: data.responsible || '',
      date: data.date,
    });

    if (result.ok) {
      window.Projectors.updateProjector(glpiId, {
        ultima_limpeza: data.date || new Date().toISOString().slice(0, 10),
      });
    }

    return result;
  },

  /**
   * Registra uma manutenção geral (atalho).
   * @param {number} glpiId
   * @param {object} data
   * @returns {{ ok: boolean, record?: object, error?: string }}
   */
  registerGeneralMaintenance(glpiId, data = {}) {
    const result = this.register(glpiId, {
      type: 'manutencao',
      description: data.description || 'Manutenção geral realizada',
      responsible: data.responsible || '',
      date: data.date,
    });

    if (result.ok) {
      window.Projectors.updateProjector(glpiId, {
        ultima_manutencao: data.date || new Date().toISOString().slice(0, 10),
      });
    }

    return result;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HISTÓRICO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna histórico de manutenções de um projetor.
   * @param {number} glpiId
   * @param {object} filters - { type, since, until }
   * @returns {array}
   */
  getHistory(glpiId, filters = {}) {
    const allRecords = this._getAllRecords();
    let records = allRecords.filter(r => r.glpiId === glpiId);

    // Filtrar por tipo
    if (filters.type && filters.type !== 'todos') {
      records = records.filter(r => r.type === filters.type);
    }

    // Filtrar por período
    if (filters.since) {
      const since = new Date(filters.since);
      records = records.filter(r => new Date(r.date) >= since);
    }
    if (filters.until) {
      const until = new Date(filters.until + 'T23:59:59');
      records = records.filter(r => new Date(r.date) <= until);
    }

    // Ordenar por data (mais recente primeiro)
    records.sort((a, b) => new Date(b.date) - new Date(a.date));

    return records;
  },

  /**
   * Retorna todos os registros de todos os projetores.
   * @returns {array}
   */
  getAllRecords() {
    return this._getAllRecords();
  },

  /**
   * Retorna estatísticas de manutenção.
   * @param {number} glpiId - Se null, retorna global
   * @returns {object}
   */
  getStats(glpiId = null) {
    const records = glpiId
      ? this._getAllRecords().filter(r => r.glpiId === glpiId)
      : this._getAllRecords();

    const byType = {};
    const config = window.PROJECTORS_CONFIG;

    config.maintenanceTypes.forEach(t => {
      byType[t.key] = records.filter(r => r.type === t.key).length;
    });

    // Manutenções nos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent = records.filter(r => new Date(r.date) >= thirtyDaysAgo).length;

    return {
      total: records.length,
      byType,
      recent,
    };
  },

  /**
   * Deleta um registro de manutenção.
   * @param {string} recordId
   * @returns {{ ok: boolean, error?: string }}
   */
  deleteRecord(recordId) {
    try {
      const allRecords = this._getAllRecords();
      const record = allRecords.find(r => r.id === recordId);
      if (!record) {
        return { ok: false, error: 'Registro não encontrado.' };
      }

      const filtered = allRecords.filter(r => r.id !== recordId);
      this._saveAllRecords(filtered);

      this._emit('projectors:maintenance:deleted', {
        glpiId: record.glpiId,
        recordId,
      });

      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todos os registros do localStorage.
   * @returns {array}
   */
  _getAllRecords() {
    try {
      const key = window.PROJECTORS_CONFIG.storage.prefix + window.PROJECTORS_CONFIG.storage.maintenanceKey;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Salva todos os registros no localStorage.
   * @param {array} records
   */
  _saveAllRecords(records) {
    try {
      const key = window.PROJECTORS_CONFIG.storage.prefix + window.PROJECTORS_CONFIG.storage.maintenanceKey;
      // Limitar tamanho
      const max = window.PROJECTORS_CONFIG.storage.maxHistoryRecords;
      const trimmed = records.slice(0, max);
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[ProjectorsMaintenance] Erro ao salvar registros:', e);
    }
  },

  /**
   * Adiciona um registro ao histórico.
   * @param {number} glpiId
   * @param {object} record
   */
  _addRecord(glpiId, record) {
    const all = this._getAllRecords();
    all.push(record);
    this._saveAllRecords(all);
  },

  /**
   * Atualiza metadados do projetor baseado no tipo de manutenção.
   * @param {number} glpiId
   * @param {object} record
   */
  _updateProjectorMeta(glpiId, record) {
    const updates = {};
    const today = record.date || new Date().toISOString().slice(0, 10);

    switch (record.type) {
      case 'limpeza':
        updates.ultima_limpeza = today;
        break;
      case 'manutencao':
      case 'reparo':
        updates.ultima_manutencao = today;
        break;
      case 'observacao':
        // Observações não alteram metadados
        break;
    }

    // Atualizar horas se informadas
    if (record.hoursAtMaintenance > 0) {
      updates.horas_lampada = record.hoursAtMaintenance;
    }

    if (Object.keys(updates).length > 0) {
      window.Projectors.updateProjector(glpiId, updates);
    }
  },

  /**
   * Valida um registro.
   * @param {object} record
   * @returns {{ ok: boolean, error?: string }}
   */
  _validate(record) {
    if (!record.date) {
      return { ok: false, error: 'Data não informada.' };
    }

    const date = new Date(record.date);
    if (isNaN(date.getTime())) {
      return { ok: false, error: 'Data inválida.' };
    }

    if (date > new Date()) {
      return { ok: false, error: 'Data não pode ser no futuro.' };
    }

    return { ok: true };
  },

  /**
   * Gera ID único para registro.
   * @returns {string}
   */
  _generateId() {
    return `mt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  },

  // ── Eventos ──────────────────────────────────────────────────────────────

  _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  },
};
