/**
 * GLPI Control Center - notifications_ui.js
 * -----------------------------------------------------------------------------
 * Renderização da Central de Notificações.
 *
 * Renderiza:
 * - Badge no topbar
 * - Painel lateral
 * - Lista de notificações
 * - Filtros
 * - Busca
 * - Agrupamento por data
 *
 * Sprint 10: Central de Notificações Inteligentes
 */

window.NotificationsUI = (function () {

  // ── Config ───────────────────────────────────────────────────────────────

  const UI_CONFIG = window.NOTIFICATIONS_CONFIG?.ui || {};

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Inicializa a UI e registra listeners.
   */
  function init() {
    _renderBadge();
    _renderPanel();
    _bindEvents();
    _listenToEvents();

    console.log('[NotificationsUI] Inicializada');
  }

  /**
   * Renderiza o badge no topbar.
   */
  function _renderBadge() {
    const badge = document.getElementById('notification-badge');
    const bellBtn = document.getElementById('notification-bell-btn');
    if (!badge || !bellBtn) return;

    const count = window.Notifications.getUnreadCount();
    const max = UI_CONFIG.badgeMax || 99;

    if (count === 0) {
      badge.style.display = 'none';
      badge.textContent = '';
    } else {
      badge.style.display = 'flex';
      badge.textContent = count > max ? `${max}+` : String(count);
    }
  }

  /**
   * Renderiza o painel lateral.
   */
  function _renderPanel() {
    const panel = document.getElementById('notifications-panel');
    if (!panel) return;

    const isOpen = window.NotificationsCenter.isOpen();
    panel.classList.toggle('open', isOpen);

    if (!isOpen) {
      panel.innerHTML = '';
      return;
    }

    const data = window.NotificationsCenter.getData();
    const filters = window.NotificationsCenter.getFilters();
    const search = window.NotificationsCenter.getSearchQuery();

    panel.innerHTML = `
      <div class="notif-panel-header">
        <h3>Notificações</h3>
        <div class="notif-panel-actions">
          <button class="notif-action-btn" data-notif-action="markAllRead" title="Marcar todas como lidas">
            ✓ Lidas
          </button>
          <button class="notif-action-btn notif-action-danger" data-notif-action="dismissAll" title="Excluir todas">
            ✕ Limpar
          </button>
          <button class="notif-close-btn" data-notif-action="close" title="Fechar (ESC)">
            ✕
          </button>
        </div>
      </div>

      <div class="notif-panel-search">
        <span class="notif-search-icon">🔍</span>
        <input
          type="text"
          class="notif-search-input"
          placeholder="Buscar notificações..."
          value="${_escapeAttr(search)}"
          data-notif-search
        />
        ${search ? '<button class="notif-search-clear" data-notif-action="clearSearch">✕</button>' : ''}
      </div>

      <div class="notif-panel-filters">
        ${filters.map(function (f) {
          return `<button class="notif-filter-btn ${f.active ? 'active' : ''}" data-notif-filter="${f.key}">${f.label}</button>`;
        }).join('')}
      </div>

      <div class="notif-panel-list" data-notif-list>
        ${_renderNotificationGroups(data.groups)}
      </div>

      <div class="notif-panel-footer">
        <span class="notif-count">${data.total} notificação(ões)</span>
        <span class="notif-unread-count">${data.unread} não lida(s)</span>
      </div>
    `;

    _bindPanelEvents();
    _applyReducedMotion();
  }

  /**
   * Renderiza grupos de notificações.
   */
  function _renderNotificationGroups(groups) {
    const sections = [];

    const groupLabels = {
      today: 'Hoje',
      yesterday: 'Ontem',
      thisWeek: 'Últimos 7 dias',
      older: 'Mais antigas',
    };

    Object.entries(groups).forEach(function ([key, items]) {
      if (items.length === 0) return;

      sections.push(`
        <div class="notif-group">
          <div class="notif-group-header">${groupLabels[key]}</div>
          ${items.map(_renderNotificationItem).join('')}
        </div>
      `);
    });

    if (sections.length === 0) {
      return '<div class="notif-empty">Nenhuma notificação encontrada</div>';
    }

    return sections.join('');
  }

  /**
   * Renderiza um item de notificação.
   */
  function _renderNotificationItem(notif) {
    const catConfig = window.NOTIFICATIONS_CONFIG.getCategory(notif.categoria);
    const timeAgo = _formatTimeAgo(notif.dataHora);

    return `
      <div class="notif-item ${notif.lida ? 'read' : 'unread'}" data-notif-id="${notif.id}">
        <div class="notif-item-icon" style="background:${catConfig.color}20;color:${catConfig.color}">
          ${notif.icone || catConfig.icon}
        </div>
        <div class="notif-item-content">
          <div class="notif-item-header">
            <span class="notif-item-title">${_escapeHtml(notif.titulo)}</span>
            <span class="notif-item-time">${timeAgo}</span>
          </div>
          <p class="notif-item-message">${_escapeHtml(notif.mensagem)}</p>
          <div class="notif-item-meta">
            <span class="notif-item-user">${_escapeHtml(notif.usuario)}</span>
            <span class="notif-item-source">${_escapeHtml(notif.origem)}</span>
            <span class="notif-item-priority" style="color:${window.NOTIFICATIONS_CONFIG.getPriority(notif.prioridade).color}">
              ${window.NOTIFICATIONS_CONFIG.getPriority(notif.prioridade).label}
            </span>
          </div>
          <div class="notif-item-actions">
            ${!notif.lida ? `<button class="notif-item-btn" data-notif-action="markRead" data-notif-target="${notif.id}" title="Marcar como lida">✓ Lida</button>` : ''}
            ${notif.acao ? `<button class="notif-item-btn notif-item-btn-primary" data-notif-action="executeAction" data-notif-target="${notif.id}" title="Abrir">→ Abrir</button>` : ''}
            <button class="notif-item-btn notif-item-btn-danger" data-notif-action="dismiss" data-notif-target="${notif.id}" title="Excluir">✕</button>
          </div>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  function _bindEvents() {
    // Botão do sino
    document.addEventListener('click', function (e) {
      const bellBtn = e.target.closest('[data-notif-action="toggle"]');
      if (bellBtn) {
        window.NotificationsCenter.toggle();
      }
    });
  }

  function _bindPanelEvents() {
    const panel = document.getElementById('notifications-panel');
    if (!panel) return;

    // Delegação de eventos
    panel.addEventListener('click', function (e) {
      const target = e.target.closest('[data-notif-action]');
      if (!target) return;

      const action = target.dataset.notifAction;
      const notifId = target.dataset.notifTarget;

      switch (action) {
        case 'close':
          window.NotificationsCenter.close();
          break;
        case 'markRead':
          window.NotificationsCenter.markAsRead(notifId);
          break;
        case 'markAllRead':
          window.NotificationsCenter.markAllAsRead();
          break;
        case 'dismiss':
          window.NotificationsCenter.dismiss(notifId);
          break;
        case 'dismissAll':
          window.NotificationsCenter.dismissAll();
          break;
        case 'executeAction':
          window.NotificationsCenter.executeAction(notifId);
          break;
        case 'clearSearch':
          window.NotificationsCenter.clearSearch();
          break;
      }
    });

    // Filtros
    panel.addEventListener('click', function (e) {
      const filterBtn = e.target.closest('[data-notif-filter]');
      if (filterBtn) {
        window.NotificationsCenter.setFilter(filterBtn.dataset.notifFilter);
      }
    });

    // Busca
    const searchInput = panel.querySelector('[data-notif-search]');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          window.NotificationsCenter.setSearch(searchInput.value);
        }, 300);
      });
    }
  }

  function _listenToEvents() {
    // Atualizar badge quando notificações mudam
    document.addEventListener('notifications:badge', function () {
      _renderBadge();
    });

    // Re-renderizar painel quando center renderiza
    document.addEventListener('center:render', function () {
      _renderPanel();
    });

    // Fechar painel
    document.addEventListener('center:close', function () {
      _renderPanel();
    });

    // Abrir painel
    document.addEventListener('center:open', function () {
      _renderPanel();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ══════════════════════════════════════════════════════════════════════════

  function _escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _escapeAttr(str) {
    return _escapeHtml(str);
  }

  function _formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Agora';
    if (diffMin < 60) return `${diffMin}min`;
    if (diffHr < 24) return `${diffHr}h`;
    if (diffDay < 7) return `${diffDay}d`;
    return date.toLocaleDateString('pt-BR');
  }

  function _applyReducedMotion() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.notif-item').forEach(function (el) {
        el.style.animation = 'none';
        el.style.transition = 'none';
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WIDGET DO DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza widget de notificações no dashboard.
   * @param {string} containerId
   */
  function renderDashboardWidget(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const items = window.Notifications.getAll().slice(0, 5);

    container.innerHTML = `
      <div class="notif-widget">
        <div class="notif-widget-header">
          <h4>🔔 Últimas Notificações</h4>
          <button class="notif-widget-more" data-notif-action="toggle">Ver todas →</button>
        </div>
        <div class="notif-widget-list">
          ${items.length === 0
            ? '<p class="notif-widget-empty">Nenhuma notificação recente</p>'
            : items.map(_renderWidgetItem).join('')
          }
        </div>
      </div>
    `;
  }

  function _renderWidgetItem(notif) {
    const catConfig = window.NOTIFICATIONS_CONFIG.getCategory(notif.categoria);
    const timeAgo = _formatTimeAgo(notif.dataHora);

    return `
      <div class="notif-widget-item ${notif.lida ? 'read' : 'unread'}">
        <span class="notif-widget-icon" style="color:${catConfig.color}">${notif.icone || catConfig.icon}</span>
        <div class="notif-widget-content">
          <span class="notif-widget-title">${_escapeHtml(notif.titulo)}</span>
          <span class="notif-widget-time">${timeAgo}</span>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init,
    renderDashboardWidget,
  };

})();
