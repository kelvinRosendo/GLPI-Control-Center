/**
 * GLPI Control Center - error-ui.js
 * -----------------------------------------------------------------------------
 * Interface de feedback visual para erros.
 *
 * Exibe toast notifications, modais de erro e error boundary.
 *
 * Sprint 24: Error Handling
 */

window.ErrorUI = (function () {
  'use strict';

  let _initialized = false;
  const _toasts = [];
  const MAX_TOASTS = 5;

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    if (_initialized) return;
    _initialized = true;
    _createContainer();
  }

  function _createContainer() {
    if (document.getElementById('error-toast-container')) return;

    const container = document.createElement('div');
    container.id = 'error-toast-container';
    container.className = 'error-toast-container';
    document.body.appendChild(container);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TOAST NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Exibe toast de erro.
   * @param {object} error - Objeto de erro
   * @param {object} options - Opções: duration, dismissible
   */
  function showError(error, options = {}) {
    const category = window.ErrorHandler?.getCategory(error.category) || {};
    const duration = options.duration || _getDuration(error.severity);

    const toast = document.createElement('div');
    toast.className = `error-toast error-toast--${error.severity || 'error'}`;
    toast.dataset.errorId = error.id;

    toast.innerHTML = `
      <div class="error-toast-icon" style="color: ${category.color || '#f7768e'}">
        ${category.icon || '&#10067;'}
      </div>
      <div class="error-toast-content">
        <div class="error-toast-title">${_escapeHtml(error.message)}</div>
        <div class="error-toast-meta">
          ${error.module ? `<span class="error-toast-module">${_escapeHtml(error.module)}</span>` : ''}
          <span class="error-toast-time">${_formatTime(new Date(error.timestamp))}</span>
        </div>
      </div>
      ${options.dismissible !== false ? `
        <button class="error-toast-close" type="button">&times;</button>
      ` : ''}
    `;

    _addToasts(toast, duration);
  }

  /**
   * Exibe toast de sucesso.
   * @param {string} message
   */
  function showSuccess(message) {
    _showSimple('success', message);
  }

  /**
   * Exibe toast informativo.
   * @param {string} message
   */
  function showInfo(message) {
    _showSimple('info', message);
  }

  /**
   * Exibe toast de aviso.
   * @param {string} message
   */
  function showWarning(message) {
    _showSimple('warning', message);
  }

  function _showSimple(type, message) {
    const icons = {
      success: '&#10004;',
      info: '&#8505;',
      warning: '&#9888;',
    };

    const toast = document.createElement('div');
    toast.className = `error-toast error-toast--${type}`;
    toast.innerHTML = `
      <div class="error-toast-icon">${icons[type] || ''}</div>
      <div class="error-toast-content">
        <div class="error-toast-title">${_escapeHtml(message)}</div>
      </div>
      <button class="error-toast-close" type="button">&times;</button>
    `;

    _addToasts(toast, 4000);
  }

  function _addToasts(toast, duration) {
    const container = document.getElementById('error-toast-container');
    if (!container) return;

    // Limpar toasts excedentes
    while (_toasts.length >= MAX_TOASTS) {
      const old = _toasts.shift();
      old.remove();
    }

    container.appendChild(toast);
    _toasts.push(toast);
    toast.querySelector('.error-toast-close')?.addEventListener('click', () => dismiss(toast.dataset.errorId));

    // Animar entrada
    requestAnimationFrame(() => toast.classList.add('show'));

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => dismiss(toast.dataset.errorId), duration);
    }
  }

  /**
   * Remove toast.
   * @param {string} id
   */
  function dismiss(id) {
    const toast = _toasts.find(item => item.dataset.errorId === String(id));
    if (toast) {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
      const idx = _toasts.indexOf(toast);
      if (idx > -1) _toasts.splice(idx, 1);
    }
  }

  /**
   * Remove todos os toasts.
   */
  function dismissAll() {
    _toasts.forEach(t => t.remove());
    _toasts.length = 0;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MODAL DE ERRO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Exibe modal de erro detalhado.
   * @param {object} error
   */
  function showErrorModal(error) {
    const category = window.ErrorHandler?.getCategory(error.category) || {};
    const modal = document.createElement('div');
    modal.className = 'error-modal';
    modal.innerHTML = `
      <div class="error-modal-backdrop"></div>
      <div class="error-modal-content">
        <div class="error-modal-header">
          <span class="error-modal-icon" style="color: ${category.color || '#f7768e'}">${category.icon || '&#10067;'}</span>
          <h3>Erro Detectado</h3>
          <button class="error-modal-close" type="button">&times;</button>
        </div>
        <div class="error-modal-body">
          <div class="error-modal-message">${_escapeHtml(error.message)}</div>
          <div class="error-modal-details">
            <div class="error-detail-row">
              <span class="error-detail-label">Categoria:</span>
              <span class="error-detail-value">${category.label || 'Desconhecido'}</span>
            </div>
            <div class="error-detail-row">
              <span class="error-detail-label">Módulo:</span>
              <span class="error-detail-value">${_escapeHtml(error.module || '-')}</span>
            </div>
            <div class="error-detail-row">
              <span class="error-detail-label">Horário:</span>
              <span class="error-detail-value">${_formatTime(new Date(error.timestamp))}</span>
            </div>
            ${error.stack ? `
              <div class="error-detail-row error-detail-stack">
                <span class="error-detail-label">Stack Trace:</span>
                <pre class="error-stack">${_escapeHtml(error.stack)}</pre>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="error-modal-footer">
          <button class="error-btn" data-error-copy type="button">Copiar Erro</button>
          <button class="error-btn error-btn--primary" data-error-close type="button">Fechar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.error-modal-backdrop')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.error-modal-close')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-error-close]')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-error-copy]')?.addEventListener('click', () => copyError(error.id));
    requestAnimationFrame(() => modal.classList.add('show'));
  }

  /**
   * Copia dados do erro.
   * @param {string} id
   */
  function copyError(id) {
    const queue = window.ErrorHandler?.getQueue() || [];
    const error = queue.find(e => e.id === id);
    if (error) {
      const text = JSON.stringify(error, null, 2);
      navigator.clipboard?.writeText(text).then(() => {
        showSuccess('Erro copiado para a área de transferência');
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ERROR BOUNDARY
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Cria um error boundary para um container.
   * @param {string|HTMLElement} target
   * @param {Function} renderFn
   */
  function wrapWithBoundary(target, renderFn) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;

    try {
      renderFn(el);
    } catch (error) {
      window.ErrorHandler?.handle({
        type: 'render',
        category: 'RENDER',
        message: error.message,
        stack: error.stack,
        severity: 'error',
      });

      el.innerHTML = `
        <div class="error-boundary">
          <div class="error-boundary-icon">&#128196;</div>
          <div class="error-boundary-title">Erro ao renderizar</div>
          <div class="error-boundary-message">${_escapeHtml(error.message)}</div>
          <button class="error-btn" data-error-boundary-reset>
            Tentar Novamente
          </button>
        </div>
      `;
      el.querySelector('[data-error-boundary-reset]')?.addEventListener('click', () => el.replaceChildren());
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  function _getDuration(severity) {
    const durations = {
      info: 3000,
      success: 3000,
      warning: 5000,
      error: 8000,
      critical: 0, // Não auto-dismiss
    };
    return durations[severity] || 5000;
  }

  function _formatTime(date) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    showError,
    showSuccess,
    showInfo,
    showWarning,
    showErrorModal,
    copyError,
    dismiss,
    dismissAll,
    wrapWithBoundary,
  };
})();
