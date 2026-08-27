/**
 * GLPI Control Center - projectors.config.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada do Módulo de Gestão de Projetores.
 *
 * Define:
 * - Limites de vida útil da lâmpada
 * - Intervalos de manutenção e limpeza
 * - Percentuais de alerta
 * - Status permitidos
 * - Tipos de manutenção
 * - Campos de formulário
 * - Configurações visuais
 *
 * PRINCÍPIO: Configuration Driven Design
 * - Nenhum valor fixo no código
 * - Todo comportamento visual vem desta configuração
 * - Novos limites são alterados APENAS neste arquivo
 *
 * Sprint 8: Módulo de Gestão de Projetores
 */

window.PROJECTORS_CONFIG = {

  // ══════════════════════════════════════════════════════════════════════════
  // LIMITES DE VIDA ÚTIL DA LÂMPADA
  // ══════════════════════════════════════════════════════════════════════════

  lamp: {
    lifeHours: 3000,              // Vida útil estimada da lâmpada (horas)
    warningPercentage: 80,        // Alerta amarelo (% da vida útil)
    criticalPercentage: 95,       // Alerta vermelho (% da vida útil)
    replacementCost: 0,           // Custo estimado de troca (preparado para futuro)
  },

  // ══════════════════════════════════════════════════════════════════════════
  // INTERVALOS DE MANUTENÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  maintenance: {
    intervalDays: 90,             // Intervalo recomendado de manutenção (dias)
    cleaningIntervalDays: 30,     // Intervalo recomendado de limpeza (dias)
    maxDaysSinceLastUse: 180,     // Dias sem uso para considerar "parado"
    warningDaysBefore: 14,        // Dias antes do vencimento para alertar
  },

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS PERMITIDOS
  // ══════════════════════════════════════════════════════════════════════════

  status: {
    operando: {
      key: 'operando',
      label: 'Operando',
      icon: '&#9989;',
      color: '#00c896',
      description: 'Projetor funcionando normalmente',
    },
    atencao: {
      key: 'atencao',
      label: 'Atenção',
      icon: '&#9888;',
      color: '#ffc107',
      description: 'Projetor com alerta pendente',
    },
    manutencao: {
      key: 'manutencao',
      label: 'Manutenção',
      icon: '&#128295;',
      color: '#f59e0b',
      description: 'Projetor em manutenção',
    },
    fora_de_uso: {
      key: 'fora_de_uso',
      label: 'Fora de Uso',
      icon: '&#10060;',
      color: '#ff5555',
      description: 'Projetor indisponível',
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TIPOS DE MANUTENÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  maintenanceTypes: [
    { key: 'lampada', label: 'Troca de Lâmpada', icon: '&#128161;', color: '#ffc107' },
    { key: 'limpeza', label: 'Limpeza', icon: '&#129525;', color: '#4f7ef7' },
    { key: 'manutencao', label: 'Manutenção Geral', icon: '&#128295;', color: '#f59e0b' },
    { key: 'reparo', label: 'Reparo', icon: '&#128296;', color: '#ff5555' },
    { key: 'observacao', label: 'Observação', icon: '&#128221;', color: '#9299b8' },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // TIPOS DE AVISO (extraídos do parser)
  // ══════════════════════════════════════════════════════════════════════════

  noticeTypes: {
    horas:        { key: 'horas',        label: 'Horas',        icon: '&#9200;',  color: '#4f7ef7' },
    manutencao:   { key: 'manutencao',   label: 'Manutenção',   icon: '&#128295;', color: '#f59e0b' },
    defeito:      { key: 'defeito',      label: 'Defeito',      icon: '&#9888;',  color: '#ff5555' },
    movimentacao: { key: 'movimentacao', label: 'Movimentação', icon: '&#128666;', color: '#9299b8' },
    lampada:      { key: 'lampada',      label: 'Lâmpada',      icon: '&#128161;', color: '#ffc107' },
    instalacao:   { key: 'instalacao',   label: 'Instalação',   icon: '&#128230;', color: '#00c896' },
    informativo:  { key: 'informativo',  label: 'Informativo',  icon: '&#128172;', color: '#9299b8' },
    outro:        { key: 'outro',        label: 'Outro',        icon: '&#128196;', color: '#9299b8' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // NÍVEIS DE CONFIANÇA
  // ══════════════════════════════════════════════════════════════════════════

  confidence: {
    confirmado:    { key: 'confirmado',    label: 'Confirmado',    color: '#00c896' },
    parcial:       { key: 'parcial',       label: 'Parcial',       color: '#ffc107' },
    nao_encontrado:{ key: 'nao_encontrado', label: 'Não Encontrado', color: '#9299b8' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPOS DO FORMULÁRIO DE DETALHES
  // ══════════════════════════════════════════════════════════════════════════

  fields: [
    { key: 'nome', label: 'Nome', tipo: 'texto', editable: false, section: 'identificacao' },
    { key: 'patrimonio', label: 'Patrimônio', tipo: 'texto', editable: false, section: 'identificacao' },
    { key: 'serial', label: 'Número de Série', tipo: 'texto', editable: false, section: 'identificacao' },
    { key: 'modelo', label: 'Modelo', tipo: 'texto', editable: false, section: 'identificacao' },
    { key: 'reparticao', label: 'Localização', tipo: 'texto', editable: false, section: 'identificacao' },
    { key: 'data_aquisicao', label: 'Data de Aquisição', tipo: 'data', editable: true, section: 'identificacao' },
    { key: 'fabricante', label: 'Fabricante', tipo: 'texto', editable: true, section: 'identificacao' },

    { key: 'horas_lampada', label: 'Horas da Lâmpada', tipo: 'numero', editable: true, section: 'lampada', min: 0, max: 10000 },
    { key: 'vida_util_estimada', label: 'Vida Útil Estimada (h)', tipo: 'numero', editable: true, section: 'lampada', min: 100, max: 10000 },
    { key: 'data_troca_lampada', label: 'Última Troca de Lâmpada', tipo: 'data', editable: true, section: 'lampada' },

    { key: 'ultima_manutencao', label: 'Última Manutenção', tipo: 'data', editable: true, section: 'manutencao' },
    { key: 'ultima_limpeza', label: 'Última Limpeza', tipo: 'data', editable: true, section: 'manutencao' },
    { key: 'horas_totais', label: 'Horas Totais de Uso', tipo: 'numero', editable: true, section: 'manutencao', min: 0 },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÕES DO FORMULÁRIO
  // ══════════════════════════════════════════════════════════════════════════

  sections: [
    { key: 'identificacao', label: 'Identificação', icon: '&#128196;' },
    { key: 'lampada', label: 'Lâmpada', icon: '&#128161;' },
    { key: 'manutencao', label: 'Manutenção', icon: '&#128295;' },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES VISUAIS
  // ══════════════════════════════════════════════════════════════════════════

  visuals: {
    cardColor: '#ffc107',
    lampBarHeight: 8,
    timelineMaxItems: 20,
    animationDuration: 300,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // STORAGE
  // ══════════════════════════════════════════════════════════════════════════

  storage: {
    prefix: 'glpi:projectors:',
    detailsKey: 'details',
    maintenanceKey: 'maintenance',
    maxHistoryRecords: 200,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna configuração de um status.
   * @param {string} statusKey
   * @returns {object|null}
   */
  getStatus(statusKey) {
    return this.status[statusKey] || null;
  },

  /**
   * Retorna todos os status.
   * @returns {array}
   */
  getAllStatus() {
    return Object.values(this.status);
  },

  /**
   * Retorna tipo de manutenção pela chave.
   * @param {string} typeKey
   * @returns {object|null}
   */
  getMaintenanceType(typeKey) {
    return this.maintenanceTypes.find(t => t.key === typeKey) || null;
  },

  /**
   * Retorna todos os tipos de manutenção.
   * @returns {array}
   */
  getMaintenanceTypes() {
    return [...this.maintenanceTypes];
  },

  /**
   * Retorna campos de uma seção.
   * @param {string} sectionKey
   * @returns {array}
   */
  getFieldsBySection(sectionKey) {
    return this.fields.filter(f => f.section === sectionKey);
  },

  /**
   * Retorna seções.
   * @returns {array}
   */
  getSections() {
    return [...this.sections];
  },
};
