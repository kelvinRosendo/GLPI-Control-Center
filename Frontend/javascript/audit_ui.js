/**
 * GLPI Control Center - audit_ui.js
 * -----------------------------------------------------------------------------
 * Módulo de UI do Sistema de Auditoria.
 *
 * Responsabilidades:
 * - Renderizar timeline estilo GitHub
 * - Barra de busca instantânea (sem reload)
 * - Filtros avançados (categoria, severidade, módulo, usuário, data)
 * - Detalhes do evento (modal)
 * - Paginação
 * - Atualização em tempo real (listener de novos eventos)
 *
 * NÃO registra eventos. Consulte audit.js.
 * NÃO persiste dados. Consulte audit_storage.js.
 *
 * Sprint 9: Auditoria Avançada e Linha do Tempo Global
 */

window.AuditUI = (function () {
  // ── Estado da UI ───────────────────────────────────────────────────────

  const _state = {
    currentPage: 1,
    pageSize: window.AUDIT_CONFIG.ui.timelinePageSize,
    filters: {
      search: '',
      category: 'todos',
      severity: 'todas',
      module: 'todos',
      user: '',
      dateFrom: '',
      dateTo: '',
    },
    searchTimeout: null,
    initialized: false,
  };

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Formata timestamp para exibição amigável.
   * @param {string} isoString
   * @returns {string}
   */
  function _formatTimestamp(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Agora';
    if (mins < 60) return `${mins}min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days === 1) return 'Ontem';
    if (days < 7) return `${days} dias atrás`;

    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) + ' ' + date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Retorna label do dia agrupado.
   * @param {string} isoString
   * @returns {string}
   */
  function _getDayLabel(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = today - eventDay;

    if (diff === 0) return 'Hoje';
    if (diff === 86400000) return 'Ontem';
    if (diff < 7 * 86400000) {
      return date.toLocaleDateString('pt-BR', { weekday: 'long' });
    }
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Trunca texto se muito longo.
   * @param {string} text
   * @param {number} max
   * @returns {string}
   */
  function _truncate(text, max) {
    if (!text) return '';
    if (text.length <= max) return text;
    return text.substring(0, max) + '...';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Renderiza a aba de Auditoria.
   * @param {HTMLElement} container
   */
  function render(container) {
    if (!container) return;

    container.innerHTML = `
      <div class="audit-module">
        <div class="audit-header">
          <div class="audit-header__title">
            <h2><i class="fas fa-shield-alt"></i> Auditoria</h2>
            <span class="audit-header__count" id="audit-total-count"></span>
          </div>
          <div class="audit-header__actions">
            <button class="btn btn-outline btn-sm" id="audit-refresh-btn" title="Atualizar">
              <i class="fas fa-sync-alt"></i>
            </button>
            <button class="btn btn-outline btn-sm" id="audit-clear-btn" title="Limpar registros">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>

        <!-- Barra de Busca -->
        <div class="audit-search">
          <div class="audit-search__input-wrapper">
            <i class="fas fa-search audit-search__icon"></i>
            <input type="text"
                   id="audit-search-input"
                   class="audit-search__input"
                   placeholder="Buscar por descrição, usuário, equipamento, fornecedor..."
                   autocomplete="off">
            <button class="audit-search__clear" id="audit-search-clear" title="Limpar busca">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>

        <!-- Filtros -->
        <div class="audit-filters">
          <div class="audit-filters__row">
            <div class="audit-filters__group">
              <label>Categoria</label>
              <select id="audit-filter-category" class="audit-filters__select">
                <option value="todos">Todas</option>
              </select>
            </div>
            <div class="audit-filters__group">
              <label>Severidade</label>
              <select id="audit-filter-severity" class="audit-filters__select">
                <option value="todas">Todas</option>
              </select>
            </div>
            <div class="audit-filters__group">
              <label>Módulo</label>
              <select id="audit-filter-module" class="audit-filters__select">
                <option value="todos">Todos</option>
              </select>
            </div>
            <div class="audit-filters__group">
              <label>Usuário</label>
              <input type="text" id="audit-filter-user" class="audit-filters__input"
                     placeholder="Filtrar por usuário">
            </div>
            <div class="audit-filters__group">
              <label>Data Início</label>
              <input type="date" id="audit-filter-dateFrom" class="audit-filters__input">
            </div>
            <div class="audit-filters__group">
              <label>Data Fim</label>
              <input type="date" id="audit-filter-dateTo" class="audit-filters__input">
            </div>
            <div class="audit-filters__group audit-filters__actions">
              <button class="btn btn-outline btn-sm" id="audit-filters-clear" title="Limpar filtros">
                <i class="fas fa-times"></i> Limpar
              </button>
            </div>
          </div>
        </div>

        <!-- Stats Cards -->
        <div class="audit-stats" id="audit-stats">
          <div class="audit-stats__card audit-stats__card--total">
            <span class="audit-stats__value" id="stat-total">0</span>
            <span class="audit-stats__label">Total</span>
          </div>
          <div class="audit-stats__card audit-stats__card--today">
            <span class="audit-stats__value" id="stat-today">0</span>
            <span class="audit-stats__label">Hoje</span>
          </div>
          <div class="audit-stats__card audit-stats__card--errors">
            <span class="audit-stats__value" id="stat-errors">0</span>
            <span class="audit-stats__label">Erros</span>
          </div>
          <div class="audit-stats__card audit-stats__card--week">
            <span class="audit-stats__value" id="stat-week">0</span>
            <span class="audit-stats__label">Esta Semana</span>
          </div>
        </div>

        <!-- Timeline -->
        <div class="audit-timeline" id="audit-timeline">
          <div class="audit-timeline__loading">Carregando...</div>
        </div>

        <!-- Paginação -->
        <div class="audit-pagination" id="audit-pagination"></div>

        <!-- Modal de Detalhes -->
        <div class="audit-modal-overlay" id="audit-modal-overlay" style="display:none;">
          <div class="audit-modal" id="audit-modal">
            <div class="audit-modal__header">
              <h3>Detalhes do Evento</h3>
              <button class="audit-modal__close" id="audit-modal-close">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="audit-modal__body" id="audit-modal-body"></div>
          </div>
        </div>
      </div>
    `;

    _populateFilters();
    _bindEvents();
    _refreshView();
    _state.initialized = true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FILTROS
  // ══════════════════════════════════════════════════════════════════════════

  function _populateFilters() {
    // Categorias
    const catSelect = document.getElementById('audit-filter-category');
    if (catSelect) {
      const cats = window.AUDIT_CONFIG.getCategories();
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.key;
        opt.textContent = c.label;
        catSelect.appendChild(opt);
      });
    }

    // Severidades
    const sevSelect = document.getElementById('audit-filter-severity');
    if (sevSelect) {
      const sevs = window.AUDIT_CONFIG.getSeverities();
      sevs.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.key;
        opt.textContent = s.label;
        sevSelect.appendChild(opt);
      });
    }

    // Módulos
    const modSelect = document.getElementById('audit-filter-module');
    if (modSelect) {
      Object.values(window.AUDIT_CONFIG.modules).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.key;
        opt.textContent = m.label;
        modSelect.appendChild(opt);
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BINDING DE EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  function _bindEvents() {
    // Busca instantânea com debounce
    const searchInput = document.getElementById('audit-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        clearTimeout(_state.searchTimeout);
        _state.searchTimeout = setTimeout(function () {
          _state.filters.search = searchInput.value;
          _state.currentPage = 1;
          _refreshView();
        }, window.AUDIT_CONFIG.ui.searchDebounceMs);
      });
    }

    // Limpar busca
    const searchClear = document.getElementById('audit-search-clear');
    if (searchClear) {
      searchClear.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        _state.filters.search = '';
        _state.currentPage = 1;
        _refreshView();
      });
    }

    // Filtros
    ['audit-filter-category', 'audit-filter-severity', 'audit-filter-module'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', function () {
          const key = id.replace('audit-filter-', '');
          _state.filters[key] = el.value;
          _state.currentPage = 1;
          _refreshView();
        });
      }
    });

    // Filtro de usuário
    const userInput = document.getElementById('audit-filter-user');
    if (userInput) {
      userInput.addEventListener('input', function () {
        clearTimeout(_state.searchTimeout);
        _state.searchTimeout = setTimeout(function () {
          _state.filters.user = userInput.value;
          _state.currentPage = 1;
          _refreshView();
        }, window.AUDIT_CONFIG.ui.searchDebounceMs);
      });
    }

    // Filtros de data
    ['audit-filter-dateFrom', 'audit-filter-dateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', function () {
          const key = id.replace('audit-filter-', '');
          _state.filters[key] = el.value;
          _state.currentPage = 1;
          _refreshView();
        });
      }
    });

    // Limpar filtros
    const clearBtn = document.getElementById('audit-filters-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        _resetFilters();
        _refreshView();
      });
    }

    // Atualizar
    const refreshBtn = document.getElementById('audit-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        window.AuditStorage.invalidateCache();
        _refreshView();
      });
    }

    // Limpar registros
    const clearAllBtn = document.getElementById('audit-clear-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function () {
        if (confirm('Tem certeza que deseja limpar todos os registros de auditoria?')) {
          window.AuditStorage.clear();
          _refreshView();
        }
      });
    }

    // Modal
    const modalOverlay = document.getElementById('audit-modal-overlay');
    const modalClose = document.getElementById('audit-modal-close');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) _closeModal();
      });
    }
    if (modalClose) {
      modalClose.addEventListener('click', _closeModal);
    }

    // Listener de novos eventos em tempo real
    window.addEventListener('audit:event-recorded', function () {
      _refreshView();
    });

    // Fechar modal com ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') _closeModal();
    });
  }

  function _resetFilters() {
    _state.filters = {
      search: '',
      category: 'todos',
      severity: 'todas',
      module: 'todos',
      user: '',
      dateFrom: '',
      dateTo: '',
    };
    _state.currentPage = 1;

    // Resetar UI dos filtros
    const searchInput = document.getElementById('audit-search-input');
    if (searchInput) searchInput.value = '';

    ['audit-filter-category', 'audit-filter-severity', 'audit-filter-module'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.selectedIndex = 0;
    });

    const userInput = document.getElementById('audit-filter-user');
    if (userInput) userInput.value = '';

    ['audit-filter-dateFrom', 'audit-filter-dateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ATUALIZAÇÃO DA VIEW
  // ══════════════════════════════════════════════════════════════════════════

  function _refreshView() {
    _updateStats();
    _renderTimeline();
    _renderPagination();
  }

  function _updateStats() {
    const stats = window.Audit.getStats();

    const totalEl = document.getElementById('stat-total');
    const todayEl = document.getElementById('stat-today');
    const errorsEl = document.getElementById('stat-errors');
    const weekEl = document.getElementById('stat-week');
    const countEl = document.getElementById('audit-total-count');

    if (totalEl) totalEl.textContent = stats.total.toLocaleString('pt-BR');
    if (todayEl) todayEl.textContent = stats.today.toLocaleString('pt-BR');
    if (errorsEl) errorsEl.textContent = (stats.bySeverity.error || 0).toLocaleString('pt-BR');
    if (weekEl) weekEl.textContent = stats.thisWeek.toLocaleString('pt-BR');
    if (countEl) countEl.textContent = `${stats.total} registro(s)`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIMELINE
  // ══════════════════════════════════════════════════════════════════════════

  function _renderTimeline() {
    const container = document.getElementById('audit-timeline');
    if (!container) return;

    const result = window.Audit.query({
      ..._state.filters,
      page: _state.currentPage,
      pageSize: _state.pageSize,
    });

    if (result.records.length === 0) {
      container.innerHTML = `
        <div class="audit-timeline__empty">
          <i class="fas fa-shield-alt"></i>
          <p>Nenhum registro encontrado.</p>
          <span>Ações registradas aparecerão aqui.</span>
        </div>
      `;
      return;
    }

    // Agrupar por dia
    const groups = {};
    result.records.forEach(record => {
      const dayKey = _getDayLabel(record.timestamp);
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(record);
    });

    let html = '';

    Object.entries(groups).forEach(([dayLabel, records]) => {
      html += `
        <div class="audit-timeline__group">
          <div class="audit-timeline__group-header">
            <span class="audit-timeline__group-label">${dayLabel}</span>
            <span class="audit-timeline__group-count">${records.length}</span>
          </div>
          <div class="audit-timeline__events">
      `;

      records.forEach(record => {
        const catConfig = window.AUDIT_CONFIG.getCategory(record.categoria);
        const sevConfig = window.AUDIT_CONFIG.getSeverity(record.severity);
        const truncatedDesc = _truncate(record.descricao, window.AUDIT_CONFIG.ui.maxDescriptionLength);

        html += `
          <div class="audit-timeline__event" data-id="${record.id}">
            <div class="audit-timeline__event-dot" style="background:${record.categoryColor}"></div>
            <div class="audit-timeline__event-content">
              <div class="audit-timeline__event-header">
                <span class="audit-timeline__event-icon" style="color:${record.categoryColor}">${record.categoryIcon}</span>
                <span class="audit-timeline__event-action">${record.acaoLabel}</span>
                <span class="audit-timeline__event-severity audit-timeline__event-severity--${record.severity}">
                  ${sevConfig ? sevConfig.icon : ''} ${sevConfig ? sevConfig.label : record.severity}
                </span>
                <span class="audit-timeline__event-time">${_formatTimestamp(record.timestamp)}</span>
              </div>
              <div class="audit-timeline__event-desc">${truncatedDesc}</div>
              <div class="audit-timeline__event-meta">
                <span class="audit-timeline__event-user"><i class="fas fa-user"></i> ${record.usuario}</span>
                <span class="audit-timeline__event-category" style="color:${record.categoryColor}">
                  ${catConfig ? catConfig.label : record.categoria}
                </span>
                ${record.equipamento ? `<span class="audit-timeline__event-equip"><i class="fas fa-desktop"></i> ${record.equipamento}</span>` : ''}
                ${record.fornecedor ? `<span class="audit-timeline__event-supplier"><i class="fas fa-truck"></i> ${record.fornecedor}</span>` : ''}
              </div>
            </div>
            <button class="audit-timeline__event-detail" data-id="${record.id}" title="Ver detalhes">
              <i class="fas fa-chevron-right"></i>
            </button>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Bind de detalhes
    container.querySelectorAll('.audit-timeline__event-detail, .audit-timeline__event').forEach(el => {
      el.addEventListener('click', function (e) {
        const id = el.dataset.id || el.closest('[data-id]')?.dataset.id;
        if (id) _showDetail(id);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGINAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  function _renderPagination() {
    const container = document.getElementById('audit-pagination');
    if (!container) return;

    const result = window.Audit.query({
      ..._state.filters,
      page: _state.currentPage,
      pageSize: _state.pageSize,
    });

    if (result.totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = `
      <div class="audit-pagination__nav">
        <button class="btn btn-sm btn-outline" ${result.page <= 1 ? 'disabled' : ''} data-page="${result.page - 1}">
          <i class="fas fa-chevron-left"></i>
        </button>
    `;

    const maxVisible = 5;
    let startPage = Math.max(1, result.page - Math.floor(maxVisible / 2));
    let endPage = Math.min(result.totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      html += `<button class="btn btn-sm btn-outline" data-page="1">1</button>`;
      if (startPage > 2) html += `<span class="audit-pagination__dots">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="btn btn-sm ${i === result.page ? 'btn-primary' : 'btn-outline'}" data-page="${i}">${i}</button>`;
    }

    if (endPage < result.totalPages) {
      if (endPage < result.totalPages - 1) html += `<span class="audit-pagination__dots">...</span>`;
      html += `<button class="btn btn-sm btn-outline" data-page="${result.totalPages}">${result.totalPages}</button>`;
    }

    html += `
        <button class="btn btn-sm btn-outline" ${result.page >= result.totalPages ? 'disabled' : ''} data-page="${result.page + 1}">
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
      <div class="audit-pagination__info">
        Mostrando ${(result.page - 1) * _state.pageSize + 1}–${Math.min(result.page * _state.pageSize, result.total)} de ${result.total}
      </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', function () {
        const page = parseInt(btn.dataset.page, 10);
        if (page >= 1 && page <= result.totalPages) {
          _state.currentPage = page;
          _refreshView();
        }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODAL DE DETALHES
  // ══════════════════════════════════════════════════════════════════════════

  function _showDetail(id) {
    const record = window.Audit.getById(id);
    if (!record) return;

    const modalOverlay = document.getElementById('audit-modal-overlay');
    const modalBody = document.getElementById('audit-modal-body');
    if (!modalOverlay || !modalBody) return;

    const catConfig = window.AUDIT_CONFIG.getCategory(record.categoria);
    const sevConfig = window.AUDIT_CONFIG.getSeverity(record.severity);
    const date = new Date(record.timestamp);

    modalBody.innerHTML = `
      <div class="audit-detail">
        <div class="audit-detail__header" style="border-left-color: ${record.categoryColor}">
          <span class="audit-detail__icon" style="color:${record.categoryColor}">${record.categoryIcon}</span>
          <div>
            <h4>${record.acaoLabel}</h4>
            <span class="audit-detail__severity audit-detail__severity--${record.severity}">
              ${sevConfig ? sevConfig.icon : ''} ${sevConfig ? sevConfig.label : record.severity}
            </span>
          </div>
        </div>

        <div class="audit-detail__grid">
          <div class="audit-detail__field">
            <label>Data/Hora</label>
            <span>${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}</span>
          </div>
          <div class="audit-detail__field">
            <label>Usuário</label>
            <span><i class="fas fa-user"></i> ${record.usuario}</span>
          </div>
          <div class="audit-detail__field">
            <label>Categoria</label>
            <span style="color:${record.categoryColor}">${catConfig ? catConfig.label : record.categoria}</span>
          </div>
          <div class="audit-detail__field">
            <label>Módulo</label>
            <span>${window.AUDIT_CONFIG.getModuleLabel(record.modulo)}</span>
          </div>
          ${record.equipamento ? `
          <div class="audit-detail__field">
            <label>Equipamento</label>
            <span><i class="fas fa-desktop"></i> ${record.equipamento}</span>
          </div>` : ''}
          ${record.fornecedor ? `
          <div class="audit-detail__field">
            <label>Fornecedor</label>
            <span><i class="fas fa-truck"></i> ${record.fornecedor}</span>
          </div>` : ''}
          <div class="audit-detail__field audit-detail__field--full">
            <label>Descrição</label>
            <span>${record.descricao}</span>
          </div>
          ${record.extras ? `
          <div class="audit-detail__field audit-detail__field--full">
            <label>Dados Extras</label>
            <pre class="audit-detail__extras">${JSON.stringify(record.extras, null, 2)}</pre>
          </div>` : ''}
          ${record.browser ? `
          <div class="audit-detail__field audit-detail__field--full">
            <label>Browser</label>
            <span class="audit-detail__browser">${record.browser.userAgent || 'N/A'}</span>
          </div>` : ''}
        </div>

        <div class="audit-detail__footer">
          <span class="audit-detail__id">ID: ${record.id}</span>
        </div>
      </div>
    `;

    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function _closeModal() {
    const modalOverlay = document.getElementById('audit-modal-overlay');
    if (modalOverlay) {
      modalOverlay.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    render: render,
    refresh: function () {
      _refreshView();
    },
    resetFilters: function () {
      _resetFilters();
      _refreshView();
    },
    getState: function () {
      return { ..._state };
    },
  };
})();
