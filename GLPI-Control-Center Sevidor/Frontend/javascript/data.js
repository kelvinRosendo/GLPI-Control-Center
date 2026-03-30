/**
 * GLPI Control Center - data.js
 * -----------------------------------------------------------------------------
 * Configurações do ambiente e estado inicial dos dados.
 *
 * window.CONFIG  — configurações (URL do GLPI, backend, usuários de login)
 * window.DATA    — dados reais carregados pelo GlpiClient (populado após login)
 *
 * Os dados DEMO foram removidos. Os dados reais vêm do backend PHP via
 * GlpiClient.loadAll(), chamado em app.js após o login bem-sucedido.
 */

window.CONFIG = {
  // URL direta do GLPI (usada nos botões "Abrir no GLPI")
  glpiUrl: 'http://192.168.1.20/glpi',

  // URL base do backend PHP proxy
  // Em produção, troque pelo endereço real do servidor
  backendUrl: 'http://192.168.1.20:9090',

  // Usuários permitidos no login local (modo mock — não depende do GLPI)
  users: {
    admin: '1234',
    ti: 'ti@2025',
  },
};

/**
 * window.DATA é populado pelo GlpiClient.loadAll() após o login.
 * Fica vazio até que os dados sejam carregados.
 */
window.DATA = {
  computadores:        [],
  chromebooksGeekiees: [],
  chromebooksApoio:    {},
  projetores:          [],
  impressoras:         [],
};