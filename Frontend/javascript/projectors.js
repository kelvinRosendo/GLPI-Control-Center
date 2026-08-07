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
   * Carrega e processa dados dos projetores.
   * @returns {{ ok: boolean, error?: string }}
   */
  async load() {
    if (this._state.loading) return { ok: true };

    this._state.loading = true;
    this._state.error = '';

    try {
      // 1. Garantir dados base do GLPI
      await this._ensureData();

      // 2. Carregar detalhes salvos em localStorage
      const savedDetails = this._loadSavedDetails();

      // 3. Enriquecer projetores com dados salvos
      const enriched = this._enrichProjectors(savedDetails);

      // 4. Calcular status automático para cada projetor
      const withStatus = enriched.map(p => ({
        ...p,
        calculatedStatus: this._calculateStatus(p),
      }));

      // 5. Calcular indicadores gerais
      this._state.indicators = this._calculateIndicators(withStatus);

      // 6. Calcular alertas
      this._state.alerts = this._calculateAlerts(withStatus);

      // 7. Armazenar
      this._state.projectors = withStatus;
      this._state.loaded = true;
      this._state.loadedAt = new Date().toISOString();

      // 8. Emitir evento
      this._emit('projectors:loaded', {
        count: withStatus.length,
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
        // Pode falhar — tentar usar dados existentes
      }
    }
  },

  /**
   * Carrega detalhes salvos do localStorage.
   * @returns {object} Map de glpiId -> details
   */
  _loadSavedDetails() {
    const now = Date.now();
    const ttl = window.PROJECTORS_CONFIG.storage;

    // Usar cache se válido (5 min)
    if (this._cache.details && (now - this._cache.timestamp) < 300000) {
      return this._cache.details;
    }

    try {
      const key = window.PROJECTORS_CONFIG.storage.prefix + window.PROJECTORS_CONFIG.storage.detailsKey;
      const raw = localStorage.getItem(key);
      const details = raw ? JSON.parse(raw) : {};
      this._cache.details = details;
      this._cache.timestamp = now;
      return details;
    } catch {
      return {};
    }
  },

  /**
   * Salva detalhes de um projetor no localStorage.
   * @param {number} glpiId
   * @param {object} details
   */
  _saveDetails(glpiId, details) {
    try {
      const all = this._loadSavedDetails();
      all[glpiId] = { ...(all[glpiId] || {}), ...details, _updatedAt: new Date().toISOString() };
      const key = window.PROJECTORS_CONFIG.storage.prefix + window.PROJECTORS_CONFIG.storage.detailsKey;
      localStorage.setItem(key, JSON.stringify(all));
      this._cache.details = all;
      this._cache.timestamp = Date.now();
    } catch (e) {
      console.warn('[Projectors] Erro ao salvar detalhes:', e);
    }
  },

  /**
   * Enriquece dados do GLPI com informações salvas.
   * @param {object} savedDetails
   * @returns {array}
   */
  _enrichProjectors(savedDetails) {
    const glpiData = window.DATA.projetores || [];

    return glpiData.map(p => {
      const saved = savedDetails[p.glpiId] || {};
      return {
        ...p,
        // Campos do GLPI (já existentes)
        nome: p.nome || '',
        serial: p.serial || '',
        patrimonio: p.patrimonio || '',
        modelo: p.modelo || '',
        reparticao: p.reparticao || '',
        status: p.status || 'ativo',
        // Campos salvos localmente
        data_aquisicao: saved.data_aquisicao || '',
        fabricante: saved.fabricante || '',
        horas_lampada: Number(saved.horas_lampada) || 0,
        vida_util_estimada: Number(saved.vida_util_estimada) || window.PROJECTORS_CONFIG.lamp.lifeHours,
        data_troca_lampada: saved.data_troca_lampada || '',
        ultima_manutencao: saved.ultima_manutencao || '',
        ultima_limpeza: saved.ultima_limpeza || '',
        horas_totais: Number(saved.horas_totais) || 0,
        // Metadados
        _hasLocalData: !!saved._updatedAt,
        _updatedAt: saved._updatedAt || null,
      };
    });
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

  // ══════════════════════════════════════════════════════════════════════════
  // ATUALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Atualiza detalhes de um projetor.
   * @param {number} glpiId
   * @param {object} updates
   * @returns {{ ok: boolean }}
   */
  updateProjector(glpiId, updates) {
    try {
      this._saveDetails(glpiId, updates);
      this._cache = { details: null, timestamp: 0 };
      this.recalculate();
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

      // Despertar evento de notificação para manutenção
      if (window.NotificationEvents && updates.maintenanceDate) {
        window.NotificationEvents.dispatchProjector('maint_done', {
          id: glpiId,
          nome: `Projetor #${glpiId}`,
          usuario: window.UserContext?.getCurrentUser()?.nome || 'Sistema',
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

  // ── Eventos ──────────────────────────────────────────────────────────────

  _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  },
};
