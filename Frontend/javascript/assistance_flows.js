/**
 * GLPI Control Center - assistance_flows.js
 * -----------------------------------------------------------------------------
 * Motor de execução de ações de assistência.
 *
 * Responsabilidades:
 * - Ler ações de INTEGRATIONS_CONFIG (Configuration Driven Design)
 * - Executar ações: open-url, mailto, clipboard
 * - Resolver templates com dados do equipamento
 * - Preparar dados para preenchimento de templates
 *
 * Sprint 2: Fluxos de assistência + ações reutilizáveis
 * Sprint 3: Dados movidos para integrations.config.js
 *
 * NÃO contém dados de fornecedor. Consulte integrations.config.js.
 */

window.AssistanceFlows = {

  // ── API Pública (leitura do config) ──────────────────────────────────────

  getFlow(key) {
    return window.INTEGRATIONS_CONFIG?.getIntegration(key) || null;
  },

  getActions(key) {
    return window.INTEGRATIONS_CONFIG?.getAcoes(key) || [];
  },

  getAction(key, actionId) {
    const actions = this.getActions(key);
    return actions.find(a => a.id === actionId) || null;
  },

  getInstructions(key) {
    return window.INTEGRATIONS_CONFIG?.getInstrucoes(key) || [];
  },

  // ── Engine de Ações ──────────────────────────────────────────────────────

  /**
   * Executa uma ação com base na configuração.
   * Retorna { ok, type, auditEvent, data } para auditoria.
   */
  executeAction(integrationKey, actionId, assetData) {
    const action = this.getAction(integrationKey, actionId);
    if (!action) {
      return { ok: false, error: 'Ação não encontrada.' };
    }

    const resolvedTemplate = this._resolveTemplate(action.template || '', assetData);
    const resolvedUrl = action.url ? this._resolveTemplate(action.url, assetData) : null;

    switch (action.tipo) {
      case 'open-url':
        return this._executeOpenUrl(resolvedUrl || resolvedTemplate, action, assetData);

      case 'mailto':
        return this._executeMailto(resolvedTemplate, action, assetData);

      case 'clipboard':
        return this._executeClipboard(resolvedTemplate, action, assetData);

      default:
        return { ok: false, error: `Tipo de ação desconhecido: ${action.tipo}` };
    }
  },

  // ── Executores de Ação ───────────────────────────────────────────────────

  _executeOpenUrl(url, action, assetData) {
    try {
      window.open(url, action.target || '_blank', 'noopener,noreferrer');
      return {
        ok: true,
        type: action.tipo,
        auditEvent: action.auditEvent,
        data: { url },
      };
    } catch (err) {
      return { ok: false, error: 'Falha ao abrir URL.' };
    }
  },

  _executeMailto(template, action, assetData) {
    try {
      const integration = window.INTEGRATIONS_CONFIG?.getIntegration(assetData._integrationKey);
      const email = integration?.contato?.email || '';
      const subject = this._resolveTemplate(
        integration?.emailTemplate?.assunto || 'Chamado Técnico',
        assetData
      );
      const body = this._resolveTemplate(
        integration?.emailTemplate?.corpo || template,
        assetData
      );

      const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoUrl;

      return {
        ok: true,
        type: action.tipo,
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
        type: action.tipo,
        auditEvent: action.auditEvent,
        data: { textLength: text.length },
      };
    } catch (err) {
      return { ok: false, error: 'Falha ao copiar para a área de transferência.' };
    }
  },

  // ── Helpers ──────────────────────────────────────────────────────────────

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
  prepareAssetData(asset, checklist, observations, integrationKey) {
    const integration = window.INTEGRATIONS_CONFIG?.getIntegration(integrationKey);

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
      _integrationKey: integrationKey,
    };

    if (integration?.emailTemplate) {
      data._emailData = {
        to: integration.contato?.email || '',
        subject: this._resolveTemplate(integration.emailTemplate.assunto, data),
        body: this._resolveTemplate(integration.emailTemplate.corpo, data),
      };
      data.emailCompleto = `De: \nPara: ${data._emailData.to}\nAssunto: ${data._emailData.subject}\n\n${data._emailData.body}`;
    }

    return data;
  },

  _getPrioridadeLabel(id) {
    const prioridades = window.WORKFLOW_CONFIG?.prioridades || [];
    const found = prioridades.find(p => p.id === parseInt(id, 10));
    return found ? found.label : 'Média';
  },
};
