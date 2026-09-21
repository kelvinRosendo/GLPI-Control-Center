/**
 * GLPI Control Center - agent_panel.js
 * -----------------------------------------------------------------------------
 * Painel do assistente de IA — interface lateral/desktop, tela inteira/mobile.
 *
 * Sprint 06: Agente de IA
 */

window.AgentPanel = (function () {
  'use strict';

  const API_BASE = 'api/agent';
  let _isOpen = false;
  let _isLoading = false;
  let _status = null;
  let _currentAsset = null;

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  function init() {
    _createDOM();
    _bindEvents();
    _checkStatus();
  }

  function _createDOM() {
    if (document.getElementById('agent-toggle')) return;

    const toggle = document.createElement('button');
    toggle.id = 'agent-toggle';
    toggle.className = 'agent-toggle';
    toggle.setAttribute('aria-label', 'Abrir assistente');
    toggle.innerHTML = '&#129302;';
    document.body.appendChild(toggle);

    const panel = document.createElement('div');
    panel.id = 'agent-panel';
    panel.className = 'agent-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Assistente de IA');
    panel.innerHTML = `
      <div class="agent-header">
        <div class="agent-header-left">
          <div class="agent-header-icon">&#129302;</div>
          <div>
            <div class="agent-header-title">Assistente de IA</div>
            <div class="agent-header-subtitle" id="agent-status-text">Verificando...</div>
          </div>
        </div>
        <button class="agent-close-btn" id="agent-close" aria-label="Fechar assistente">&times;</button>
      </div>
      <div class="agent-context" id="agent-context">
        <span class="agent-context-label">Contexto:</span>
        <span id="agent-context-text"></span>
      </div>
      <div class="agent-messages" id="agent-messages">
        <div class="agent-msg agent-msg--system">
          <div class="agent-msg-bubble">Olá! Sou o assistente de TI do GCC. Como posso ajudar?</div>
        </div>
      </div>
      <div class="agent-input-area">
        <div class="agent-input-row">
          <textarea class="agent-input" id="agent-input" placeholder="Digite sua mensagem..." rows="1" aria-label="Mensagem para o assistente"></textarea>
          <button class="agent-send-btn" id="agent-send" aria-label="Enviar mensagem" disabled>&#10148;</button>
        </div>
        <div class="agent-input-hint">Enter para enviar · Shift+Enter para nova linha</div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  function _bindEvents() {
    document.getElementById('agent-toggle')?.addEventListener('click', togglePanel);
    document.getElementById('agent-close')?.addEventListener('click', closePanel);
    document.getElementById('agent-send')?.addEventListener('click', _sendMessage);

    const input = document.getElementById('agent-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          _sendMessage();
        }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        document.getElementById('agent-send').disabled = !input.value.trim();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _isOpen) {
        closePanel();
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAINEL
  // ══════════════════════════════════════════════════════════════════════════

  function togglePanel() {
    if (_isOpen) closePanel();
    else openPanel();
  }

  function openPanel() {
    _isOpen = true;
    document.getElementById('agent-panel')?.classList.add('agent-panel--open');
    document.getElementById('agent-toggle')?.classList.add('agent-toggle--active');
    document.getElementById('agent-input')?.focus();

    const toggle = document.getElementById('agent-toggle');
    if (toggle) toggle.setAttribute('aria-label', 'Fechar assistente');
  }

  function closePanel() {
    _isOpen = false;
    document.getElementById('agent-panel')?.classList.remove('agent-panel--open');
    document.getElementById('agent-toggle')?.classList.remove('agent-toggle--active');

    const toggle = document.getElementById('agent-toggle');
    if (toggle) toggle.setAttribute('aria-label', 'Abrir assistente');
  }

  function setContext(asset) {
    _currentAsset = asset;
    const ctx = document.getElementById('agent-context');
    const text = document.getElementById('agent-context-text');
    if (asset && ctx && text) {
      ctx.classList.add('agent-context--active');
      text.textContent = `${asset.itemtype}:${asset.id} — ${asset.name || ''}`;
    } else if (ctx) {
      ctx.classList.remove('agent-context--active');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ══════════════════════════════════════════════════════════════════════════

  async function _checkStatus() {
    try {
      const res = await fetch(API_BASE + '/status', { credentials: 'include' });
      const data = await res.json();
      _status = data.data || data;

      const statusEl = document.getElementById('agent-status-text');
      if (_status.configured) {
        if (statusEl) statusEl.textContent = `Modelo: ${_status.model}`;
        document.getElementById('agent-send').disabled = false;
      } else {
        if (statusEl) statusEl.textContent = 'Não configurado';
        _showNotConfigured();
      }
    } catch {
      const statusEl = document.getElementById('agent-status-text');
      if (statusEl) statusEl.textContent = 'Erro ao verificar status';
    }
  }

  function _showNotConfigured() {
    const messages = document.getElementById('agent-messages');
    if (!messages) return;

    messages.innerHTML = `
      <div class="agent-not-configured">
        <div class="agent-not-configured-icon">&#9888;</div>
        <div class="agent-not-configured-title">Assistente não configurado</div>
        <div class="agent-not-configured-message">
          O provedor de IA não está configurado no servidor.<br>
          Configure a variável de ambiente <code>OPENCODE_GO_API_KEY</code> para ativar o assistente.
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MENSAGENS
  // ══════════════════════════════════════════════════════════════════════════

  async function _sendMessage() {
    if (_isLoading) return;

    const input = document.getElementById('agent-input');
    const message = input?.value?.trim();
    if (!message) return;

    _isLoading = true;
    input.value = '';
    input.style.height = 'auto';
    document.getElementById('agent-send').disabled = true;

    _addMessage('user', message);
    _showLoading();

    try {
      const context = {};
      if (_currentAsset) {
        context.current_asset = _currentAsset;
      }

      const res = await fetch(API_BASE + '/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context }),
      });

      const data = await res.json();
      _hideLoading();

      if (data.success) {
        _addMessage('assistant', data.response);
      } else {
        _addMessage('system', data.error || 'Erro ao processar mensagem');
      }
    } catch (err) {
      _hideLoading();
      _addMessage('system', 'Erro de conexão com o servidor');
    }

    _isLoading = false;
    document.getElementById('agent-send').disabled = false;
  }

  function _addMessage(role, content) {
    const messages = document.getElementById('agent-messages');
    if (!messages) return;

    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const msgDiv = document.createElement('div');
    msgDiv.className = `agent-msg agent-msg--${role}`;
    msgDiv.innerHTML = `
      <div class="agent-msg-bubble">${_escapeHtml(content)}</div>
      <div class="agent-msg-time">${time}</div>
    `;
    messages.appendChild(msgDiv);
    messages.scrollTop = messages.scrollHeight;
  }

  function _showLoading() {
    const messages = document.getElementById('agent-messages');
    if (!messages) return;

    const loading = document.createElement('div');
    loading.id = 'agent-loading';
    loading.className = 'agent-msg agent-msg--assistant';
    loading.innerHTML = `
      <div class="agent-tool-call">
        <div class="spinner"></div>
        <span>Consultando...</span>
      </div>
    `;
    messages.appendChild(loading);
    messages.scrollTop = messages.scrollHeight;
  }

  function _hideLoading() {
    document.getElementById('agent-loading')?.remove();
  }

  function _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init,
    togglePanel,
    openPanel,
    closePanel,
    setContext,
  };
})();
