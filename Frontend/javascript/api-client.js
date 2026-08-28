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
    const promise = _fetchWithRetry(url, requestConfig, options.retries ?? _config.retries);

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
  // FETCH COM RETRY
  // ════════════════════════════════════════════════════════════════════════════

  async function _fetchWithRetry(url, config, retries) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, config);

        if (!res.ok) {
          const error = new Error(`HTTP ${res.status}`);
          error.status = res.status;
          error.response = res;

          // Não retry em erros 4xx (exceto 429)
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            throw error;
          }

          lastError = error;
        } else {
          const json = await res.json();

          if (json.ok === false) {
            const error = new Error(json.error || 'Erro na API');
            error.data = json;
            throw error;
          }

          return json;
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
    if (error.name === 'AbortError') return false;
    if (error.status === 429) return true;
    if (error.status >= 500) return true;
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
