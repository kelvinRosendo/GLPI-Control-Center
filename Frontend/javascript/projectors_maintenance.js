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
   * Registra uma manutencao para um projetor via backend API.
   * @param {number} glpiId
   * @param {object} maintenanceData
   * @returns {{ ok: boolean, record?: object, error?: string }}
   */
  async register(glpiId, maintenanceData) {
    if (!glpiId) {
      return { ok: false, error: 'ID do projetor nao informado.' };
    }

    const config = window.PROJECTORS_CONFIG;
    const typeConfig = config.getMaintenanceType(maintenanceData.type);
    if (!typeConfig) {
      return { ok: false, error: `Tipo de manutencao '${maintenanceData.type}' invalido.` };
    }

    try {
      // Enviar para o backend
      const result = await window.GlpiClient.registerProjectorMaintenance(glpiId, {
        tipo: maintenanceData.type,
        data: maintenanceData.date || new Date().toISOString().slice(0, 10),
        responsavel: maintenanceData.responsible || '',
        descricao: maintenanceData.description || '',
        horas_lampada_registradas: Number(maintenanceData.hoursAtMaintenance) || 0,
      });

      // Recarregar dados dos projetores
      await window.Projectors.load();

      // Emitir evento
      this._emit('projectors:maintenance:registered', {
        glpiId,
        record: result.record,
      });

      // Registrar auditoria global
      if (window.Audit) {
        window.Audit.register({
          action: 'manutencao_registrada',
          module: 'projectors',
          descricao: `${typeConfig.label} registrada para projetor #${glpiId}: ${maintenanceData.description || 'Sem descricao'}`,
          equipamento: `Projetor #${glpiId}`,
        });
      }

      return { ok: true, record: result.record };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * Registra uma troca de lampada (atalho).
   * @param {number} glpiId
   * @param {object} data
   * @returns {{ ok: boolean, record?: object, error?: string }}
   */
  async registerLampReplacement(glpiId, data = {}) {
    return this.register(glpiId, {
      type: 'lampada',
      description: data.description || 'Troca de lampada realizada',
      responsible: data.responsible || '',
      hoursAtMaintenance: 0,
      date: data.date,
    });
  },

  /**
   * Registra uma limpeza (atalho).
   * @param {number} glpiId
   * @param {object} data
   * @returns {{ ok: boolean, record?: object, error?: string }}
   */
  async registerCleaning(glpiId, data = {}) {
    return this.register(glpiId, {
      type: 'limpeza',
      description: data.description || 'Limpeza realizada',
      responsible: data.responsible || '',
      date: data.date,
    });
  },

  /**
   * Registra uma manutencao geral (atalho).
   * @param {number} glpiId
   * @param {object} data
   * @returns {{ ok: boolean, record?: object, error?: string }}
   */
  async registerGeneralMaintenance(glpiId, data = {}) {
    return this.register(glpiId, {
      type: 'manutencao',
      description: data.description || 'Manutencao geral realizada',
      responsible: data.responsible || '',
      date: data.date,
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HISTÓRICO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna historico de manutencoes de um projetor via backend API.
   * @param {number} glpiId
   * @returns {array}
   */
  async getHistory(glpiId) {
    try {
      const records = await window.GlpiClient.fetchProjectorHistory(glpiId);
      return records;
    } catch {
      return [];
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNOS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Eventos ──────────────────────────────────────────────────────────────

  _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  },
};
