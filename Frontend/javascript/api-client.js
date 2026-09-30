/**
 * GLPI Control Center - api-client.js
 * -----------------------------------------------------------------------------
 * Cliente HTTP centralizado com interceptores, retry e cache.
 *
 * Sprint 26: API Integrations
 */

window.ApiClient = (function () {
  'use strict';

  let _config = {
    baseUrl: '',
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
    cacheEnabled: true,
    cacheTTL: 60000,
  };

  const _interceptors = {
    request: [],
    response: [],
    error: [],
  };

  const _cache = {};
  const _pendingRequests = new Map();

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init(config = {}) {
    _config = { ..._config, ...config };
    _config.baseUrl = _config.baseUrl || (window.CONFIG?.backendUrl ?? '').replace(/\/$/, '');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // REQUEST
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Executa uma requisição HTTP.
   * @param {string} endpoint - Caminho da API
   * @param {object} options - Opções: method, body, headers, cache, retries
   * @returns {Promise<object>}
   */
  async function request(endpoint, options = {}) {
    const url = _buildUrl(endpoint);
    const method = (options.method || 'GET').toUpperCase();
    const cacheKey = options.cache !== false ? _getCacheKey(url, method, options.body) : null;

    // Verificar cache para GET
    if (method === 'GET' && cacheKey && _config.cacheEnabled) {
      const cached = _getFromCache(cacheKey);
      if (cached) return cached;
    }

    // Verificar request duplicado
    if (_pendingRequests.has(cacheKey)) {
      return _pendingRequests.get(cacheKey);
    }

    // Construir request
    let requestConfig = {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(options.timeout ?? _config.timeout),
    };

    if (options.body !== undefined) {
      requestConfig.body = JSON.stringify(options.body);
    }

    // Executar interceptors de request
    requestConfig = await _runInterceptors('request', requestConfig);

    // Promise com retry
    const promise = _fetchWithRetry(url, requestConfig, options.retries ?? (method === 'GET' ? _config.retries : 0));

    if (cacheKey) {
      _pendingRequests.set(cacheKey, promise);
    }

    try {
      const result = await promise;

      // Cache resultado GET
      if (method === 'GET' && cacheKey && _config.cacheEnabled) {
        _setCache(cacheKey, result);
      }

      // Executar interceptors de response
      return await _runInterceptors('response', result);
    } catch (error) {
      // Executar interceptors de erro
      await _runInterceptors('error', error);
      throw error;
    } finally {
      if (cacheKey) {
        _pendingRequests.delete(cacheKey);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MÉTODOS ABREVIAADOS
  // ════════════════════════════════════════════════════════════════════════════

  function get(endpoint, options = {}) {
    return request(endpoint, { ...options, method: 'GET' });
  }

  function post(endpoint, body, options = {}) {
    return request(endpoint, { ...options, method: 'POST', body });
  }

  function put(endpoint, body, options = {}) {
    return request(endpoint, { ...options, method: 'PUT', body });
  }

  function del(endpoint, options = {}) {
    return request(endpoint, { ...options, method: 'DELETE' });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RESPOSTAS DE ERRO
  // ════════════════════════════════════════════════════════════════════════════

  // Mensagens de último recurso, por status, quando o servidor não explica.
  const FALLBACK_MESSAGES = {
    400: 'O servidor recusou a requisição.',
    401: 'Sua sessão expirou. Entre novamente.',
    403: 'Você não tem permissão para esta ação.',
    404: 'Registro não encontrado.',
    409: 'Não foi possível concluir: o estado mudou ou já existe um responsável.',
    413: 'A requisição é grande demais para o servidor.',
    422: 'Revise os dados enviados: alguma condição não foi satisfeita.',
    429: 'Muitas requisições em seguida. Aguarde alguns instantes.',
    500: 'Erro interno no servidor.',
    502: 'O servidor não conseguiu falar com o GLPI agora.',
    503: 'Serviço temporariamente indisponível.',
    504: 'O servidor demorou demais para responder.',
  };

  /**
   * Extrai a explicação do servidor a partir do corpo de uma resposta de
   * erro, sem nunca exibir o payload bruto, credenciais ou stack traces.
   *
   * Aceita o contrato do GCC ({ok:false, error, meta}) e o formato do GLPI
   * ({status, message}). HTML, vazio ou conteúdo inesperado viram uma
   * mensagem genérica compreensível.
   */
  function _safeErrorMessage(status, payload) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const candidates = [payload.error, payload.message, payload.message_text];
      for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const clean = candidate.replace(/\s+/g, ' ').trim();
        // Payloads de stack trace ou JSON aninhado não são explicações.
        if (clean && clean.length <= 300 && !/^[[{<]/.test(clean)) return clean;
      }
    }
    return FALLBACK_MESSAGES[status] || 'Não foi possível concluir a operação.';
  }

  /**
   * Metadados seguros de um erro: o que a interface precisa para explicar
   * conflito, permissão, dado incorreto ou falha parcial. Campos desconhecidos
   * do servidor são descartados.
   */
  function _safeErrorMeta(status, payload) {
    const raw = (payload && typeof payload.meta === 'object' && payload.meta !== null) ? payload.meta : {};
    const out = { status };
    if (typeof raw.reason === 'string') out.reason = raw.reason.slice(0, 80);
    if (typeof raw.currentHandler === 'string' && raw.currentHandler) out.currentHandler = raw.currentHandler.slice(0, 160);
    if (typeof raw.currentStatusLabel === 'string') out.currentStatusLabel = raw.currentStatusLabel.slice(0, 60);
    if (Number.isFinite(Number(raw.currentUserId))) out.currentUserId = Number(raw.currentUserId);
    if (Array.isArray(raw.allowedActions)) {
      out.allowedActions = raw.allowedActions
        .filter(a => a && typeof a.action === 'string' && typeof a.label === 'string')
        .map(a => ({ action: a.action.slice(0, 24), label: a.label.slice(0, 60) }));
    }
    const data = (raw.data && typeof raw.data === 'object') ? raw.data : {};
    if (typeof data.partial === 'boolean') out.partial = data.partial;
    if (data.applied && typeof data.applied === 'object') {
      const applied = {};
      for (const [key, value] of Object.entries(data.applied)) {
        if (typeof value === 'boolean') applied[key] = value;
      }
      out.applied = applied;
    }
    if (Array.isArray(data.steps)) {
      out.steps = data.steps
        .filter(s => s && typeof s.step === 'string')
        .map(s => ({
          step: s.step.slice(0, 32),
          ok: Boolean(s.ok),
          label: typeof s.label === 'string' ? s.label.slice(0, 80) : '',
        }));
    }
    return out;
  }

  function _buildError(status, payload) {
    const error = new Error(_safeErrorMessage(status, payload));
    error.status = status;
    error.meta = _safeErrorMeta(status, payload);
    // `data` mantém a resposta completa para quem precisar do detalhe.
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) error.data = payload;
    error.isApiError = true;
    return error;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FETCH COM RETRY
  // ════════════════════════════════════════════════════════════════════════════

  async function _fetchWithRetry(url, config, retries) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        let res;
        try {
          res = await fetch(url, config);
        } catch (networkError) {
          // AbortSignal.timeout produz AbortError/TimeoutError; rede caída, TypeError.
          if (networkError?.name === 'AbortError' || networkError?.name === 'TimeoutError') {
            const timeout = _buildError(0, { error: 'A requisição demorou demais e foi interrompida.' });
            timeout.name = 'TimeoutError';
            throw timeout;
          }
          const offline = _buildError(0, { error: 'Sem conexão com o servidor do GCC. Verifique a rede.' });
          offline.isNetworkError = true;
          throw offline;
        }

        // O corpo é lido uma única vez e serve tanto para o caminho feliz
        // quanto para o caminho de erro.
        let payload = null;
        if (res.status !== 204) {
          const text = await res.text().catch(() => '');
          if (text) {
            try { payload = JSON.parse(text); } catch { payload = null; }
          }
        }

        if (!res.ok) {
          const error = _buildError(res.status, payload);
          // Não repetir erros 4xx: repetir uma alteração pode duplicar efeito.
          if (res.status >= 400 && res.status < 500 && res.status !== 429) throw error;
          lastError = error;
        } else {
          if (payload === null || typeof payload !== 'object') {
            throw _buildError(0, { error: 'Resposta do servidor não pôde ser lida.' });
          }
          if (payload.ok === false) throw _buildError(res.status, payload);
          return payload;
        }
      } catch (error) {
        lastError = error;
        if (attempt < retries && _isRetryable(error)) {
          await _delay(_config.retryDelay * (attempt + 1));
        } else {
          throw error;
        }
      }
    }

    throw lastError;
  }

  function _isRetryable(error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return false;
    if (error.status === 429) return true;
    if (error.status >= 500) return true;
    if (error.isNetworkError) return true;
    if (error.message?.includes('network')) return true;
    return false;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INTERCEPTORS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Registra interceptor de request.
   * @param {Function} fn - async (config) => config
   * @returns {Function} Unsubscribe
   */
  function addRequestInterceptor(fn) {
    _interceptors.request.push(fn);
    return () => {
      _interceptors.request = _interceptors.request.filter(i => i !== fn);
    };
  }

  /**
   * Registra interceptor de response.
   * @param {Function} fn - async (response) => response
   * @returns {Function} Unsubscribe
   */
  function addResponseInterceptor(fn) {
    _interceptors.response.push(fn);
    return () => {
      _interceptors.response = _interceptors.response.filter(i => i !== fn);
    };
  }

  /**
   * Registra interceptor de erro.
   * @param {Function} fn - async (error) => error
   * @returns {Function} Unsubscribe
   */
  function addErrorInterceptor(fn) {
    _interceptors.error.push(fn);
    return () => {
      _interceptors.error = _interceptors.error.filter(i => i !== fn);
    };
  }

  async function _runInterceptors(type, data) {
    let result = data;
    for (const interceptor of _interceptors[type]) {
      result = await interceptor(result);
    }
    return result;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CACHE
  // ════════════════════════════════════════════════════════════════════════════

  function _getCacheKey(url, method, body) {
    return `${method}:${url}:${body ? JSON.stringify(body) : ''}`;
  }

  function _getFromCache(key) {
    const entry = _cache[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > _config.cacheTTL) {
      delete _cache[key];
      return null;
    }
    return entry.data;
  }

  function _setCache(key, data) {
    _cache[key] = { data, timestamp: Date.now() };
  }

  function invalidateCache(pattern) {
    if (pattern) {
      Object.keys(_cache).forEach(key => {
        if (key.includes(pattern)) delete _cache[key];
      });
    } else {
      Object.keys(_cache).forEach(key => delete _cache[key]);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  function _buildUrl(endpoint) {
    if (endpoint.startsWith('http')) return endpoint;
    return _config.baseUrl + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
  }

  function _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    request,
    get,
    post,
    put,
    del,
    addRequestInterceptor,
    addResponseInterceptor,
    addErrorInterceptor,
    invalidateCache,
  };
})();
