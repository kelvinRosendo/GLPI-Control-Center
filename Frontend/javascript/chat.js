/**
 * GLPI Control Center - chat.js
 * -----------------------------------------------------------------------------
 * Módulo do chat assistente com a Gemini API.
 */

window.Chat = {

  openPanel() {
    const panel = document.getElementById('chat-panel');
    if (panel) {
      panel.style.display = 'flex';
      document.getElementById('chat-input')?.focus();
    }
  },

  closePanel() {
    const panel = document.getElementById('chat-panel');
    if (panel) panel.style.display = 'none';
  },

  async send() {
    const input = document.getElementById('chat-input');
    const messages = document.getElementById('chat-messages');
    if (!input || !messages) return;

    const texto = input.value.trim();
    if (!texto) return;

    // Exibe mensagem do usuário
    this._addMessage(texto, 'user');
    input.value = '';

    // Indicador de carregamento
    const loadingId = 'chat-loading-' + Date.now();
    const loading = document.createElement('div');
    loading.innerHTML = `
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(var(--color-accent-rgb),0.1);flex-shrink:0;">
          <span class="gcc-icon gcc-icon--sm" style="color:var(--color-accent)"><img src="css/icons/assistance.svg" alt="" /></span>
        </div>
        <div style="background:var(--surface2,#222535);padding:10px 14px;border-radius:10px;font-size:13px;color:var(--text2,#9299b8);">
          Pensando...
        </div>
      </div>`;
    loading.firstElementChild.id = loadingId;
    messages.appendChild(loading.firstElementChild);
    messages.scrollTop = messages.scrollHeight;

    try {
      const json = await window.GlpiClient._fetch('/api/chat', { method: 'POST', body: { message: texto } });

      // Remove loading
      document.getElementById(loadingId)?.remove();

      if (json.ok) {
        this._addMessage(json.data.resposta, 'assistant');
      } else {
        this._addMessage('Erro ao obter resposta. Tente novamente.', 'error');
      }
    } catch (e) {
      document.getElementById(loadingId)?.remove();
      this._addMessage('Backend indisponível.', 'error');
    }

    messages.scrollTop = messages.scrollHeight;
  },

  _addMessage(texto, role) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;

    const isUser     = role === 'user';
    const isError    = role === 'error';
    const bgColor    = isUser  ? 'var(--accent,#4f7ef7)'       : isError ? 'rgba(255,85,85,0.15)' : 'var(--surface2,#222535)';
    const textColor  = isUser  ? '#fff'                         : isError ? 'var(--red,#ff5555)'   : 'var(--text,#e8eaf6)';
    const align      = isUser  ? 'flex-end'                     : 'flex-start';
    const icon       = isUser  ? '' : `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(var(--color-accent-rgb),0.1);flex-shrink:0;"><span class="gcc-icon gcc-icon--sm" style="color:var(--color-accent)"><img src="css/icons/assistance.svg" alt="" /></span></div>`;
    const row = document.createElement('div');
    row.style.cssText = `display:flex;gap:8px;align-items:flex-start;justify-content:${align};`;
    if (!isUser) {
      const iconWrapper = document.createElement('div');
      iconWrapper.innerHTML = icon;
      row.appendChild(iconWrapper.firstElementChild);
    }
    const bubble = document.createElement('div');
    bubble.style.cssText = `background:${bgColor};color:${textColor};padding:10px 14px;border-radius:10px;font-size:13px;max-width:80%;line-height:1.5;white-space:pre-wrap;`;
    bubble.textContent = String(texto ?? '');
    row.appendChild(bubble);
    messages.appendChild(row);

    messages.scrollTop = messages.scrollHeight;
  },
};
