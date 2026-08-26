/**
 * GLPI Control Center - sidebar.js
 * -----------------------------------------------------------------------------
 * Componente Sidebar — navegação lateral agrupada com ícones SVG locais.
 *
 * Grupos de navegação (Sprint 28):
 *   PRINCIPAL: Dashboard
 *   OPERAÇÃO: Inventário, Chamados, Projetores, Assistências
 *   GESTÃO: Analytics, Relatórios, Auditoria, Notificações
 *   INTEGRAÇÕES: Fornecedores, Integrações
 *   ADMINISTRAÇÃO: Configurações
 *
 * Sprint 28: Dashboard Corporativo
 */

window.Sidebar = (function () {
  'use strict';

  const STORAGE_KEY = 'gcc_sidebar_state';

  // ════════════════════════════════════════════════════════════════════════════
  // GRUPOS DE NAVEGAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  const NAV_GROUPS = [
    {
      id: 'principal',
      label: 'PRINCIPAL',
      items: [
        { id: 'home', label: 'Dashboard', icon: 'dashboard', module: 'home' },
      ],
    },
    {
      id: 'operacao',
      label: 'OPERAÇÃO',
      items: [
        { id: 'computadores', label: 'Inventário', icon: 'computer', module: 'computadores' },
        { id: 'chamados', label: 'Chamados', icon: 'tickets', module: 'chamados' },
        { id: 'projetores', label: 'Projetores', icon: 'projector', module: 'projetores' },
        { id: 'assistente', label: 'Assistências', icon: 'assistance', module: 'assistente' },
      ],
    },
    {
      id: 'gestao',
      label: 'GESTÃO',
      items: [
        { id: 'geekiees', label: 'Geekiees', icon: 'chromebook', module: 'geekiees' },
        { id: 'apoio', label: 'Carrinhos', icon: 'cart', module: 'apoio' },
        { id: 'impressoras', label: 'Impressoras', icon: 'printer', module: 'impressoras' },
        { id: 'relatorios', label: 'Relatórios', icon: 'reports', module: 'relatorios' },
        { id: 'auditoria', label: 'Auditoria', icon: 'audit', module: 'auditoria' },
      ],
    },
    {
      id: 'integracoes',
      label: 'INTEGRAÇÕES',
      items: [
        { id: 'fornecedores', label: 'Fornecedores', icon: 'suppliers', module: 'fornecedores' },
        { id: 'integracoes', label: 'Integrações', icon: 'integrations', module: 'integracoes' },
      ],
    },
    {
      id: 'admin',
      label: 'ADMINISTRAÇÃO',
      items: [
        { id: 'configuracoes', label: 'Configurações', icon: 'settings', module: 'configuracoes' },
      ],
    },
  ];

  // ════════════════════════════════════════════════════════════════════════════
  // ESTADO
  // ════════════════════════════════════════════════════════════════════════════

  let _collapsed = false;
  let _initialized = false;

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    _loadState();
    _initialized = true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function render() {
    const container = document.getElementById('sidebar');
    if (!container) return;

    const currentTab = window.STATE?.tab || 'home';
    const visibleModules = _getVisibleModules();

    let html = `
      <div class="sidebar-header">
        <img src="assets/branding/logo/logotextoesquerdabranco.png" alt="Colégio Satélite" class="sidebar-logo sidebar-logo-full" />
        <img src="assets/branding/logo/logo.png" alt="Colégio Satélite" class="sidebar-logo sidebar-logo-symbol" />
        <div class="sidebar-brand">
          <span class="sidebar-brand-name">GLPI Control Center</span>
          <span class="sidebar-brand-sub">Central de T.I.</span>
        </div>
      </div>
      <button class="sidebar-toggle" id="sidebar-toggle" aria-label="${_collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}">
        <span class="sidebar-toggle-icon">${_collapsed ? '&#9654;' : '&#9664;'}</span>
      </button>
      <nav class="sidebar-nav" role="navigation" aria-label="Navegação principal">
    `;

    NAV_GROUPS.forEach(group => {
      const visibleItems = group.items.filter(item => visibleModules.includes(item.module));
      if (visibleItems.length === 0) return;

      html += `<div class="sidebar-group">`;
      if (group.label) {
        html += `<div class="sidebar-group-label">${group.label}</div>`;
      }
      html += `<div class="sidebar-group-items">`;

      visibleItems.forEach(item => {
        const isActive = currentTab === item.id;
        const iconHtml = window.gccIcon ? window.gccIcon(item.icon, 'sm') : '';
        html += `
          <button class="sidebar-item ${isActive ? 'sidebar-item--active' : ''}"
                  data-sidebar-tab="${item.id}"
                  title="${item.label}"
                  aria-current="${isActive ? 'page' : 'false'}">
            <span class="sidebar-item-icon">${iconHtml}</span>
            <span class="sidebar-item-label">${item.label}</span>
          </button>
        `;
      });

      html += `</div></div>`;
    });

    html += `</nav>`;

    container.innerHTML = html;
    container.classList.toggle('sidebar--collapsed', _collapsed);
    container.classList.toggle('sidebar--expanded', !_collapsed);

    _bindEvents();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════════════════════

  function _bindEvents() {
    // Toggle sidebar
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => toggle());
    }

    // Itens de navegação
    document.querySelectorAll('.sidebar-item[data-sidebar-tab]').forEach(item => {
      item.addEventListener('click', () => {
        const tabId = item.dataset.sidebarTab;
        if (tabId && window.App?.go) {
          window.App.go(tabId);
        }
      });

      // Keyboard navigation
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TOGGLE
  // ════════════════════════════════════════════════════════════════════════════

  function toggle() {
    _collapsed = !_collapsed;
    _saveState();
    render();

    // Atualizar layout principal
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.classList.toggle('app--sidebar-collapsed', _collapsed);
      appEl.classList.toggle('app--sidebar-expanded', !_collapsed);
    }
  }

  function collapse() {
    if (!_collapsed) {
      _collapsed = true;
      _saveState();
      render();
    }
  }

  function expand() {
    if (_collapsed) {
      _collapsed = false;
      _saveState();
      render();
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  function _getVisibleModules() {
    // Usar PermissionChecker se disponível
    if (window.PC?.getVisibleModuleKeys) {
      return window.PC.getVisibleModuleKeys();
    }
    // Fallback para UserContext
    if (window.UserContext?.getVisibleModules) {
      return window.UserContext.getVisibleModules().map(m => m.key);
    }
    // Fallback: todos os módulos
    return Object.keys(window.Permissions?.getModules?.() || {});
  }

  function _loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        _collapsed = state.collapsed || false;
      }
    } catch {
      _collapsed = false;
    }
  }

  function _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed: _collapsed }));
    } catch {
      // Ignorar erros de storage
    }
  }

  function isCollapsed() {
    return _collapsed;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BREADCRUMB
  // ════════════════════════════════════════════════════════════════════════════

  function renderBreadcrumb() {
    const currentTab = window.STATE?.tab || 'home';
    let groupLabel = '';
    let itemLabel = '';

    NAV_GROUPS.forEach(group => {
      const item = group.items.find(i => i.id === currentTab);
      if (item) {
        groupLabel = group.label || 'Início';
        itemLabel = item.label;
      }
    });

    return `
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <ol class="breadcrumb-list">
          <li class="breadcrumb-item">
            <a href="#" class="breadcrumb-link" data-sidebar-tab="home">Home</a>
          </li>
          ${groupLabel && groupLabel !== 'Início' ? `
          <li class="breadcrumb-item">
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-text">${groupLabel}</span>
          </li>
          ` : ''}
          ${itemLabel ? `
          <li class="breadcrumb-item breadcrumb-item--current">
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-text" aria-current="page">${itemLabel}</span>
          </li>
          ` : ''}
        </ol>
      </nav>
    `;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    render,
    toggle,
    collapse,
    expand,
    isCollapsed,
    renderBreadcrumb,
    NAV_GROUPS,
  };
})();
