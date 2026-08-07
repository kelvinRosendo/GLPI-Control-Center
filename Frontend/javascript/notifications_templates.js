/**
 * GLPI Control Center - notifications_templates.js
 * -----------------------------------------------------------------------------
 * Templates para geração automática de mensagens de notificação.
 *
 * Cada template é uma função que recebe dados do evento e retorna
 * título e mensagem formatados.
 *
 * Sprint 10: Central de Notificações Inteligentes
 */

window.NotificationTemplates = (function () {

  // ── Helpers ──────────────────────────────────────────────────────────────

  function _escape(str) {
    return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _user(data) {
    return _escape(data.usuario || data.nome || 'Sistema');
  }

  function _asset(data) {
    return _escape(data.ativo || data.nome || data.equipment || 'Ativo');
  }

  function _id(data) {
    return _escape(data.id || data.glpiId || '');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEMPLATES
  // ══════════════════════════════════════════════════════════════════════════

  const templates = {

    // ── Workflow ──────────────────────────────────────────────────────────

    workflow_created: function (data) {
      return {
        titulo: `Chamado #${_id(data)} criado`,
        mensagem: `${_user(data)} abriu um chamado para ${_asset(data)}.`,
        acao: { tipo: 'OPEN_WORKFLOW', params: { id: data.id } },
      };
    },

    workflow_cancelled: function (data) {
      return {
        titulo: `Chamado #${_id(data)} cancelado`,
        mensagem: `O chamado de ${_asset(data)} foi cancelado por ${_user(data)}.`,
        acao: { tipo: 'OPEN_WORKFLOW', params: { id: data.id } },
      };
    },

    workflow_completed: function (data) {
      return {
        titulo: `Chamado #${_id(data)} concluído`,
        mensagem: `O chamado de ${_asset(data)} foi resolvido com sucesso.`,
        acao: { tipo: 'OPEN_WORKFLOW', params: { id: data.id } },
      };
    },

    workflow_error: function (data) {
      return {
        titulo: `Erro no chamado #${_id(data)}`,
        mensagem: data.erro || 'Ocorreu um erro ao processar o chamado.',
        acao: { tipo: 'OPEN_WORKFLOW', params: { id: data.id } },
      };
    },

    // ── Portal Viewer ────────────────────────────────────────────────────

    portal_opened: function (data) {
      return {
        titulo: 'Portal Aberto',
        mensagem: `O portal ${_escape(data.portal || 'GLPI')} foi aberto.`,
      };
    },

    portal_iframe_blocked: function (data) {
      return {
        titulo: 'Iframe Bloqueado',
        mensagem: `O iframe de ${_escape(data.portal || 'GLPI')} foi bloqueado pelo navegador.`,
      };
    },

    portal_fallback: function (data) {
      return {
        titulo: 'Fallback do Portal',
        mensagem: `Usando acesso alternativo para ${_escape(data.portal || 'GLPI')}.`,
      };
    },

    // ── Projetores ───────────────────────────────────────────────────────

    projector_lamp_high: function (data) {
      return {
        titulo: 'Lâmpada acima de 80%',
        mensagem: `O projetor ${_escape(data.nome || data.projector || 'Projetor')} está com a lâmpada em ${_escape(data.percentual || '85%')} de uso.`,
        acao: { tipo: 'OPEN_PROJECTOR', params: { id: data.id } },
      };
    },

    projector_lamp_critical: function (data) {
      return {
        titulo: 'Lâmpada em estado crítico',
        mensagem: `O projetor ${_escape(data.nome || data.projector || 'Projetor')} precisa de substituição urgente da lâmpada.`,
        acao: { tipo: 'OPEN_PROJECTOR', params: { id: data.id } },
      };
    },

    projector_maint_overdue: function (data) {
      return {
        titulo: 'Manutenção vencida',
        mensagem: `A manutenção do projetor ${_escape(data.nome || data.projector || 'Projetor')} está atrasada.`,
        acao: { tipo: 'OPEN_PROJECTOR', params: { id: data.id } },
      };
    },

    projector_maint_done: function (data) {
      return {
        titulo: 'Manutenção registrada',
        mensagem: `Manutenção do projetor ${_escape(data.nome || data.projector || 'Projetor')} registrada por ${_user(data)}.`,
        acao: { tipo: 'OPEN_PROJECTOR', params: { id: data.id } },
      };
    },

    // ── Dashboard ────────────────────────────────────────────────────────

    dashboard_updated: function (data) {
      return {
        titulo: 'Dashboard Atualizado',
        mensagem: 'Os dados do painel foram atualizados com sucesso.',
      };
    },

    dashboard_error: function (data) {
      return {
        titulo: 'Erro ao Carregar Dashboard',
        mensagem: data.erro || 'Não foi possível carregar os dados do painel.',
        acao: { tipo: 'OPEN_DASHBOARD', params: {} },
      };
    },

    // ── Relatórios ───────────────────────────────────────────────────────

    report_exported: function (data) {
      return {
        titulo: 'Relatório Exportado',
        mensagem: `O relatório "${_escape(data.nome || 'Relatório')}" foi exportado com sucesso.`,
      };
    },

    report_viewed: function (data) {
      return {
        titulo: 'Relatório Visualizado',
        mensagem: `O relatório "${_escape(data.nome || 'Relatório')}" foi visualizado.`,
      };
    },

    report_error: function (data) {
      return {
        titulo: 'Erro no Relatório',
        mensagem: data.erro || 'Ocorreu um erro ao gerar o relatório.',
      };
    },

    // ── Auth ─────────────────────────────────────────────────────────────

    auth_login: function (data) {
      return {
        titulo: 'Login Realizado',
        mensagem: `${_user(data)} fez login no sistema.`,
      };
    },

    auth_logout: function (data) {
      return {
        titulo: 'Logout Realizado',
        mensagem: `${_user(data)} saiu do sistema.`,
      };
    },

    auth_session_expired: function (data) {
      return {
        titulo: 'Sessão Expirada',
        mensagem: 'Sua sessão expirou. Faça login novamente.',
      };
    },

    auth_domain_denied: function (data) {
      return {
        titulo: 'Domínio Negado',
        mensagem: `O email ${_escape(data.email || '')} não possui acesso ao sistema.`,
      };
    },

    // ── Integrações ──────────────────────────────────────────────────────

    integration_started: function (data) {
      return {
        titulo: 'Integração Iniciada',
        mensagem: `A integração com ${_escape(data.servico || 'serviço externo')} foi iniciada.`,
      };
    },

    integration_success: function (data) {
      return {
        titulo: 'Integração Concluída',
        mensagem: `A integração com ${_escape(data.servico || 'serviço externo')} foi concluída com sucesso.`,
      };
    },

    integration_error: function (data) {
      return {
        titulo: 'Erro na Integração',
        mensagem: `Falha na integração com ${_escape(data.servico || 'serviço externo')}: ${_escape(data.erro || 'Erro desconhecido')}.`,
      };
    },

    integration_cancelled: function (data) {
      return {
        titulo: 'Integração Cancelada',
        mensagem: `A integração com ${_escape(data.servico || 'serviço externo')} foi cancelada.`,
      };
    },

    // ── Genérico ─────────────────────────────────────────────────────────

    generic: function (data) {
      return {
        titulo: _escape(data.titulo || 'Notificação'),
        mensagem: _escape(data.mensagem || data.descricao || ''),
      };
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna template por nome.
   * @param {string} templateName
   * @returns {Function|null}
   */
  function getTemplate(templateName) {
    return templates[templateName] || templates.generic;
  }

  /**
   * Aplica template e retorna notificação formatada.
   * @param {string} templateName
   * @param {object} data
   * @returns {object}
   */
  function apply(templateName, data) {
    const fn = getTemplate(templateName);
    const result = fn(data);
    return {
      titulo: result.titulo,
      mensagem: result.mensagem,
      acao: result.acao || null,
    };
  }

  /**
   * Lista todos os templates disponíveis.
   * @returns {Array<string>}
   */
  function listTemplates() {
    return Object.keys(templates);
  }

  return {
    getTemplate,
    apply,
    listTemplates,
  };

})();
