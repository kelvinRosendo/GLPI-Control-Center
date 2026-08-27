/**
 * GLPI Control Center - projectors.parser.js
 * -----------------------------------------------------------------------------
 * Parser de comentários do GLPI para extração de horas, datas e avisos.
 *
 * Transforma texto livre em dados estruturados sem modificar o original.
 *
 * Sprint 31: Extração de Horas dos Projetores
 */

window.ProjectorsParser = (function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTES
  // ══════════════════════════════════════════════════════════════════════════

  var CONFIDENCE = {
    CONFIRMED: 'confirmado',
    PARTIAL: 'parcial',
    NOT_FOUND: 'nao_encontrado',
  };

  var NOTICE_TYPE = {
    HORAS: 'horas',
    MANUTENCAO: 'manutencao',
    DEFEITO: 'defeito',
    MOVIMENTACAO: 'movimentacao',
    LAMPADA: 'lampada',
    INSTALACAO: 'instalacao',
    INFORMATIVO: 'informativo',
    OUTRO: 'outro',
  };

  var SEVERITY = {
    INFORMATIVO: 'informativo',
    ATENCAO: 'atencao',
    CRITICO: 'critico',
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PALAVRA-CHAVE PARA CLASSIFICAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  var _typeKeywords = [
    { type: NOTICE_TYPE.LAMPADA, severity: SEVERITY.ATENCAO, keywords: [
      'lampada', 'lâmpada', 'lâmpada trocada', 'troca de lâmpada', 'troca da lâmpada',
      'substituição de lâmpada', 'substituicao de lampada', 'nova lâmpada', 'nova lampada',
      'replaced lamp', 'lamp replaced',
    ]},
    { type: NOTICE_TYPE.MANUTENCAO, severity: SEVERITY.ATENCAO, keywords: [
      'manutenção', 'manutencao', 'assistência', 'assistencia', 'reparo',
      'conserto', 'revisao', 'revisão', 'adjust', 'ajuste',
    ]},
    { type: NOTICE_TYPE.DEFEITO, severity: SEVERITY.CRITICO, keywords: [
      'defeito', 'defeituoso', 'não funciona', 'nao funciona', 'com defeito',
      'apresentando defeito', 'quebrado', 'danificado', 'averiado',
      'não liga', 'nao liga', 'sem imagem', 'sem som',
    ]},
    { type: NOTICE_TYPE.MOVIMENTACAO, severity: SEVERITY.INFORMATIVO, keywords: [
      'movimentação', 'movimentacao', 'transferido', 'transferência', 'transferencia',
      'voltar para o setor', 'retornado', 'devolvido', 'empréstimo', 'emprestimo',
      'reallocado', 'realocação', 'realocacao',
    ]},
    { type: NOTICE_TYPE.INSTALACAO, severity: SEVERITY.INFORMATIVO, keywords: [
      'instalado', 'instalação', 'instalacao', 'instalado no', 'instalada em',
      'montado', 'configurado',
    ]},
    { type: NOTICE_TYPE.INFORMATIVO, severity: SEVERITY.INFORMATIVO, keywords: [
      'verificado', 'checado', 'inspecionado', 'testado', 'functionando',
      'funcionando', 'operacional',
    ]},
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // PARSER DE HORAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Extrai valor numérico de horas de um texto.
   * Aceita: 5800h, 5800 h, 5800 horas, 5.800h, Horas: 5800, Horas da lâmpada: 5800
   * @param {string} text
   * @returns {number|null}
   */
  function parseHours(text) {
    if (!text || typeof text !== 'string') return null;

    var normalized = text
      .replace(/\./g, '')
      .replace(/,/g, '')
      .toLowerCase()
      .trim();

    var patterns = [
      /horas\s*(?:da\s*(?:lâmpada|lampada)?)?\s*[:=]\s*(\d+)/,
      /horas?\s*[:=]\s*(\d+)/,
      /(\d+)\s*horas?/,
      /(\d+)\s*h(?:rs?)?\b/,
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match = normalized.match(patterns[i]);
      if (match) {
        var val = parseInt(match[1], 10);
        if (val > 0 && val < 100000) return val;
      }
    }

    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PARSER DE DATAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Extrai data no formato DD/MM/YYYY ou YYYY-MM-DD.
   * @param {string} text
   * @returns {string|null} YYYY-MM-DD ou null
   */
  function parseDate(text) {
    if (!text || typeof text !== 'string') return null;

    var matchBR = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (matchBR) {
      var d = matchBR[1].padStart(2, '0');
      var m = matchBR[2].padStart(2, '0');
      var y = matchBR[3];
      return y + '-' + m + '-' + d;
    }

    var matchISO = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (matchISO) {
      var y2 = matchISO[1];
      var m2 = matchISO[2].padStart(2, '0');
      var d2 = matchISO[3].padStart(2, '0');
      return y2 + '-' + m2 + '-' + d2;
    }

    return null;
  }

  /**
   * Converte YYYY-MM-DD para DD/MM/YYYY.
   * @param {string} isoDate
   * @returns {string}
   */
  function formatDateBR(isoDate) {
    if (!isoDate) return '';
    var parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PARSE DE REGISTRO INDIVIDUAL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Analisa uma linha/trecho e extrai horas + data se existirem.
   * @param {string} line
   * @returns {{ hours: number|null, date: string|null }}
   */
  function parseLine(line) {
    return {
      hours: parseHours(line),
      date: parseDate(line),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXTRAÇÃO DE MÚLTIPLOS REGISTROS DE HORAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Extrai todos os registros de horas encontrados no comentário.
   * @param {string} comment
   * @returns {array} [{ hours, date, raw }]
   */
  function extractHourRecords(comment) {
    if (!comment || typeof comment !== 'string') return [];

    var lines = comment.split(/\n/);
    var records = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      var parsed = parseLine(line);
      if (parsed.hours !== null) {
        records.push({
          hours: parsed.hours,
          date: parsed.date,
          raw: line,
        });
      }
    }

    // Ordenar por data (mais recente primeiro), sem data no final
    records.sort(function (a, b) {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

    return records;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // IDENTIFICAÇÃO DE EVENTOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Verifica se o texto contém indicação de troca de lâmpada.
   * @param {string} text
   * @returns {boolean}
   */
  function isLampReplacement(text) {
    if (!text) return false;
    var lower = text.toLowerCase();
    var patterns = [
      'lâmpada trocada', 'lampada trocada',
      'troca de lâmpada', 'troca da lâmpada', 'troca de lampada',
      'substituição de lâmpada', 'substituicao de lampada',
      'nova lâmpada', 'nova lampada',
      'lampa substituida', 'lâmpada substituída',
    ];
    for (var i = 0; i < patterns.length; i++) {
      if (lower.indexOf(patterns[i]) !== -1) return true;
    }
    return false;
  }

  /**
   * Verifica se o texto contém indicação de manutenção geral.
   * @param {string} text
   * @returns {boolean}
   */
  function isMaintenance(text) {
    if (!text) return false;
    var lower = text.toLowerCase();
    var patterns = [
      'manutenção', 'manutencao', 'assistência', 'assistencia',
      'reparo', 'conserto', 'revisão', 'revisao',
    ];
    for (var i = 0; i < patterns.length; i++) {
      if (lower.indexOf(patterns[i]) !== -1) return true;
    }
    return false;
  }

  /**
   * Verifica se o texto contém indicação de defeito.
   * @param {string} text
   * @returns {boolean}
   */
  function isDefect(text) {
    if (!text) return false;
    var lower = text.toLowerCase();
    var patterns = [
      'defeito', 'defeituoso', 'apresentando defeito',
      'não funciona', 'nao funciona', 'com defeito',
      'quebrado', 'danificado',
    ];
    for (var i = 0; i < patterns.length; i++) {
      if (lower.indexOf(patterns[i]) !== -1) return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLASSIFICAÇÃO DE TEXTO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Classifica um trecho de texto em tipo e severidade.
   * @param {string} text
   * @returns {{ type: string, severity: string }}
   */
  function classifyText(text) {
    if (!text) return { type: NOTICE_TYPE.OUTRO, severity: SEVERITY.INFORMATIVO };

    var lower = text.toLowerCase();

    // Verificar horas primeiro
    if (parseHours(text) !== null) {
      return { type: NOTICE_TYPE.HORAS, severity: SEVERITY.INFORMATIVO };
    }

    // Verificar por palavras-chave (ordem de prioridade)
    for (var i = 0; i < _typeKeywords.length; i++) {
      var group = _typeKeywords[i];
      for (var j = 0; j < group.keywords.length; j++) {
        if (lower.indexOf(group.keywords[j]) !== -1) {
          return { type: group.type, severity: group.severity };
        }
      }
    }

    return { type: NOTICE_TYPE.OUTRO, severity: SEVERITY.INFORMATIVO };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXTRAÇÃO DE AVISOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Divide o comentário em blocos lógicos e classifica cada um.
   * @param {string} comment
   * @returns {array} [{ type, severity, date, message, rawText }]
   */
  function extractNotices(comment) {
    if (!comment || typeof comment !== 'string') return [];

    // Separar por linhas ou por "|"
    var blocks = comment
      .split(/\n/)
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });

    // Se há apenas uma linha longa, tentar separar por "|"
    if (blocks.length === 1 && blocks[0].indexOf('|') !== -1) {
      blocks = blocks[0].split('|').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
    }

    var notices = [];

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var classification = classifyText(block);
      var date = parseDate(block);

      // Pular blocos que são apenas horas (já processados separadamente)
      if (classification.type === NOTICE_TYPE.HORAS && blocks.length > 1) {
        continue;
      }

      notices.push({
        type: classification.type,
        severity: classification.severity,
        date: date,
        message: _cleanMessage(block),
        rawText: block,
      });
    }

    return notices;
  }

  /**
   * Remove data e horas do texto da mensagem para deixar legível.
   * @param {string} text
   * @returns {string}
   */
  function _cleanMessage(text) {
    var cleaned = text
      .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, '')
      .replace(/\d{4}-\d{2}-\d{2}/g, '')
      .replace(/\d+\s*h(?:oras?|rs?)?\b/gi, '')
      .replace(/[-–—|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Capitalizar primeira letra
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned || text;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PARSE COMPLETO DO COMENTÁRIO
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Função principal: analisa o comentário completo de um projetor.
   * @param {string} comment - Texto original do GLPI
   * @param {object} savedData - Dados salvos localmente (para fallback)
   * @returns {object} ProjectorParsedData
   */
  function parse(comment, savedData) {
    savedData = savedData || {};

    var hourRecords = extractHourRecords(comment);
    var notices = extractNotices(comment);

    // Determinar horas atuais (fallback: campo estruturado > comentário)
    var structuredHours = parseInt(savedData.horas_lampada, 10) || 0;
    var parsedHours = hourRecords.length > 0 ? hourRecords[0].hours : null;
    var parsedDate = hourRecords.length > 0 ? hourRecords[0].date : null;

    var currentLampHours;
    var hoursSource;
    var confidence;

    if (structuredHours > 0) {
      currentLampHours = structuredHours;
      hoursSource = 'estruturado';
      confidence = CONFIDENCE.CONFIRMED;
    } else if (parsedHours !== null) {
      currentLampHours = parsedHours;
      hoursSource = 'comentario';
      confidence = parsedDate ? CONFIDENCE.CONFIRMED : CONFIDENCE.PARTIAL;
    } else {
      currentLampHours = 0;
      hoursSource = 'nenhum';
      confidence = CONFIDENCE.NOT_FOUND;
    }

    // Detectar última troca de lâmpada
    var lastLampReplacement = null;
    var lampReplacementNotice = null;
    for (var i = 0; i < notices.length; i++) {
      if (isLampReplacement(notices[i].rawText)) {
        lastLampReplacement = notices[i].date;
        lampReplacementNotice = notices[i];
        break;
      }
    }

    // Se há troca de lâmpada registrada e não há nova leitura de horas após ela,
    // marcar para revisão
    var needsReview = false;
    if (lastLampReplacement && parsedDate) {
      needsReview = parsedDate < lastLampReplacement;
    }

    return {
      currentLampHours: currentLampHours,
      lastHoursDate: parsedDate,
      hoursSource: hoursSource,
      confidence: confidence,
      lastLampReplacement: lastLampReplacement,
      needsReview: needsReview,
      hourRecords: hourRecords,
      notices: notices,
      rawComment: comment,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CÁLCULO DE PERCENTUAL DE VIDA ÚTIL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Calcula o percentual de uso da lâmpada.
   * @param {number} hours
   * @param {number} lifeHours
   * @returns {number} 0-100+ (pode ultrapassar 100)
   */
  function calculateLampPercentage(hours, lifeHours) {
    if (!hours || !lifeHours || lifeHours <= 0) return 0;
    return Math.round((hours / lifeHours) * 1000) / 10;
  }

  /**
   * Determina a severidade do uso da lâmpada.
   * @param {number} percentage
   * @returns {string} severidade
   */
  function getLampSeverity(percentage) {
    if (percentage >= 100) return SEVERITY.CRITICO;
    if (percentage >= 80) return SEVERITY.ATENCAO;
    return SEVERITY.INFORMATIVO;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  return {
    CONFIDENCE: CONFIDENCE,
    NOTICE_TYPE: NOTICE_TYPE,
    SEVERITY: SEVERITY,

    parse: parse,
    parseHours: parseHours,
    parseDate: parseDate,
    parseLine: parseLine,
    formatDateBR: formatDateBR,
    extractHourRecords: extractHourRecords,
    extractNotices: extractNotices,
    classifyText: classifyText,
    isLampReplacement: isLampReplacement,
    isMaintenance: isMaintenance,
    isDefect: isDefect,
    calculateLampPercentage: calculateLampPercentage,
    getLampSeverity: getLampSeverity,
  };
})();
