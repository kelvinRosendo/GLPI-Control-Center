/**
 * GLPI Control Center - portal-viewer.utils.js
 * -----------------------------------------------------------------------------
 * Funções auxiliares para o Portal Viewer.
 *
 * Responsabilidades:
 * - Validar URLs (apenas https:// e http://)
 * - Detectar suporte a iframe
 * - Sanitizar parâmetros
 * - Controlar timeout
 * - Helpers de DOM e segurança
 *
 * Sprint 4: Utilitários para PortalViewer
 */

window.PortalViewerUtils = {

  // ── Validação de URL ─────────────────────────────────────────────────────

  ALLOWED_PROTOCOLS: ['https:', 'http:'],

  /**
   * Valida se uma URL é segura para abertura.
   * Aceita somente https:// e http://.
   * Bloqueia protocolos inválidos (javascript:, data:, file:, etc.)
   *
   * @param {string} url
   * @returns {{ valid: boolean, error?: string }}
   */
  validateUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'URL não fornecida.' };
    }

    const trimmed = url.trim();
    if (trimmed === '') {
      return { valid: false, error: 'URL vazia.' };
    }

    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { valid: false, error: 'URL em formato inválido.' };
    }

    if (!this.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return {
        valid: false,
        error: `Protocolo não permitido: ${parsed.protocol} Somente https:// e http:// são aceitos.`,
      };
    }

    return { valid: true };
  },

  /**
   * Retorna a URL validada e limpa, ou null se inválida.
   * @param {string} url
   * @returns {string|null}
   */
  sanitizeUrl(url) {
    const result = this.validateUrl(url);
    return result.valid ? url.trim() : null;
  },

  // ── Detecção de Suporte a iframe ─────────────────────────────────────────

  /**
   * Detecta se o navegador suporta iframes.
   * @returns {boolean}
   */
  supportsIframe() {
    return typeof document !== 'undefined' && 'createElement' in document;
  },

  /**
   * Tenta detectar se uma URL bloqueia iframe via X-Frame-Options ou CSP.
   * Esta é uma detecção heurística — o bloqueio real só é conhecido
   * quando o iframe tenta carregar.
   *
   * @param {string} url
   * @returns {{ canIframe: boolean, reason?: string }}
   */
  async detectIframeSupport(url) {
    const validated = this.validateUrl(url);
    if (!validated.valid) {
      return { canIframe: false, reason: validated.error };
    }

    return new Promise((resolve) => {
      const testIframe = document.createElement('iframe');
      testIframe.style.display = 'none';
      testIframe.setAttribute('sandbox', 'allow-same-origin');
      testIframe.src = url;

      const timeout = setTimeout(() => {
        cleanup();
        resolve({ canIframe: true, reason: 'timeout-assumed-ok' });
      }, 3000);

      const cleanup = () => {
        clearTimeout(timeout);
        if (testIframe.parentNode) {
          testIframe.parentNode.removeChild(testIframe);
        }
      };

      testIframe.onload = () => {
        cleanup();
        resolve({ canIframe: true });
      };

      testIframe.onerror = () => {
        cleanup();
        resolve({ canIframe: false, reason: 'error-loading' });
      };

      document.body.appendChild(testIframe);
    });
  },

  // ── Controle de Timeout ──────────────────────────────────────────────────

  /**
   * Cria um timeout controlado para carregamento de iframe.
   * @param {number} ms - milissegundos
   * @param {function} callback - chamado quando o timeout expira
   * @returns {{ cancel: function }}
   */
  createTimeout(ms, callback) {
    const id = setTimeout(callback, ms);
    return {
      cancel: () => clearTimeout(id),
    };
  },

  /**
   * Duração padrão de timeout para carregamento de portal.
   */
  PORTAL_TIMEOUT_MS: 15000,

  /**
   * Duração padrão de timeout para detecção de bloqueio.
   */
  BLOCK_DETECT_TIMEOUT_MS: 5000,

  // ── Sanitização de Parâmetros ────────────────────────────────────────────

  /**
   * Sanitiza um valor para uso em templates.
   * Remove tags HTML e limita tamanho.
   *
   * @param {string} value
   * @param {number} maxLength
   * @returns {string}
   */
  sanitizeParam(value, maxLength = 500) {
    if (!value || typeof value !== 'string') return '';

    return value
      .replace(/<[^>]*>/g, '')
      .replace(/[<>"'&]/g, '')
      .trim()
      .substring(0, maxLength);
  },

  /**
   * Sanitiza um objeto de parâmetros inteiro.
   * @param {object} params
   * @returns {object}
   */
  sanitizeParams(params) {
    if (!params || typeof params !== 'object') return {};

    const sanitized = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeParam(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }
    return sanitized;
  },

  // ── Helpers de DOM ───────────────────────────────────────────────────────

  /**
   * Remove um elemento do DOM de forma segura.
   * @param {HTMLElement|null} el
   */
  safeRemove(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  },

  /**
   * Remove todos os event listeners de um elemento clonando-o.
   * @param {HTMLElement} el
   * @returns {HTMLElement}
   */
  removeAllListeners(el) {
    if (!el) return el;
    const clone = el.cloneNode(true);
    el.parentNode?.replaceChild(clone, el);
    return clone;
  },

  // ── Helpers de Email ─────────────────────────────────────────────────────

  /**
   * Monta uma URL mailto com parâmetros sanitizados.
   * @param {string} email
   * @param {string} subject
   * @param {string} body
   * @returns {string}
   */
  buildMailtoUrl(email, subject, body) {
    const safeEmail = this.sanitizeParam(email, 200);
    const safeSubject = this.sanitizeParam(subject, 200);
    const safeBody = this.sanitizeParam(body, 5000);

    return `mailto:${safeEmail}?subject=${encodeURIComponent(safeSubject)}&body=${encodeURIComponent(safeBody)}`;
  },

  // ── Helpers de Estado ────────────────────────────────────────────────────

  /**
   * Estados possíveis do Portal Viewer.
   */
  STATES: {
    IDLE: 'idle',
    LOADING: 'loading',
    LOADED: 'loaded',
    BLOCKED: 'blocked',
    TIMEOUT: 'timeout',
    ERROR: 'error',
  },

  /**
   * Labels dos estados para exibição.
   */
  STATE_LABELS: {
    idle: 'Inicializando...',
    loading: 'Conectando ao fornecedor...',
    loaded: 'Portal carregado',
    blocked: 'Fornecedor bloqueou iframe',
    timeout: 'Portal demorou para responder',
    error: 'Erro inesperado',
  },
};
