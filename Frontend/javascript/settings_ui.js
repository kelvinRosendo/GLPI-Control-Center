/**
 * GLPI Control Center - settings_ui.js
 * -----------------------------------------------------------------------------
 * Interface de configurações do sistema.
 *
 * Sprint 20: Settings
 */

window.SettingsUI = (function () {
  'use strict';

  let _initialized = false;
  let _activeCategory = 'appearance';

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
  // MODAL
  // ════════════════════════════════════════════════════════════════════════════

  function _createModal() {
    if (document.getElementById('settings-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'settings-modal';
    modal.innerHTML = `
      <div class="settings-backdrop" data-settings-action="close"></div>
      <div class="settings-content">
        <div class="settings-header">
          <h2>Configurações</h2>
          <button class="settings-close" data-settings-action="close">&times;</button>
        </div>
        <div class="settings-body">
          <nav class="settings-sidebar" id="settings-sidebar"></nav>
          <main class="settings-main" id="settings-main"></main>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDERIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function _renderSidebar() {
    const container = document.getElementById('settings-sidebar');
    if (!container) return;

    const categories = window.Settings.getCategories();
    container.innerHTML = categories.map(cat => `
      <button class="settings-nav-item ${cat.key === _activeCategory ? 'active' : ''}"
              data-settings-category="${cat.key}">
        <span class="settings-nav-icon">${cat.icon}</span>
        <div class="settings-nav-info">
          <span class="settings-nav-label">${cat.label}</span>
          <span class="settings-nav-desc">${cat.description}</span>
        </div>
      </button>
    `).join('');
  }

  function _renderContent() {
    const container = document.getElementById('settings-main');
    if (!container) return;

    const cat = window.Settings.getCategory(_activeCategory);
    const settings = window.Settings.get(_activeCategory);

    let html = `<div class="settings-section">`;
    html += `<h3 class="settings-section-title">${cat.label}</h3>`;

    switch (_activeCategory) {
      case 'appearance':
        html += _renderAppearance(settings);
        break;
      case 'notifications':
        html += _renderNotifications(settings);
        break;
      case 'behavior':
        html += _renderBehavior(settings);
        break;
      case 'privacy':
        html += _renderPrivacy(settings);
        break;
      case 'about':
        html += _renderAbout();
        break;
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FORMULÁRIOS POR CATEGORIA
  // ════════════════════════════════════════════════════════════════════════════

  function _renderAppearance(s) {
    return `
      <div class="settings-field">
        <label class="settings-label">Tema</label>
        <div class="settings-toggle-group">
          <button class="settings-toggle-btn ${s.theme === 'dark' ? 'active' : ''}"
                  data-settings-set="appearance.theme" data-settings-value="dark">
            &#127761; Escuro
          </button>
          <button class="settings-toggle-btn ${s.theme === 'light' ? 'active' : ''}"
                  data-settings-set="appearance.theme" data-settings-value="light">
            &#9728; Claro
          </button>
        </div>
      </div>

      <div class="settings-field">
        <label class="settings-label">Modo Compacto</label>
        <label class="settings-switch">
          <input type="checkbox" ${s.compactMode ? 'checked' : ''}
                 data-settings-set="appearance.compactMode" data-settings-type="checkbox" />
          <span class="settings-switch-slider"></span>
        </label>
      </div>

      <div class="settings-field">
        <label class="settings-label">Animações</label>
        <label class="settings-switch">
          <input type="checkbox" ${s.animationsEnabled ? 'checked' : ''}
                 data-settings-set="appearance.animationsEnabled" data-settings-type="checkbox" />
          <span class="settings-switch-slider"></span>
        </label>
      </div>

      <div class="settings-field">
        <label class="settings-label">Tamanho da Fonte</label>
        <select class="settings-select" data-settings-set="appearance.fontSize">
          <option value="small" ${s.fontSize === 'small' ? 'selected' : ''}>Pequena</option>
          <option value="normal" ${s.fontSize === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="large" ${s.fontSize === 'large' ? 'selected' : ''}>Grande</option>
        </select>
      </div>
    `;
  }

  function _renderNotifications(s) {
    return `
      <div class="settings-field">
        <label class="settings-label">Notificações Ativas</label>
        <label class="settings-switch">
          <input type="checkbox" ${s.enabled ? 'checked' : ''}
                 data-settings-set="notifications.enabled" data-settings-type="checkbox" />
          <span class="settings-switch-slider"></span>
        </label>
      </div>

      <div class="settings-field">
        <label class="settings-label">Som</label>
        <label class="settings-switch">
          <input type="checkbox" ${s.soundEnabled ? 'checked' : ''}
                 data-settings-set="notifications.soundEnabled" data-settings-type="checkbox" />
          <span class="settings-switch-slider"></span>
        </label>
      </div>

      <div class="settings-field">
        <label class="settings-label">Notificações Desktop</label>
        <label class="settings-switch">
          <input type="checkbox" ${s.desktopEnabled ? 'checked' : ''}
                 data-settings-set="notifications.desktopEnabled" data-settings-type="checkbox" />
          <span class="settings-switch-slider"></span>
        </label>
      </div>

      <div class="settings-field">
        <label class="settings-label">Prioridade Mínima</label>
        <select class="settings-select" data-settings-set="notifications.minPriority">
          <option value="LOW" ${s.minPriority === 'LOW' ? 'selected' : ''}>Todas</option>
          <option value="NORMAL" ${s.minPriority === 'NORMAL' ? 'selected' : ''}>Normal+</option>
          <option value="HIGH" ${s.minPriority === 'HIGH' ? 'selected' : ''}>Alta+</option>
          <option value="CRITICAL" ${s.minPriority === 'CRITICAL' ? 'selected' : ''}>Crítica</option>
        </select>
      </div>
    `;
  }

  function _renderBehavior(s) {
    return `
      <div class="settings-field">
        <label class="settings-label">Atalhos de Teclado</label>
        <label class="settings-switch">
          <input type="checkbox" ${s.shortcutsEnabled ? 'checked' : ''}
                 data-settings-set="behavior.shortcutsEnabled" data-settings-type="checkbox" />
          <span class="settings-switch-slider"></span>
        </label>
      </div>

      <div class="settings-field">
        <label class="settings-label">Auto-Refresh</label>
        <label class="settings-switch">
          <input type="checkbox" ${s.autoRefresh ? 'checked' : ''}
                 data-settings-set="behavior.autoRefresh" data-settings-type="checkbox" />
          <span class="settings-switch-slider"></span>
        </label>
      </div>

      <div class="settings-field">
        <label class="settings-label">Intervalo de Refresh (seg)</label>
        <input type="number" class="settings-input" min="60" max="3600"
               value="${s.autoRefreshInterval || 300}"
               data-settings-set="behavior.autoRefreshInterval" data-settings-type="number" />
      </div>

      <div class="settings-field">
        <label class="settings-label">Aba Padrão</label>
        <select class="settings-select" data-settings-set="behavior.defaultTab">
          <option value="home" ${s.defaultTab === 'home' ? 'selected' : ''}>Dashboard</option>
          <option value="computadores" ${s.defaultTab === 'computadores' ? 'selected' : ''}>Computadores</option>
          <option value="projetores" ${s.defaultTab === 'projetores' ? 'selected' : ''}>Projetores</option>
          <option value="chamados" ${s.defaultTab === 'chamados' ? 'selected' : ''}>Chamados</option>
        </select>
      </div>
    `;
  }

  function _renderPrivacy(s) {
    return `
      <div class="settings-field">
        <label class="settings-label">Salvar Histórico</label>
        <label class="settings-switch">
          <input type="checkbox" ${s.saveHistory ? 'checked' : ''}
                 data-settings-set="privacy.saveHistory" data-settings-type="checkbox" />
          <span class="settings-switch-slider"></span>
        </label>
      </div>

      <div class="settings-field">
        <label class="settings-label">Dias de Histórico</label>
        <input type="number" class="settings-input" min="1" max="365"
               value="${s.historyDays || 30}"
               data-settings-set="privacy.historyDays" data-settings-type="number" />
      </div>

      <div class="settings-field">
        <label class="settings-label">Limpar Cache</label>
        <button class="settings-btn settings-btn-danger" data-settings-action="clearCache">
          Limpar Cache
        </button>
      </div>

      <div class="settings-field">
        <label class="settings-label">Exportar Configurações</label>
        <button class="settings-btn" data-settings-action="export">
          Exportar JSON
        </button>
      </div>

      <div class="settings-field">
        <label class="settings-label">Importar Configurações</label>
        <input type="file" accept=".json" class="settings-file"
               data-settings-action="import" />
      </div>

      <div class="settings-field">
        <label class="settings-label">Restaurar Padrões</label>
        <button class="settings-btn settings-btn-danger" data-settings-action="reset">
          Restaurar
        </button>
      </div>
    `;
  }

  function _renderAbout() {
    const v = window.Settings.get('about') || {};
    return `
      <div class="settings-about">
        <div class="settings-about-logo">&#128736;</div>
        <h3>GLPI Control Center</h3>
        <p class="settings-about-version">Versão ${v.version || '1.0.0'}</p>
        <p class="settings-about-build">Build ${v.build || '2024.01'}</p>
        <p class="settings-about-desc">Painel de controle para gestão de TI</p>
        <hr class="settings-divider" />
        <p class="settings-about-copy">&copy; 2024 Colégio Satélite</p>
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════════════════════

  function _bindEvents() {
    document.addEventListener('click', function (e) {
      // Fechar
      if (e.target.closest('[data-settings-action="close"]')) {
        close();
        return;
      }

      // Navegação
      const catBtn = e.target.closest('[data-settings-category]');
      if (catBtn) {
        _activeCategory = catBtn.dataset.settingsCategory;
        _renderSidebar();
        _renderContent();
        return;
      }

      // Toggle buttons
      const toggleBtn = e.target.closest('[data-settings-set]');
      if (toggleBtn && toggleBtn.dataset.settingsValue) {
        window.Settings.set(toggleBtn.dataset.settingsSet, toggleBtn.dataset.settingsValue);
        _renderContent();
        return;
      }

      // Ações especiais
      const action = e.target.closest('[data-settings-action]');
      if (action) {
        _handleAction(action.dataset.settingsAction);
        return;
      }
    });

    // Inputs e checkboxes
    document.addEventListener('change', function (e) {
      const input = e.target.closest('[data-settings-set]');
      if (!input) return;

      let value = input.value;
      if (input.dataset.settingsType === 'checkbox') {
        value = input.checked;
      } else if (input.dataset.settingsType === 'number') {
        value = parseInt(value, 10);
      }

      window.Settings.set(input.dataset.settingsSet, value);
    });

    // Selects
    document.addEventListener('change', function (e) {
      const select = e.target.closest('.settings-select[data-settings-set]');
      if (select) {
        window.Settings.set(select.dataset.settingsSet, select.value);
        _renderContent();
      }
    });
  }

  function _handleAction(action) {
    switch (action) {
      case 'clearCache':
        if (confirm('Limpar todo o cache do sistema?')) {
          localStorage.clear();
          alert('Cache limpo com sucesso!');
        }
        break;
      case 'export':
        _exportSettings();
        break;
      case 'import':
        break;
      case 'reset':
        if (confirm('Restaurar todas as configurações para o padrão?')) {
          window.Settings.reset();
          _renderContent();
          alert('Configurações restauradas!');
        }
        break;
    }
  }

  function _exportSettings() {
    const json = window.Settings.exportSettings();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gcc_settings_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ABERTURA/FECHAMENTO
  // ════════════════════════════════════════════════════════════════════════════

  function open() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      _renderSidebar();
      _renderContent();
      modal.classList.add('open');
    }
  }

  function close() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('open');
  }

  function toggle() {
    const modal = document.getElementById('settings-modal');
    modal?.classList.contains('open') ? close() : open();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    open,
    close,
    toggle,
  };
})();
