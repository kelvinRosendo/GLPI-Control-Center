/**
 * javascript/config/index.js
 * -----------------------------------------------------------------------------
 * Configuration Loader centralizado para o Frontend.
 *
 * POR QUE EXISTE?
 * - O Workflow (e outros módulos) precisam de configurações
 * - Antes, cada arquivo lia configs diretamente (acoplamento)
 * - Agora, existe um ÚNICO ponto de acesso às configurações
 *
 * COMO FUNCIONA?
 * - Carrega todas as configurações dos arquivos .config.js
 * - Fornece interface única para acesso
 * - Pode ser estendido para buscar de APIs
 *
 * PADRÃO UTILIZADO:
 * - Service Layer Pattern
 * - Facade Pattern (simplifica acesso a múltiplas configs)
 *
 * FLUXO:
 * Workflow → WorkflowConfig.getAssistencias()
 *          → ConfigLoader lê AssistenciasConfig
 *          → Retorna array com assistências
 *
 * NO FUTURO:
 * Workflow → WorkflowConfig.getAssistencias()
 *          → ConfigLoader busca via fetch('/api/config/assistencias')
 *          → Retorna array com assistências
 *          → Workflow NÃO SENTE A DIFERENÇA
 */

window.WorkflowConfig = (() => {

  // ═════════════════════════════════════════════════════════════════════════
  // ASSISTÊNCIAS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todas as assistências técnicas.
   *
   * USO:
   *   const assistencias = WorkflowConfig.getAssistencias();
   */
  function getAssistencias() {
    return window.AssistenciasConfig || [];
  }

  /**
   * Retorna uma assistência pelo ID.
   *
   * USO:
   *   const torino = WorkflowConfig.getAssistenciaById('torino');
   */
  function getAssistenciaById(id) {
    return getAssistencias().find(a => a.id === id) || null;
  }

  /**
   * Valida se uma assistência existe.
   *
   * USO:
   *   if (WorkflowConfig.isValidAssistencia('torino')) { ... }
   */
  function isValidAssistencia(id) {
    return getAssistenciaById(id) !== null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CHECKLISTS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Retorna os grupos do checklist.
   *
   * USO:
   *   const groups = WorkflowConfig.getChecklistGroups();
   */
  function getChecklistGroups() {
    return window.ChecklistGroupsConfig || [];
  }

  /**
   * Retorna todas as perguntas do checklist (flat array).
   *
   * USO:
   *   const questions = WorkflowConfig.getChecklistQuestions();
   */
  function getChecklistQuestions() {
    return getChecklistGroups().flatMap(g => g.questions || []);
  }

  /**
   * Retorna uma pergunta do checklist pelo ID.
   *
   * USO:
   *   const q = WorkflowConfig.getChecklistQuestionById('tipo_problema');
   */
  function getChecklistQuestionById(id) {
    return getChecklistQuestions().find(q => q.id === id) || null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // FLOWS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todos os fluxos.
   *
   * USO:
   *   const flows = WorkflowConfig.getFlows();
   */
  function getFlows() {
    return window.FlowsConfig || {};
  }

  /**
   * Retorna o fluxo de uma assistência específica.
   *
   * USO:
   *   const flow = WorkflowConfig.getFlowByAssistencia('hbb');
   */
  function getFlowByAssistencia(assistenciaId) {
    return getFlows()[assistenciaId] || null;
  }

  /**
   * Retorna as ações de um fluxo.
   *
   * USO:
   *   const actions = WorkflowConfig.getFlowActions('hbb');
   */
  function getFlowActions(assistenciaId) {
    const flow = getFlowByAssistencia(assistenciaId);
    return flow ? (flow.acoes || []) : [];
  }

  /**
   * Gera o corpo do email a partir do template.
   *
   * USO:
   *   const emailBody = WorkflowConfig.generateEmailBody('hbb', dados);
   */
  function generateEmailBody(assistenciaId, dados) {
    const flow = getFlowByAssistencia(assistenciaId);
    if (!flow || !flow.emailTemplate) return '';
    if (typeof flow.emailTemplate === 'function') {
      return flow.emailTemplate(dados);
    }
    // Se for string (backend), substitui placeholders
    return flow.emailTemplate
      .replace('{patrimonio}', dados.patrimonio || '')
      .replace('{nome}', dados.nome || '')
      .replace('{serial}', dados.serial || '')
      .replace('{modelo}', dados.modelo || '')
      .replace('{tipoProblema}', dados.tipoProblema || '')
      .replace('{equipamentoLiga}', dados.equipamentoLiga || '')
      .replace('{danoFisico}', dados.danoFisico || '')
      .replace('{mauUso}', dados.mauUso || '')
      .replace('{contrato}', dados.contrato || '')
      .replace('{observacoes}', dados.observacoes || '')
      .replace('{usuario}', dados.usuario || '');
  }

  /**
   * Retorna a URL do portal de uma assistência.
   *
   * USO:
   *   const url = WorkflowConfig.getPortalUrl('torino');
   */
  function getPortalUrl(assistenciaId) {
    const flow = getFlowByAssistencia(assistenciaId);
    return flow ? (flow.portalUrl || null) : null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // STATUS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Retorna o mapeamento de status.
   */
  function getStatusMap() {
    return (window.StatusConfig || {}).statusMap || {};
  }

  /**
   * Retorna o status padrão.
   */
  function getStatusDefault() {
    return (window.StatusConfig || {}).statusDefault || 'aberto';
  }

  /**
   * Converte um ID de status do GLPI para nome legível.
   *
   * USO:
   *   const status = WorkflowConfig.mapStatus(1); // 'aberto'
   */
  function mapStatus(glpiStatusId) {
    const map = getStatusMap();
    return map[glpiStatusId] || getStatusDefault();
  }

  /**
   * Retorna labels legíveis para status.
   */
  function getStatusLabels() {
    return (window.StatusConfig || {}).statusLabels || {};
  }

  /**
   * Retorna o label legível de um status.
   *
   * USO:
   *   const label = WorkflowConfig.getStatusLabel('aberto'); // 'Aberto'
   */
  function getStatusLabel(status) {
    const labels = getStatusLabels();
    return labels[status] || status;
  }

  /**
   * Retorna o mapeamento de prioridade.
   */
  function getPrioridadeMap() {
    return (window.StatusConfig || {}).prioridadeMap || {};
  }

  /**
   * Converte um ID de prioridade do GLPI para nome legível.
   */
  function mapPrioridade(glpiPrioridadeId) {
    const map = getPrioridadeMap();
    return map[glpiPrioridadeId] || 'media';
  }

  /**
   * Retorna labels legíveis para prioridade.
   */
  function getPrioridadeLabels() {
    return (window.StatusConfig || {}).prioridadeLabels || {};
  }

  /**
   * Retorna o label legível de uma prioridade.
   */
  function getPrioridadeLabel(prioridade) {
    const labels = getPrioridadeLabels();
    return labels[prioridade] || prioridade;
  }

  /**
   * Retorna o mapeamento de status do ativo.
   */
  function getAssetStatusMap() {
    return (window.StatusConfig || {}).assetStatusMap || {};
  }

  /**
   * Converte um states_id do GLPI para nome legível.
   */
  function mapAssetStatus(statesId) {
    if (!statesId || statesId === 0) {
      return (window.StatusConfig || {}).assetStatusDefault || 'ativo';
    }
    const map = getAssetStatusMap();
    return map[statesId] || (window.StatusConfig || {}).assetStatusDefault || 'ativo';
  }

  /**
   * Retorna labels legíveis para status do ativo.
   */
  function getAssetStatusLabels() {
    return (window.StatusConfig || {}).assetStatusLabels || {};
  }

  /**
   * Retorna o label legível de um status do ativo.
   */
  function getAssetStatusLabel(status) {
    const labels = getAssetStatusLabels();
    return labels[status] || status;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // WORKFLOW GERAL
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Retorna a versão do workflow.
   */
  function getWorkflowVersion() {
    return '2.0.0';
  }

  /**
   * Retorna os labels das etapas do wizard.
   */
  function getStepLabels() {
    return ['Equipamento', 'Assistência', 'Checklist', 'Confirmação', 'Fluxo'];
  }

  /**
   * Retorna o label de uma etapa específica.
   */
  function getStepLabel(step) {
    return getStepLabels()[step - 1] || '';
  }

  /**
   * Retorna o número total de etapas.
   */
  function getTotalSteps() {
    return 5;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ═════════════════════════════════════════════════════════════════════════

  return {
    // Assistências
    getAssistencias,
    getAssistenciaById,
    isValidAssistencia,

    // Checklists
    getChecklistGroups,
    getChecklistQuestions,
    getChecklistQuestionById,

    // Flows
    getFlows,
    getFlowByAssistencia,
    getFlowActions,
    generateEmailBody,
    getPortalUrl,

    // Status
    getStatusMap,
    getStatusDefault,
    mapStatus,
    getStatusLabels,
    getStatusLabel,
    getPrioridadeMap,
    mapPrioridade,
    getPrioridadeLabels,
    getPrioridadeLabel,
    getAssetStatusMap,
    mapAssetStatus,
    getAssetStatusLabels,
    getAssetStatusLabel,

    // Workflow
    getWorkflowVersion,
    getStepLabels,
    getStepLabel,
    getTotalSteps,
  };

})();
