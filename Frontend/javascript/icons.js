/**
 * GLPI Control Center - icons.js
 * -----------------------------------------------------------------------------
 * Sistema central de resolução de ícones SVG locais.
 *
 * Mapa de chaves → caminhos relativos à raiz do frontend.
 * Paths padronizados em lowercase para compatibilidade cross-platform.
 *
 * Sprint 29: Correção e Estabilização
 */

(function () {
  'use strict';

  window.GCC_ICONS = {
    dashboard: 'css/icons/dashboard.svg',
    computer: 'css/icons/computer.svg',
    chromebook: 'css/icons/chromebook.svg',
    projector: 'css/icons/projector.svg',
    printer: 'css/icons/printer.svg',
    tickets: 'css/icons/tickets.svg',
    assistance: 'css/icons/assistance.svg',
    analytics: 'css/icons/analytics.svg',
    reports: 'css/icons/reports.svg',
    audit: 'css/icons/audit.svg',
    notifications: 'css/icons/notifications.svg',
    suppliers: 'css/icons/suppliers.svg',
    integrations: 'css/icons/integrations.svg',
    settings: 'css/icons/settings.svg',
    refresh: 'css/icons/refresh.svg',
    logout: 'css/icons/logout.svg',
    user: 'css/icons/user.svg',
    success: 'css/icons/success.svg',
    warning: 'css/icons/warning.svg',
    error: 'css/icons/error.svg',
    info: 'css/icons/info.svg',
    cart: 'css/icons/cart.svg',
    search: 'css/icons/search.svg',
    'arrow-right': 'css/icons/arrow-right.svg',
    plus: 'css/icons/plus.svg',
    calendar: 'css/icons/calendar.svg',
  };

  /**
   * Retorna um elemento <span> com <img> para o ícone solicitado.
   * @param {string} key - Chave do ícone (ex: 'dashboard', 'computer')
   * @param {string} [size='md'] - Tamanho (xs, sm, md, lg, xl, 2xl)
   * @param {string} [alt=''] - Texto alternativo
   * @returns {string} HTML string
   */
  window.gccIcon = function (key, size, alt) {
    size = size || 'md';
    alt = alt || '';
    var path = window.GCC_ICONS[key];
    if (!path) {
      console.warn('[Icons] Ícone não encontrado:', key);
      return '';
    }
    return '<span class="gcc-icon gcc-icon--' + size + '" aria-hidden="true"><img src="' + path + '" alt="' + alt + '" loading="lazy" /></span>';
  };
})();
