/**
 * GLPI Control Center - agent_panel.js
 * -----------------------------------------------------------------------------
 * Painel do assistente de IA — interface lateral/desktop, tela inteira/mobile.
 * Suporte a propostas com confirmação e execução (Sprint 07).
 *
 * Sprint 06/07: Agente de IA
 */

window.AgentPanel = (function () {
  'use strict';

  const API_BASE = 'api/agent';
  let _isOpen = false;
  let _isLoading = false;
  let _status = null;
  let _currentAsset = null;
  let _pendingProposals = new Map();

  // ══════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  let _initialized = false;
  let _abortControllers = new Set();
  function init() {
    if (_initialized) {
      // Idempotente: apenas re-verifica status, não duplica listeners/DOM
      _checkStatus();
      return;
    }
    _initialized = true;
    _createDOM();
    _bindEvents();
    _checkStatus();
  }
  function clearState() {
    // Chamado no logout: limpa mensagens, propostas, contexto e aborta pendentes
    _pendingProposals.clear();
    _currentAsset = null;
    _isOpen = false;
    document.getElementById('agent-panel')?.classList.remove('agent-panel--open');
    document.getElementById('agent-toggle')?.classList.remove('agent-toggle--active');
    const msgs = document.getElementById('agent-messages');
    if (msgs) msgs.innerHTML = '<div class="agent-msg agent-msg--system"><div class="agent-msg-bubble">Olá! Sou o assistente de TI do GCC. Como posso ajudar?</div></div>';
    // Abortar requisições pendentes
    for (const c of _abortControllers) { try { c.abort(); } catch {} }
    _abortControllers.clear();
    const ctx = document.getElementById('agent-context');
    ctx?.classList.remove('agent-context--active');
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
      const api = window.ApiClient || window.GlpiClient;
      let data;
      if (window.ApiClient) {
        data = await window.ApiClient.get('/' + API_BASE + '/status');
        data = data.data || data;
      } else {
        const res = await fetch('/' + API_BASE + '/status', { credentials: 'include', signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('HTTP '+res.status);
        const j = await res.json();
        if (j.ok === false) throw new Error(j.error || 'erro');
        data = j.data || j;
      }
      _status = data;
      const statusEl = document.getElementById('agent-status-text');
      if (_status.configured) {
        if (statusEl) statusEl.textContent = `Modelo: ${_status.model}`;
        const send = document.getElementById('agent-send');
        if (send) send.disabled = false;
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
      let data;
      if (window.ApiClient) {
        data = await window.ApiClient.post('/' + API_BASE + '/chat', { message, context });
      } else {
        const res = await fetch('/' + API_BASE + '/chat', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, context }),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error('HTTP '+res.status);
        data = await res.json();
        if (data.ok === false) throw new Error(data.error || 'erro');
      }
      _hideLoading();
      // ApiClient retorna {ok:true, ...} ou {success:?}
      if (data.success !== false && (data.ok !== false)) {
        _addMessage('assistant', data.response || data.data?.response || '');
      } else {
        _addMessage('system', data.error || data.data?.error || 'Erro ao processar mensagem');
      }
    } catch (err) {
      _hideLoading();
      _addMessage('system', err.message?.includes('Timeout') ? 'Timeout ao contatar agente' : 'Erro de conexão com o servidor');
    }

    _isLoading = false;
    document.getElementById('agent-send').disabled = false;
  }

  function _addMessage(role, content, proposal = null) {
    const messages = document.getElementById('agent-messages');
    if (!messages) return;

    if (proposal) {
      _addProposalCard(proposal);
      return;
    }

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
  // PROPOSTAS
  // ══════════════════════════════════════════════════════════════════════════

  function _addProposalCard(proposal) {
    const messages = document.getElementById('agent-messages');
    if (!messages) return;

    const actionLabels = {
      create: 'Criar',
      update: 'Editar',
      delete: 'Excluir',
      restore: 'Restaurar',
    };

    const action = proposal.action || 'update';
    const actionLabel = actionLabels[action] || action;
    const assetName = proposal.asset_name || `${proposal.itemtype}:${proposal.id}`;
    const proposalId = proposal.proposal_id;

    _pendingProposals.set(proposalId, proposal);

    const currentVals = proposal.current_values || {};
    const proposedVals = proposal.proposed_values || {};

    let changesHtml = '';
    if (action === 'update') {
      const fields = Object.keys(proposedVals);
      if (fields.length > 0) {
        changesHtml = '<div class="agent-proposal-changes">';
        for (const field of fields) {
          const oldVal = currentVals[field] || '(vazio)';
          const newVal = proposedVals[field];
          const oldDisplay = typeof oldVal === 'object' ? (oldVal?.name || JSON.stringify(oldVal)) : oldVal;
          const newDisplay = typeof newVal === 'object' ? (newVal?.name || JSON.stringify(newVal)) : newVal;
          changesHtml += `<div class="agent-proposal-change"><span class="agent-proposal-field">${_escapeHtml(field)}</span>: <span class="agent-proposal-old">${_escapeHtml(oldDisplay)}</span> → <span class="agent-proposal-new">${_escapeHtml(newDisplay)}</span></div>`;
        }
        changesHtml += '</div>';
      }
    } else if (action === 'delete') {
      changesHtml = '<div class="agent-proposal-warning">Exclusão lógica: ativo será marcado como Inativo</div>';
    } else if (action === 'restore') {
      changesHtml = '<div class="agent-proposal-info">Ativo será restaurado para "Em uso"</div>';
    } else if (action === 'create') {
      changesHtml = '<div class="agent-proposal-info">Novo ativo será criado</div>';
    }

    const disclaimer = proposal.disclaimer || 'PRÉVIA — nenhuma alteração executada.';
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const card = document.createElement('div');
    card.className = 'agent-msg agent-msg--proposal';
    card.dataset.proposalId = proposalId;
    card.innerHTML = `
      <div class="agent-proposal-card">
        <div class="agent-proposal-header">
          <span class="agent-proposal-action">${actionLabel}</span>
          <span class="agent-proposal-asset">${_escapeHtml(assetName)}</span>
        </div>
        <div class="agent-proposal-body">
          ${changesHtml}
        </div>
        <div class="agent-proposal-disclaimer">${_escapeHtml(disclaimer)}</div>
        <div class="agent-proposal-actions">
          <button class="agent-proposal-confirm-btn" data-proposal-id="${proposalId}" aria-label="Confirmar ${actionLabel}">
            Confirmar
          </button>
          <button class="agent-proposal-cancel-btn" data-proposal-id="${proposalId}" aria-label="Cancelar proposta">
            Cancelar
          </button>
        </div>
        <div class="agent-msg-time">${time}</div>
      </div>
    `;

    const confirmBtn = card.querySelector('.agent-proposal-confirm-btn');
    const cancelBtn = card.querySelector('.agent-proposal-cancel-btn');

    confirmBtn?.addEventListener('click', () => _confirmProposal(proposalId));
    cancelBtn?.addEventListener('click', () => _cancelProposal(proposalId));

    messages.appendChild(card);
    messages.scrollTop = messages.scrollHeight;
  }

  async function _confirmProposal(proposalId) {
    const card = document.querySelector(`[data-proposal-id="${proposalId}"]`);
    const confirmBtn = card?.querySelector('.agent-proposal-confirm-btn');
    const cancelBtn = card?.querySelector('.agent-proposal-cancel-btn');

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Executando...';
    }
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      let data;
      if (window.ApiClient) {
        data = await window.ApiClient.post('/' + API_BASE + '/execute', { proposal_id: proposalId });
      } else {
        const res = await fetch('/' + API_BASE + '/execute', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposal_id: proposalId }),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error('HTTP '+res.status);
        data = await res.json();
        if (data.ok === false) throw new Error(data.error || 'erro');
      }
      // ApiClient retorna {ok,data} ; GlpiClient retorna mesma
      const payload = data.data || data;
      const opId = payload.operation_id || payload.operation?.operation_id || null;
      const verif = payload.verification || null;
      const isSuccess = (data.ok !== false) && (payload.success !== false);
      if (isSuccess) {
        _addMessage('system', data.message || 'Proposta executada com sucesso.');
        card?.classList.add('agent-proposal--executed');
        _pendingProposals.delete(proposalId);
        if (opId) {
          _renderReceipt(opId, verif);
          _frontendConfirm(opId);
        }
      } else {
        _addMessage('system', 'Falha: ' + (payload.error || data.error || 'Erro ao executar proposta'));
        if (opId) _renderReceipt(opId, verif);
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirmar';
        }
        if (cancelBtn) cancelBtn.disabled = false;
      }
    } catch (err) {
      _addMessage('system', 'Erro de conexão ao executar proposta: ' + (err.message||''));
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirmar';
      }
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  function _renderReceipt(operationId, verification) {
    const messages = document.getElementById('agent-messages');
    if (!messages) return;
    const layers = verification?.layers || {};
    const overall = verification?.overall || 'unknown';
    const human = {
      verified: 'operação concluída e verificada',
      verified_glpi: 'GLPI: valor confirmado após nova consulta',
      verified_local: 'operação local verificada (GLPI não aplicável)',
      partial_cache_pending: 'GLPI confirmado, cache/API pendente',
      divergent: 'divergência entre esperado e GLPI',
      unknown: 'resultado desconhecido',
      failed: 'falha de gravação'
    }[overall] || overall;

    const card = document.createElement('div');
    card.className = 'agent-msg agent-msg--receipt';
    card.dataset.operationId = operationId;
    const glpiSt = layers.glpi?.state || 'pending';
    const cacheSt = layers.cache?.state || 'pending';
    const apiSt = layers.api?.state || 'pending';
    const frontSt = layers.frontend?.state || 'pending';
    card.innerHTML = `
      <div class="agent-receipt-card">
        <div class="agent-receipt-header">Comprovante — OP:${String(operationId).slice(0,8)}</div>
        <div class="agent-receipt-overall">Resultado: <strong>${_escapeHtml(human)}</strong></div>
        <div class="agent-receipt-layers">
          <div>Execução: ${layers.execution?.state || '?'} | GLPI: ${glpiSt} | Cache: ${cacheSt} | API: ${apiSt} | Frontend: ${frontSt}</div>
        </div>
        ${verification?.divergences?.length ? `<div class="agent-receipt-div">Divergências: ${verification.divergences.map(d=>_escapeHtml(d.field + ': ' + JSON.stringify(d.expected)+'→'+JSON.stringify(d.observed))).join('<br>')}</div>` : ''}
        <div class="agent-receipt-actions">
          <button class="agent-receipt-verify" data-op="${operationId}">Verificar novamente</button>
          <a href="/api/operations/${operationId}/receipt" target="_blank">Detalhes</a>
        </div>
      </div>`;
    const btn = card.querySelector('.agent-receipt-verify');
    btn?.addEventListener('click', ()=> _reverify(operationId));
    messages.appendChild(card);
    messages.scrollTop = messages.scrollHeight;
    // Atualizar estado compartilhado e armazenar versão
    try {
      const v = verification?.cache_version || new Date().toISOString();
      localStorage.setItem('gcc_last_verified_' + operationId, v);
      // Disparar evento para listas/cards consumirem nova representação
      window.dispatchEvent(new CustomEvent('gcc:assetUpdated', { detail: { operationId, verification } }));
    } catch {}
  }

  async function _reverify(operationId) {
    try {
      let data;
      if (window.ApiClient) data = await window.ApiClient.post(`/api/operations/${operationId}/verify`, {});
      else {
        const res = await fetch(`/api/operations/${operationId}/verify`, { method: 'POST', credentials: 'include', signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('HTTP '+res.status);
        data = await res.json();
      }
      const payload = data.data || data;
      if (payload) _addMessage('system', 'Reverificação: ' + (payload.overall || JSON.stringify(payload.layers)));
      else _addMessage('system', 'Reverificação concluída');
    } catch { _addMessage('system', 'Falha na reverificação'); }
  }

  async function _frontendConfirm(operationId) {
    try {
      const version = localStorage.getItem('gcc_last_verified_' + operationId) || new Date().toISOString();
      if (window.ApiClient) await window.ApiClient.post(`/api/operations/${operationId}/frontend-confirm`, { api_version: version });
      else await fetch(`/api/operations/${operationId}/frontend-confirm`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_version: version }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {}
  }

  async function _cancelProposal(proposalId) {
    const card = document.querySelector(`[data-proposal-id="${proposalId}"]`);
    const confirmBtn = card?.querySelector('.agent-proposal-confirm-btn');
    const cancelBtn = card?.querySelector('.agent-proposal-cancel-btn');

    if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelando...';
    }
    if (confirmBtn) confirmBtn.disabled = true;

    try {
      let data;
      if (window.ApiClient) data = await window.ApiClient.post('/' + API_BASE + '/proposal/cancel', { proposal_id: proposalId });
      else {
        const res = await fetch('/' + API_BASE + '/proposal/cancel', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposal_id: proposalId }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error('HTTP '+res.status);
        data = await res.json();
      }
      if (data.ok !== false && data.success !== false) {
        _addMessage('system', 'Proposta cancelada.');
        card?.classList.add('agent-proposal--cancelled');
        _pendingProposals.delete(proposalId);
      } else {
        _addMessage('system', 'Não foi possível cancelar: ' + (data.error || 'Erro'));
        if (cancelBtn) {
          cancelBtn.disabled = false;
          cancelBtn.textContent = 'Cancelar';
        }
        if (confirmBtn) confirmBtn.disabled = false;
      }
    } catch (err) {
      _addMessage('system', 'Erro de conexão ao cancelar proposta: ' + (err.message||''));
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Cancelar';
      }
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    init,
    clearState,
    togglePanel,
    openPanel,
    closePanel,
    setContext,
    getPendingProposals: () => Array.from(_pendingProposals.values()),
  };
})();
