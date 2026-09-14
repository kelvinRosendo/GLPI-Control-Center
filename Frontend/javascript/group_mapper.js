/**
 * GLPI Control Center - group_mapper.js
 * -----------------------------------------------------------------------------
 * Mapeamento configurável de grupos GLPI para Carrinhos e Salas/Turmas.
 *
 * Critérios:
 * - Carrinho: grupo com "Carrinho" no groupPath OU campo cart preenchido
 * - Turma: grupo com "Médio" no groupPath (ou padrão configurável)
 * - NÃO usa "possui grupo" como critério genérico
 * - NÃO inferia carrinho por comentários, turma ou nome do usuário
 */

window.GroupMapper = (() => {
  'use strict';

  /**
   * Configuração de padrões de reconhecimento.
   * Cada padrão tem regex para testar o groupPath normalizado.
   */
  const CONFIG = {
    cartPatterns: [
      /Carrinho\s+\d+/i,
    ],
    turmaPatterns: [
      /\d+\s*º\s*(?:Medio|Ano)\s+[A-Z]/i,
    ],
    cartFieldPatterns: [
      /Carrinho\s+\d+/i,
    ],
  };

  /**
   * Decodifica entidades HTML e normaliza o texto.
   * Preserva o valor original para exibição.
   */
  function _normalizeText(str) {
    if (!str) return '';
    const decoded = str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ');
    return decoded.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  /**
   * Verifica se um groupPath corresponde a um padrão de carrinho.
   */
  function matchesCartPattern(groupPath) {
    const normalized = _normalizeText(groupPath);
    return CONFIG.cartPatterns.some(p => p.test(normalized));
  }

  /**
   * Verifica se um groupPath corresponde a um padrão de turma.
   */
  function matchesTurmaPattern(groupPath) {
    const normalized = _normalizeText(groupPath);
    return CONFIG.turmaPatterns.some(p => p.test(normalized));
  }

  /**
   * Verifica se o campo cart do GLPI indica um carrinho.
   */
  function matchesCartField(cartValue) {
    if (!cartValue) return false;
    return CONFIG.cartFieldPatterns.some(p => p.test(_normalizeText(cartValue)));
  }

  /**
   * Extrai o nome do carrinho de um groupPath.
   * Ex: "Geekie > Carrinho > Carrinho 3" → "Carrinho 3"
   */
  function extractCartName(groupPath) {
    if (!groupPath) return null;
    const match = groupPath.match(/(Carrinho\s+\d+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Classifica um ativo chromebook_support.
   *
   * Retorna:
   *   { type: 'cart', cartName: 'Carrinho 3' }
   *   { type: 'turma', turmaName: '1º Médio B' }
   *   { type: 'none' }
   */
  function classifyChromebookSupport(asset) {
    const groupPath = asset.groupPath || '';
    const cart = asset.cart || '';

    if (matchesCartField(cart)) {
      const cartName = extractCartName(groupPath) || cart.trim();
      return { type: 'cart', cartName };
    }

    if (matchesCartPattern(groupPath)) {
      const cartName = extractCartName(groupPath);
      if (cartName) return { type: 'cart', cartName };
    }

    if (matchesTurmaPattern(groupPath)) {
      const turmaName = groupPath.trim();
      return { type: 'turma', turmaName };
    }

    return { type: 'none' };
  }

  /**
   * Classifica um ativo chromebook_student.
   *
   * Retorna:
   *   { type: 'turma', turmaName: '3º Médio B' }
   *   { type: 'none' }
   */
  function classifyChromebookStudent(asset) {
    const groupPath = asset.groupPath || '';

    if (matchesTurmaPattern(groupPath)) {
      return { type: 'turma', turmaName: groupPath.trim() };
    }

    return { type: 'none' };
  }

  return {
    CONFIG,
    _normalizeText,
    matchesCartPattern,
    matchesTurmaPattern,
    matchesCartField,
    extractCartName,
    classifyChromebookSupport,
    classifyChromebookStudent,
  };
})();
