/**
 * GLPI Control Center - assistance_flows.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada dos fluxos de cada assistência técnica.
 *
 * Cada assistência possui:
 * - Dados visuais (ícone, cor, descrição)
 * - Instruções exibidas ao usuário
 * - Ações disponíveis (botões, e-mails, portais)
 * - Template de e-mail (quando aplicável)
 *
 * Para adicionar uma nova assistência ou fluxo:
 * Basta adicionar um novo objeto neste array.
 * Nenhuma alteração no Workflow principal é necessária.
 */

window.AssistanceFlows = {

  // ── Configuração dos fluxos ─────────────────────────────────────────────

  flows: {

    hbb: {
      id: 'hbb',
      nome: 'HBB',
      icone: '&#128295;',
      cor: '#f59e0b',
      descricao: 'Suporte técnico HBB — Renan',

      instrucao: 'O equipamento deverá ser entregue ao responsável (Renan).',

      proximosPassos: [
        'Preencha os dados do equipamento abaixo',
        'Um e-mail será gerado automaticamente',
        'Encaminhe o e-mail para o responsável',
        'Aguarda o retorno do suporte HBB',
      ],

      acoes: [
        {
          id: 'gerar_email',
          tipo: 'email',
          label: 'Gerar E-mail',
          icone: '&#9993;',
          descricao: 'Gera um e-mail padrão com os dados do equipamento',
        },
        {
          id: 'copiar_email',
          tipo: 'clipboard',
          label: 'Copiar Texto do E-mail',
          icone: '&#128203;',
          descricao: 'Copia o texto do e-mail para a área de transferência',
        },
      ],

      emailTemplate: (dados) => {
        const linhas = [
          'Prezado(a) Renan,',
          '',
          'Solicito atendimento técnico para o seguinte equipamento:',
          '',
          `Patrimônio: ${dados.patrimonio || 'Não informado'}`,
          `Equipamento: ${dados.nome || 'Não informado'}`,
          `Serial: ${dados.serial || 'Não informado'}`,
          `Modelo: ${dados.modelo || 'Não informado'}`,
          '',
          `Problema: ${dados.tipoProblema || 'Não informado'}`,
          `Equipamento liga: ${dados.equipamentoLiga || 'Não informado'}`,
          `Dano físico: ${dados.danoFisico || 'Não informado'}`,
          `Mau uso: ${dados.mauUso || 'Não informado'}`,
          '',
          `Contrato: ${dados.contrato || 'Não informado'}`,
          '',
          dados.observacoes ? `Observações: ${dados.observacoes}` : '',
          '',
          'Atenciosamente,',
          dados.usuario || 'Técnico de TI',
        ];
        return linhas.filter(l => l !== undefined).join('\n');
      },
    },

    torino: {
      id: 'torino',
      nome: 'Torino',
      icone: '&#127760;',
      cor: '#3b82f6',
      descricao: 'Suporte técnico Torino — Portal de atendimento',

      instrucao: 'Utilize o portal da Torino para abrir o chamado de suporte.',

      proximosPassos: [
        'Clique no botão abaixo para abrir o portal',
        'Preencha o formulário no portal',
        'Anexe fotos do equipamento se necessário',
        'Aguarda retorno da Torino',
      ],

      acoes: [
        {
          id: 'abrir_portal',
          tipo: 'link',
          label: 'Abrir Portal Torino',
          icone: '&#128279;',
          descricao: 'Abre o portal de atendimento da Torino em nova aba',
          url: '#portal-torino',
        },
        {
          id: 'copiar_dados',
          tipo: 'clipboard',
          label: 'Copiar Dados do Equipamento',
          icone: '&#128203;',
          descricao: 'Copia os dados do equipamento para preenchimento no portal',
        },
      ],

      portalUrl: '#portal-torino',
    },

    acer_geek: {
      id: 'acer_geek',
      nome: 'Acer Geek',
      icone: '&#128187;',
      cor: '#10b981',
      descricao: 'Suporte técnico Acer Geek — Portal de atendimento',

      instrucao: 'Utilize o portal Acer para abrir o chamado de garantia.',

      proximosPassos: [
        'Clique no botão abaixo para abrir o portal',
        'Selecione a opção de garantia',
        'Informe o número de série do equipamento',
        'Aguarda retorno da Acer',
      ],

      acoes: [
        {
          id: 'abrir_portal',
          tipo: 'link',
          label: 'Abrir Portal Acer',
          icone: '&#128279;',
          descricao: 'Abre o portal de atendimento Acer em nova aba',
          url: '#portal-acer',
        },
        {
          id: 'copiar_dados',
          tipo: 'clipboard',
          label: 'Copiar Número de Série',
          icone: '&#128203;',
          descricao: 'Copia o número de série para preenchimento no portal',
        },
      ],

      portalUrl: '#portal-acer',
    },

    acer: {
      id: 'acer',
      nome: 'Acer',
      icone: '&#128421;',
      cor: '#8b5cf6',
      descricao: 'Suporte técnico Acer — Atendimento direto',

      instrucao: 'Entre em contato diretamente com o suporte Acer.',

      proximosPassos: [
        'Anote os dados do equipamento abaixo',
        'Ligue para o suporte Acer',
        'Informe os dados solicitados',
        'Registre o número do protocolo',
      ],

      acoes: [
        {
          id: 'copiar_dados',
          tipo: 'clipboard',
          label: 'Copiar Dados do Equipamento',
          icone: '&#128203;',
          descricao: 'Copia todos os dados do equipamento para consulta',
        },
      ],
    },
  },

  // ── API pública ─────────────────────────────────────────────────────────

  getFlow(assistenciaId) {
    return this.flows[assistenciaId] || null;
  },

  getFlowByAssistencia(assistencia) {
    return this.getFlow(assistencia.id) || this.getFlow(assistencia) || null;
  },

  getFlowActions(assistenciaId) {
    const flow = this.getFlow(assistenciaId);
    return flow ? flow.acoes : [];
  },

  generateEmailBody(assistenciaId, dados) {
    const flow = this.getFlow(assistenciaId);
    if (!flow || !flow.emailTemplate) return '';
    return flow.emailTemplate(dados);
  },

  getPortalUrl(assistenciaId) {
    const flow = this.getFlow(assistenciaId);
    return flow ? flow.portalUrl || null : null;
  },

  hasAction(assistenciaId, actionId) {
    const actions = this.getFlowActions(assistenciaId);
    return actions.some(a => a.id === actionId);
  },

  getAction(assistenciaId, actionId) {
    const actions = this.getFlowActions(assistenciaId);
    return actions.find(a => a.id === actionId) || null;
  },

  getAllFlows() {
    return { ...this.flows };
  },
};
