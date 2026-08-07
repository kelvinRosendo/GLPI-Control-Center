/**
 * GLPI Control Center - notifications_center.js
 * -----------------------------------------------------------------------------
 * Lógica de negócio para o painel lateral de notificações.
 *
 * Gerencia:
 * - Abertura/fechamento do painel
 * - Filtros ativos
 * - Busca
 * - Agrupamento por data
 * - Ações em massa
 *
 * Sprint 10: Central de Notificações Inteligentes
 */

window.NotificationsCenter = (function () {

  // ── Estado ───────────────────────────────────────────────────────────────

  let _isOpen = false;
  let _activeFilter = 'ALL';
  let _searchQuery = '';
  let _listeners = [];

  // ══════════════════════════════════════════════════════════════════════════
  // PAINEL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Abre o painel de notificações.
   */
  function open() {
    _isOpen = true;
    _emit('center:open');
    _render();
  }

  /**
   * Fecha o painel de notificações.
   */
  function close() {
    _isOpen = false;
    _emit('center:close');
    _render();
  }

  /**
   * Alterna entre aberto/fechado.
   */
  function toggle() {
    if (_isOpen) {
      close();
    } else {
      open();
    }
  }

  /**
   * Retorna se o painel está aberto.
   */
  function isOpen() {
    return _isOpen;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FILTROS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Define o filtro ativo.
   * @param {string} filterKey
   */
  function setFilter(filterKey) {
    _activeFilter = filterKey;
    _emit('center:filter', { filter: filterKey });
    _render();
  }

  /**
   * Retorna o filtro ativo.
   */
  function getActiveFilter() {
    return _activeFilter;
  }

  /**
   * Retorna todos os filtros disponíveis.
   */
  function getFilters() {
    return Object.entries(window.NOTIFICATIONS_CONFIG.filters).map(function ([key, value]) {
      return {
        key: key,
        label: value.label,
        active: key === _activeFilter,
      };
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUSCA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Define a query de busca.
   * @param {string} query
   */
  function setSearch(query) {
    _searchQuery = query;
    _emit('center:search', { query: query });
    _render();
  }

  /**
   * Limpa a busca.
   */
  function clearSearch() {
    _searchQuery = '';
    _emit('center:search', { query: '' });
    _render();
  }

  /**
   * Retorna a query atual.
   */
  function getSearchQuery() {
    return _searchQuery;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DADOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna notificações processadas (filtradas, agrupadas).
   */
  function getData() {
    let items;

    // Aplicar busca
    if (_searchQuery) {
      items = window.Notifications.search(_searchQuery);
    } else {
      // Aplicar filtro
      items = window.Notifications.getFiltered(_activeFilter);
    }

    // Agrupar por data
    const groups = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    items.forEach(function (n) {
      const date = new Date(n.dataHora);
      if (date >= today) {
        groups.today.push(n);
      } else if (date >= yesterday) {
        groups.yesterday.push(n);
      } else if (date >= weekAgo) {
        groups.thisWeek.push(n);
      } else {
        groups.older.push(n);
      }
    });

    return {
      items: items,
      groups: groups,
      total: items.length,
      unread: items.filter(function (n) { return !n.lida; }).length,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AÇÕES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Marca uma notificação como lida.
   */
  function markAsRead(id) {
    window.Notifications.markAsRead(id);
    _render();
  }

  /**
   * Marca todas como lidas.
   */
  function markAllAsRead() {
    window.Notifications.markAllAsRead();
    _render();
  }

  /**
   * Exclui uma notificação.
   */
  function dismiss(id) {
    window.Notifications.dismiss(id);
    _render();
  }

  /**
   * Exclui todas.
   */
  function dismissAll() {
    window.Notifications.dismissAll();
    _render();
  }

  /**
   * Executa a ação de uma notificação.
   */
  function executeAction(id) {
    window.Notifications.executeAction(id);
    close(); // Fechar painel após ação
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  function _render() {
    _emit('center:render', {
      isOpen: _isOpen,
      filter: _activeFilter,
      search: _searchQuery,
      data: getData(),
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ATALHOS DE TECLADO
  // ══════════════════════════════════════════════════════════════════════════

  function _handleKeydown(e) {
    // ESC para fechar
    if (e.key === 'Escape' && _isOpen) {
      close();
      e.preventDefault();
    }
  }

  function _bindKeyboard() {
    document.addEventListener('keydown', _handleKeydown);
  }

  function _unbindKeyboard() {
    document.removeEventListener('keydown', _handleKeydown);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Inicializa o center.
   */
  function init() {
    _bindKeyboard();

    // Escutar novas notificações para atualizar badge
    document.addEventListener('notifications:new', function () {
      _render();
    });

    console.log('[NotificationsCenter] Inicializado');
  }

  /**
   * Destroi o center.
   */
  function destroy() {
    _unbindKeyboard();
    _listeners = [];
    _isOpen = false;
    _activeFilter = 'ALL';
    _searchQuery = '';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ══════════════════════════════════════════════════════════════════════════

  function _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init,
    destroy,
    open,
    close,
    toggle,
    isOpen,
    setFilter,
    getActiveFilter,
    getFilters,
    setSearch,
    clearSearch,
    getSearchQuery,
    getData,
    markAsRead,
    markAllAsRead,
    dismiss,
    dismissAll,
    executeAction,
  };

})();
