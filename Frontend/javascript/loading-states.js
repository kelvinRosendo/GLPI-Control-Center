/**
 * GLPI Control Center - loading-states.js
 * -----------------------------------------------------------------------------
 * Gerenciamento de estados de carregamento.
 *
 * Fornece spinners, skeleton screens e feedback visual
 * durante operações assíncronas.
 *
 * Sprint 22: Performance & Caching
 */

window.LoadingStates = (function () {
  'use strict';

  const _activeLoaders = new Map();

  // ════════════════════════════════════════════════════════════════════════════
  // SPINNER
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Mostra spinner em um container.
   * @param {string|HTMLElement} target - Seletor ou elemento
   * @param {object} options - Opções: size, color, text
   * @returns {string} ID do loader
   */
  function showSpinner(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;

    const id = _generateId();
    const size = options.size || 'medium';
    const color = options.color || 'var(--accent)';
    const text = options.text || '';

    const spinner = document.createElement('div');
    spinner.className = `loading-spinner loading-spinner--${size}`;
    spinner.dataset.loadingId = id;
    spinner.innerHTML = `
      <div class="loading-spinner-ring" style="border-color: ${color}"></div>
      ${text ? `<div class="loading-spinner-text">${text}</div>` : ''}
    `;

    el.style.position = 'relative';
    el.appendChild(spinner);

    _activeLoaders.set(id, { type: 'spinner', target: el, element: spinner });
    return id;
  }

  /**
   * Remove spinner.
   * @param {string} id - ID do loader
   */
  function hideSpinner(id) {
    const loader = _activeLoaders.get(id);
    if (loader && loader.element) {
      loader.element.remove();
      _activeLoaders.delete(id);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SKELETON
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Mostra skeleton screen.
   * @param {string|HTMLElement} target - Seletor ou elemento
   * @param {object} options - Opções: rows, type
   * @returns {string} ID do loader
   */
  function showSkeleton(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;

    const id = _generateId();
    const rows = options.rows || 3;
    const type = options.type || 'text';

    const skeleton = document.createElement('div');
    skeleton.className = 'loading-skeleton';
    skeleton.dataset.loadingId = id;

    let html = '';
    for (let i = 0; i < rows; i++) {
      html += `<div class="loading-skeleton-row loading-skeleton--${type}" style="width: ${_randomWidth()}"></div>`;
    }
    skeleton.innerHTML = html;

    el.appendChild(skeleton);
    _activeLoaders.set(id, { type: 'skeleton', target: el, element: skeleton });
    return id;
  }

  /**
   * Remove skeleton.
   * @param {string} id - ID do loader
   */
  function hideSkeleton(id) {
    hideSpinner(id);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // OVERLAY
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Mostra overlay de carregamento.
   * @param {string|HTMLElement} target - Seletor ou elemento
   * @param {object} options - Opções: text, blur
   * @returns {string} ID do loader
   */
  function showOverlay(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;

    const id = _generateId();
    const text = options.text || 'Carregando...';
    const blur = options.blur !== false;

    const overlay = document.createElement('div');
    overlay.className = `loading-overlay ${blur ? 'loading-overlay--blur' : ''}`;
    overlay.dataset.loadingId = id;
    overlay.innerHTML = `
      <div class="loading-overlay-content">
        <div class="loading-spinner loading-spinner--medium">
          <div class="loading-spinner-ring"></div>
        </div>
        <div class="loading-overlay-text">${text}</div>
      </div>
    `;

    el.style.position = 'relative';
    el.appendChild(overlay);

    _activeLoaders.set(id, { type: 'overlay', target: el, element: overlay });
    return id;
  }

  /**
   * Remove overlay.
   * @param {string} id - ID do loader
   */
  function hideOverlay(id) {
    hideSpinner(id);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PROMISE WRAPPER
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Executa uma promise com feedback visual automático.
   * @param {string|HTMLElement} target - Container
   * @param {Function} fn - Função async
   * @param {object} options - Opções: type, text, errorText
   * @returns {Promise}
   */
  async function withLoading(target, fn, options = {}) {
    const type = options.type || 'overlay';
    let loaderId;

    try {
      if (type === 'spinner') {
        loaderId = showSpinner(target, options);
      } else if (type === 'skeleton') {
        loaderId = showSkeleton(target, options);
      } else {
        loaderId = showOverlay(target, options);
      }

      const result = await fn();
      return result;
    } catch (error) {
      console.error('[LoadingStates] Error:', error);
      throw error;
    } finally {
      if (loaderId) {
        hideSpinner(loaderId);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LIMPEZA
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Remove todos os loaders ativos.
   */
  function hideAll() {
    _activeLoaders.forEach((loader, id) => {
      if (loader.element) loader.element.remove();
    });
    _activeLoaders.clear();
  }

  /**
   * Retorna loaders ativos.
   * @returns {number}
   */
  function getActiveCount() {
    return _activeLoaders.size;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  function _generateId() {
    return 'loader_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
  }

  function _randomWidth() {
    const widths = ['60%', '80%', '45%', '70%', '55%', '90%'];
    return widths[Math.floor(Math.random() * widths.length)];
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    showSpinner,
    hideSpinner,
    showSkeleton,
    hideSkeleton,
    showOverlay,
    hideOverlay,
    withLoading,
    hideAll,
    getActiveCount,
  };
})();
