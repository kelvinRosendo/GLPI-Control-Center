/**
 * GLPI Control Center - integration-engine.js
 * -----------------------------------------------------------------------------
 * Motor de integrações do Workflow Wizard.
 *
 * Responsabilidades:
 * - Localizar integração a partir da config
 * - Validar configuração antes de iniciar
 * - Iniciar integração (start)
 * - Executar ações (executeAction)
 * - Emitir eventos CustomEvent (integration:start, success, error, cancel)
 * - Registrar auditoria via IntegrationAudit
 *
 * Eventos emitidos:
 *   integration:start   — integração inicializada com sucesso
 *   integration:success — ação executada com sucesso
 *   integration:error   — falha na execução da ação
 *   integration:cancel  — integração cancelada pelo usuário
 *
 * Sprint 3: Engine completa com Configuration Driven Design
 * Sprint 4: PortalViewer consumirá IntegrationEngine.start()
 *
 * NÃO contém regra de negócio do workflow. Consulte workflow.js.
 * NÃO contém dados de fornecedor. Consulte integrations.config.js.
 * NÃO renderiza DOM. Consulte workflow_ui.js.
 */

window.IntegrationEngine = {
  // ── Estado do Engine ──────────────────────────────────────────────────────

  _state: {
    initialized: false,
    integrationKey: null,
    integrationConfig: null,
    workflowData: null,
    actionsExecuted: [],
    events: [],
    startedAt: null,
  },

  // ── Ciclo de Vida ────────────────────────────────────────────────────────

  /**
   * Localiza, valida e inicia a integração.
   *
   * Fluxo interno:
   *   1. Localizar integração em INTEGRATIONS_CONFIG
   *   2. Validar configuração (campos obrigatórios)
   *   3. Inicializar estado
   *   4. Emitir integration:start
   *
   * @param {string} integrationKey - chave da integração (torino, hbb, etc.)
   * @param {object} workflowData - dados do workflow (asset, checklist, etc.)
   * @returns {{ ok: boolean, config?: object, error?: string }}
   */
  start(integrationKey, workflowData) {
    // 1. Localizar integração
    const config = this._localizarIntegracao(integrationKey);
    if (!config) {
      const error = `Integração não encontrada: ${integrationKey}`;
      this._emit('integration:error', { integrationKey, error });
      return { ok: false, error };
    }

    // 2. Validar configuração
    const validation = this._validarConfiguracao(config);
    if (!validation.valid) {
      const error = `Configuração inválida: ${validation.errors.join(', ')}`;
      this._emit('integration:error', { integrationKey, error, errors: validation.errors });
      return { ok: false, error };
    }

    // 3. Inicializar estado
    this._state = {
      initialized: true,
      integrationKey,
      integrationConfig: config,
      workflowData: { ...workflowData },
      actionsExecuted: [],
      events: [],
      startedAt: new Date().toISOString(),
    };

    // 4. Emitir integration:start
    this._emit('integration:start', {
      integrationKey,
      nome: config.nome,
      tipo: config.tipo,
      timestamp: this._state.startedAt,
    });

    return { ok: true, config };
  },

  /**
   * Cancela a integração em andamento.
   * Emite integration:cancel.
   */
  cancel() {
    if (!this._state.initialized) return;

    this._emit('integration:cancel', {
      integrationKey: this._state.integrationKey,
      actionsExecuted: this._state.actionsExecuted.length,
      timestamp: new Date().toISOString(),
    });

    this.reset();
  },

  // ── Execução de Ações ────────────────────────────────────────────────────

  /**
   * Localiza, valida e executa uma ação da integração.
   *
   * Fluxo interno:
   *   1. Verificar se engine está inicializado
   *   2. Preparar dados do asset para template
   *   3. Delegar execução para AssistanceFlows
   *   4. Registrar auditoria
   *   5. Emitir integration:success ou integration:error
   *
   * @param {string} actionId - ID da ação
   * @returns {{ ok: boolean, type?: string, auditEvent?: string, error?: string }}
   */
  executeAction(actionId) {
    // 1. Verificar inicialização
    if (!this._state.initialized) {
      return { ok: false, error: 'Engine não inicializado. Chame start() primeiro.' };
    }

    const { integrationKey, workflowData } = this._state;

    // 2. Preparar dados do asset
    const assetData = window.AssistanceFlows.prepareAssetData(
      workflowData.asset,
      workflowData.checklist,
      workflowData.observations,
      integrationKey
    );

    // 3. Delegar execução
    const result = window.AssistanceFlows.executeAction(integrationKey, actionId, assetData);

    const timestamp = new Date().toISOString();

    if (result.ok) {
      // 4a. Registrar sucesso
      const record = {
        actionId,
        type: result.type,
        auditEvent: result.auditEvent,
        data: result.data,
        resultado: 'sucesso',
        timestamp,
      };

      this._state.actionsExecuted.push(record);

      // 5a. Emitir integration:success
      this._emit('integration:success', {
        integrationKey,
        actionId,
        type: result.type,
        auditEvent: result.auditEvent,
        timestamp,
      });

      // 6. Registrar auditoria
      this._registrarAuditoria(record);
    } else {
      // 4b. Emitir integration:error
      this._emit('integration:error', {
        integrationKey,
        actionId,
        error: result.error,
        resultado: 'falha',
        timestamp,
      });
    }

    return result;
  },

  // ── Localização e Validação ──────────────────────────────────────────────

  /**
   * Localiza integração em INTEGRATIONS_CONFIG.
   * @param {string} key
   * @returns {object|null}
   */
  _localizarIntegracao(key) {
    return window.INTEGRATIONS_CONFIG?.getIntegration(key) || null;
  },

  /**
   * Valida se a configuração possui campos obrigatórios.
   * @param {object} config
   * @returns {{ valid: boolean, errors: string[] }}
   */
  _validarConfiguracao(config) {
    const errors = [];

    if (!config.key) errors.push('key é obrigatório');
    if (!config.nome) errors.push('nome é obrigatório');
    if (!config.tipo) errors.push('tipo é obrigatório');
    if (!Array.isArray(config.acoes)) errors.push('acoes deve ser um array');
    if (!Array.isArray(config.instrucoes)) errors.push('instrucoes deve ser um array');

    return { valid: errors.length === 0, errors };
  },

  // ── Auditoria ────────────────────────────────────────────────────────────

  /**
   * Registra ação no sistema de auditoria.
   * @param {object} record
   */
  _registrarAuditoria(record) {
    const { workflowData } = this._state;

    window.IntegrationAudit?.recordAction({
      integrationKey: this._state.integrationKey,
      fornecedor: this._state.integrationConfig?.nome || '',
      usuario: workflowData?.usuario || 'sistema',
      equipamento: {
        nome: workflowData?.asset?.nome || '',
        patrimonio: workflowData?.asset?.patrimonio || '',
        serial: workflowData?.asset?.serial || '',
        glpiId: workflowData?.asset?.glpiId || null,
      },
      acao: record.actionId,
      resultado: record.resultado || 'sucesso',
      auditEvent: record.auditEvent,
      timestamp: record.timestamp,
      data: record.data,
    });
  },

  // ── Eventos (CustomEvent) ────────────────────────────────────────────────

  /**
   * Emite um CustomEvent no document.
   * Módulos comunicam-se apenas através destes eventos.
   *
   * Eventos disponíveis:
   *   integration:start   — integração iniciada
   *   integration:success — ação executada com sucesso
   *   integration:error   — falha na execução
   *   integration:cancel  — integração cancelada
   *
   * @param {string} eventName
   * @param {object} detail
   */
  _emit(eventName, detail) {
    const eventDetail = {
      engine: 'integration',
      ...detail,
    };

    this._state.events.push({
      name: eventName,
      detail: eventDetail,
      timestamp: new Date().toISOString(),
    });

    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail: eventDetail }));
    }
  },

  // ── Getters ──────────────────────────────────────────────────────────────

  getState() {
    return { ...this._state };
  },

  getActionsExecuted() {
    return [...this._state.actionsExecuted];
  },

  getEvents() {
    return [...this._state.events];
  },

  isInitialized() {
    return this._state.initialized;
  },

  getIntegrationKey() {
    return this._state.integrationKey;
  },

  getIntegrationConfig() {
    return this._state.integrationConfig ? { ...this._state.integrationConfig } : null;
  },

  getSummary() {
    if (!this._state.initialized) return null;

    return {
      integrationKey: this._state.integrationKey,
      integrationName: this._state.integrationConfig?.nome || this._state.integrationKey,
      tipo: this._state.integrationConfig?.tipo || 'unknown',
      status: this._state.integrationConfig?.status || 'unknown',
      actionsExecuted: this._state.actionsExecuted.length,
      events: this._state.events.length,
      startedAt: this._state.startedAt,
    };
  },

  // ── Reset ────────────────────────────────────────────────────────────────

  reset() {
    this._state = {
      initialized: false,
      integrationKey: null,
      integrationConfig: null,
      workflowData: null,
      actionsExecuted: [],
      events: [],
      startedAt: null,
    };
  },
};
