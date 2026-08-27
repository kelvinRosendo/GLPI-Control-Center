/**
 * GLPI Control Center - search_ui.js
 * -----------------------------------------------------------------------------
 * Interface de busca global — Sprint 30.
 *
 * Dois modos:
 * 1. Modal (Ctrl+K backup / overlay)
 * 2. Topbar (barra inline no header)
 */

window.SearchUI = (function () {
  'use strict';

  let _initialized = false;
  let _isOpen = false;
  let _topbarSelectedIndex = -1;

  const FILTERS = [
    { key: 'all', label: 'Todos' },
    { key: 'computadores', label: 'Computadores' },
    { key: 'chromebooks_geekiees', label: 'Geekie' },
    { key: 'chromebooks_apoio', label: 'Apoio' },
    { key: 'projetores', label: 'Projetores' },
    { key: 'impressoras', label: 'Impressoras' },
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  function init() {
    if (_initialized) return;
    _initialized = true;
    _createModal();
    _bindEvents();
    _bindTopbarSearch();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODAL DE BUSCA (backup)
  // ══════════════════════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════════════════════
  // TOPBAR SEARCH
  // ══════════════════════════════════════════════════════════════════════════

  function _bindTopbarSearch() {
    const input = document.getElementById('topbar-search-input');
    const dropdown = document.getElementById('topbar-search-dropdown');
    if (!input || !dropdown) return;

    // Input event — debounced search
    input.addEventListener('input', function () {
      const q = input.value.trim();
      if (!q) {
        _closeTopbarDropdown();
        window.Search.clear();
        return;
      }
      window.Search.searchDebounced(q);
    });

    // Focus — show dropdown if there are results
    input.addEventListener('focus', function () {
      if (window.Search.getResults().length > 0 || window.Search.getQuery()) {
        _openTopbarDropdown();
      } else {
        _showTopbarHistory(dropdown);
      }
    });

    // Click outside — close
    document.addEventListener('click', function (e) {
      const search = document.getElementById('topbar-search');
      if (search && !search.contains(e.target)) {
        _closeTopbarDropdown();
      }
    });

    // Keyboard navigation
    input.addEventListener('keydown', function (e) {
      const items = dropdown.querySelectorAll('.topbar-search-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _topbarSelectedIndex = Math.min(_topbarSelectedIndex + 1, items.length - 1);
        _highlightTopbarItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _topbarSelectedIndex = Math.max(_topbarSelectedIndex - 1, 0);
        _highlightTopbarItem(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (_topbarSelectedIndex >= 0 && items[_topbarSelectedIndex]) {
          items[_topbarSelectedIndex].click();
        } else if (items.length > 0) {
          items[0].click();
        }
      } else if (e.key === 'Escape') {
        _closeTopbarDropdown();
        input.blur();
      }
    });

    // Ctrl+K listener
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        input.focus();
        input.select();
        _openTopbarDropdown();
      }
    });
  }

  function _openTopbarDropdown() {
    const dropdown = document.getElementById('topbar-search-dropdown');
    if (dropdown) {
      dropdown.classList.add('open');
      _isOpen = true;
    }
  }

  function _closeTopbarDropdown() {
    const dropdown = document.getElementById('topbar-search-dropdown');
    if (dropdown) {
      dropdown.classList.remove('open');
      _isOpen = false;
      _topbarSelectedIndex = -1;
    }
  }

  function _highlightTopbarItem(items) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === _topbarSelectedIndex);
    });
    if (items[_topbarSelectedIndex]) {
      items[_topbarSelectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function _showTopbarHistory(dropdown) {
    const history = window.Search.getHistory();
    if (history.length === 0) {
      dropdown.innerHTML = '<div class="topbar-search-empty">Digite para buscar ativos</div>';
      _openTopbarDropdown();
      return;
    }

    let html = '<div class="topbar-search-header"><span class="topbar-search-count">Buscas recentes</span></div>';
    history.slice(0, 5).forEach(h => {
      html += `
        <div class="topbar-search-item" data-topbar-search-query="${_escapeAttr(h.query)}">
          <div class="topbar-search-item-icon">&#128337;</div>
          <div class="topbar-search-item-info">
            <div class="topbar-search-item-name">${_escapeHtml(h.query)}</div>
          </div>
        </div>
      `;
    });
    dropdown.innerHTML = html;
    _openTopbarDropdown();

    // Bind history clicks
    dropdown.querySelectorAll('[data-topbar-search-query]').forEach(el => {
      el.addEventListener('click', () => {
        const input = document.getElementById('topbar-search-input');
        if (input) {
          input.value = el.dataset.topbarSearchQuery;
          window.Search.search(el.dataset.topbarSearchQuery);
          input.focus();
        }
      });
    });
  }

  function _renderTopbarResults(data) {
    const dropdown = document.getElementById('topbar-search-dropdown');
    if (!dropdown) return;

    const { results, total, query } = data;

    if (!query) {
      _showTopbarHistory(dropdown);
      return;
    }

    if (results.length === 0) {
      dropdown.innerHTML = `
        <div class="topbar-search-empty">
          Nenhum ativo encontrado para "${_escapeHtml(query)}"<br>
          <small>Tente: nome, patrimônio, série, sala</small>
        </div>
      `;
      _openTopbarDropdown();
      return;
    }

    // Mostrar max 8 resultados
    const displayed = results.slice(0, 8);
    const hasMore = results.length > 8;

    let html = `
      <div class="topbar-search-header">
        <span class="topbar-search-count">${total} resultado${total !== 1 ? 's' : ''}</span>
        <button class="topbar-search-clear" data-topbar-action="clear">Limpar</button>
      </div>
    `;

    displayed.forEach(item => {
      const typeIcon = _getTopbarTypeIcon(item.type);
      const typeName = _getTopbarTypeName(item.type);
      const meta = _buildItemMeta(item);

      html += `
        <div class="topbar-search-item" data-topbar-action="navigate" data-topbar-type="${_escapeAttr(item.type)}" data-topbar-id="${_escapeAttr(String(item.id || ''))}">
          <div class="topbar-search-item-icon">${typeIcon}</div>
          <div class="topbar-search-item-info">
            <div class="topbar-search-item-name">${_highlightQuery(item.name)}</div>
            ${meta ? `<div class="topbar-search-item-meta">${meta}</div>` : ''}
          </div>
          <span class="topbar-search-item-type">${typeName}</span>
        </div>
      `;
    });

    if (hasMore) {
      html += `
        <div class="topbar-search-footer">
          <button class="topbar-search-all" data-topbar-action="view-all">Ver todos os ${results.length} resultados</button>
        </div>
      `;
    }

    dropdown.innerHTML = html;
    _openTopbarDropdown();
    _topbarSelectedIndex = -1;

    // Bind result clicks
    dropdown.querySelectorAll('[data-topbar-action="navigate"]').forEach(el => {
      el.addEventListener('click', () => {
        const type = el.dataset.topbarType;
        const id = el.dataset.topbarId;
        _closeTopbarDropdown();
        const input = document.getElementById('topbar-search-input');
        if (input) input.value = '';

        // Navegar para o ativo
        if (window.AssetResolver) {
          window.AssetResolver.navigate({ type, id });
        } else {
          // Fallback: navegar para a tab do tipo
          const tab = _getTabForType(type);
          if (tab && window.App?.go) window.App.go(tab);
        }
      });
    });

    // Clear button
    dropdown.querySelectorAll('[data-topbar-action="clear"]').forEach(el => {
      el.addEventListener('click', () => {
        const input = document.getElementById('topbar-search-input');
        if (input) {
          input.value = '';
          input.focus();
        }
        window.Search.clear();
        _showTopbarHistory(dropdown);
      });
    });

    // View all button
    dropdown.querySelectorAll('[data-topbar-action="view-all"]').forEach(el => {
      el.addEventListener('click', () => {
        _closeTopbarDropdown();
        // Navegar para inventário com o termo de busca
        if (window.App?.go) {
          window.App.go('computadores', { search: window.Search.getQuery() });
        }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO MODAL
  // ══════════════════════════════════════════════════════════════════════════

  function _renderResults(data) {
    // Modal rendering
    const container = document.getElementById('search-modal-results');
    if (container) {
      const { results, total, query } = data;
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
        items.forEach(item => { html += _renderResultItem(item); });
        html += `</div>`;
      }
      container.innerHTML = html;
    }

    // Topbar rendering
    _renderTopbarResults(data);
  }

  function _renderResultItem(item) {
    const statusClass = _getStatusClass(item.status);
    return `
      <a class="search-modal-item" href="${_escapeAttr(item.link || '#')}" data-search-action="navigate">
        <div class="search-modal-item-icon ${statusClass}">${_getTopbarTypeIcon(item.type)}</div>
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
        <button class="search-modal-item search-history-item" data-search-query="${_escapeAttr(h.query)}">
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

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  function _bindEvents() {
    // Modal input
    document.addEventListener('input', function (e) {
      if (e.target.id === 'search-global-input') {
        window.Search.searchDebounced(e.target.value);
      }
    });

    // Click in modal items
    document.addEventListener('click', function (e) {
      const target = e.target.closest('[data-search-action]');
      if (!target) return;
      if (target.dataset.searchAction === 'close') {
        close();
      } else if (target.dataset.searchAction === 'navigate') {
        close();
      }
    });

    // Click on modal filters
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-search-filter]');
      if (!btn) return;
      document.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.Search.setFilter(btn.dataset.searchFilter);
    });

    // Click on modal history
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

    // Keyboard: ESC closes modal
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _isOpen) {
        close();
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ABERTURA/FECHAMENTO MODAL
  // ══════════════════════════════════════════════════════════════════════════

  function open() {
    const modal = document.getElementById('search-global-modal');
    const input = document.getElementById('search-global-input');
    if (modal) {
      modal.classList.add('open');
      _isOpen = true;
      if (input) { input.value = ''; input.focus(); }
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
    _closeTopbarDropdown();
  }

  function toggle() {
    _isOpen ? close() : open();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ══════════════════════════════════════════════════════════════════════════

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

  function _getTopbarTypeIcon(type) {
    const icons = {
      computadores: '&#128187;',
      chromebooks_geekiees: '&#128187;',
      chromebooks_apoio: '&#128187;',
      projetores: '&#128190;',
      impressoras: '&#128424;',
    };
    return icons[type] || '&#128269;';
  }

  function _getTopbarTypeName(type) {
    const names = {
      computadores: 'Computador',
      chromebooks_geekiees: 'Chromebook',
      chromebooks_apoio: 'Chromebook',
      projetores: 'Projetor',
      impressoras: 'Impressora',
    };
    return names[type] || 'Ativo';
  }

  function _getTabForType(type) {
    const tabs = {
      computadores: 'computadores',
      chromebooks_geekiees: 'geekiees',
      chromebooks_apoio: 'apoio',
      projetores: 'projetores',
      impressoras: 'impressoras',
    };
    return tabs[type] || 'computadores';
  }

  function _buildItemMeta(item) {
    const parts = [];
    if (item.patrimonio) parts.push(`Pat: ${item.patrimonio}`);
    if (item.local) parts.push(item.local);
    if (item.user) parts.push(item.user);
    return parts.join(' · ');
  }

  function _highlightQuery(text) {
    const q = window.Search.getQuery();
    if (!q) return _escapeHtml(text);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return _escapeHtml(text).replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }

  function _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function _escapeAttr(str) {
    return _escapeHtml(str);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LISTENERS DE EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  function _listenToSearchEvents() {
    document.addEventListener('search:results', (e) => _renderResults(e.detail));
    document.addEventListener('search:empty', (e) => {
      const container = document.getElementById('search-modal-results');
      if (container) {
        container.innerHTML = `<div class="search-modal-empty">Nenhum resultado para "${_escapeHtml(e.detail.query)}"</div>`;
      }
      _renderTopbarResults({ results: [], total: 0, query: e.detail.query });
    });
    document.addEventListener('search:clear', () => {
      const container = document.getElementById('search-modal-results');
      if (container) container.innerHTML = _renderHistory();
      _closeTopbarDropdown();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

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
