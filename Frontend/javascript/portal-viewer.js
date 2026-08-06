/**
 * GLPI Control Center - portal-viewer.js
 * -----------------------------------------------------------------------------
 * Portal Viewer — camada visual das integrações.
 *
 * Responsabilidades:
 * - Abrir modal conforme o tipo da integração (portal, email ou manual)
 * - Tentar carregar iframe automaticamente para portais
 * - Detectar bloqueio (X-Frame-Options / CSP) e fazer fallback para nova aba
 * - Controlar estados: connecting, validating, loading, loaded, blocked, fallback, done, error
 * - Exibir countdown de 2 segundos antes de abrir em nova aba
 * - Fornecer botão "Abrir agora" para abertura imediata
 * - Registrar auditoria de cada etapa
 * - Emitir eventos CustomEvent para monitoramento
 * - Destruir iframe ao fechar (evitar memory leaks)
 *
 * Eventos emitidos:
 *   portal:opening          — modal sendo aberto
 *   portal:iframe-loading   — iframe começando a carregar
 *   portal:iframe-loaded    — iframe carregou com sucesso
 *   portal:iframe-blocked   — fornecedor bloqueou iframe
 *   portal:fallback-start   — countdown de fallback iniciado
 *   portal:fallback-finished — fallback concluído (nova aba aberta)
 *   portal:loaded           — portal/email carregado com sucesso
 *   portal:timeout          — portal demorou para responder
 *   portal:error            — erro inesperado
 *   portal:closed           — modal fechado
 *
 * Sprint 4: PortalViewer + Integration UI
 * Sprint 4.5: iframe real + detecção automática de bloqueio
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
  _countdownInterval: null,
  _countdownValue: 0,
  _fallbackUrl: null,
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
    this._setState('connecting');
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
  // PORTAL (iframe com detecção automática)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Abre portal web tentando iframe primeiro.
   * A detecção de bloqueio é automática — sem configuração manual.
   */
  _openPortal(config) {
    const url = window.PortalViewerUtils.sanitizeUrl(config.portal?.url || config.url);
    if (!url) {
      this._setState('error', 'URL do portal inválida.');
      this._audit('iframe-error', 'falha', { reason: 'invalid-url' });
      return;
    }

    this._fallbackUrl = url;
    this._setState('validating');
    this._audit('iframe-attempt', 'sucesso', { url });

    this._loadIframe(url);
  },

  /**
   * Carrega iframe no modal e detecta bloqueio automaticamente.
   *
   * Fluxo de detecção:
   * 1. Criar iframe com sandbox
   * 2. Aguardar onload → verificar se conteúdo é acessível
   * 3. Aguardar onerror → bloqueio confirmado
   * 4. Timeout configurável → considerar como bloqueado
   * 5. Cross-origin sem erro → provavelmente carregou (CORS impede leitura)
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
    this._setState('loading');
    this._emit('portal:iframe-loading', { integrationKey: this._integrationKey, url });

    // Timeout para carregamento
    this._timeout = window.PortalViewerUtils.createTimeout(
      window.PortalViewerUtils.PORTAL_TIMEOUT_MS,
      () => {
        this._handleIframeBlocked(url, 'timeout');
      }
    );

    // Quando iframe carrega — verificar se não foi bloqueado
    this._addEvent(iframe, 'load', () => {
      this._timeout?.cancel();

      // Verificar se o conteúdo realmente carregou
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc || doc.body?.innerHTML === '') {
          // Conteúdo vazio = provável bloqueio via X-Frame-Options/CSP
          this._handleIframeBlocked(url, 'empty-content');
          return;
        }
      } catch {
        // Cross-origin — não conseguimos ler, mas pode ter carregado
        // Se o navegador não bloqueou, o iframe provavelmente funciona
      }

      // Iframe carregou com sucesso
      this._handleIframeLoaded(url);
    });

    // Erro no iframe
    this._addEvent(iframe, 'error', () => {
      this._timeout?.cancel();
      this._handleIframeBlocked(url, 'error');
    });

    container.innerHTML = '';
    container.appendChild(iframe);
  },

  /**
   * Trata iframe carregado com sucesso.
   */
  _handleIframeLoaded(url) {
    this._setState('loaded');
    this._emit('portal:iframe-loaded', { integrationKey: this._integrationKey, url });
    this._audit('iframe-loaded', 'sucesso', { url });

    // Registrar auditoria global
    if (window.Audit) {
      window.Audit.register({
        action: 'portal_aberto',
        module: 'portal_viewer',
        descricao: `Portal ${this._integrationConfig?.nome || this._integrationKey} carregado via iframe`,
        fornecedor: this._integrationConfig?.nome || null,
        equipamento: this._workflowData?.asset?.nome || null,
      });
    }

    // Mostrar iframe, esconder loading
    const iframeContainer = this._modalEl?.querySelector('.pv-iframe-container');
    if (iframeContainer) iframeContainer.style.display = 'block';
  },

  /**
   * Trata iframe bloqueado — inicia fallback automático.
   * @param {string} url - URL que falhou
   * @param {string} reason - motivo: 'empty-content', 'error', 'timeout'
   */
  _handleIframeBlocked(url, reason) {
    this._setState('blocked');
    this._emit('portal:iframe-blocked', {
      integrationKey: this._integrationKey,
      url,
      reason,
    });
    this._audit('iframe-blocked', 'falha', { url, reason });

    // Registrar auditoria global
    if (window.Audit) {
      window.Audit.register({
        action: 'portal_bloqueado',
        module: 'portal_viewer',
        severity: 'warning',
        descricao: `Portal ${this._integrationConfig?.nome || this._integrationKey} bloqueou iframe (${reason}). Fallback para nova aba.`,
        fornecedor: this._integrationConfig?.nome || null,
        equipamento: this._workflowData?.asset?.nome || null,
        extras: { url, reason },
      });
    }

    // Iniciar fallback automático após 2 segundos
    this._startFallbackCountdown();
  },

  // ══════════════════════════════════════════════════════════════════════════
  // FALLBACK — Abertura em nova aba
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Inicia countdown de 2 segundos antes de abrir em nova aba.
   */
  _startFallbackCountdown() {
    this._countdownValue = Math.ceil(window.PortalViewerUtils.FALLBACK_COUNTDOWN_MS / 1000);
    this._setState('fallback', `Abrindo nova aba em ${this._countdownValue}s...`);
    this._emit('portal:fallback-start', {
      integrationKey: this._integrationKey,
      url: this._fallbackUrl,
      countdown: this._countdownValue,
    });
    this._audit('fallback-start', 'sucesso', { url: this._fallbackUrl });

    this._updateCountdownDisplay();

    this._countdownInterval = window.PortalViewerUtils.createInterval(1000, () => {
      this._countdownValue--;
      this._updateCountdownDisplay();

      if (this._countdownValue <= 0) {
        this._executeFallback();
      }
    });
  },

  /**
   * Atualiza a exibição do countdown na UI.
   */
  _updateCountdownDisplay() {
    const countdownEl = this._modalEl?.querySelector('.pv-countdown-value');
    if (countdownEl) {
      countdownEl.textContent = this._countdownValue;
    }

    const statusText = this._modalEl?.querySelector('.pv-status-text');
    if (statusText && this._state === 'fallback') {
      statusText.textContent = `Abrindo nova aba em ${this._countdownValue}s...`;
    }
  },

  /**
   * Executa o fallback — abre URL em nova aba.
   */
  _executeFallback() {
    this._cancelCountdown();

    if (!this._fallbackUrl) {
      this._setState('error', 'URL do portal não disponível.');
      return;
    }

    this._openInNewTab(this._fallbackUrl);
    this._setState('done');
    this._emit('portal:fallback-finished', {
      integrationKey: this._integrationKey,
      url: this._fallbackUrl,
    });
    this._audit('fallback-finished', 'sucesso', { url: this._fallbackUrl });

    // Registrar auditoria global
    if (window.Audit) {
      window.Audit.register({
        action: 'portal_fallback',
        module: 'portal_viewer',
        descricao: `Portal ${this._integrationConfig?.nome || this._integrationKey} aberto em nova aba via fallback`,
        fornecedor: this._integrationConfig?.nome || null,
        equipamento: this._workflowData?.asset?.nome || null,
        extras: { url: this._fallbackUrl },
      });
    }
  },

  /**
   * Cancela o countdown em andamento.
   */
  _cancelCountdown() {
    this._countdownInterval?.cancel();
    this._countdownInterval = null;
    this._countdownValue = 0;
  },

  /**
   * Abre URL em nova aba.
   */
  _openInNewTab(url) {
    const validated = window.PortalViewerUtils.validateUrl(url);
    if (!validated.valid) return;

    window.open(url, '_blank', 'noopener,noreferrer');
  },

  /**
   * Botão "Abrir agora" — abre imediatamente sem esperar countdown.
   */
  _handleOpenNow() {
    this._cancelCountdown();
    this._executeFallback();
  },

  /**
   * Botão "Abrir em nova aba" clicado pelo usuário (fallback manual).
   */
  _handleOpenInNewTab() {
    const url = this._fallbackUrl || this._integrationConfig?.portal?.url || this._integrationConfig?.url;
    const sanitized = window.PortalViewerUtils.sanitizeUrl(url);
    if (sanitized) {
      this._cancelCountdown();
      this._openInNewTab(sanitized);
      this._setState('done');
      this._audit('fallback-opened-manual', 'sucesso', { url: sanitized });
    }
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
      if (state === 'connecting' || state === 'validating' || state === 'loading') {
        statusDot.classList.add('loading');
      } else if (state === 'loaded' || state === 'done') {
        statusDot.classList.add('loaded');
      } else if (state === 'blocked' || state === 'error') {
        statusDot.classList.add('error');
      } else if (state === 'fallback') {
        statusDot.classList.add('fallback');
      }
    }

    // Mostrar/esconder elementos conforme estado
    const loadingEl = this._modalEl?.querySelector('.pv-loading');
    const blockedEl = this._modalEl?.querySelector('.pv-blocked-msg');
    const fallbackEl = this._modalEl?.querySelector('.pv-fallback-msg');
    const errorEl = this._modalEl?.querySelector('.pv-error-msg');
    const retryBtn = this._modalEl?.querySelector('.pv-retry-btn');
    const openNowBtn = this._modalEl?.querySelector('.pv-open-now-btn');
    const openTabBtn = this._modalEl?.querySelector('.pv-open-tab-btn');
    const iframeContainer = this._modalEl?.querySelector('.pv-iframe-container');
    const progressEl = this._modalEl?.querySelector('.pv-progress');

    const isPortal = this._integrationConfig?.tipo === 'portal';

    if (loadingEl) loadingEl.style.display = (state === 'connecting' || state === 'validating' || state === 'loading') ? 'flex' : 'none';
    if (blockedEl) blockedEl.style.display = state === 'blocked' ? 'block' : 'none';
    if (fallbackEl) fallbackEl.style.display = state === 'fallback' ? 'block' : 'none';
    if (errorEl) errorEl.style.display = state === 'error' ? 'block' : 'none';
    if (retryBtn) retryBtn.style.display = (state === 'error' || state === 'blocked') ? 'inline-flex' : 'none';
    if (openNowBtn) openNowBtn.style.display = (state === 'fallback' || state === 'blocked') ? 'inline-flex' : 'none';
    if (openTabBtn) openTabBtn.style.display = (state === 'blocked' && !isPortal) ? 'inline-flex' : 'none';
    if (iframeContainer) iframeContainer.style.display = (state === 'loaded' && isPortal) ? 'block' : 'none';
    if (progressEl) progressEl.style.display = (state === 'loading' || state === 'validating') ? 'block' : 'none';

    // Atualizar barra de progresso
    if (progressEl) {
      const progressBar = progressEl.querySelector('.pv-progress-bar');
      if (progressBar) {
        if (state === 'connecting') progressBar.style.width = '20%';
        else if (state === 'validating') progressBar.style.width = '40%';
        else if (state === 'loading') progressBar.style.width = '70%';
        else if (state === 'loaded') progressBar.style.width = '100%';
      }
    }
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
                <span class="pv-status-text">${window.PortalViewerUtils.STATE_LABELS.connecting}</span>
              </div>
            </div>
          </div>
          <button class="pv-close-btn" data-pv-close="button" aria-label="Fechar">&times;</button>
        </div>

        <div class="pv-content">
          ${config.tipo === 'portal' ? `
            <div class="pv-loading">
              <div class="pv-spinner"></div>
              <span class="pv-loading-text">Conectando ao fornecedor...</span>
            </div>

            <div class="pv-progress" style="display:none;">
              <div class="pv-progress-bar"></div>
            </div>

            <div class="pv-iframe-container"></div>

            <div class="pv-blocked-msg" style="display:none;">
              <div class="pv-msg-icon">&#128683;</div>
              <p class="pv-msg-text">O portal do fornecedor não permite abertura dentro do GCC.</p>
              <p class="pv-msg-hint">O portal será aberto automaticamente em nova aba.</p>
            </div>

            <div class="pv-fallback-msg" style="display:none;">
              <div class="pv-msg-icon">&#128196;</div>
              <p class="pv-msg-text">Abrindo em nova aba...</p>
              <p class="pv-msg-hint">
                Abrindo em nova aba em <span class="pv-countdown-value">2</span> segundos.
              </p>
              <button class="pv-btn pv-btn-primary pv-open-now-btn" data-pv-action="open-now" style="margin-top:16px;">
                &#128279; Abrir agora
              </button>
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
          <button class="pv-btn pv-btn-secondary pv-open-now-btn" style="display:none;" data-pv-action="open-now">
            &#128279; Abrir agora
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
   * Limpa iframe, timeouts, countdowns e event listeners.
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

    // Cancelar countdown
    this._cancelCountdown();

    // Remover listeners
    this._listeners.forEach(({ el, event, handler }) => {
      el?.removeEventListener(event, handler);
    });
    this._listeners = [];

    this._state = 'idle';
    this._integrationKey = null;
    this._integrationConfig = null;
    this._workflowData = null;
    this._fallbackUrl = null;
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
        else if (action === 'open-now') this._handleOpenNow();
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

    this._cancelCountdown();

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
        this._fallbackUrl = url;
        this._setState('connecting');
        this._audit('iframe-retry', 'sucesso', { url });
        this._loadIframe(url);
      } else {
        this._setState('error', 'URL inválida.');
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // AUDITORIA
  // ══════════════════════════════════════════════════════════════════════════

  _audit(action, resultado, data = {}) {
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
      data,
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
