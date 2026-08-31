/**
 * GLPI Control Center - projectors.js
 * -----------------------------------------------------------------------------
 * Módulo de dados e lógica de negócio da Gestão de Projetores.
 *
 * Responsabilidades:
 * - Carregar dados dos projetores (reutiliza GlpiClient)
 * - Enriquecer dados com informações salvas em localStorage
 * - Calcular vida útil da lâmpada
 * - Calcular alertas automáticos
 * - Determinar status automaticamente
 * - Gerenciar estado do módulo
 * - Emitir eventos CustomEvent
 *
 * NÃO renderiza HTML. Consulte projectors_ui.js.
 * NÃO registra manutenções. Consulte projectors_maintenance.js.
 *
 * Sprint 8: Módulo de Gestão de Projetores
 */

window.Projectors = {

  // ── Estado ───────────────────────────────────────────────────────────────

  _state: {
    loaded: false,
    loading: false,
    error: '',
    projectors: [],
    indicators: {},
    alerts: [],
    selectedId: null,
    loadedAt: null,
  },

  // ── Cache ────────────────────────────────────────────────────────────────

  _cache: {
    details: null,
    timestamp: 0,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CICLO DE VIDA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Carrega e processa dados dos projetores via backend API.
   * @returns {{ ok: boolean, error?: string }}
   */
   async load() {
    if (this._state.loading) return { ok: true };

    this._state.loading = true;
    this._state.error = '';

    try {
      // 1. Tentar buscar dados enriquecidos do backend
      let projectors = [];
      let indicators = {};

      try {
        const response = await window.GlpiClient.fetchProjectorsEnriched();
        if (response && response.data) {
          projectors = response.data.map(p => {
            const savedData = {
              horas_lampada: p.horas_lampada,
              vida_util_estimada: p.vida_util_estimada,
            };
            const parsed = window.ProjectorsParser.parse(p.comentario || '', savedData);
            return {
              ...p,
              calculatedStatus: p.status_calculado || 'operando',
              parsedData: parsed,
              horas_lampada: parsed.currentLampHours > 0 ? parsed.currentLampHours : (p.horas_lampada || 0),
              horas_lampada_source: parsed.hoursSource,
              horas_lampada_confidence: parsed.confidence,
              horas_lampada_date: parsed.lastHoursDate,
              lamp_replacement_date: parsed.lastLampReplacement,
              notices: parsed.notices,
              hourRecords: parsed.hourRecords,
              rawComment: parsed.rawComment,
            };
          });
          // As horas podem vir do Nome alternativo de usuario e sao normalizadas
          // durante o mapeamento acima. Recalcular evita usar os indicadores do
          // backend produzidos antes dessa normalizacao.
          indicators = this._calculateIndicators(projectors);
        }
      } catch (enrichedErr) {
        console.warn('[Projectors] API enriquecida falhou, tentando dados basicos:', enrichedErr.message);
        // Fallback: usar dados basicos do DATA
        const basicData = window.DATA?.projetores || [];
        if (basicData.length > 0) {
          projectors = basicData.map(p => ({
            ...p,
            calculatedStatus: p.status || 'operando',
            horas_lampada: p.horas_lampada || 0,
            vida_util_estimada: p.vida_util_estimada || 3000,
            ultima_manutencao: p.ultima_manutencao || '',
            ultima_limpeza: p.ultima_limpeza || '',
          }));
          indicators = this._calculateIndicators(projectors);
        } else {
          throw new Error('Nenhum projetor encontrado. Verifique se ha projetores cadastrados no GLPI com nome comecando por "Projetor".');
        }
      }

      // 2. Calcular alertas para o frontend
      this._state.alerts = this._calculateAlerts(projectors);

      // 3. Dispatchar eventos de notificação para o centro de notificações
      this._dispatchProjectorAlerts();

      // 3. Armazenar
      this._state.projectors = projectors;
      this._state.indicators = indicators;
      this._state.loaded = true;
      this._state.loadedAt = new Date().toISOString();

      // 4. Emitir evento
      this._emit('projectors:loaded', {
        count: projectors.length,
        indicators: this._state.indicators,
        alerts: this._state.alerts,
      });

      this._state.loading = false;
      return { ok: true };

    } catch (err) {
      this._state.loading = false;
      this._state.error = err.message || 'Erro ao carregar projetores.';
      this._emit('projectors:error', { error: this._state.error });
      return { ok: false, error: this._state.error };
    }
  },

  /**
   * Força recálculo dos indicadores.
   */
  recalculate() {
    if (!this._state.loaded) return;

    const savedDetails = this._loadSavedDetails();
    const enriched = this._enrichProjectors(savedDetails);
    const withStatus = enriched.map(p => ({
      ...p,
      calculatedStatus: this._calculateStatus(p),
    }));

    this._state.indicators = this._calculateIndicators(withStatus);
    this._state.alerts = this._calculateAlerts(withStatus);
    this._state.projectors = withStatus;
    this._state.loadedAt = new Date().toISOString();

    this._emit('projectors:recalculated', {
      indicators: this._state.indicators,
      alerts: this._state.alerts,
    });
  },

  /**
   * Reseta o estado do módulo.
   */
  reset() {
    this._state = {
      loaded: false,
      loading: false,
      error: '',
      projectors: [],
      indicators: {},
      alerts: [],
      selectedId: null,
      loadedAt: null,
    };
    this._cache = { details: null, timestamp: 0 };
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DADOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Garante que window.DATA possui dados de projetores.
   */
  async _ensureData() {
    const D = window.DATA;
    if (!D.projetores?.length) {
      try {
        await window.GlpiClient.loadAll();
      } catch {
        // Pode falhar - tentar usar dados existentes
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CÁLCULOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Calcula o status automático de um projetor.
   * @param {object} projector
   * @returns {string} Chave do status
   */
  _calculateStatus(projector) {
    // Se o GLPI diz que está em manutenção, respeitar
    if (projector.status === 'manutencao') return 'manutencao';

    // Calcular baseado em alertas
    const config = window.PROJECTORS_CONFIG;
    const alerts = [];

    // Verificar lâmpada
    if (projector.horas_lampada > 0 && projector.vida_util_estimada > 0) {
      const percentage = (projector.horas_lampada / projector.vida_util_estimada) * 100;
      if (percentage >= config.lamp.criticalPercentage) {
        alerts.push('lampada_critica');
      } else if (percentage >= config.lamp.warningPercentage) {
        alerts.push('lampada_aviso');
      }
    }

    // Verificar manutenção
    if (projector.ultima_manutencao) {
      const daysSince = this._daysSince(projector.ultima_manutencao);
      if (daysSince > config.maintenance.intervalDays) {
        alerts.push('manutencao_atrasada');
      }
    }

    // Verificar limpeza
    if (projector.ultima_limpeza) {
      const daysSince = this._daysSince(projector.ultima_limpeza);
      if (daysSince > config.maintenance.cleaningIntervalDays) {
        alerts.push('limpeza_necessaria');
      }
    }

    // Determinar status
    if (alerts.includes('lampada_critica') || alerts.includes('manutencao_atrasada')) {
      return 'atencao';
    }
    if (alerts.length > 0) return 'atencao';

    return 'operando';
  },

  /**
   * Calcula indicadores gerais dos projetores.
   * @param {array} projectors
   * @returns {object}
   */
  _calculateIndicators(projectors) {
    const config = window.PROJECTORS_CONFIG;
    const total = projectors.length;

    const operando = projectors.filter(p => p.calculatedStatus === 'operando').length;
    const atencao = projectors.filter(p => p.calculatedStatus === 'atencao').length;
    const manutencao = projectors.filter(p => p.calculatedStatus === 'manutencao').length;
    const fora_de_uso = projectors.filter(p => p.calculatedStatus === 'fora_de_uso').length;

    // Lâmpadas próximas do limite
    const lampWarning = projectors.filter(p => {
      if (p.horas_lampada <= 0 || p.vida_util_estimada <= 0) return false;
      const pct = (p.horas_lampada / p.vida_util_estimada) * 100;
      return pct >= config.lamp.warningPercentage;
    }).length;

    // Média de horas
    const totalHoras = projectors.reduce((sum, p) => sum + (p.horas_lampada || 0), 0);
    const mediaHoras = total > 0 ? Math.round(totalHoras / total) : 0;

    // Percentual médio de vida útil
    const mediaVidaUtil = projectors.reduce((sum, p) => {
      if (p.vida_util_estimada > 0) {
        return sum + ((p.horas_lampada / p.vida_util_estimada) * 100);
      }
      return sum;
    }, 0);
    const percentualMedio = total > 0 ? Math.round(mediaVidaUtil / total) : 0;

    return {
      total,
      operando,
      atencao,
      manutencao,
      fora_de_uso,
      lampWarning,
      mediaHoras,
      percentualMedio,
    };
  },

  /**
   * Calcula alertas ativos.
   * @param {array} projectors
   * @returns {array}
   */
  _calculateAlerts(projectors) {
    const config = window.PROJECTORS_CONFIG;
    const alerts = [];

    projectors.forEach(p => {
      const pAlerts = [];

      // Lâmpada crítica
      if (p.horas_lampada > 0 && p.vida_util_estimada > 0) {
        const pct = (p.horas_lampada / p.vida_util_estimada) * 100;
        if (pct >= config.lamp.criticalPercentage) {
          pAlerts.push({
            type: 'lampada_critica',
            severity: 'critical',
            message: `Lâmpada em ${Math.round(pct)}% da vida útil`,
          });
        } else if (pct >= config.lamp.warningPercentage) {
          pAlerts.push({
            type: 'lampada_aviso',
            severity: 'warning',
            message: `Lâmpada em ${Math.round(pct)}% da vida útil`,
          });
        }
      }

      // Manutenção atrasada
      if (p.ultima_manutencao) {
        const days = this._daysSince(p.ultima_manutencao);
        if (days > config.maintenance.intervalDays) {
          pAlerts.push({
            type: 'manutencao_atrasada',
            severity: days > config.maintenance.intervalDays * 2 ? 'critical' : 'warning',
            message: `Manutenção atrasada há ${days} dias`,
          });
        } else if (days > config.maintenance.intervalDays - config.maintenance.warningDaysBefore) {
          pAlerts.push({
            type: 'manutencao_proxima',
            severity: 'info',
            message: `Manutenção vence em ${config.maintenance.intervalDays - days} dias`,
          });
        }
      }

      // Limpeza recomendada
      if (p.ultima_limpeza) {
        const days = this._daysSince(p.ultima_limpeza);
        if (days > config.maintenance.cleaningIntervalDays) {
          pAlerts.push({
            type: 'limpeza_necessaria',
            severity: days > config.maintenance.cleaningIntervalDays * 2 ? 'critical' : 'warning',
            message: `Limpeza necessária há ${days} dias`,
          });
        }
      }

      // Equipamento parado
      if (p.horas_lampada === 0 && p.horas_totais === 0 && !p.ultima_manutencao && !p.data_aquisicao) {
        pAlerts.push({
          type: 'sem_dados',
          severity: 'info',
          message: 'Sem dados de uso registrados',
        });
      }

      if (pAlerts.length > 0) {
        alerts.push({
          projector: p,
          alerts: pAlerts,
          highestSeverity: this._highestSeverity(pAlerts),
        });
      }
    });

    // Ordenar por severidade
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.highestSeverity] - severityOrder[b.highestSeverity]);
return alerts;
  },

  /**
   * Dispatcha eventos de notificação para o centro de notificações
   * baseado nos alertas calculados dos projetores.
   * @private
   */
  _dispatchProjectorAlerts() {
    const alerts = this._state.alerts;

    // Dispatchar eventos por severidade e tipo
    alerts.forEach(alert => {
      const { projector, alerts: alertDetails, highestSeverity } = alert;

      let eventKey, config;

      switch (highestSeverity) {
        case 'critical':
          if (alertDetails.some(a => a.type === 'lampada_critica')) {
            eventKey = 'PROJECTOR_LAMP_CRITICAL';
            config = window.NOTIFICATIONS_CONFIG.getEventConfig(eventKey);
          } else if (alertDetails.some(a => a.type === 'manutencao_atrasada')) {
            eventKey = 'PROJECTOR_MAINT_OVERDUE';
            config = window.NOTIFICATIONS_CONFIG.getEventConfig(eventKey);
          }
          break;
        case 'warning':
          if (alertDetails.some(a => a.type === 'lampada_aviso')) {
            eventKey = 'PROJECTOR_LAMP_HIGH';
            config = window.NOTIFICATIONS_CONFIG.getEventConfig(eventKey);
          } else if (alertDetails.some(a => a.type === 'manutencao_atrasada') || alertDetails.some(a => a.type === 'limpeza_necessaria')) {
            eventKey = 'PROJECTOR_MAINT_OVERDUE';
            config = window.NOTIFICATIONS_CONFIG.getEventConfig(eventKey);
          }
          break;
        case 'info':
          if (alertDetails.some(a => a.type === 'manutencao_proxima')) {
            eventKey = 'PROJECTOR_MAINT_DONE';
            config = window.NOTIFICATIONS_CONFIG.getEventConfig(eventKey);
          }
          break;
      }

      if (eventKey && config) {
        window.NotificationEvents.dispatchProjector(eventKey, {
          glpiId: projector.glpiId,
          nome: projector.nome,
          patrimonio: projector.patrimonio,
          tipo: highestSeverity,
          percentualUso: projector.percentual_uso,
        });
      }
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ATUALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Atualiza detalhes de um projetor via backend API.
   * @param {number} glpiId
   * @param {object} updates
   * @returns {{ ok: boolean }}
   */
  async updateProjector(glpiId, updates) {
    try {
      // Enviar atualizacao de lampada para o backend
      if (updates.horas_lampada !== undefined || updates.vida_util_estimada !== undefined) {
        await window.GlpiClient.updateProjectorLamp(glpiId, {
          horas_lampada: updates.horas_lampada,
          vida_util_estimada: updates.vida_util_estimada,
        });
      }

      // Recarregar dados
      await this.load();

      this._emit('projectors:updated', { glpiId, updates });

      if (window.Audit) {
        window.Audit.register({
          action: 'projetor_atualizado',
          module: 'projectors',
          descricao: `Projetor #${glpiId} atualizado`,
          equipamento: `Projetor #${glpiId}`,
          dados: updates,
        });
      }

      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * Retorna detalhes de um projetor específico.
   * @param {number} glpiId
   * @returns {object|null}
   */
  getProjector(glpiId) {
    return this._state.projectors.find(p => p.glpiId === glpiId) || null;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Calcula dias desde uma data.
   * @param {string} dateStr
   * @returns {number}
   */
  _daysSince(dateStr) {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  },

  /**
   * Retorna a maior severidade de uma lista de alertas.
   * @param {array} alerts
   * @returns {string}
   */
  _highestSeverity(alerts) {
    if (alerts.some(a => a.severity === 'critical')) return 'critical';
    if (alerts.some(a => a.severity === 'warning')) return 'warning';
    return 'info';
  },

  /**
   * Calcula o percentual de vida útil da lâmpada.
   * @param {object} projector
   * @returns {number} 0-100
   */
  getLampPercentage(projector) {
    if (!projector || projector.horas_lampada <= 0 || projector.vida_util_estimada <= 0) return 0;
    return Math.min(100, Math.round((projector.horas_lampada / projector.vida_util_estimada) * 100));
  },

  /**
   * Calcula horas restantes da lâmpada.
   * @param {object} projector
   * @returns {number}
   */
  getLampRemaining(projector) {
    if (!projector) return 0;
    return Math.max(0, projector.vida_util_estimada - projector.horas_lampada);
  },

  /**
   * Retorna a cor baseada no percentual de vida útil.
   * @param {number} percentage
   * @returns {string} CSS color
   */
  getLampColor(percentage) {
    const config = window.PROJECTORS_CONFIG;
    if (percentage >= config.lamp.criticalPercentage) return '#ff5555';
    if (percentage >= config.lamp.warningPercentage) return '#ffc107';
    return '#00c896';
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GETTERS PÚBLICOS
  // ══════════════════════════════════════════════════════════════════════════

  getProjectors() {
    return [...this._state.projectors];
  },

  getIndicators() {
    return { ...this._state.indicators };
  },

  getAlerts() {
    return [...this._state.alerts];
  },

  getSelectedId() {
    return this._state.selectedId;
  },

  setSelectedId(id) {
    this._state.selectedId = id;
  },

  getState() {
    return { ...this._state };
  },

  isLoaded() {
    return this._state.loaded;
  },

  isLoading() {
    return this._state.loading;
  },

  getError() {
    return this._state.error;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // AVISOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todos os avisos de todos os projetores, ordenados por data (recente primeiro).
   * @param {object} filters - { type, severity, projectorId, dateFrom, dateTo, search }
   * @returns {array}
   */
  getAllNotices(filters) {
    filters = filters || {};
    var all = [];

    this._state.projectors.forEach(function (p) {
      var notices = p.notices || [];
      notices.forEach(function (n) {
        all.push({
          projectorId: p.glpiId,
          projectorName: p.nome,
          projectorSerial: p.serial,
          projectorModel: p.modelo,
          projectorLocation: p.reparticao,
          type: n.type,
          severity: n.severity,
          date: n.date,
          message: n.message,
          rawText: n.rawText,
          lampHours: p.horas_lampada || 0,
          lampLifeHours: p.vida_util_estimada || 0,
          lampPercentage: window.ProjectorsParser.calculateLampPercentage(
            p.horas_lampada || 0, p.vida_util_estimada || 0
          ),
        });
      });
    });

    // Filtros
    if (filters.type) {
      all = all.filter(function (n) { return n.type === filters.type; });
    }
    if (filters.severity) {
      all = all.filter(function (n) { return n.severity === filters.severity; });
    }
    if (filters.projectorId) {
      all = all.filter(function (n) { return n.projectorId === filters.projectorId; });
    }
    if (filters.dateFrom) {
      all = all.filter(function (n) { return n.date && n.date >= filters.dateFrom; });
    }
    if (filters.dateTo) {
      all = all.filter(function (n) { return n.date && n.date <= filters.dateTo; });
    }
    if (filters.search) {
      var q = filters.search.toLowerCase();
      all = all.filter(function (n) {
        return (n.message || '').toLowerCase().indexOf(q) !== -1 ||
               (n.rawText || '').toLowerCase().indexOf(q) !== -1 ||
               (n.projectorName || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    // Ordenar por data (recente primeiro), sem data no final
    all.sort(function (a, b) {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

    return all;
  },

  /**
   * Retorna resumo dos avisos.
   * @returns {object}
   */
  getNoticesSummary() {
    var all = this.getAllNotices();
    var types = {};
    var severities = {};

    all.forEach(function (n) {
      types[n.type] = (types[n.type] || 0) + 1;
      severities[n.severity] = (severities[n.severity] || 0) + 1;
    });

    return {
      total: all.length,
      byType: types,
      bySeverity: severities,
      projectorCount: new Set(all.map(function (n) { return n.projectorId; })).size,
    };
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DADOS DO PROJETOR COM PARSER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna dados do projetor com informações do parser.
   * @param {number} glpiId
   * @returns {object|null}
   */
  getProjectorDetail(glpiId) {
    var p = this.getProjector(glpiId);
    if (!p) return null;

    var config = window.PROJECTORS_CONFIG;
    var parser = window.ProjectorsParser;

    var lampPct = parser.calculateLampPercentage(
      p.horas_lampada || 0,
      p.vida_util_estimada || config.lamp.lifeHours
    );

    return {
      ...p,
      lampPercentage: lampPct,
      lampSeverity: parser.getLampSeverity(lampPct),
      lampRemaining: Math.max(0, (p.vida_util_estimada || config.lamp.lifeHours) - (p.horas_lampada || 0)),
      confidence: p.horas_lampada_confidence || parser.CONFIDENCE.NOT_FOUND,
      hoursSource: p.horas_lampada_source || 'nenhum',
      lastHoursDate: p.horas_lampada_date || null,
      lastLampReplacement: p.lamp_replacement_date || null,
      needsReview: p.parsedData ? p.parsedData.needsReview : false,
    };
  },

  // ── Eventos ──────────────────────────────────────────────────────────────

  _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  },
};
