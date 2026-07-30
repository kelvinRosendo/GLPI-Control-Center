/**
 * GLPI Control Center - portal-viewer.js
 * -----------------------------------------------------------------------------
 * Portal Viewer — camada visual das integrações.
 *
 * Responsabilidades:
 * - Abrir modal conforme o tipo da integração (portal ou email)
 * - Renderizar iframe quando permitido
 * - Controlar estados: loading, loaded, blocked, timeout, error
 * - Detectar bloqueio de iframe e fazer fallback automático
 * - Detectar timeout de carregamento
 * - Destruir iframe ao fechar (evitar memory leaks)
 * - Emitir eventos CustomEvent
 * - Registrar auditoria via IntegrationAudit
 *
 * Eventos emitidos:
 *   portal:opening  — modal sendo aberto
 *   portal:loaded   — portal carregado com sucesso
 *   portal:blocked  — fornecedor bloqueou iframe
 *   portal:timeout  — portal demorou para responder
 *   portal:error    — erro inesperado
 *   portal:closed   — modal fechado
 *
 * Sprint 4: PortalViewer + Integration UI
 *
 * NÃO contém regra de negócio do workflow. Consulte workflow.js.
 * NÃO contém dados de fornecedor. Consulte integrations.config.js.
 * NÃO contém lógica de integração. Consulte integration-engine.js.
 */

