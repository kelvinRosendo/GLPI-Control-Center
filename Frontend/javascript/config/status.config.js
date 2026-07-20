/**
 * javascript/config/status.config.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada dos mapeamentos de status (Frontend).
 *
 * POR QUE EXISTE?
 * - Antes, os mapeamentos estavam hardcoded em tickets.php
 * - O frontend também precisa desses mapeamentos para exibição
 * - Manter sincronizado entre frontend e backend é crítico
 *
 * COMO FUNCIONA?
 * - Mapeia IDs do GLPI para nomes legíveis
 * - Usado na exibição de tickets e ativos
 *
 * PADRÃO UTILIZADO:
 * - Lookup Table Pattern
 * - Mesma estrutura do backend (facilita sincronização futura)
 */

window.StatusConfig = {
  // Mapeamento de status do GLPI
  statusMap: {
    1: 'aberto',
    2: 'em_andamento',
    3: 'em_andamento',
    4: 'pendente',
    5: 'resolvido',
    6: 'fechado',
  },
  statusDefault: 'aberto',

  // Labels legíveis para exibição
  statusLabels: {
    aberto: 'Aberto',
    em_andamento: 'Em andamento',
    pendente: 'Pendente',
    resolvido: 'Resolvido',
    fechado: 'Fechado',
  },

  // Mapeamento de prioridade
  prioridadeMap: {
    1: 'muito_baixa',
    2: 'baixa',
    3: 'media',
    4: 'alta',
    5: 'muito_alta',
  },
  prioridadeDefault: 'media',

  // Labels legíveis para prioridade
  prioridadeLabels: {
    muito_baixa: 'Muito Baixa',
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
    muito_alta: 'Muito Alta',
  },

  // Mapeamento de status do ativo
  assetStatusMap: {
    2: 'manutencao',
    3: 'emprestado',
  },
  assetStatusDefault: 'ativo',

  // Labels legíveis para status do ativo
  assetStatusLabels: {
    ativo: 'Ativo',
    manutencao: 'Em manutenção',
    emprestado: 'Emprestado',
  },
};
