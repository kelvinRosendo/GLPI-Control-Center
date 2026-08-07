/**
 * GLPI Control Center - workflow.js
 * -----------------------------------------------------------------------------
 * Máquina de estados e regra de negócio do Workflow Wizard.
 *
 * Responsabilidades:
 * - Controlar transições de etapa (state machine)
 * - Validar dados por etapa
 * - Montar o payload final para o backend
 * - Gerenciar o ciclo de vida do workflow (open → steps → submit → done)
 *
 * Sprint 2: Nova etapa "Fluxo da Assistência" (step 5)
 * Sprint 3: Integrações delegadas para IntegrationEngine
 *
 * NÃO contém conhecimento de fornecedor. Consulte integrations.config.js.
 * NÃO contém lógica de integração. Consulte integration-engine.js.
 * NÃO renderiza DOM. Consulte workflow_ui.js para renderização.
 */

window.Workflow = {
  // ── State Machine ──────────────────────────────────────────────────────────

  state: {
    currentStep: 0,
    completedSteps: [],
    canAdvance: false,
    sending: false,
    error: '',
  },

  // ── Dados do Workflow ──────────────────────────────────────────────────────

  workflowData: {
    asset: {},
    assistance: '',
    checklist: {
      prioridade: 3,
      tipoProblema: '',
      mauUso: false,
      mauUsoDescricao: '',
    },
    observations: '',
    rules: {},
    metadata: {
      workflowVersion: '3.0',
      createdAt: null,
    },
  },

  // ── Constantes ─────────────────────────────────────────────────────────────

  TOTAL_STEPS: 5,

  STEP_LABELS: [
    'Equipamento',
    'Assistência',
    'Checklist',
    'Fluxo',
    'Confirmação',
  ],

  // ── Abertura / Fechamento ──────────────────────────────────────────────────

  open(ativo) {
    this._reset();
    this.workflowData.asset = { ...ativo };
    this.workflowData.metadata.createdAt = new Date().toISOString();
    this.state.currentStep = 1;
    this.state.canAdvance = true;
    window.WorkflowUI.open(ativo);
  },

  close() {
    this._reset();
    window.WorkflowUI.close();
  },

  // ── Navegação ──────────────────────────────────────────────────────────────

  next() {
    const validation = this._validateCurrentStep();

    if (!validation.valid) {
      this.state.error = validation.errors.join(' ');
      this.state.canAdvance = false;
      window.WorkflowUI.render();
      return;
    }

    this.state.error = '';

    if (!this.state.completedSteps.includes(this.state.currentStep)) {
      this.state.completedSteps.push(this.state.currentStep);
    }

    if (this.state.currentStep < this.TOTAL_STEPS) {
      this.state.currentStep++;
      this.state.canAdvance = true;
      window.WorkflowUI.render();
    }
  },

  back() {
    if (this.state.currentStep > 1) {
      this.state.error = '';
      this.state.currentStep--;
      this.state.canAdvance = true;
      window.WorkflowUI.render();
    }
  },

  goTo(step) {
    if (step < 1 || step > this.TOTAL_STEPS) return;
    if (!this.state.completedSteps.includes(step) && step !== this.state.currentStep) return;

    this.state.error = '';
    this.state.currentStep = step;
    this.state.canAdvance = true;
    window.WorkflowUI.render();
  },

  // ── Setters (chamados pela UI) ─────────────────────────────────────────────

  setAssistencia(id) {
    this.workflowData.assistance = id;
    this.state.error = '';
    this.state.canAdvance = true;
    window.WorkflowUI.render();
  },

  setChecklistField(key, value) {
    if (key in this.workflowData.checklist) {
      this.workflowData.checklist[key] = value;
    }
    this.state.error = '';
  },

  setPrioridade(value) {
    this.workflowData.checklist.prioridade = parseInt(value, 10) || 3;
  },

  setObservations(text) {
    this.workflowData.observations = text;
  },

  // ── Validação ──────────────────────────────────────────────────────────────

  _validateCurrentStep() {
    switch (this.state.currentStep) {
      case 1:
        return this._validateStep1();
      case 2:
        return this._validateStep2();
      case 3:
        return this._validateStep3();
      case 4:
        return this._validateStep4();
      case 5:
        return { valid: true, errors: [] };
      default:
        return { valid: false, errors: ['Etapa desconhecida.'] };
    }
  },

  _validateStep1() {
    const a = this.workflowData.asset;
    if (!a || !a.glpiId) {
      return { valid: false, errors: ['Equipamento não identificado.'] };
    }
    return { valid: true, errors: [] };
  },

  _validateStep2() {
    const errors = [];
    if (!this.workflowData.assistance) {
      errors.push('Selecione uma assistência responsável.');
    }
    return { valid: errors.length === 0, errors };
  },

  _validateStep3() {
    const errors = [];
    const cl = this.workflowData.checklist;

    if (!cl.tipoProblema) {
      errors.push('Selecione o tipo do problema.');
    }

    if (cl.mauUso && !cl.mauUsoDescricao.trim()) {
      errors.push('Descreva o mau uso identificado.');
    }

    return { valid: errors.length === 0, errors };
  },

  _validateStep4() {
    return { valid: true, errors: [] };
  },

  // ── Montagem do Payload ────────────────────────────────────────────────────

  _buildPayload() {
    const a = this.workflowData.asset;
    const cl = this.workflowData.checklist;

    return {
      glpiId: a.glpiId,
      itemtype: 'Computer',
      assistance: this.workflowData.assistance,
      checklist: {
        prioridade: cl.prioridade,
        tipoProblema: cl.tipoProblema,
        mauUso: cl.mauUso,
        mauUsoDescricao: cl.mauUsoDescricao,
      },
      observations: this.workflowData.observations,
      rules: { ...this.workflowData.rules },
      metadata: {
        workflowVersion: this.workflowData.metadata.workflowVersion,
        createdAt: this.workflowData.metadata.createdAt,
      },
    };
  },

  // ── Envio ──────────────────────────────────────────────────────────────────

  async submit() {
    if (this.state.sending) return;

    this.state.sending = true;
    this.state.error = '';
    window.WorkflowUI.render();

    const payload = this._buildPayload();

    try {
      const result = await window.GlpiClient.createWorkflowTicket(payload);
      this.state.sending = false;

      if (result && result.ticketId) {
        this.state.currentStep = this.TOTAL_STEPS + 1;
        window.WorkflowUI.render();

        // Registrar auditoria: chamado aberto
        if (window.Audit) {
          window.Audit.register({
            action: 'chamado_aberto',
            module: 'workflow',
            descricao: `Chamado #${result.ticketId} aberto com sucesso`,
            equipamento: this.workflowData.asset?.nome || null,
          });
        }

        // Despertar evento de notificação
        if (window.NotificationEvents) {
          window.NotificationEvents.dispatchWorkflow('created', {
            id: result.ticketId,
            ativo: this.workflowData.asset?.nome || 'Ativo',
            usuario: window.UserContext?.getCurrentUser()?.nome || 'Sistema',
          });
        }

        // Abrir PortalViewer após 1.5s (tempo para o usuário ver a confirmação)
        const integrationKey = this.workflowData.assistance;
        if (integrationKey && window.PortalViewer) {
          setTimeout(() => {
            window.PortalViewer.open(integrationKey, this.workflowData);
          }, 1500);
        } else {
          setTimeout(() => this.close(), 3000);
        }
      } else {
        this.state.error = 'Resposta inválida do servidor.';
        window.WorkflowUI.render();
      }
    } catch (err) {
      this.state.sending = false;
      this.state.error = err.message || 'Falha ao criar chamado.';

      // Registrar auditoria: falha ao abrir chamado
      if (window.Audit) {
        window.Audit.register({
          action: 'chamado_falha',
          module: 'workflow',
          severity: 'error',
          descricao: `Falha ao abrir chamado: ${err.message}`,
          equipamento: this.workflowData.asset?.nome || null,
        });
      }

      // Despertar evento de notificação de erro
      if (window.NotificationEvents) {
        window.NotificationEvents.dispatchWorkflow('error', {
          erro: err.message,
          ativo: this.workflowData.asset?.nome || 'Ativo',
          usuario: window.UserContext?.getCurrentUser()?.nome || 'Sistema',
        });
      }

      window.WorkflowUI.render();
    }
  },

  // ── Snapshot do Estado ─────────────────────────────────────────────────────

  getState() {
    return {
      state: { ...this.state },
      workflowData: JSON.parse(JSON.stringify(this.workflowData)),
    };
  },

  // ── Helpers ────────────────────────────────────────────────────────────────

  _reset() {
    this.state = {
      currentStep: 0,
      completedSteps: [],
      canAdvance: false,
      sending: false,
      error: '',
    };

    this.workflowData = {
      asset: {},
      assistance: '',
      checklist: {
        prioridade: 3,
        tipoProblema: '',
        mauUso: false,
        mauUsoDescricao: '',
      },
      observations: '',
      rules: {},
      metadata: {
        workflowVersion: window.WORKFLOW_CONFIG?.workflowVersion || '3.0',
        createdAt: null,
      },
    };
  },

  getAssistenciaLabel(id) {
    const found = (window.WORKFLOW_CONFIG.assistencias || []).find(a => a.id === id);
    return found ? found.label : id;
  },

  getPrioridadeLabel(id) {
    const found = (window.WORKFLOW_CONFIG.prioridades || []).find(p => p.id === parseInt(id, 10));
    return found ? found.label : 'Média';
  },

  getTipoProblemaLabel(id) {
    const found = (window.WORKFLOW_CONFIG.tiposProblema || []).find(t => t.id === id);
    return found ? found.label : id;
  },
};
