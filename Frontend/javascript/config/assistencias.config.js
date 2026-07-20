/**
 * javascript/config/assistencias.config.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada das assistências técnicas (Frontend).
 *
 * POR QUE EXISTE?
 * - Antes, as assistências estavam hardcoded em workflow.js (linhas 24-29)
 * - Estava DUPLICADO com o backend (workflow.php)
 * - Agora existe uma fonte única da verdade
 *
 * COMO FUNCIONA?
 * - Define o array de assistências disponíveis
 * - O Workflow consome via ConfigurationLoader
 *
 * PADRÃO UTILIZADO:
 * - Single Source of Truth
 * - O frontend e backend compartilham a mesma estrutura
 *
 * IMPACTO FUTURO:
 * - Para adicionar assistência, basta adicionar aqui
 * - Futuramente pode vir de uma API (fetch)
 */

window.AssistenciasConfig = [
  {
    id: 'torino',
    nome: 'Torino',
    descricao: 'Suporte técnico Torino',
  },
  {
    id: 'hbb',
    nome: 'HBB',
    descricao: 'Suporte técnico HBB',
  },
  {
    id: 'acer_geek',
    nome: 'Acer Geek',
    descricao: 'Suporte técnico Acer Geek',
  },
  {
    id: 'acer',
    nome: 'Acer',
    descricao: 'Suporte técnico Acer',
  },
];
