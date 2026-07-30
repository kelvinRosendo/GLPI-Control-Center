/**
 * GLPI Control Center - assistance_flows.js
 * -----------------------------------------------------------------------------
 * Configuração centralizada dos fluxos de assistência.
 *
 * PRINCÍPIO: Configuration Driven Design
 * Nenhum if/switch baseado em fornecedor.
 * Toda a lógica é extraída das configurações abaixo.
 *
 * Sprint 2: Fluxos de assistência + ações reutilizáveis
 * Sprint 3: IntegrationEngine consumirá este módulo diretamente
 */

window.AssistanceFlows = {
  // ── Configurações dos Fluxos ───────────────────────────────────────────────

  flows: {
    torino: {
      id: 'torino',
      nome: 'Torino',
      descricao: 'Assistência técnica especializada em Chromebooks e equipamentos Dell/Acer.',
      tipo: 'portal',
      icon: '&#128268;',
      color: '#4f7ef7',

      portal: {
        url: 'https://suporte.torino.com.br',
        suportaIframe: false,
        fallback: 'Abrir portal em nova aba',
      },

      actions: [
        {
          id: 'open-portal',
          label: 'Abrir Portal Torino',
          description: 'Acessar o portal de chamados da Torino',
          icon: '&#128279;',
          type: 'open-url',
          target: '_blank',
          url: 'https://suporte.torino.com.br',
          auditEvent: 'portal-opened',
        },
        {
          id: 'copy-data',
          label: 'Copiar Dados do Equipamento',
          description: 'Copiar nome, patrimônio e serial para a área de transferência',
          icon: '&#128203;',
          type: 'clipboard',
          template: 'Equipamento: {nome}\nPatrimônio: {patrimonio}\nSerial: {serial}\nLocalização: {reparticao}',
          auditEvent: 'clipboard-copied',
        },
        {
          id: 'copy-instructions',
          label: 'Copiar Instruções',
          description: 'Copiar instruções padrão para abertura de chamado Torino',
          icon: '&#128196;',
          type: 'clipboard',
          template: 'Prezados,\n\nSolicito abertura de chamado para o equipamento acima.\nProblema identificado: {tipoProblema}\nObservações: {observacoes}\n\nAtt.',
          auditEvent: 'instructions-copied',
        },
      ],

      instructions: [
        'Acesse o portal da Torino clicando no botão acima',
        'Faça login com as credenciais da instituição',
        'Abra um chamado informando os dados do equipamento',
        'Anote o número do chamado para acompanhamento',
      ],
    },

    hbb: {
      id: 'hbb',
      nome: 'HBB',
      descricao: 'Suporte técnico via e-mail para equipamentos com contrato HBB.',
      tipo: 'email',
      icon: '&#128231;',
      color: '#00c896',

      contato: {
        responsavel: 'Renan',
        email: 'renan@hbb.com.br',
        telefone: '(11) 99999-0000',
      },

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

      actions: [
        {
          id: 'generate-email',
          label: 'Gerar E-mail',
          description: 'Abrir cliente de e-mail com modelo pré-preenchido',
          icon: '&#9993;',
          type: 'mailto',
          template: 'mailto:{email}?subject={assunto}&body={corpo}',
          auditEvent: 'email-generated',
        },
        {
          id: 'copy-email-template',
          label: 'Copiar Modelo de E-mail',
          description: 'Copiar o texto do e-mail para a área de transferência',
          icon: '&#128203;',
          type: 'clipboard',
          template: '{emailCompleto}',
          auditEvent: 'email-template-copied',
        },
        {
          id: 'copy-data',
          label: 'Copiar Dados do Equipamento',
          description: 'Copiar informações do equipamento para o e-mail',
          icon: '&#128203;',
          type: 'clipboard',
          template: 'Equipamento: {nome}\nPatrimônio: {patrimonio}\nSerial: {serial}',
          auditEvent: 'clipboard-copied',
        },
      ],

      instructions: [
        'Clique em "Gerar E-mail" para abrir seu cliente de e-mail',
        'O modelo já virá preenchido com os dados do equipamento',
        'Revise as informações e envie para o responsável',
        'Informe ao setor técnico que o chamado foi registrado',
      ],
    },

    acer_geek: {
      id: 'acer_geek',
      nome: 'Acer Geek',
      descricao: 'Portal de suporte Acer para equipamentos em garantia.',
      tipo: 'portal',
      icon: '&#128295;',
      color: '#6c5ce7',

      portal: {
        url: 'https://support.acer.com',
        suportaIframe: true,
        fallback: 'Abrir portal em nova aba',
      },

      actions: [
        {
          id: 'open-portal',
          label: 'Abrir Portal Acer',
          description: 'Acessar o portal de suporte da Acer',
          icon: '&#128279;',
          type: 'open-url',
          target: '_blank',
          url: 'https://support.acer.com',
          auditEvent: 'portal-opened',
        },
        {
          id: 'copy-data',
          label: 'Copiar Dados do Equipamento',
          description: 'Copiar informações para preenchimento no portal',
          icon: '&#128203;',
          type: 'clipboard',
          template: 'Modelo: {nome}\nSerial: {serial}\nPatrimônio: {patrimonio}',
          auditEvent: 'clipboard-copied',
        },
        {
          id: 'copy-serial',
          label: 'Copiar Serial',
          description: 'Copiar apenas o número de serial',
          icon: '&#128270;',
          type: 'clipboard',
          template: '{serial}',
          auditEvent: 'serial-copied',
        },
      ],

      instructions: [
        'Acesse o portal Acer clicando no botão acima',
        'Selecione "Suporte Técnico" no menu',
        'Informe o número de série do equipamento',
        'Descreva o problema e acompanhe o chamado',
      ],
    },

    acer: {
      id: 'acer',
      nome: 'Acer',
      descricao: 'Suporte Acer direto — fluxo em definição.',
      tipo: 'manual',
      icon: '&#128736;',
      color: '#ffc107',

      actions: [
        {
          id: 'copy-data',
          label: 'Copiar Dados do Equipamento',
          description: 'Copiar informações do equipamento',
          icon: '&#128203;',
          type: 'clipboard',
          template: 'Equipamento: {nome}\nPatrimônio: {patrimonio}\nSerial: {serial}\nLocalização: {reparticao}',
          auditEvent: 'clipboard-copied',
        },
      ],

      instructions: [
        'Fluxo de atendimento em definição',
        'Copie os dados do equipamento acima',
        'Entre em contato com o suporte Acer diretamente',
        'Mantenha o número do chamado registrado',
      ],
    },
  },

  // ── API Pública ────────────────────────────────────────────────────────────

  getFlow(assistanceId) {
    return this.flows[assistanceId] || null;
  },

  getActions(assistanceId) {
    const flow = this.getFlow(assistanceId);
    return flow ? flow.actions : [];
  },

  getAction(assistanceId, actionId) {
    const actions = this.getActions(assistanceId);
    return actions.find(a => a.id === actionId) || null;
  },

  getInstructions(assistanceId) {
    const flow = this.getFlow(assistanceId);
    return flow ? flow.instructions : [];
  },

  // ── Engine de Ações ────────────────────────────────────────────────────────

  /**
   * Executa uma ação com base na configuração.
   * Retorna { ok, type, result } para auditoria.
   */
  executeAction(assistanceId, actionId, assetData) {
    const action = this.getAction(assistanceId, actionId);
    if (!action) {
      return { ok: false, error: 'Ação não encontrada.' };
    }

    const resolvedTemplate = this._resolveTemplate(action.template || '', assetData);
    const resolvedUrl = action.url ? this._resolveTemplate(action.url, assetData) : null;

    switch (action.type) {
      case 'open-url':
        return this._executeOpenUrl(resolvedUrl || resolvedTemplate, action, assetData);

      case 'mailto':
        return this._executeMailto(resolvedTemplate, action, assetData, assetData._emailData);

      case 'clipboard':
        return this._executeClipboard(resolvedTemplate, action, assetData);

      default:
        return { ok: false, error: `Tipo de ação desconhecido: ${action.type}` };
    }
  },

  // ── Executores de Ação ─────────────────────────────────────────────────────

  _executeOpenUrl(url, action, assetData) {
    try {
      window.open(url, action.target || '_blank', 'noopener,noreferrer');
      return {
        ok: true,
        type: action.type,
        auditEvent: action.auditEvent,
        data: { url },
      };
    } catch (err) {
      return { ok: false, error: 'Falha ao abrir URL.' };
    }
  },

  _executeMailto(template, action, assetData, emailData) {
    try {
      const flow = this.getFlow(assetData._assistanceId);
      const email = flow?.contato?.email || '';
      const subject = this._resolveTemplate(
        flow?.emailTemplate?.assunto || 'Chamado Técnico',
        assetData
      );
      const body = this._resolveTemplate(
        flow?.emailTemplate?.corpo || template,
        assetData
      );

      const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoUrl;

      return {
        ok: true,
        type: action.type,
        auditEvent: action.auditEvent,
        data: { email, subject },
      };
    } catch (err) {
      return { ok: false, error: 'Falha ao gerar e-mail.' };
    }
  },

  _executeClipboard(template, action, assetData) {
    try {
      const text = this._resolveTemplate(template, assetData);
      navigator.clipboard.writeText(text).then(
        () => {},
        () => {}
      );
      return {
        ok: true,
        type: action.type,
        auditEvent: action.auditEvent,
        data: { textLength: text.length },
      };
    } catch (err) {
      return { ok: false, error: 'Falha ao copiar para a área de transferência.' };
    }
  },

  // ── Helpers ────────────────────────────────────────────────────────────────

  _resolveTemplate(template, data) {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  },

  /**
   * Prepara os dados do asset para resolução de templates.
   * Inclui campos do asset + dados auxiliares para e-mail.
   */
  prepareAssetData(asset, checklist, observations, assistanceId) {
    const flow = this.getFlow(assistanceId);

    const data = {
      nome: asset.nome || '',
      patrimonio: asset.patrimonio || '',
      serial: asset.serial || '',
      reparticao: asset.reparticao || '',
      status: asset.status || '',
      tipoProblema: checklist?.tipoProblema || '',
      prioridade: this._getPrioridadeLabel(checklist?.prioridade || 3),
      mauUso: checklist?.mauUso ? 'Sim' : 'Não',
      observacoes: observations || '',
      _assistanceId: assistanceId,
      _emailData: null,
    };

    if (flow?.emailTemplate) {
      data._emailData = {
        to: flow.contato?.email || '',
        subject: this._resolveTemplate(flow.emailTemplate.assunto, data),
        body: this._resolveTemplate(flow.emailTemplate.corpo, data),
      };
    }

    return data;
  },

  _getPrioridadeLabel(id) {
    const prioridades = window.WORKFLOW_CONFIG?.prioridades || [];
    const found = prioridades.find(p => p.id === parseInt(id, 10));
    return found ? found.label : 'Média';
  },
};
