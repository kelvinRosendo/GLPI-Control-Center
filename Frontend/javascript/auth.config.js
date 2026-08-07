/**
 * GLPI Control Center - auth.config.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada do sistema de autenticação.
 *
 * Define:
 * - Client ID do Google OAuth
 * - Domínios permitidos
 * - URLs de redirecionamento
 * - Configurações de sessão
 * - Provedores de autenticação (preparado para múltiplos)
 *
 * PRINCÍPIO: Configuration Driven Design
 * - Nenhum valor hardcoded nos módulos de autenticação
 * - Novos provedores são adicionados APENAS neste arquivo
 *
 * Sprint 9.5: Google OAuth, Controle de Acesso e Perfis de Usuário
 */

window.AUTH_CONFIG = (function () {
  'use strict';

  // Carregar configuração de ambiente se disponível
  var envConfig = window.ENV_CONFIG || {};

  // ══════════════════════════════════════════════════════════════════════════
  // GOOGLE OAUTH 2.0
  // ══════════════════════════════════════════════════════════════════════════

  var googleClientId = envConfig.auth?.googleClientId
    || '985292439142-lveqa6pff29h4c3pb5951a1gn69lpomv.apps.googleusercontent.com';

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  return {

    google: {
      clientId: googleClientId,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/oauth2/v2/rest'],
      scope: 'openid email profile',
    },

    // ════════════════════════════════════════════════════════════════════════
    // DOMÍNIOS PERMITIDOS
    // ════════════════════════════════════════════════════════════════════════

    allowedDomains: envConfig.auth?.allowedDomains
      || ['colegiosatelite.com.br'],

    // ════════════════════════════════════════════════════════════════════════
    // SESSÃO
    // ════════════════════════════════════════════════════════════════════════

    session: {
      storageKey: envConfig.auth?.sessionKey || 'glpi:gcc:session',
      tokenRefreshIntervalMs: 30 * 60 * 1000,   // 30 minutos
      maxSessionDurationMs: 12 * 60 * 60 * 1000, // 12 horas
      rememberMe: true,
    },

    // ════════════════════════════════════════════════════════════════════════
    // MENSAGENS
    // ════════════════════════════════════════════════════════════════════════

    messages: {
      domainNotAllowed: 'Este sistema é exclusivo para colaboradores do Colégio Satélite.',
      loginRequired: 'Faça login para acessar o sistema.',
      sessionExpired: 'Sua sessão expirou. Faça login novamente.',
      networkError: 'Erro de conexão. Verifique sua internet.',
      genericError: 'Ocorreu um erro ao tentar fazer login.',
    },

    // ════════════════════════════════════════════════════════════════════════
    // PROVEDORES PREPARADOS (futuro)
    // ════════════════════════════════════════════════════════════════════════

    providers: {
      google: { enabled: true, label: 'Google' },
      azure: { enabled: false, label: 'Microsoft Entra ID' },
      ldap: { enabled: false, label: 'LDAP' },
      ad: { enabled: false, label: 'Active Directory' },
    },

    // ════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Verifica se o domínio do email é permitido.
     * @param {string} email
     * @returns {boolean}
     */
    isDomainAllowed: function (email) {
      if (!email || typeof email !== 'string') return false;
      var domain = email.split('@')[1];
      if (domain) domain = domain.toLowerCase();
      return this.allowedDomains.indexOf(domain) !== -1;
    },

    /**
     * Retorna o provedor ativo.
     * @returns {string}
     */
    getActiveProvider: function () {
      var entries = Object.entries(this.providers);
      for (var i = 0; i < entries.length; i++) {
        if (entries[i][1].enabled) return entries[i][0];
      }
      return 'google';
    },

    /**
     * Verifica se um provedor está habilitado.
     * @param {string} providerKey
     * @returns {boolean}
     */
    isProviderEnabled: function (providerKey) {
      var provider = this.providers[providerKey];
      return provider ? provider.enabled : false;
    },
  };

})();
