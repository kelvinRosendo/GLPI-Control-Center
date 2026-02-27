/* 
        data.js — Fonte de dados  + helpers

        Normalmente aqui ficam:
    CONFIG (url do GLPI etc.)
    Dados mockados para rodar sem GLPI (DEMO)
    Funções utilitárias para padronizar dados

        Exemplos:
    getMockComputadores()
    getMockCarrinhos()
    mapStatus(...)

No futuro, esse arquivo pode virar só “mock”, e o real vir do glpi.client.js.
*/ 

/**
 * GLPI Control Center - data.js
 * -----------------------------------------------------------------------------
 * Responsável por:
 * - Configurações do ambiente (URL do GLPI, usuários mock)
 * - Dados DEMO (mock) para testar o painel sem depender do GLPI real
 *
 * Importante:
 * - Esse arquivo NÃO é o backend. Ele só serve pra fase de teste do frontend.
 * - Em produção, esses dados virão do backend (api/glpi.php etc).
 */

window.CONFIG = {
  // Troque para o endereço do seu GLPI quando estiver rodando na rede
  glpiUrl: "http://seu-glpi.interno",

  // Usuários mock pra testar o login
  users: {
    admin: "1234",
    ti: "ti@2025",
  },
};

window.DEMO = {
  computadores: [
    { nome: "PC-TI-01", serial: "SN202401", patrimonio: "00101", status: "ativo", reparticao: "TI", glpiId: 101 },
    { nome: "PC-ADM-05", serial: "SN202402", patrimonio: "00102", status: "emprestado", reparticao: "Administração", glpiId: 102 },
  ],

  chromebooksGeekiees: [
    { nome: "GK-01", serial: "GK9A12345", patrimonio: "00981", status: "ativo", reparticao: "Sala 101", glpiId: 201 },
    { nome: "GK-02", serial: "GK9B23456", patrimonio: "01025", status: "emprestado", reparticao: "Sala 102", glpiId: 202 },
  ],

  chromebooksApoio: {
    "Carrinho 1": [
      { nome: "Apoio-01", serial: "SCD9A12345", patrimonio: "00981", status: "ativo", glpiId: 301 },
      { nome: "Apoio-02", serial: "SCD9B67890", patrimonio: "01025", status: "emprestado", glpiId: 302 },
      { nome: "Apoio-03", serial: "SCD9C23456", patrimonio: "01222", status: "ativo", glpiId: 303 },
    ],

    "Carrinho 2": [
      { nome: "Apoio-13", serial: "SCD9C54321", patrimonio: "01102", status: "ativo", glpiId: 305 },
      { nome: "Apoio-14", serial: "SCD9B78956", patrimonio: "01115", status: "ativo", glpiId: 306 },
    ],

    "Carrinho 3": [],

    "Carrinho 4": [
      { nome: "Apoio-37", serial: "SCD9G33445", patrimonio: "01150", status: "ativo", glpiId: 313 },
      { nome: "Apoio-38", serial: "SCD9H44556", patrimonio: "01260", status: "ativo", glpiId: 314 },
    ],
  },

  projetores: [
    { nome: "PROJ-B101", serial: "PR20240001", patrimonio: "02001", status: "ativo", reparticao: "Sala 101", glpiId: 401 },
  ],

  impressoras: [
    { nome: "IMP-ADM-01", serial: "IP20240001", patrimonio: "03001", status: "ativo", reparticao: "Administração", glpiId: 501 },
  ],
};