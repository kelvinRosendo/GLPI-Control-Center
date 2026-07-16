/**
 * GLPI Control Center - workflow.js
 * -----------------------------------------------------------------------------
 * Workflow Inteligente de Chamados para Chromebooks.
 *
 * Gerencia o estado do wizard multi-step, validação por etapa,
 * regras de negócio (RN-01, RN-02, RN-03) e preparação dos dados
 * para criação do chamado no GLPI.
 *
 * Não contém lógica de renderização — ver workflow_ui.js.
 */

window.Workflow = (() => {

  // ── Configuração ──────────────────────────────────────────────────────────

  const TOTAL_STEPS = 4;

  const ASSISTENCIAS = [
    { id: 'torino',    nome: 'Torino',    descricao: 'Suporte técnico Torino' },
    { id: 'hbb',       nome: 'HBB',       descricao: 'Suporte técnico HBB' },
    { id: 'acer_geek', nome: 'Acer Geek', descricao: 'Suporte técnico Acer Geek' },
    { id: 'acer',      nome: 'Acer',      descricao: 'Suporte técnico Acer' },
  ];

  const CHECKLIST_QUESTIONS = [
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
      condicional: (respostas) => respostas.mau_uso === 'sim',
    },
    {
      id: 'observacoes',
      label: 'Observações adicionais',
      tipo: 'textarea',
      obrigatorio: false,
    },
  ];

  const STEP_LABELS = ['Equipamento', 'Assistência', 'Checklist', 'Confirmação'];

  // ── Estado ────────────────────────────────────────────────────────────────

  let _state = _createInitialState();

  function _createInitialState() {
    return {
      step: 1,
      ativo: null,
      assistencia: '',
      checklist: {},
      regras: { mauUso: false, contratoObrigatorio: true },
      enviando: false,
      erro: '',
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
      _state.step++;
      _applyRules();
      window.WorkflowUI.render();
      return true;
    }
    return false;
  }

  function prevStep() {
    if (_state.step > 1) {
      _state.step--;
      _applyRules();
      window.WorkflowUI.render();
      return true;
    }
    return false;
  }

  function goToStep(step) {
    if (step >= 1 && step <= TOTAL_STEPS) {
      _state.step = step;
      window.WorkflowUI.render();
    }
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

    switch (_state.step) {
      case 1:
        if (!_state.ativo) {
          _state.erro = 'Nenhum equipamento selecionado.';
          return false;
        }
        return true;

      case 2:
        if (!_state.assistencia) {
          _state.erro = 'Selecione o tipo de assistência técnica.';
          return false;
        }
        return true;

      case 3:
        for (const q of CHECKLIST_QUESTIONS) {
          if (q.condicional && !q.condicional(_state.checklist)) continue;
          if (q.obrigatorio && !_state.checklist[q.id]) {
            _state.erro = `Responda: "${q.label}"`;
            return false;
          }
        }
        if (_state.checklist.mau_uso === 'sim' && !_state.checklist.mau_uso_detalhe) {
          _state.erro = 'Descreva o mau uso identificado.';
          return false;
        }
        return true;

      default:
        return true;
    }
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

  function getAssistencias() {
    return ASSISTENCIAS;
  }

  function getAssistenciaById(id) {
    return ASSISTENCIAS.find(a => a.id === id) || null;
  }

  function getChecklistQuestions() {
    return CHECKLIST_QUESTIONS;
  }

  function getStepLabels() {
    return STEP_LABELS;
  }

  function getStepLabel(step) {
    return STEP_LABELS[step - 1] || '';
  }

  function isStepValid(step) {
    const current = _state.step;
    _state.step = step;
    const valid = validateCurrentStep();
    _state.step = current;
    return valid;
  }

  // ── Preparação dos dados para o GLPI ─────────────────────────────────────

  function buildPayload() {
    const ativo = _state.ativo;
    const assistencia = getAssistenciaById(_state.assistencia);
    const checklist = _state.checklist;
    const regras = _state.regras;

    const mauUsoLabel = checklist.mau_uso === 'sim' ? 'Sim' : 'Não';
    const contratoLabel = regras.contratoObrigatorio ? 'Obrigatório' : 'Não obrigatório';

    const titulo = `${ativo.nome} — ${assistencia ? assistencia.nome : 'Chamado'}`;

    const descricaoLinhas = [
      `Assistência: ${assistencia ? assistencia.nome : 'Não informada'}`,
      `Tipo de problema: ${_getChecklistLabel('tipo_problema', checklist.tipo_problema)}`,
      `Mau uso: ${mauUsoLabel}`,
    ];

    if (checklist.mau_uso === 'sim' && checklist.mau_uso_detalhe) {
      descricaoLinhas.push(`Detalhe do mau uso: ${checklist.mau_uso_detalhe}`);
    }

    descricaoLinhas.push(`Contrato: ${contratoLabel}`);

    if (checklist.observacoes) {
      descricaoLinhas.push(`Observações: ${checklist.observacoes}`);
    }

    const descricao = descricaoLinhas.join('\n');

    return {
      titulo,
      descricao,
      glpiId: ativo.glpiId,
      itemtype: 'Computer',
      prioridade: regras.mauUso ? 4 : 3,
      categoria: 0,
      assistencia: _state.assistencia,
      assistenciaNome: assistencia ? assistencia.nome : '',
      checklist: { ..._state.checklist },
      regras: { ..._state.regras },
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
    window.WorkflowUI.render();

    try {
      const payload = buildPayload();
      const result = await window.GlpiClient.createWorkflowTicket(payload);

      _state.sucesso = {
        ticketId: result.ticketId,
        titulo: payload.titulo,
      };
      _state.enviando = false;
      window.WorkflowUI.render();

    } catch (e) {
      _state.erro = e.message || 'Erro ao criar chamado no GLPI.';
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
    getChecklistQuestions,
    getStepLabels,
    getStepLabel,
    isStepValid,
    buildPayload,
    submit,
    ASSISTENCIAS,
    CHECKLIST_QUESTIONS,
    TOTAL_STEPS,
  };

})();
