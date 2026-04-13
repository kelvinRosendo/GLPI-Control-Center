/**
 * GLPI Control Center - data.js
 * -----------------------------------------------------------------------------
 * Configurações do ambiente e estado inicial dos dados.
 */

(function initConfig() {
  const params = new URLSearchParams(window.location.search);
  const forcedMode = params.get('mode');
  const hostname = window.location.hostname;
  const detectedLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  const mode = forcedMode === 'local' || forcedMode === 'server'
    ? forcedMode
    : (detectedLocalHost ? 'local' : 'server');

  const serverHost = '192.168.1.20';
  const runtime = {
    local: {
      label: 'local',
      glpiUrl: 'http://localhost/glpi',
      backendUrl: 'http://localhost:8080',
    },
    server: {
      label: 'server',
      glpiUrl: `http://${serverHost}/glpi`,
      backendUrl: `http://${serverHost}:9090`,
    },
  }[mode];

  window.CONFIG = {
    mode,
    modeWasForced: forcedMode === 'local' || forcedMode === 'server',
    detectedLocalHost,
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