window.PortalViewer = {
  // ── Estado ───────────────────────────────────────────────────────────────

  _modalEl: null,
  _iframeEl: null,
  _state: 'idle',
  _integrationKey: null,
  _integrationConfig: null,
  _workflowData: null,
  _timeout: null,
  _listeners: [],

  // ══════════════════════════════════════════════════════════════════════════
  // ABERTURA / FECHAMENTO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Abre o Portal Viewer para uma integração.
   * @param {string} integrationKey - chave da integração
   * @param {object} workflowData - dados do workflow (asset, checklist, etc.)
   */
  open(integrationKey, workflowData) {
    const config = window.INTEGRATIONS_CONFIG?.getIntegration(integrationKey);
    if (!config) {
      console.error('[PortalViewer] Integração não encontrada:', integrationKey);
      return;
    }

    this._integrationKey = integrationKey;
    this._integrationConfig = config;
    this._workflowData = workflowData || {};

    this._createModal();
    this._setState('loading');
    this._emit('portal:opening', { integrationKey, tipo: config.tipo });

    if (config.tipo === 'portal') {
      this._openPortal(config);
    } else if (config.tipo === 'email') {
      this._openEmail(config);
    } else {
      this._openManual(config);
    }
  },

  /**
   * Fecha o Portal Viewer e limpa recursos.
   */
  close() {
    this._emit('portal:closed', {
      integrationKey: this._integrationKey,
      state: this._state,
    });

    this._cleanup();
    this._destroyModal();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PORTAL (iframe)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Abre portal web com iframe.
   * Tenta iframe primeiro; se bloqueado, faz fallback automático.
   */
  _openPortal(config) {
    const url = window.PortalViewerUtils.sanitizeUrl(config.portal?.url || config.url);
    if (!url) {
      this._setState('error', 'URL do portal inválida.');
      return;
    }

    if (config.suportaIframe) {
      this._loadIframe(url);
    } else {
      this._openInNewTab(url);
      this._setState('loaded');
    }
  },

  /**
   * Carrega iframe no modal.
   * Detecta loading, timeout e bloqueio.
   */
  _loadIframe(url) {
    const container = this._modalEl?.querySelector('.pv-iframe-container');
    if (!container) return;

    const iframe = document.createElement('iframe');
    iframe.className = 'pv-iframe';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    iframe.setAttribute('title', this._integrationConfig?.nome || 'Portal');
    iframe.setAttribute('loading', 'eager');
    iframe.src = url;

    this._iframeEl = iframe;

    // Timeout para carregamento
    this._timeout = window.PortalViewerUtils.createTimeout(
      window.PortalViewerUtils.PORTAL_TIMEOUT_MS,
      () => {
        this._setState('timeout');
        this._emit('portal:timeout', { integrationKey: this._integrationKey, url });
      }
    );

    // Quando iframe carrega
    this._addEvent(iframe, 'load', () => {
      this._timeout?.cancel();

      // Verificar se realmente carregou ou se foi bloqueado
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc || doc.body?.innerHTML === '') {
          this._setState('blocked');
          this._emit('portal:blocked', { integrationKey: this._integrationKey, url });
        } else {
          this._setState('loaded');
          this._emit('portal:loaded', { integrationKey: this._integrationKey, url });
        }
      } catch {
        // Cross-origin — provavelmente carregou (CORS impede leitura)
        this._setState('loaded');
        this._emit('portal:loaded', { integrationKey: this._integrationKey, url });
      }
    });

    // Erro no iframe
    this._addEvent(iframe, 'error', () => {
      this._timeout?.cancel();
      this._setState('blocked');
      this._emit('portal:blocked', { integrationKey: this._integrationKey, url });
    });

    container.innerHTML = '';
    container.appendChild(iframe);
  },

  // ══════════════════════════════════════════════════════════════════════════
  // E-MAIL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Abre view de e-mail com modelo pré-preenchido.
   */
  _openEmail(config) {
    const emailData = this._buildEmailData(config);
    this._renderEmailView(config, emailData);
    this._setState('loaded');
    this._emit('portal:loaded', { integrationKey: this._integrationKey, tipo: 'email' });
  },

  /**
   * Monta os dados do e-mail a partir da config e do workflow.
   */
  _buildEmailData(config) {
    const wd = this._workflowData;
    const asset = wd.asset || {};
    const cl = wd.checklist || {};

    const params = {
      nome: asset.nome || '',
      patrimonio: asset.patrimonio || '',
      serial: asset.serial || '',
      reparticao: asset.reparticao || '',
      tipoProblema: cl.tipoProblema || '',
      prioridade: this._getPrioridadeLabel(cl.prioridade),
      mauUso: cl.mauUso ? 'Sim' : 'Não',
      observacoes: wd.observations || '',
    };

    const subject = this._resolveTemplate(config.emailTemplate?.assunto || '', params);
    const body = this._resolveTemplate(config.emailTemplate?.corpo || '', params);
    const email = config.contato?.email || '';

    return {
      to: email,
      responsavel: config.contato?.responsavel || '',
      subject,
      body,
      fullText: `De: \nPara: ${email}\nAssunto: ${subject}\n\n${body}`,
    };
  },

  /**
   * Renderiza a view de e-mail dentro do modal.
   */
  _renderEmailView(config, emailData) {
    const content = this._modalEl?.querySelector('.pv-content');
    if (!content) return;

    content.innerHTML = `
      <div class="pv-email-view">
        <div class="pv-email-info">
          <div class="pv-email-field">
            <span class="pv-email-label">Responsável</span>
            <span class="pv-email-value">${this._esc(emailData.responsavel)}</span>
          </div>
          <div class="pv-email-field">
            <span class="pv-email-label">E-mail</span>
            <span class="pv-email-value mono">${this._esc(emailData.to)}</span>
          </div>
        </div>

        <div class="pv-email-notice">
          <span class="pv-email-notice-icon">&#9432;</span>
          <span>O equipamento deverá ser entregue ao responsável.</span>
        </div>

        <div class="pv-email-template">
          <h4 class="pv-email-template-title">Modelo do E-mail</h4>
          <div class="pv-email-template-subject">
            <span class="pv-email-label">Assunto</span>
            <span class="pv-email-value">${this._esc(emailData.subject)}</span>
          </div>
          <pre class="pv-email-template-body">${this._esc(emailData.body)}</pre>
        </div>

        <div class="pv-email-actions">
          <button class="pv-btn pv-btn-primary" data-pv-action="copy-email">
            &#128203; Copiar E-mail
          </button>
          <button class="pv-btn pv-btn-primary" data-pv-action="open-mailto">
            &#9993; Abrir Cliente de E-mail
          </button>
        </div>

        <div class="pv-email-copied" id="pv-email-copied" style="display:none;">
          &#10003; E-mail copiado para a área de transferência!
        </div>
      </div>
    `;

    // Bind actions
    this._addEvent(content.querySelector('[data-pv-action="copy-email"]'), 'click', () => {
      navigator.clipboard.writeText(emailData.fullText).then(() => {
        const msg = content.querySelector('#pv-email-copied');
        if (msg) msg.style.display = 'block';
        this._audit('email-template-copied', 'sucesso');
      });
    });

    this._addEvent(content.querySelector('[data-pv-action="open-mailto"]'), 'click', () => {
      const mailtoUrl = window.PortalViewerUtils.buildMailtoUrl(
        emailData.to,
        emailData.subject,
        emailData.body
      );
      window.location.href = mailtoUrl;
      this._audit('email-generated', 'sucesso');
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MANUAL (sem portal nem email)
  // ══════════════════════════════════════════════════════════════════════════

  _openManual(config) {
    const content = this._modalEl?.querySelector('.pv-content');
    if (!content) return;

    const instrucoes = (config.instrucoes || [])
      .map((inst, i) => `<div class="pv-instruction"><span class="pv-instruction-num">${i + 1}</span><span>${this._esc(inst)}</span></div>`)
      .join('');

    content.innerHTML = `
      <div class="pv-manual-view">
        <div class="pv-manual-notice">
          <span class="pv-email-notice-icon">&#9432;</span>
          <span>${this._esc(config.descricao)}</span>
        </div>
        <div class="pv-instructions">${instrucoes}</div>
      </div>
    `;

    this._setState('loaded');
  },

  // ══════════════════════════════════════════════════════════════════════════
  // FALLBACK
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Abre URL em nova aba (fallback quando iframe é bloqueado).
   */
  _openInNewTab(url) {
    const validated = window.PortalViewerUtils.validateUrl(url);
    if (!validated.valid) return;

    window.open(url, '_blank', 'noopener,noreferrer');
    this._audit('fallback-opened', 'sucesso');
  },

  /**
   * Botão "Abrir em nova aba" clicado pelo usuário.
   */
  _handleOpenInNewTab() {
    const url = this._integrationConfig?.portal?.url || this._integrationConfig?.url;
    const sanitized = window.PortalViewerUtils.sanitizeUrl(url);
    if (sanitized) {
      this._openInNewTab(sanitized);
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ESTADOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Atualiza o estado e re-renderiza a UI.
   */
  _setState(state, message) {
    this._state = state;

    const statusEl = this._modalEl?.querySelector('.pv-status-text');
    if (statusEl) {
      statusEl.textContent = message || window.PortalViewerUtils.STATE_LABELS[state] || state;
    }

    const statusDot = this._modalEl?.querySelector('.pv-status-dot');
    if (statusDot) {
      statusDot.className = 'pv-status-dot';
      if (state === 'loading') statusDot.classList.add('loading');
      else if (state === 'loaded') statusDot.classList.add('loaded');
      else if (state === 'blocked' || state === 'timeout' || state === 'error') statusDot.classList.add('error');
    }

    // Mostrar/esconder elementos conforme estado
    const loadingEl = this._modalEl?.querySelector('.pv-loading');
    const blockedEl = this._modalEl?.querySelector('.pv-blocked-msg');
    const timeoutEl = this._modalEl?.querySelector('.pv-timeout-msg');
    const errorEl = this._modalEl?.querySelector('.pv-error-msg');
    const retryBtn = this._modalEl?.querySelector('.pv-retry-btn');
    const iframeContainer = this._modalEl?.querySelector('.pv-iframe-container');
    const openTabBtn = this._modalEl?.querySelector('.pv-open-tab-btn');

    if (loadingEl) loadingEl.style.display = state === 'loading' ? 'flex' : 'none';
    if (blockedEl) blockedEl.style.display = state === 'blocked' ? 'block' : 'none';
    if (timeoutEl) timeoutEl.style.display = state === 'timeout' ? 'block' : 'none';
    if (errorEl) errorEl.style.display = state === 'error' ? 'block' : 'none';
    if (retryBtn) retryBtn.style.display = (state === 'timeout' || state === 'error' || state === 'blocked') ? 'inline-flex' : 'none';
    if (iframeContainer) iframeContainer.style.display = (state === 'loaded' && this._integrationConfig?.tipo === 'portal') ? 'block' : 'none';
    if (openTabBtn) openTabBtn.style.display = (state === 'blocked' || state === 'timeout') ? 'inline-flex' : 'none';
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MODAL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Cria o modal no DOM.
   */
  _createModal() {
    this._destroyModal();

    const config = this._integrationConfig;
    const tipoLabel = config.tipo === 'portal' ? 'Portal' : config.tipo === 'email' ? 'E-mail' : 'Manual';

    const div = document.createElement('div');
    div.id = 'portal-viewer-modal';
    div.className = 'pv-modal';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-label', `Portal Viewer — ${config.nome}`);
    div.setAttribute('aria-modal', 'true');

    div.innerHTML = `
      <div class="pv-backdrop" data-pv-close="backdrop"></div>
      <div class="pv-dialog">
        <div class="pv-header">
          <div class="pv-header-left">
            <span class="pv-header-icon">${config.tipo === 'email' ? '&#9993;' : '&#128279;'}</span>
            <div>
              <h2 class="pv-header-title">${this._esc(config.nome)}</h2>
              <div class="pv-header-meta">
                <span class="pv-header-type">${tipoLabel}</span>
                <span class="pv-status-dot loading"></span>
                <span class="pv-status-text">${window.PortalViewerUtils.STATE_LABELS.loading}</span>
              </div>
            </div>
          </div>
          <button class="pv-close-btn" data-pv-close="button" aria-label="Fechar">&times;</button>
        </div>

        <div class="pv-content">
          ${config.tipo === 'portal' ? `
            <div class="pv-loading">
              <div class="pv-spinner"></div>
              <span>Conectando ao fornecedor...</span>
            </div>

            <div class="pv-iframe-container"></div>

            <div class="pv-blocked-msg" style="display:none;">
              <div class="pv-msg-icon">&#128683;</div>
              <p class="pv-msg-text">O portal <strong>${this._esc(config.nome)}</strong> bloqueou a exibição dentro do sistema.</p>
              <p class="pv-msg-hint">O portal foi aberto automaticamente em nova aba.</p>
            </div>

            <div class="pv-timeout-msg" style="display:none;">
              <div class="pv-msg-icon">&#9203;</div>
              <p class="pv-msg-text">O portal <strong>${this._esc(config.nome)}</strong> demorou para responder.</p>
              <p class="pv-msg-hint">Verifique sua conexão e tente novamente.</p>
            </div>

            <div class="pv-error-msg" style="display:none;">
              <div class="pv-msg-icon">&#9888;</div>
              <p class="pv-msg-text">Ocorreu um erro inesperado ao carregar o portal.</p>
              <p class="pv-msg-hint">Tente novamente ou abra em nova aba.</p>
            </div>
          ` : ''}
        </div>

        <div class="pv-footer">
          <button class="pv-btn pv-btn-secondary pv-retry-btn" style="display:none;" data-pv-action="retry">
            &#8635; Tentar novamente
          </button>
          <button class="pv-btn pv-btn-secondary pv-open-tab-btn" style="display:none;" data-pv-action="open-tab">
            &#128279; Abrir em nova aba
          </button>
          <div class="pv-footer-spacer"></div>
          <button class="pv-btn pv-btn-secondary" data-pv-action="back">
            &#8592; Voltar
          </button>
          <button class="pv-btn pv-btn-primary" data-pv-close="button">
            Fechar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(div);
    this._modalEl = div;
    document.body.classList.add('modal-open');

    this._bindEvents();
  },

  /**
   * Destrói o modal e limpa recursos.
   */
  _destroyModal() {
    this._cleanup();
    if (this._modalEl) {
      this._modalEl.remove();
      this._modalEl = null;
    }
    document.body.classList.remove('modal-open');
  },

  /**
   * Limpa iframe, timeouts e event listeners.
   */
  _cleanup() {
    // Destruir iframe
    if (this._iframeEl) {
      this._iframeEl.src = 'about:blank';
      window.PortalViewerUtils.safeRemove(this._iframeEl);
      this._iframeEl = null;
    }

    // Cancelar timeout
    this._timeout?.cancel();
    this._timeout = null;

    // Remover listeners
    this._listeners.forEach(({ el, event, handler }) => {
      el?.removeEventListener(event, handler);
    });
    this._listeners = [];

    this._state = 'idle';
    this._integrationKey = null;
    this._integrationConfig = null;
    this._workflowData = null;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Emite um CustomEvent no document.
   */
  _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  },

  /**
   * Registra listener para remoção posterior (evita memory leaks).
   */
  _addEvent(el, event, handler) {
    if (!el) return;
    el.addEventListener(event, handler);
    this._listeners.push({ el, event, handler });
  },

  /**
   * Bind events do modal.
   */
  _bindEvents() {
    if (!this._modalEl) return;

    // Fechar
    this._modalEl.querySelectorAll('[data-pv-close]').forEach(el => {
      this._addEvent(el, 'click', () => this.close());
    });

    // Ações
    this._modalEl.querySelectorAll('[data-pv-action]').forEach(el => {
      this._addEvent(el, 'click', () => {
        const action = el.dataset.pvAction;
        if (action === 'retry') this._handleRetry();
        else if (action === 'open-tab') this._handleOpenInNewTab();
        else if (action === 'back') this.close();
      });
    });

    // ESC fecha
    this._addEvent(document, 'keydown', (e) => {
      if (e.key === 'Escape' && this._modalEl) {
        this.close();
      }
    });

    // Focus trap
    this._addEvent(this._modalEl, 'keydown', (e) => {
      if (e.key !== 'Tab') return;

      const focusable = this._modalEl.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RETRY
  // ══════════════════════════════════════════════════════════════════════════

  _handleRetry() {
    if (!this._integrationConfig) return;

    this._setState('loading');

    if (this._integrationConfig.tipo === 'portal') {
      // Limpar iframe anterior
      if (this._iframeEl) {
        this._iframeEl.src = 'about:blank';
        window.PortalViewerUtils.safeRemove(this._iframeEl);
        this._iframeEl = null;
      }

      const url = window.PortalViewerUtils.sanitizeUrl(
        this._integrationConfig.portal?.url || this._integrationConfig.url
      );
      if (url) {
        this._loadIframe(url);
      } else {
        this._setState('error', 'URL inválida.');
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // AUDITORIA
  // ══════════════════════════════════════════════════════════════════════════

  _audit(action, resultado) {
    window.IntegrationAudit?.recordAction({
      integrationKey: this._integrationKey,
      fornecedor: this._integrationConfig?.nome || '',
      usuario: this._workflowData?.usuario || 'sistema',
      equipamento: {
        nome: this._workflowData?.asset?.nome || '',
        patrimonio: this._workflowData?.asset?.patrimonio || '',
        serial: this._workflowData?.asset?.serial || '',
        glpiId: this._workflowData?.asset?.glpiId || null,
      },
      acao: action,
      resultado,
      auditEvent: action,
      timestamp: new Date().toISOString(),
      data: {},
    });
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  _resolveTemplate(template, data) {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  },

  _getPrioridadeLabel(id) {
    const prioridades = window.WORKFLOW_CONFIG?.prioridades || [];
    const found = prioridades.find(p => p.id === parseInt(id, 10));
    return found ? found.label : 'Média';
  },

  _esc(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};
