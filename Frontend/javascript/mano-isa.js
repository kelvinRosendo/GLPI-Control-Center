/**
 * GLPI Control Center - mano-isa.js
 * -----------------------------------------------------------------------------
 * Componente Mano Isa — mascote institucional do GCC.
 *
 * Utilizado em:
 * - Tela de login
 * - Empty states
 * - Mensagens de ajuda
 * - Erros amigáveis
 * - 404
 *
 * Sprint 13: Branding Colégio Satélite
 */

window.ManoIsa = {
  /**
   * Retorna HTML do Mano Isa para empty states.
   * @param {string} message - Mensagem principal
   * @param {string} [submessage] - Mensagem secundária
   * @returns {string} HTML
   */
  renderEmptyState(message, submessage = '') {
    return `
      <div class="mano-isa-empty" role="status">
        <div class="mano-isa-avatar">
          <span class="mano-isa-wave">&#128075;</span>
        </div>
        <h3 class="mano-isa-title">${this._escapeHtml(message)}</h3>
        ${submessage ? `<p class="mano-isa-subtitle">${this._escapeHtml(submessage)}</p>` : ''}
      </div>
    `;
  },

  /**
   * Retorna HTML do Mano Isa para mensagens de erro.
   * @param {string} title - Título do erro
   * @param {string} [message] - Descrição do erro
   * @returns {string} HTML
   */
  renderError(title, message = '') {
    return `
      <div class="mano-isa-error" role="alert">
        <div class="mano-isa-avatar">
          <span class="mano-isa-sad">&#128542;</span>
        </div>
        <h3 class="mano-isa-title">${this._escapeHtml(title)}</h3>
        ${message ? `<p class="mano-isa-subtitle">${this._escapeHtml(message)}</p>` : ''}
      </div>
    `;
  },

  /**
   * Retorna HTML do Mano Isa para tela de ajuda.
   * @param {string} [tip] - Dica ou mensagem
   * @returns {string} HTML
   */
  renderHelp(tip = '') {
    return `
      <div class="mano-isa-help">
        <div class="mano-isa-avatar">
          <span class="mano-isa-idea">&#128161;</span>
        </div>
        <div class="mano-isa-help-content">
          <p class="mano-isa-tip">${this._escapeHtml(tip || 'Precisa de ajuda? Fale com o setor de TI!')}</p>
        </div>
      </div>
    `;
  },

  /**
   * Retorna HTML do Mano Isa para 404.
   * @returns {string} HTML
   */
  render404() {
    return `
      <div class="mano-isa-404" role="status">
        <div class="mano-isa-avatar">
          <span class="mano-isa-confused">&#128533;</span>
        </div>
        <h3 class="mano-isa-title">Página não encontrada</h3>
        <p class="mano-isa-subtitle">O Mano Isa procurou mas não encontrou essa página.</p>
      </div>
    `;
  },

  /**
   * Escapa HTML para prevenir XSS.
   * @param {string} text
   * @returns {string}
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
