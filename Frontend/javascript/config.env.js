/**
 * GLPI Control Center - config.env.js
 * -----------------------------------------------------------------------------
 * Configuração de ambiente do Frontend.
 *
 * Este arquivo contém todas as variáveis de ambiente do frontend.
 * Em produção, substitua os valores conforme o ambiente.
 *
 * ATENÇÃO: Este arquivo é versionado. NUNCA coloque chaves sensíveis aqui.
 * Use variáveis de ambiente do servidor ou runtime config para secrets.
 *
 * Sprint 10: Central de Notificações Inteligentes
 */

(function () {
  'use strict';

  // Detectar ambiente
  var hostname = window.location.hostname;
  var isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  var params = new URLSearchParams(window.location.search);
  var forcedEnv = params.get('env');

  // ══════════════════════════════════════════════════════════════════════════
  // AMBIENTES
  // ══════════════════════════════════════════════════════════════════════════

  var environments = {

    // ── Development (Local) ──────────────────────────────────────────────

    development: {
      label: 'development',
      debug: true,

      // Backend API
      backend: {
        url: 'http://localhost:3000',
        timeout: 30000,
      },

      // GLPI (acesso direto para某些 funções)
      glpi: {
        url: 'http://localhost/glpi',
      },

      // Google OAuth
      auth: {
        googleClientId: '985292439142-lveqa6pff29h4c3pb5951a1gn69lpomv.apps.googleusercontent.com',
        allowedDomains: ['colegiosatelite.com.br'],
        sessionKey: 'glpi:gcc:session:dev',
      },

      // Notificações
      notifications: {
        maxItems: 100,
        ttlDays: 7,
      },

      // Integrações
      integrations: {
        openaiEnabled: false,
      },
    },

    // ── Production (Servidor) ────────────────────────────────────────────

    production: {
      label: 'production',
      debug: false,

      // Backend API
      backend: {
        url: 'https://gcc.colegiosatelite.com.br',
        timeout: 15000,
      },

      // GLPI
      glpi: {
        url: 'https://glpi.colegiosatelite.com.br',
      },

      // Google OAuth
      auth: {
        googleClientId: '985292439142-lveqa6pff29h4c3pb5951a1gn69lpomv.apps.googleusercontent.com',
        allowedDomains: ['colegiosatelite.com.br'],
        sessionKey: 'glpi:gcc:session',
      },

      // Notificações
      notifications: {
        maxItems: 100,
        ttlDays: 30,
      },

      // Integrações
      integrations: {
        openaiEnabled: true,
      },
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // DETECÇÃO AUTOMÁTICA
  // ══════════════════════════════════════════════════════════════════════════

  var env = forcedEnv || (isLocalhost ? 'development' : 'production');
  var config = environments[env] || environments.development;

  // ══════════════════════════════════════════════════════════════════════════
  // EXPOSIÇÃO GLOBAL
  // ══════════════════════════════════════════════════════════════════════════

  window.ENV_CONFIG = config;
  window.APP_ENV = env;

  // Log em development
  if (config.debug) {
    console.log('[ENV] Ambiente detectado:', env);
    console.log('[ENV] Config:', config);
  }

})();
