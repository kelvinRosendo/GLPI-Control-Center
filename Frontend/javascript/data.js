/**
 * GLPI Control Center - data.js
 * -----------------------------------------------------------------------------
 * Configurações do ambiente e estado inicial dos dados.
 *
 * ATUALIZADO: Agora usa config.env.js para variáveis de ambiente.
 */

(function initConfig() {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var forcedMode = params.get('mode');
  var hostname = window.location.hostname;
  var detectedLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

  var mode = forcedMode === 'local' || forcedMode === 'server'
    ? forcedMode
    : (detectedLocalHost ? 'local' : 'server');

  // Usar config.env.js se disponível
  var envConfig = window.ENV_CONFIG || {};
  var backendUrl = envConfig.backend?.url;
  var glpiUrl = envConfig.glpi?.url;

  var serverHost = '192.168.1.20';

  var runtime = {
    local: {
      label: 'local',
      glpiUrl: glpiUrl || 'http://localhost/glpi',
      backendUrl: backendUrl || 'http://localhost:8080',
    },
    server: {
      label: 'server',
      glpiUrl: glpiUrl || 'http://' + serverHost + '/glpi',
      backendUrl: backendUrl || 'http://' + serverHost + ':9090',
    },
  }[mode];

  window.CONFIG = {
    mode: mode,
    modeWasForced: forcedMode === 'local' || forcedMode === 'server',
    detectedLocalHost: detectedLocalHost,
    glpiUrl: runtime.glpiUrl,
    backendUrl: runtime.backendUrl,
    users: {
      admin: '1234',
      ti: 'ti@2025',
    },
  };
})();

window.DATA = {
  computadores: [],
  chromebooksGeekiees: [],
  chromebooksApoio: {},
  projetores: [],
  impressoras: [],
};
