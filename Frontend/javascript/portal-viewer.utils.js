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
 * Sprint 4.5: Novos estados para detecção automática de iframe
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
   * Cria um intervalo controlado que executa callback a cada tick.
   * @param {number} ms - milissegundos entre cada tick
   * @param {function} callback - chamado a cada tick
   * @returns {{ cancel: function }}
   */
  createInterval(ms, callback) {
    const id = setInterval(callback, ms);
    return {
      cancel: () => clearInterval(id),
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

  /**
   * Duração do countdown antes de abrir em nova aba (ms).
   */
  FALLBACK_COUNTDOWN_MS: 2000,

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
    CONNECTING: 'connecting',
    VALIDATING: 'validating',
    LOADING: 'loading',
    LOADED: 'loaded',
    BLOCKED: 'blocked',
    FALLBACK: 'fallback',
    DONE: 'done',
    ERROR: 'error',
  },

  /**
   * Labels dos estados para exibição.
   */
  STATE_LABELS: {
    idle: 'Inicializando...',
    connecting: 'Conectando...',
    validating: 'Validando...',
    loading: 'Carregando portal...',
    loaded: 'Portal carregado',
    blocked: 'Portal bloqueado',
    fallback: 'Abrindo nova aba...',
    done: 'Concluído',
    error: 'Erro inesperado',
  },
};
