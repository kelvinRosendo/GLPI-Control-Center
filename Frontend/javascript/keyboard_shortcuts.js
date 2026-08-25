/**
 * GLPI Control Center - keyboard_shortcuts.js
 * -----------------------------------------------------------------------------
 * Sistema centralizado de atalhos de teclado.
 *
 * Sprint 19: Keyboard Shortcuts
 */

window.KeyboardShortcuts = (function () {
  'use strict';

  let _initialized = false;
  let _enabled = true;
  let _shortcuts = {};
  let _helpVisible = false;

  // ════════════════════════════════════════════════════════════════════════════
  // SHORTCUTS PADRÃO
  // ════════════════════════════════════════════════════════════════════════════

  const DEFAULT_SHORTCUTS = [
    // Busca
    { key: 'k', ctrl: true, action: 'search:open', label: 'Abrir busca', category: 'Busca' },

    // Navegação
    { key: '1', ctrl: true, action: 'nav:home', label: 'Dashboard', category: 'Navegação' },
    { key: '2', ctrl: true, action: 'nav:computadores', label: 'Computadores', category: 'Navegação' },
    { key: '3', ctrl: true, action: 'nav:projetores', label: 'Projetores', category: 'Navegação' },
    { key: '4', ctrl: true, action: 'nav:chamados', label: 'Chamados', category: 'Navegação' },
    { key: '5', ctrl: true, action: 'nav:relatorios', label: 'Relatórios', category: 'Navegação' },

    // Ações
    { key: 'r', ctrl: true, action: 'app:refresh', label: 'Atualizar dados', category: 'Ações' },
    { key: ',', ctrl: true, action: 'settings:open', label: 'Configurações', category: 'Ações' },

    // Atalhos gerais
    { key: '?', shift: true, action: 'help:toggle', label: 'Ajuda de atalhos', category: 'Geral' },
    { key: 'Escape', action: 'modal:close', label: 'Fechar modal/painel', category: 'Geral' },
  ];

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    if (_initialized) return;
    _initialized = true;

    _registerDefaults();
    _bindGlobalKeys();
  }

  function _registerDefaults() {
    DEFAULT_SHORTCUTS.forEach(s => register(s));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // REGISTRO
  // ════════════════════════════════════════════════════════════════════════════

  function register(shortcut) {
    const id = _getId(shortcut);
    _shortcuts[id] = { ...shortcut, id };
  }

  function unregister(action) {
    Object.keys(_shortcuts).forEach(id => {
      if (_shortcuts[id].action === action) delete _shortcuts[id];
    });
  }

  function _getId(s) {
    return `${s.ctrl ? 'ctrl+' : ''}${s.shift ? 'shift+' : ''}${s.alt ? 'alt+' : ''}${s.key}`;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXECUÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function _handleKeydown(e) {
    if (!_enabled) return;
    if (_isInputFocused(e)) return;

    const id = _getId({
      key: e.key,
      ctrl: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
      alt: e.altKey,
    });

    const shortcut = _shortcuts[id];
    if (!shortcut) return;

    e.preventDefault();
    e.stopPropagation();

    _executeAction(shortcut.action);
  }

  function _isInputFocused(e) {
    const tag = e.target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
  }

  function _executeAction(action) {
    switch (action) {
      case 'search:open':
        window.SearchUI?.open();
        break;
      case 'nav:home':
        window.App?.go('home');
        break;
      case 'nav:computadores':
        window.App?.go('computadores');
        break;
      case 'nav:projetores':
        window.App?.go('projetores');
        break;
      case 'nav:chamados':
        window.App?.go('chamados');
        break;
      case 'nav:relatorios':
        window.App?.go('relatorios');
        break;
      case 'app:refresh':
        window.App?.refresh?.();
        break;
      case 'settings:open':
        window.App?.go('settings');
        break;
      case 'help:toggle':
        _toggleHelp();
        break;
      case 'modal:close':
        _closeModals();
        break;
      default:
        document.dispatchEvent(new CustomEvent('shortcut:action', { detail: { action } }));
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MODAL DE AJUDA
  // ════════════════════════════════════════════════════════════════════════════

  function _toggleHelp() {
    _helpVisible ? _hideHelp() : _showHelp();
  }

  function _showHelp() {
    if (document.getElementById('shortcuts-help-modal')) return;

    const grouped = {};
    Object.values(_shortcuts).forEach(s => {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    });

    let html = `<div class="shortcuts-help-modal" id="shortcuts-help-modal">`;
    html += `<div class="shortcuts-help-backdrop" data-shortcut-action="close-help"></div>`;
    html += `<div class="shortcuts-help-content">`;
    html += `<div class="shortcuts-help-header">
               <h3>Atalhos de Teclado</h3>
               <button class="shortcuts-help-close" data-shortcut-action="close-help">&times;</button>
             </div>`;
    html += `<div class="shortcuts-help-body">`;

    for (const [category, items] of Object.entries(grouped)) {
      html += `<div class="shortcuts-help-group">`;
      html += `<div class="shortcuts-help-category">${category}</div>`;
      items.forEach(s => {
        html += `<div class="shortcuts-help-row">
                   <span class="shortcuts-help-keys">${_formatKeys(s)}</span>
                   <span class="shortcuts-help-label">${s.label}</span>
                 </div>`;
      });
      html += `</div>`;
    }

    html += `</div></div></div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    _helpVisible = true;

    document.addEventListener('click', _handleHelpClick);
  }

  function _hideHelp() {
    const modal = document.getElementById('shortcuts-help-modal');
    if (modal) modal.remove();
    _helpVisible = false;
    document.removeEventListener('click', _handleHelpClick);
  }

  function _handleHelpClick(e) {
    if (e.target.closest('[data-shortcut-action="close-help"]')) {
      _hideHelp();
    }
  }

  function _formatKeys(s) {
    const keys = [];
    if (s.ctrl) keys.push('Ctrl');
    if (s.shift) keys.push('Shift');
    if (s.alt) keys.push('Alt');
    keys.push(s.key === ' ' ? 'Space' : s.key === 'Escape' ? 'Esc' : s.key.length === 1 ? s.key.toUpperCase() : s.key);
    return keys.join(' + ');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FECHAR MODAIS
  // ════════════════════════════════════════════════════════════════════════════

  function _closeModals() {
    window.SearchUI?.close();
    window.NotificationsCenter?.close();
    document.dispatchEvent(new CustomEvent('shortcut:closeAll'));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BIND GLOBAL
  // ════════════════════════════════════════════════════════════════════════════

  function _bindGlobalKeys() {
    document.addEventListener('keydown', _handleKeydown);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CONTROLE
  // ════════════════════════════════════════════════════════════════════════════

  function enable() { _enabled = true; }
  function disable() { _enabled = false; }
  function isEnabled() { return _enabled; }

  function getAll() { return Object.values(_shortcuts); }

  function getByCategory(category) {
    return Object.values(_shortcuts).filter(s => s.category === category);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    register,
    unregister,
    enable,
    disable,
    isEnabled,
    getAll,
    getByCategory,
    showHelp: _showHelp,
    hideHelp: _hideHelp,
  };
})();
