/**
 * GLPI Control Center - tickets.js
 * -----------------------------------------------------------------------------
 * Responsável por:
 * - Abrir e fechar o modal de chamado (legado — redireciona para Workflow)
 * - Enviar o formulário para o backend (legado)
 * - Buscar chamados da aba geral
 *
 * O fluxo de criação de chamados agora é gerenciado pelo módulo Workflow.
 * Este arquivo mantém compatibilidade com chamadas legadas.
 */

window.Tickets = {
  _ativoAtual: null,

  // ── Abre o modal de workflow (substitui o modal legado) ───────────────────

  openModal(ativo) {
    window.Workflow.open(ativo);
  },

  // ── Fecha o modal (legado) ────────────────────────────────────────────────

  closeModal() {
    window.Workflow.close();
  },

  // ── Envia o formulário ao backend (legado — redireciona para Workflow) ────

  async send() {
    const state = window.Workflow.getState();
    if (state.step === window.Workflow.TOTAL_STEPS && !state.enviando && !state.sucesso) {
      await window.Workflow.submit();
    }
  },
};