/**
 * GLPI Control Center - workflow.js
 * -----------------------------------------------------------------------------
 * Workflow Inteligente de Chamados para Chromebooks — v2.0 (Assistance Flows).
 *
 * Gerencia:
 * - Estado do wizard multi-step (5 etapas)
 * - Validação por etapa (sem pulo de etapas)
 * - Regras de negócio (RN-01, RN-02, RN-03)
 * - Checklist extensível com grupos
 * - Passo 5: Fluxo da Assistência (config-driven)
 * - Rastreamento de ações executadas na assistência
 * - Dados de auditoria estruturados
 * - Integração com categorias GLPI
 *
 * Não contém lógica de renderização — ver workflow_ui.js.
 */

window.Workflow = (() => {

  const WORKFLOW_VERSION = '2.0.0';
  const TOTAL_STEPS = 5;

  const ASSISTENCIAS = [
    { id: 'torino',    nome: 'Torino',    descricao: 'Suporte técnico Torino' },
    { id: 'hbb',       nome: 'HBB',       descricao: 'Suporte técnico HBB' },
    { id: 'acer_geek', nome: 'Acer Geek', descricao: 'Suporte técnico Acer Geek' },
    { id: 'acer',      nome: 'Acer',      descricao: 'Suporte técnico Acer' },
  ];

  const CHECKLIST_GROUPS = [
    {
      id: 'problema',
      label: 'Problema',
      questions: [
        {
          id: 'tipo_problema',
          label: 'Qual o tipo do problema?',
          tipo: 'select',
          opcoes: [
            { value: '', label: 'Selecione...' },
            { value: 'nao_liga',          label: 'Não liga' },
            { value: 'tela_problema',     label: 'Problema na tela' },
            { value: 'teclado_problema',  label: 'Problema no teclado' },
            { value: 'bateria',           label: 'Problema na bateria' },
            { value: 'wifi',              label: 'Não conecta WiFi' },
            { value: 'carregador',        label: 'Sem carregador / carregador danificado' },
            { value: 'software',          label: 'Problema de software' },
            { value: 'outro',             label: 'Outro' },
          ],
          obrigatorio: true,
        },
        {
          id: 'equipamento_liga',
          label: 'O equipamento liga?',
          tipo: 'radio',
          opcoes: [
            { value: 'sim', label: 'Sim' },
            { value: 'nao', label: 'Não' },
            { value: 'intermitente', label: 'Intermitente' },
          ],
          obrigatorio: true,
        },
      ],
    },
    {
      id: 'condicao',
      label: 'Condição Física',
      questions: [
        {
          id: 'dano_fisico',
          label: 'Existe dano físico visível?',
          tipo: 'radio',
          opcoes: [
            { value: 'sim', label: 'Sim' },
            { value: 'nao', label: 'Não' },
          ],
          obrigatorio: true,
        },
        {
          id: 'tipo_dano',
          label: 'Qual o tipo de dano?',
          tipo: 'select',
          opcoes: [
            { value: '', label: 'Selecione...' },
            { value: 'tela_rachada',     label: 'Tela rachada/quebrada' },
            { value: 'carcaca_avariada', label: 'Carcaça danificada' },
            { value: 'teclas_soltas',    label: 'Teclas soltas' },
            { value: 'porta_danificada', label: 'Porta danificada' },
            { value: 'marca_queda',      label: 'Marcas de queda' },
            { value: 'outro',            label: 'Outro' },
          ],
          obrigatorio: true,
          condicional: (r) => r.dano_fisico === 'sim',
        },
        {
          id: 'dano_detalhe',
          label: 'Descreva o dano identificado',
          tipo: 'textarea',
          obrigatorio: false,
          condicional: (r) => r.dano_fisico === 'sim',
        },
      ],
    },
    {
      id: 'uso',
      label: 'Uso e Acesso',
      questions: [
        {
          id: 'mau_uso',
          label: 'Existe mau uso?',
          tipo: 'radio',
          opcoes: [
            { value: 'sim', label: 'Sim' },
            { value: 'nao', label: 'Não' },
          ],
          obrigatorio: true,
        },
        {
          id: 'mau_uso_detalhe',
          label: 'Descreva o mau uso identificado',
          tipo: 'textarea',
          obrigatorio: false,
          condicional: (r) => r.mau_uso === 'sim',
        },
      ],
    },
    {
      id: 'observacoes_grupo',
      label: 'Observações',
      questions: [
        {
          id: 'observacoes',
          label: 'Observações adicionais',
          tipo: 'textarea',
          obrigatorio: false,
        },
      ],
    },
  ];

  const CHECKLIST_QUESTIONS = CHECKLIST_GROUPS.flatMap(g => g.questions);
  const STEP_LABELS = ['Equipamento', 'Assistência', 'Checklist', 'Confirmação', 'Fluxo'];

  // ── Categorias GLPI (cache) ───────────────────────────────────────────────

  let _categoriasCache = null;
  let _categoriasLoading = false;

  // ── Estado ────────────────────────────────────────────────────────────────

  let _state = _createInitialState();

  function _createInitialState() {
    return {
      step: 1,
      completedSteps: [],
      ativo: null,
      assistencia: '',
      categoriaGlpi: 0,
      checklist: {},
      regras: { mauUso: false, contratoObrigatorio: true },
      actionsExecuted: [],
      enviando: false,
      erro: '',
      erroCampo: '',
      sucesso: null,
    };
  }

  // ── API pública ───────────────────────────────────────────────────────────

  function open(ativo) {
    _state = _createInitialState();
    _state.ativo = { ...ativo };
    _applyRules();
    window.WorkflowUI.open();
  }

  function close() {
    _state = _createInitialState();
    window.WorkflowUI.close();
  }

  function getState() {
    return { ..._state };
  }

  function nextStep() {
    if (!validateCurrentStep()) return false;
    if (_state.step < TOTAL_STEPS) {
      if (!_state.completedSteps.includes(_state.step)) {
        _state.completedSteps.push(_state.step);
      }
      _state.step++;
      _state.erro = '';
      _state.erroCampo = '';
      _applyRules();
      window.WorkflowUI.render();
      return true;
    }
    return false;
  }

  function prevStep() {
    if (_state.step > 1) {
      _state.step--;
      _state.erro = '';
      _state.erroCampo = '';
      window.WorkflowUI.render();
      return true;
    }
    return false;
  }

  function goToStep(step) {
    if (step < 1 || step > TOTAL_STEPS) return;
    if (step > _state.step && !_state.completedSteps.includes(step - 1)) {
      _state.erro = 'Complete a etapa anterior primeiro.';
      _state.erroCampo = '';
      window.WorkflowUI.render();
      return;
    }
    _state.step = step;
    _state.erro = '';
    _state.erroCampo = '';
    window.WorkflowUI.render();
  }

  function setAssistencia(assistenciaId) {
    _state.assistencia = assistenciaId;
    _applyRules();
    window.WorkflowUI.render();
  }

  function setChecklistValue(questionId, value) {
    _state.checklist[questionId] = value;
    _applyRules();
    window.WorkflowUI.render();
  }

  // ── Validação ─────────────────────────────────────────────────────────────

  function validateCurrentStep() {
    _state.erro = '';
    _state.erroCampo = '';

    switch (_state.step) {
      case 1:
        if (!_state.ativo) {
          _state.erro = 'Nenhum equipamento selecionado. Volte e selecione um equipamento.';
          return false;
        }
        return true;

      case 2:
        if (!_state.assistencia) {
          _state.erro = 'Selecione o tipo de assistência técnica para continuar.';
          _state.erroCampo = 'assistencia';
          return false;
        }
        return true;

      case 3:
        return _validateChecklist();

      case 4:
        return true;

      default:
        return true;
    }
  }

  function _validateChecklist() {
    for (const group of CHECKLIST_GROUPS) {
      for (const q of group.questions) {
        if (q.condicional && !q.condicional(_state.checklist)) continue;
        if (q.obrigatorio) {
          const val = _state.checklist[q.id];
          if (val === undefined || val === null || val === '') {
            _state.erro = `Campo obrigatório: "${q.label}"`;
            _state.erroCampo = q.id;
            return false;
          }
        }
      }
    }

    if (_state.checklist.mau_uso === 'sim' && !_state.checklist.mau_uso_detalhe) {
      _state.erro = 'Descreva o mau uso identificado no campo de detalhe.';
      _state.erroCampo = 'mau_uso_detalhe';
      return false;
    }

    if (_state.checklist.dano_fisico === 'sim' && !_state.checklist.tipo_dano) {
      _state.erro = 'Selecione o tipo de dano físico identificado.';
      _state.erroCampo = 'tipo_dano';
      return false;
    }

    return true;
  }

  // ── Regras de negócio ─────────────────────────────────────────────────────

  function _applyRules() {
    const mauUso = _state.checklist.mau_uso === 'sim';
    _state.regras = {
      mauUso,
      contratoObrigatorio: !mauUso,
      contratoBloqueado: mauUso,
    };
  }

  function getRegras() {
    return { ..._state.regras };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getAssistencias() { return ASSISTENCIAS; }
  function getAssistenciaById(id) { return ASSISTENCIAS.find(a => a.id === id) || null; }
  function getChecklistGroups() { return CHECKLIST_GROUPS; }
  function getChecklistQuestions() { return CHECKLIST_QUESTIONS; }
  function getStepLabels() { return STEP_LABELS; }
  function getStepLabel(step) { return STEP_LABELS[step - 1] || ''; }
  function getWorkflowVersion() { return WORKFLOW_VERSION; }

  // ── Assistência Flow ────────────────────────────────────────────────────

  function getAssistanceFlowConfig() {
    if (!_state.assistencia) return null;
    if (!window.AssistanceFlows) return null;
    return window.AssistanceFlows.getFlow(_state.assistencia);
  }

  function registerAssistanceAction(actionId, actionData) {
    const exists = _state.actionsExecuted.find(a => a.actionId === actionId);
    if (exists) return;
    _state.actionsExecuted.push({
      actionId,
      timestamp: new Date().toISOString(),
      ...actionData,
    });
    window.WorkflowUI.render();
  }

  function isActionExecuted(actionId) {
    return _state.actionsExecuted.some(a => a.actionId === actionId);
  }

  function getActionsExecuted() {
    return [..._state.actionsExecuted];
  }

  function isStepAccessible(step) {
    if (step <= 1) return true;
    return _state.completedSteps.includes(step - 1) || step <= _state.step;
  }

  // ── Categorias GLPI ──────────────────────────────────────────────────────

  async function loadCategorias() {
    if (_categoriasCache) return _categoriasCache;
    if (_categoriasLoading) return [];
    _categoriasLoading = true;
    try {
      const data = await window.GlpiClient.fetchCategorias();
      _categoriasCache = data || [];
    } catch (e) {
      _categoriasCache = [];
    }
    _categoriasLoading = false;
    return _categoriasCache;
  }

  function getCategorias() { return _categoriasCache || []; }

  // ── Preparação dos dados para o GLPI ─────────────────────────────────────

  function buildPayload() {
    const ativo = _state.ativo;
    const assistencia = getAssistenciaById(_state.assistencia);
    const checklist = _state.checklist;
    const regras = _state.regras;
    const now = new Date();

    const titulo = `${ativo.nome} — ${assistencia ? assistencia.nome : 'Chamado'}`;

    const linhas = [];
    linhas.push(`Assistência: ${assistencia ? assistencia.nome : 'Não informada'}`);
    linhas.push(`Tipo de problema: ${_getChecklistLabel('tipo_problema', checklist.tipo_problema)}`);
    linhas.push(`Equipamento liga: ${_getChecklistLabel('equipamento_liga', checklist.equipamento_liga)}`);
    linhas.push(`Dano físico: ${checklist.dano_fisico === 'sim' ? 'Sim' : 'Não'}`);

    if (checklist.dano_fisico === 'sim' && checklist.tipo_dano) {
      linhas.push(`Tipo de dano: ${_getChecklistLabel('tipo_dano', checklist.tipo_dano)}`);
    }
    if (checklist.dano_fisico === 'sim' && checklist.dano_detalhe) {
      linhas.push(`Detalhe do dano: ${checklist.dano_detalhe}`);
    }

    linhas.push(`Mau uso: ${checklist.mau_uso === 'sim' ? 'Sim' : 'Não'}`);
    if (checklist.mau_uso === 'sim' && checklist.mau_uso_detalhe) {
      linhas.push(`Detalhe mau uso: ${checklist.mau_uso_detalhe}`);
    }
    linhas.push(`Contrato: ${regras.contratoObrigatorio ? 'Obrigatório' : 'Não obrigatório'}`);

    if (checklist.observacoes) {
      linhas.push(`Observações: ${checklist.observacoes}`);
    }

    const descricao = linhas.join('\n');

    const auditData = {
      workflowVersion: WORKFLOW_VERSION,
      timestamp: now.toISOString(),
      assistencia: _state.assistencia,
      assistenciaNome: assistencia ? assistencia.nome : '',
      checklist: { ..._state.checklist },
      regras: { ..._state.regras },
      assistanceFlow: {
        actionsExecuted: [..._state.actionsExecuted],
      },
    };

    return {
      titulo,
      descricao,
      glpiId: ativo.glpiId,
      itemtype: 'Computer',
      prioridade: regras.mauUso ? 4 : 3,
      categoria: _state.categoriaGlpi || 0,
      assistencia: _state.assistencia,
      assistenciaNome: assistencia ? assistencia.nome : '',
      checklist: { ..._state.checklist },
      regras: { ..._state.regras },
      auditData,
    };
  }

  function _getChecklistLabel(questionId, value) {
    const q = CHECKLIST_QUESTIONS.find(item => item.id === questionId);
    if (!q || !q.opcoes) return value || 'Não informado';
    const opt = q.opcoes.find(o => o.value === value);
    return opt ? opt.label : (value || 'Não informado');
  }

  // ── Submissão ─────────────────────────────────────────────────────────────

  async function submit() {
    if (_state.enviando) return;

    _state.enviando = true;
    _state.erro = '';
    _state.erroCampo = '';
    window.WorkflowUI.render();

    try {
      const payload = buildPayload();
      const result = await window.GlpiClient.createWorkflowTicket(payload);

      _state.sucesso = {
        ticketId: result.ticketId,
        titulo: payload.titulo,
        assistencia: payload.assistenciaNome,
        mauUso: _state.regras.mauUso,
        contrato: _state.regras.contratoObrigatorio,
      };
      _state.enviando = false;
      window.WorkflowUI.render();

    } catch (e) {
      _state.erro = e.message || 'Erro ao criar chamado no GLPI. Tente novamente.';
      _state.enviando = false;
      window.WorkflowUI.render();
    }
  }

  // ── Exposição pública ─────────────────────────────────────────────────────

  return {
    open,
    close,
    getState,
    nextStep,
    prevStep,
    goToStep,
    setAssistencia,
    setChecklistValue,
    validateCurrentStep,
    getRegras,
    getAssistencias,
    getAssistenciaById,
    getChecklistGroups,
    getChecklistQuestions,
    getStepLabels,
    getStepLabel,
    getWorkflowVersion,
    isStepAccessible,
    getAssistanceFlowConfig,
    registerAssistanceAction,
    isActionExecuted,
    getActionsExecuted,
    loadCategorias,
    getCategorias,
    buildPayload,
    submit,
    ASSISTENCIAS,
    CHECKLIST_GROUPS,
    CHECKLIST_QUESTIONS,
    TOTAL_STEPS,
    WORKFLOW_VERSION,
  };

})();
