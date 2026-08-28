/**
 * GLPI Control Center - api-interceptors.js
 * -----------------------------------------------------------------------------
 * Interceptores padrão para o ApiClient.
 *
 * Sprint 26: API Integrations
 */

window.ApiInterceptors = (function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════
  // INTERCEPTOR: AUTENTICAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Adiciona token de autenticação aos requests.
   */
  function authInterceptor(config) {
    const session = window.UserContext?.getSession?.();
    if (session?.token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${session.token}`;
    }
    if (session?.csrfToken) {
      config.headers = config.headers || {};
      config.headers['X-CSRF-Token'] = session.csrfToken;
    }
    return config;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INTERCEPTOR: LOGGING
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Loga requests e responses.
   */
  function loggingInterceptor(config) {
    if (window.Audit) {
      window.Audit.log({
        action: 'api_request',
        module: 'api',
        descricao: `${config.method} ${config.url || 'unknown'}`,
        severity: 'info',
      });
    }
    return config;
  }

  /**
   * Loga responses bem-sucedidas.
   */
  function responseLogger(response) {
    return response;
  }

  /**
   * Loga erros de API.
   */
  function errorLogger(error) {
    if (window.ErrorHandler) {
      window.ErrorHandler.handleNetwork(error.message || 'Erro de API', {
        status: error.status,
        url: error.url,
      });
    }
    return error;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INTERCEPTOR: LOADING
  // ════════════════════════════════════════════════════════════════════════════

  let _activeRequests = 0;
  let _loadingTimeout = null;

  /**
   * Gerencia estado de loading global.
   */
  function loadingInterceptor(config) {
    _activeRequests++;
    _updateLoadingState();
    return config;
  }

  function loadingResponseInterceptor(response) {
    _activeRequests = Math.max(0, _activeRequests - 1);
    _updateLoadingState();
    return response;
  }

  function loadingErrorInterceptor(error) {
    _activeRequests = Math.max(0, _activeRequests - 1);
    _updateLoadingState();
    throw error;
  }

  function _updateLoadingState() {
    clearTimeout(_loadingTimeout);
    _loadingTimeout = setTimeout(() => {
      document.dispatchEvent(new CustomEvent('api:loading', {
        detail: { loading: _activeRequests > 0, count: _activeRequests },
      }));
    }, 100);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INTERCEPTOR: RETRY 429
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Retry automático para rate limit (429).
   */
  async function rateLimitInterceptor(error) {
    if (error.status === 429) {
      const retryAfter = error.response?.headers?.get('Retry-After') || 5;
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return error;
    }
    throw error;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INSTALAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Instala todos os interceptores padrão.
   */
  function install() {
    if (!window.ApiClient) return;

    window.ApiClient.addRequestInterceptor(authInterceptor);
    window.ApiClient.addRequestInterceptor(loadingInterceptor);
    window.ApiClient.addResponseInterceptor(loadingResponseInterceptor);
    window.ApiClient.addErrorInterceptor(loadingErrorInterceptor);
    window.ApiClient.addErrorInterceptor(errorLogger);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    install,
    authInterceptor,
    loggingInterceptor,
    responseLogger,
    errorLogger,
    loadingInterceptor,
    loadingResponseInterceptor,
    loadingErrorInterceptor,
    rateLimitInterceptor,
  };
})();
