/**
 * GLPI Control Center - tickets.js
 * -----------------------------------------------------------------------------
 * Responsável por:
 * - Abrir e fechar o modal de chamado
 * - Enviar o formulário para o backend
 * - Buscar chamados da aba geral
 */

window.Tickets = {
  _ativoAtual: null,

  // ── Abre o modal pré-vinculado ao ativo ────────────────────────────────────

  openModal(ativo) {
    this._ativoAtual = ativo;

    document.getElementById('modal-asset-name').textContent =
      `${ativo.nome}  —  ID ${ativo.glpiId}`;

    // Limpa os campos
    document.getElementById('ticket-title').value    = '';
    document.getElementById('ticket-desc').value     = '';
    document.getElementById('ticket-priority').value = '3';
    document.getElementById('ticket-category').value = '';

    // Esconde feedback anterior
    const fb = document.getElementById('ticket-feedback');
    fb.style.display = 'none';
    fb.textContent   = '';

    // Exibe o modal
    document.getElementById('ticket-modal').style.display = 'flex';
  },

  // ── Fecha o modal e limpa estado ──────────────────────────────────────────

  closeModal() {
    document.getElementById('ticket-modal').style.display = 'none';
    this._ativoAtual = null;
  },

  // ── Envia o formulário ao backend ─────────────────────────────────────────

  async send() {
    const ativo      = this._ativoAtual;
    const titulo     = document.getElementById('ticket-title').value.trim();
    const descricao  = document.getElementById('ticket-desc').value.trim();
    const prioridade = parseInt(document.getElementById('ticket-priority').value);
    const categoria  = parseInt(document.getElementById('ticket-category').value) || 0;
    const fb         = document.getElementById('ticket-feedback');

    // Validação básica
    if (!titulo || !descricao) {
      fb.textContent   = '⚠️  Preencha o título e a descrição.';
      fb.style.color   = '#facc15';
      fb.style.display = 'block';
      return;
    }

    fb.textContent   = 'Salvando no GLPI…';
    fb.style.color   = 'var(--color-text-secondary, #888)';
    fb.style.display = 'block';

    try {
      const res  = await fetch(`${window.CONFIG.backendUrl}/api/tickets`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          titulo,
          descricao,
          prioridade,
          categoria,
          glpiId:   ativo.glpiId,
          itemtype: 'Computer',
        }),
      });

      const json = await res.json();

      if (json.ok) {
        fb.textContent = `✅  Chamado #${json.data.ticketId} criado com sucesso!`;
        fb.style.color = '#4ade80';
        // Fecha o modal automaticamente após 2 segundos
        setTimeout(() => this.closeModal(), 2000);
      } else {
        fb.textContent = `❌  Erro: ${json.error}`;
        fb.style.color = '#f87171';
      }
    } catch (e) {
      fb.textContent = '❌  Backend indisponível.';
      fb.style.color = '#f87171';
    }
  },
};