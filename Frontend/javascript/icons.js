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
    sync: 'css/icons/refresh.svg',
  };

  // Ícones do menu: sprite vetorial herda a cor do tema e do item ativo.
  Object.assign(window.GCC_ICONS, {
    'nav-dashboard': 'assets/icons/navigation/sprite.svg#dashboard',
    'nav-inventario': 'assets/icons/navigation/sprite.svg#inventario',
    'nav-chamados': 'assets/icons/navigation/sprite.svg#chamados',
    'nav-chamados-salas': 'assets/icons/navigation/sprite.svg#chamados-salas',
    'nav-projetores': 'assets/icons/navigation/sprite.svg#projetores',
    'nav-assistencias': 'assets/icons/navigation/sprite.svg#assistencias',
    'nav-alunos': 'assets/icons/navigation/sprite.svg#alunos',
    'nav-carrinhos': 'assets/icons/navigation/sprite.svg#carrinhos',
    'nav-salas-turmas': 'assets/icons/navigation/sprite.svg#salas-turmas',
    'nav-exibicao': 'assets/icons/navigation/sprite.svg#exibicao',
    'nav-impressoras': 'assets/icons/navigation/sprite.svg#impressoras',
    'nav-inventario-geral': 'assets/icons/navigation/sprite.svg#inventario-geral',
    'nav-relatorios': 'assets/icons/navigation/sprite.svg#relatorios',
    'nav-auditoria': 'assets/icons/navigation/sprite.svg#auditoria',
    'nav-sincronizacao-glpi': 'assets/icons/navigation/sprite.svg#sincronizacao-glpi',
  });

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
    if (path.includes('#')) {
      const safeSize = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'].includes(size) ? size : 'md';
      return '<span class="gcc-icon gcc-icon--' + safeSize + '" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" focusable="false"><use href="' + path + '"></use></svg></span>';
    }
    return '<span class="gcc-icon gcc-icon--' + size + '" aria-hidden="true"><img src="' + path + '" alt="' + alt + '" loading="lazy" /></span>';
  };
})();
