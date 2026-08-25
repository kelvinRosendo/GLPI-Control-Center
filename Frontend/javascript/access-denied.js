/**
 * GLPI Control Center - access-denied.js
 * -----------------------------------------------------------------------------
 * Tela de acesso negado.
 *
 * Exibida quando o usuário tenta acessar um módulo sem permissão.
 *
 * Sprint 15: Autenticação
 */

window.AccessDenied = (function () {
  'use strict';

  /**
   * Renderiza tela de acesso negado.
   * @param {string} moduleName - Nome do módulo negado
   * @param {string} [reason] - Motivo opcional
   * @returns {string} HTML
   */
  function render(moduleName, reason = '') {
    const user = window.UserContext?.getCurrentUser();
    const profile = user?.perfil ? window.Permissions?.getProfileLabel(user.perfil) : null;

    return `
      <div class="access-denied">
        <div class="access-denied-card">
          <div class="access-denied-icon">&#128274;</div>
          <h2 class="access-denied-title">Acesso Negado</h2>
          <p class="access-denied-module">
            Você não tem permissão para acessar <strong>${escapeHtml(moduleName)}</strong>.
          </p>
          ${reason ? `<p class="access-denied-reason">${escapeHtml(reason)}</p>` : ''}
          <div class="access-denied-info">
            ${profile ? `
              <div class="access-denied-profile">
                <span class="access-denied-label">Seu perfil:</span>
                <span class="access-denied-value">${escapeHtml(profile)}</span>
              </div>
            ` : ''}
            ${user?.email ? `
              <div class="access-denied-email">
                <span class="access-denied-label">Conta:</span>
                <span class="access-denied-value">${escapeHtml(user.email)}</span>
              </div>
            ` : ''}
          </div>
          <div class="access-denied-actions">
            <button class="access-denied-btn access-denied-btn--primary" onclick="window.App.go('home')">
              &#128200; Ir para Dashboard
            </button>
            <button class="access-denied-btn access-denied-btn--secondary" onclick="window.Auth?.logout()">
              &#128682; Trocar de conta
            </button>
          </div>
          <p class="access-denied-help">
            Precisa de acesso? Entre em contato com o setor de TI.
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Exibe a tela de acesso negado no conteúdo principal.
   * @param {string} moduleKey - Chave do módulo
   */
  function show(moduleKey) {
    const moduleName = window.Permissions?.getModules()?.[moduleKey]?.label || moduleKey;
    const mainEl = document.getElementById('main-content');
    if (mainEl) {
      mainEl.innerHTML = render(moduleName);
    }

    // Auditar tentativa de acesso negado
    if (window.Audit) {
      window.Audit.log('access_denied', {
        module: moduleKey,
        moduleName,
        user: window.UserContext?.getCurrentUser()?.email,
      });
    }
  }

  /**
   * Escape HTML para prevenir XSS.
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    render,
    show,
  };
})();
