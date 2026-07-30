/**
 * GLPI Control Center - integrations.config.js
 * -----------------------------------------------------------------------------
 * Configuração CENTRALIZADA de todas as integrações externas.
 *
 * PRINCÍPIO: Configuration Driven Design
 * - Nenhum if/switch baseado em fornecedor
 * - Todo comportamento vem da configuração
 * - Novas integrações são adicionadas APENAS neste arquivo
 *
 * Cada integração possui:
 *   key, nome, descrição, tipo, url, suportaIframe, fallback,
 *   ações, instruções, status
 *
 * Sprint 3: Configuração completa para IntegrationEngine
 * Sprint 4: PortalViewer consumirá esta config diretamente
 */

window.INTEGRATIONS_CONFIG = {

  // ══════════════════════════════════════════════════════════════════════════
  // TORINO
  // ══════════════════════════════════════════════════════════════════════════

  torino: {
    key: 'torino',
    nome: 'Torino',
    descricao: 'Assistência técnica especializada em Chromebooks e equipamentos Dell/Acer.',
    tipo: 'portal',
    url: 'https://suporte.torino.com.br',
    suportaIframe: false,
    fallback: 'open-tab',
    fallbackLabel: 'Abrir portal em nova aba',
    status: 'ativo',

    contato: {
      responsavel: 'Suporte Torino',
      email: 'suporte@torino.com.br',
      telefone: '',
    },

    portal: {
      url: 'https://suporte.torino.com.br',
      suportaIframe: false,
      fallback: 'Abrir portal em nova aba',
    },

    emailTemplate: null,

    acoes: [
      {
        id: 'open-portal',
        label: 'Abrir Portal Torino',
        description: 'Acessar o portal de chamados da Torino',
        icon: '&#128279;',
        tipo: 'open-url',
        target: '_blank',
        url: 'https://suporte.torino.com.br',
        auditEvent: 'portal-opened',
      },
      {
        id: 'copy-data',
        label: 'Copiar Dados do Equipamento',
        description: 'Copiar nome, patrimônio e serial para a área de transferência',
        icon: '&#128203;',
        tipo: 'clipboard',
        template: 'Equipamento: {nome}\nPatrimônio: {patrimonio}\nSerial: {serial}\nLocalização: {reparticao}',
        auditEvent: 'clipboard-copied',
      },
      {
        id: 'copy-instructions',
        label: 'Copiar Instruções',
        description: 'Copiar instruções padrão para abertura de chamado Torino',
        icon: '&#128196;',
        tipo: 'clipboard',
        template: 'Prezados,\n\nSolicito abertura de chamado para o equipamento acima.\nProblema identificado: {tipoProblema}\nObservações: {observacoes}\n\nAtt.',
        auditEvent: 'instructions-copied',
      },
    ],

    instrucoes: [
      'Acesse o portal da Torino clicando no botão acima',
      'Faça login com as credenciais da instituição',
      'Abra um chamado informando os dados do equipamento',
      'Anote o número do chamado para acompanhamento',
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HBB
  // ══════════════════════════════════════════════════════════════════════════

  hbb: {
    key: 'hbb',
    nome: 'HBB',
    descricao: 'Suporte técnico via e-mail para equipamentos com contrato HBB.',
    tipo: 'email',
    url: null,
    suportaIframe: false,
    fallback: 'mailto',
    fallbackLabel: 'Gerar e-mail para suporte',
    status: 'ativo',

    contato: {
      responsavel: 'Renan',
      email: 'renan@hbb.com.br',
      telefone: '(11) 99999-0000',
    },

    portal: null,

    emailTemplate: {
      assunto: '[Chamado Técnico] {nome} - Patrimônio {patrimonio}',
      corpo: `Prezado Renan,

Solicito suporte técnico para o equipamento abaixo:

Equipamento: {nome}
Patrimônio: {patrimonio}
Serial: {serial}
Localização: {reparticao}

Tipo do problema: {tipoProblema}
Prioridade: {prioridade}
Mau uso: {mauUso}

Observações: {observacoes}

Fico no aguardo do retorno.

Att.`,
    },

    acoes: [
      {
        id: 'generate-email',
        label: 'Gerar E-mail',
        description: 'Abrir cliente de e-mail com modelo pré-preenchido',
        icon: '&#9993;',
        tipo: 'mailto',
        template: 'mailto:{email}?subject={assunto}&body={corpo}',
        auditEvent: 'email-generated',
      },
      {
        id: 'copy-email-template',
        label: 'Copiar Modelo de E-mail',
        description: 'Copiar o texto do e-mail para a área de transferência',
        icon: '&#128203;',
        tipo: 'clipboard',
        template: '{emailCompleto}',
        auditEvent: 'email-template-copied',
      },
      {
        id: 'copy-data',
        label: 'Copiar Dados do Equipamento',
        description: 'Copiar informações do equipamento para o e-mail',
        icon: '&#128203;',
        tipo: 'clipboard',
        template: 'Equipamento: {nome}\nPatrimônio: {patrimonio}\nSerial: {serial}',
        auditEvent: 'clipboard-copied',
      },
    ],

    instrucoes: [
      'Clique em "Gerar E-mail" para abrir seu cliente de e-mail',
      'O modelo já virá preenchido com os dados do equipamento',
      'Revise as informações e envie para o responsável',
      'Informe ao setor técnico que o chamado foi registrado',
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACER GEEK
  // ══════════════════════════════════════════════════════════════════════════

  acer_geek: {
    key: 'acer_geek',
    nome: 'Acer Geek',
    descricao: 'Portal de suporte Acer para equipamentos em garantia.',
    tipo: 'portal',
    url: 'https://support.acer.com',
    suportaIframe: true,
    fallback: 'open-tab',
    fallbackLabel: 'Abrir portal em nova aba',
    status: 'ativo',

    contato: {
      responsavel: 'Suporte Acer',
      email: '',
      telefone: '',
    },

    portal: {
      url: 'https://support.acer.com',
      suportaIframe: true,
      fallback: 'Abrir portal em nova aba',
    },

    emailTemplate: null,

    acoes: [
      {
        id: 'open-portal',
        label: 'Abrir Portal Acer',
        description: 'Acessar o portal de suporte da Acer',
        icon: '&#128279;',
        tipo: 'open-url',
        target: '_blank',
        url: 'https://support.acer.com',
        auditEvent: 'portal-opened',
      },
      {
        id: 'copy-data',
        label: 'Copiar Dados do Equipamento',
        description: 'Copiar informações para preenchimento no portal',
        icon: '&#128203;',
        tipo: 'clipboard',
        template: 'Modelo: {nome}\nSerial: {serial}\nPatrimônio: {patrimonio}',
        auditEvent: 'clipboard-copied',
      },
      {
        id: 'copy-serial',
        label: 'Copiar Serial',
        description: 'Copiar apenas o número de serial',
        icon: '&#128270;',
        tipo: 'clipboard',
        template: '{serial}',
        auditEvent: 'serial-copied',
      },
    ],

    instrucoes: [
      'Acesse o portal Acer clicando no botão acima',
      'Selecione "Suporte Técnico" no menu',
      'Informe o número de série do equipamento',
      'Descreva o problema e acompanhe o chamado',
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ACER (direto)
  // ══════════════════════════════════════════════════════════════════════════

  acer: {
    key: 'acer',
    nome: 'Acer',
    descricao: 'Suporte Acer direto — fluxo em definição.',
    tipo: 'manual',
    url: null,
    suportaIframe: false,
    fallback: 'none',
    fallbackLabel: 'Suporte direto — sem portal',
    status: 'em-definicao',

    contato: {
      responsavel: '',
      email: '',
      telefone: '',
    },

    portal: null,
    emailTemplate: null,

    acoes: [
      {
        id: 'copy-data',
        label: 'Copiar Dados do Equipamento',
        description: 'Copiar informações do equipamento',
        icon: '&#128203;',
        tipo: 'clipboard',
        template: 'Equipamento: {nome}\nPatrimônio: {patrimonio}\nSerial: {serial}\nLocalização: {reparticao}',
        auditEvent: 'clipboard-copied',
      },
    ],

    instrucoes: [
      'Fluxo de atendimento em definição',
      'Copie os dados do equipamento acima',
      'Entre em contato com o suporte Acer diretamente',
      'Mantenha o número do chamado registrado',
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  getIntegration(key) {
    return this[key] || null;
  },

  getAllIntegrations() {
    const keys = Object.keys(this).filter(k =>
      typeof this[k] === 'object' && this[k] !== null && this[k].key
    );
    return keys.map(k => this[k]);
  },

  getActiveIntegrations() {
    return this.getAllIntegrations().filter(i => i.status === 'ativo');
  },

  canUseIframe(key) {
    const integration = this.getIntegration(key);
    return integration ? integration.suportaIframe === true : false;
  },

  getFallback(key) {
    const integration = this.getIntegration(key);
    return integration
      ? { type: integration.fallback, label: integration.fallbackLabel }
      : null;
  },

  getAcoes(key) {
    const integration = this.getIntegration(key);
    return integration ? integration.acoes : [];
  },

  getInstrucoes(key) {
    const integration = this.getIntegration(key);
    return integration ? integration.instrucoes : [];
  },
};
