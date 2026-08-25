/**
 * GLPI Control Center - search_ui.js
 * -----------------------------------------------------------------------------
 * Interface de busca global.
 *
 * Sprint 18: Search Global
 */

window.SearchUI = (function () {
  'use strict';

  let _initialized = false;
  let _isOpen = false;

  const FILTERS = [
    { key: 'all', label: 'Todos' },
    { key: 'computadores', label: 'Computadores' },
    { key: 'chromebooks_geekiees', label: 'Geekie' },
    { key: 'chromebooks_apoio', label: 'Apoio' },
    { key: 'projetores', label: 'Projetores' },
    { key: 'impressoras', label: 'Impressoras' },
  ];

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    if (_initialized) return;
    _initialized = true;
    _createModal();
    _bindEvents();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MODAL DE BUSCA
  // ════════════════════════════════════════════════════════════════════════════

  function _createModal() {
    if (document.getElementById('search-global-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'search-global-modal';
    modal.className = 'search-modal';
    modal.innerHTML = `
      <div class="search-modal-backdrop" data-search-action="close"></div>
      <div class="search-modal-content">
        <div class="search-modal-input-wrap">
          <span class="search-modal-icon">&#128269;</span>
          <input type="text" id="search-global-input" class="search-modal-input"
                 placeholder="Buscar ativos... (Ctrl+K)" autocomplete="off" />
          <kbd class="search-modal-kbd">ESC</kbd>
        </div>
        <div class="search-modal-filters" id="search-modal-filters">
          ${FILTERS.map(f => `
            <button class="search-filter-btn ${f.key === 'all' ? 'active' : ''}"
                    data-search-filter="${f.key}">${f.label}</button>
          `).join('')}
        </div>
        <div class="search-modal-results" id="search-modal-results"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function _renderResults(data) {
    const container = document.getElementById('search-modal-results');
    if (!container) return;

    const { results, total, query, filter } = data;

    if (!query) {
      container.innerHTML = _renderHistory();
      return;
    }

    if (results.length === 0) {
      container.innerHTML = `<div class="search-modal-empty">Nenhum resultado para "${_escapeHtml(query)}"</div>`;
      return;
    }

    const grouped = _groupByType(results);
    let html = `<div class="search-modal-count">${total} resultado${total !== 1 ? 's' : ''}</div>`;

    for (const [type, items] of Object.entries(grouped)) {
      const filterDef = FILTERS.find(f => f.key === type);
      html += `<div class="search-modal-group">`;
      html += `<div class="search-modal-group-title">${filterDef?.label || type} (${items.length})</div>`;
      items.forEach(item => {
        html += _renderResultItem(item);
      });
      html += `</div>`;
    }

    container.innerHTML = html;
  }

  function _renderResultItem(item) {
    const statusClass = _getStatusClass(item.status);
    return `
      <a class="search-modal-item" href="${_escapeHtml(item.link || '#')}" data-search-action="navigate">
        <div class="search-modal-item-icon ${statusClass}">${_getTypeIcon(item.type)}</div>
        <div class="search-modal-item-info">
          <div class="search-modal-item-name">${_highlightQuery(item.name)}</div>
          <div class="search-modal-item-meta">
            ${item.serial ? `SN: ${_escapeHtml(item.serial)}` : ''}
            ${item.patrimonio ? ` | Pat: ${_escapeHtml(item.patrimonio)}` : ''}
            ${item.local ? ` | ${_escapeHtml(item.local)}` : ''}
          </div>
        </div>
        <div class="search-modal-item-status ${statusClass}">${_escapeHtml(item.status || '-')}</div>
      </a>
    `;
  }

  function _renderHistory() {
    const history = window.Search.getHistory();
    if (history.length === 0) {
      return `<div class="search-modal-empty">Digite para buscar ativos</div>`;
    }

    let html = `<div class="search-modal-group">`;
    html += `<div class="search-modal-group-title">Buscas recentes</div>`;
    history.slice(0, 5).forEach(h => {
      html += `
        <button class="search-modal-item search-history-item" data-search-query="${_escapeHtml(h.query)}">
          <div class="search-modal-item-icon history">&#128337;</div>
          <div class="search-modal-item-info">
            <div class="search-modal-item-name">${_escapeHtml(h.query)}</div>
          </div>
        </button>
      `;
    });
    html += `</div>`;
    return html;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════════════════════

  function _bindEvents() {
    // Input de busca
    document.addEventListener('input', function (e) {
      if (e.target.id === 'search-global-input') {
        window.Search.searchDebounced(e.target.value);
      }
    });

    // Click em itens
    document.addEventListener('click', function (e) {
      const target = e.target.closest('[data-search-action]');
      if (!target) return;

      const action = target.dataset.searchAction;
      if (action === 'close') {
        close();
      } else if (action === 'navigate') {
        close();
      }
    });

    // Click em filtros
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-search-filter]');
      if (!btn) return;

      document.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.Search.setFilter(btn.dataset.searchFilter);
    });

    // Click em histórico
    document.addEventListener('click', function (e) {
      const item = e.target.closest('[data-search-query]');
      if (!item) return;

      const input = document.getElementById('search-global-input');
      if (input) {
        input.value = item.dataset.searchQuery;
        window.Search.search(item.dataset.searchQuery);
        input.focus();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && _isOpen) {
        close();
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ABERTURA/FECHAMENTO
  // ════════════════════════════════════════════════════════════════════════════

  function open() {
    const modal = document.getElementById('search-global-modal');
    const input = document.getElementById('search-global-input');
    if (modal) {
      modal.classList.add('open');
      _isOpen = true;
      if (input) {
        input.value = '';
        input.focus();
      }
      window.Search.clear();
    }
  }

  function close() {
    const modal = document.getElementById('search-global-modal');
    if (modal) {
      modal.classList.remove('open');
      _isOpen = false;
      window.Search.clear();
    }
  }

  function toggle() {
    _isOpen ? close() : open();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  function _groupByType(results) {
    const groups = {};
    results.forEach(r => {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    });
    return groups;
  }

  function _getStatusClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('ativo') || s.includes('ok') || s.includes('funcional')) return 'status-active';
    if (s.includes('manuten') || s.includes('defeito')) return 'status-maintenance';
    if (s.includes('emprest') || s.includes('loan')) return 'status-loan';
    if (s.includes('inativo') || s.includes('descart')) return 'status-inactive';
    return '';
  }

  function _getTypeIcon(type) {
    const icons = {
      computadores: '&#128187;',
      chromebooks_geekiees: '&#128187;',
      chromebooks_apoio: '&#128187;',
      projetores: '&#128190;',
      impressoras: '&#128424;',
    };
    return icons[type] || '&#128269;';
  }

  function _highlightQuery(text) {
    if (!window.Search.getQuery()) return _escapeHtml(text);
    const escaped = window.Search.getQuery().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return _escapeHtml(text).replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }

  function _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LISTENERS DE EVENTOS
  // ════════════════════════════════════════════════════════════════════════════

  function _listenToSearchEvents() {
    document.addEventListener('search:results', (e) => _renderResults(e.detail));
    document.addEventListener('search:empty', (e) => {
      const container = document.getElementById('search-modal-results');
      if (container) {
        container.innerHTML = `<div class="search-modal-empty">Nenhum resultado para "${_escapeHtml(e.detail.query)}"</div>`;
      }
    });
    document.addEventListener('search:clear', () => {
      const container = document.getElementById('search-modal-results');
      if (container) container.innerHTML = _renderHistory();
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init: function () {
      init();
      _listenToSearchEvents();
    },
    open,
    close,
    toggle,
    isOpen: function () { return _isOpen; },
  };
})();
