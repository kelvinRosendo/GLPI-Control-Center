/**
 * GLPI Control Center - workflow_ui.js
 * -----------------------------------------------------------------------------
 * Renderização da interface do Workflow Inteligente de Chamados — v2.0.
 *
 * Responsável por:
 * - Abrir/fechar o modal do workflow
 * - Renderizar cada etapa do wizard (com grupos no checklist)
 * - Vincular eventos de UI
 * - Indicadores visuais de validação
 * - Estados de loading e feedback
 *
 * Não contém lógica de negócio — ver workflow.js.
 */

window.WorkflowUI = (() => {

  const MODAL_ID = 'workflow-modal';
  const CONTENT_ID = 'workflow-content';

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Step indicator ────────────────────────────────────────────────────────

  function _getStepIndicator(currentStep, totalSteps, labels, state) {
    let html = '<div class="wf-steps">';
    for (let i = 1; i <= totalSteps; i++) {
      const isActive = i === currentStep;
      const isCompleted = (state.completedSteps || []).includes(i);
      const isAccessible = window.Workflow.isStepAccessible(i);
      let cls = 'wf-step';
      if (isActive) cls += ' active';
      else if (isCompleted) cls += ' completed';
      if (!isAccessible && !isActive) cls += ' locked';
      const clickAttr = isAccessible ? `data-wf-goto="${i}"` : '';
      html += `<div class="${cls}" ${clickAttr}>
        <span class="wf-step-num">${isCompleted ? '&#10003;' : i}</span>
        <span class="wf-step-label">${_escapeHtml(labels[i - 1])}</span>
      </div>`;
    }
    html += '</div>';
    return html;
  }

  // ── Step 1: Equipamento ───────────────────────────────────────────────────

  function _renderStep1(state) {
    const ativo = state.ativo;
    if (!ativo) {
      return '<div class="wf-empty-state"><p>Nenhum equipamento selecionado.</p></div>';
    }

    const statusLabel = { ativo: 'Ativo', manutencao: 'Manutenção', emprestado: 'Emprestado' }[ativo.status] || 'Ativo';
    const statusClass = { ativo: 'wf-status-active', manutencao: 'wf-status-maint', emprestado: 'wf-status-loaned' }[ativo.status] || 'wf-status-active';

    return `
      <div class="wf-section">
        <div class="wf-section-header">
          <h3 class="wf-section-title">Equipamento Selecionado</h3>
          <span class="wf-badge ${statusClass}">${_escapeHtml(statusLabel)}</span>
        </div>
        <div class="wf-equipment-card">
          <div class="wf-equip-header">
            <span class="wf-equip-name">${_escapeHtml(ativo.nome)}</span>
            ${ativo.patrimonio ? `<span class="wf-equip-pat">PAT: ${_escapeHtml(ativo.patrimonio)}</span>` : ''}
          </div>
          <div class="wf-equip-details">
            ${ativo.serial ? `
            <div class="wf-equip-row">
              <span class="wf-equip-label">Serial</span>
              <span class="wf-equip-value">${_escapeHtml(ativo.serial)}</span>
            </div>` : ''}
            ${ativo.modelo ? `
            <div class="wf-equip-row">
              <span class="wf-equip-label">Modelo</span>
              <span class="wf-equip-value">${_escapeHtml(ativo.modelo)}</span>
            </div>` : ''}
            ${ativo.grupo ? `
            <div class="wf-equip-row">
              <span class="wf-equip-label">Grupo</span>
              <span class="wf-equip-value">${_escapeHtml(ativo.grupo)}</span>
            </div>` : ''}
            ${ativo.usuario ? `
            <div class="wf-equip-row">
              <span class="wf-equip-label">Usuário</span>
              <span class="wf-equip-value">${_escapeHtml(ativo.usuario)}</span>
            </div>` : ''}
            <div class="wf-equip-row">
              <span class="wf-equip-label">ID GLPI</span>
              <span class="wf-equip-value">${_escapeHtml(String(ativo.glpiId))}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Step 2: Assistência ───────────────────────────────────────────────────

  function _renderStep2(state) {
    const assistencias = window.Workflow.getAssistencias();
    const selected = state.assistencia;
    const hasError = state.erroCampo === 'assistencia';

    const cards = assistencias.map(a => {
      const isSelected = selected === a.id;
      return `
        <div class="wf-assist-card ${isSelected ? 'selected' : ''}"
             data-wf-assistencia="${a.id}">
          <div class="wf-assist-radio ${isSelected ? 'checked' : ''}">
            <span class="wf-radio-dot"></span>
          </div>
          <div class="wf-assist-info">
            <div class="wf-assist-name">${_escapeHtml(a.nome)}</div>
            <div class="wf-assist-desc">${_escapeHtml(a.descricao)}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="wf-section">
        <h3 class="wf-section-title">Assistência Técnica <span class="wf-required">*</span></h3>
        <p class="wf-hint">Selecione a assistência responsável pelo atendimento.</p>
        ${hasError ? `<div class="wf-field-error">Selecione uma opção para continuar</div>` : ''}
        <div class="wf-assist-grid">${cards}</div>
      </div>
    `;
  }

  // ── Step 3: Checklist (com grupos) ────────────────────────────────────────

  function _renderStep3(state) {
    const groups = window.Workflow.getChecklistGroups();
    const respostas = state.checklist;

    const groupsHtml = groups.map(group => {
      const fieldsHtml = group.questions.map(q => {
        if (q.condicional && !q.condicional(respostas)) return '';
        return _renderChecklistField(q, respostas[q.id] || '', state.erroCampo === q.id);
      }).join('');

      if (!fieldsHtml.trim()) return '';

      return `
        <div class="wf-checklist-group">
          <h4 class="wf-checklist-group-title">${_escapeHtml(group.label)}</h4>
          <div class="wf-checklist-fields">${fieldsHtml}</div>
        </div>
      `;
    }).join('');

    const answered = Object.keys(respostas).filter(k => respostas[k] !== '' && respostas[k] !== undefined).length;
    const total = window.Workflow.getChecklistQuestions().filter(q => !q.condicional || q.condicional(respostas)).length;

    return `
      <div class="wf-section">
        <div class="wf-section-header">
          <h3 class="wf-section-title">Checklist de Inspeção</h3>
          <span class="wf-checklist-progress">${answered}/${total} respondidas</span>
        </div>
        <div class="wf-checklist">${groupsHtml}</div>
      </div>
    `;
  }

  function _renderChecklistField(q, value, hasError) {
    const errorClass = hasError ? ' wf-field-error-border' : '';
    const reqMark = q.obrigatorio ? ' <span class="wf-required">*</span>' : '';

    if (q.tipo === 'select') {
      const options = q.opcoes.map(o =>
        `<option value="${_escapeHtml(o.value)}" ${value === o.value ? 'selected' : ''}>${_escapeHtml(o.label)}</option>`
      ).join('');
      return `
        <div class="wf-field${errorClass}">
          <label class="wf-label">${_escapeHtml(q.label)}${reqMark}</label>
          <select class="wf-input" data-wf-checklist="${q.id}">${options}</select>
          ${hasError ? '<span class="wf-field-error-text">Campo obrigatório</span>' : ''}
        </div>
      `;
    }

    if (q.tipo === 'radio') {
      const radios = q.opcoes.map(o => `
        <label class="wf-radio-label">
          <input type="radio" name="wf-${q.id}" value="${_escapeHtml(o.value)}"
            ${value === o.value ? 'checked' : ''}
            data-wf-checklist="${q.id}" />
          <span class="wf-radio-text">${_escapeHtml(o.label)}</span>
        </label>
      `).join('');
      return `
        <div class="wf-field${errorClass}">
          <label class="wf-label">${_escapeHtml(q.label)}${reqMark}</label>
          <div class="wf-radio-group">${radios}</div>
          ${hasError ? '<span class="wf-field-error-text">Campo obrigatório</span>' : ''}
        </div>
      `;
    }

    if (q.tipo === 'textarea') {
      return `
        <div class="wf-field${errorClass}">
          <label class="wf-label">${_escapeHtml(q.label)}${reqMark}</label>
          <textarea class="wf-input wf-textarea" data-wf-checklist="${q.id}"
            placeholder="Digite aqui...">${_escapeHtml(value)}</textarea>
        </div>
      `;
    }

    return '';
  }

  // ── Step 4: Fluxo da Assistência ──────────────────────────────────────────

  function _renderStep4(state) {
    const flow = window.Workflow.getAssistanceFlowConfig();
    if (!flow) {
      return '<div class="wf-empty-state"><p>Fluxo de assistência não configurado.</p></div>';
    }

    const instrucaoHtml = flow.instrucao
      ? `<div class="wf-flow-instruction">${_escapeHtml(flow.instrucao)}</div>`
      : '';

    const proximosPassosHtml = (flow.proximosPassos || []).length > 0
      ? `<div class="wf-flow-steps">
          <h4 class="wf-flow-steps-title">Próximos passos:</h4>
          <ul class="wf-flow-steps-list">
            ${flow.proximosPassos.map(p => `<li>${_escapeHtml(p)}</li>`).join('')}
          </ul>
        </div>`
      : '';

    const actionsHtml = (flow.acoes || []).map(action => {
      const isExecuted = window.Workflow.isActionExecuted(action.id);
      const cls = isExecuted ? 'wf-flow-action done' : 'wf-flow-action';
      const iconHtml = isExecuted ? '&#10003;' : action.icone;

      if (action.tipo === 'link') {
        return `
          <button class="${cls}" data-wf-flow-action="${action.id}" data-wf-flow-url="${_escapeHtml(action.url)}">
            <span class="wf-flow-action-icon">${iconHtml}</span>
            <div class="wf-flow-action-info">
              <span class="wf-flow-action-label">${_escapeHtml(action.label)}</span>
              <span class="wf-flow-action-desc">${_escapeHtml(action.descricao)}</span>
            </div>
            ${isExecuted ? '<span class="wf-flow-action-badge">Executado</span>' : ''}
          </button>
        `;
      }

      if (action.tipo === 'email') {
        const emailBody = window.AssistanceFlows.generateEmailBody(state.assistencia, {
          patrimonio: state.ativo?.patrimonio,
          nome: state.ativo?.nome,
          serial: state.ativo?.serial,
          modelo: state.ativo?.modelo,
          tipoProblema: _getChecklistDisplay('tipo_problema', state.checklist.tipo_problema),
          equipamentoLiga: _getChecklistDisplay('equipamento_liga', state.checklist.equipamento_liga),
          danoFisico: state.checklist.dano_fisico === 'sim' ? 'Sim' : 'Não',
          mauUso: state.checklist.mau_uso === 'sim' ? 'Sim' : 'Não',
          contrato: state.regras.contratoObrigatorio ? 'Obrigatório' : 'Não obrigatório',
          observacoes: state.checklist.observacoes || '',
          usuario: state.ativo?.usuario || 'Técnico de TI',
        });
        return `
          <button class="${cls}" data-wf-flow-action="${action.id}" data-wf-flow-type="email" data-wf-flow-email="${_escapeHtml(emailBody)}">
            <span class="wf-flow-action-icon">${iconHtml}</span>
            <div class="wf-flow-action-info">
              <span class="wf-flow-action-label">${_escapeHtml(action.label)}</span>
              <span class="wf-flow-action-desc">${_escapeHtml(action.descricao)}</span>
            </div>
            ${isExecuted ? '<span class="wf-flow-action-badge">Executado</span>' : ''}
          </button>
        `;
      }

      if (action.tipo === 'clipboard') {
        const clipText = _buildClipboardText(state, action.id);
        return `
          <button class="${cls}" data-wf-flow-action="${action.id}" data-wf-flow-type="clipboard" data-wf-flow-clipboard="${_escapeHtml(clipText)}">
            <span class="wf-flow-action-icon">${iconHtml}</span>
            <div class="wf-flow-action-info">
              <span class="wf-flow-action-label">${_escapeHtml(action.label)}</span>
              <span class="wf-flow-action-desc">${_escapeHtml(action.descricao)}</span>
            </div>
            ${isExecuted ? '<span class="wf-flow-action-badge">Executado</span>' : ''}
          </button>
        `;
      }

      return '';
    }).join('');

    return `
      <div class="wf-section">
        <div class="wf-section-header">
          <h3 class="wf-section-title">
            <span class="wf-flow-icon" style="color: ${flow.cor}">${flow.icone}</span>
            Fluxo: ${_escapeHtml(flow.nome)}
          </h3>
        </div>
        ${instrucaoHtml}
        ${proximosPassosHtml}
        <div class="wf-flow-actions">
          ${actionsHtml}
        </div>
      </div>
    `;
  }

  function _buildClipboardText(state, actionId) {
    const ativo = state.ativo;
    if (!ativo) return '';

    if (actionId === 'copiar_dados' && state.assistencia === 'torino') {
      return `Patrimônio: ${ativo.patrimonio || ''}\nEquipamento: ${ativo.nome || ''}\nSerial: ${ativo.serial || ''}\nModelo: ${ativo.modelo || ''}`;
    }
    if (actionId === 'copiar_dados' && state.assistencia === 'acer_geek') {
      return `Serial: ${ativo.serial || ''}\nEquipamento: ${ativo.nome || ''}`;
    }
    if (actionId === 'copiar_dados') {
      return `Patrimônio: ${ativo.patrimonio || ''}\nEquipamento: ${ativo.nome || ''}\nSerial: ${ativo.serial || ''}\nModelo: ${ativo.modelo || ''}`;
    }
    if (actionId === 'copiar_email') {
      return window.AssistanceFlows.generateEmailBody(state.assistencia, {
        patrimonio: ativo.patrimonio,
        nome: ativo.nome,
        serial: ativo.serial,
        modelo: ativo.modelo,
        tipoProblema: _getChecklistDisplay('tipo_problema', state.checklist.tipo_problema),
        equipamentoLiga: _getChecklistDisplay('equipamento_liga', state.checklist.equipamento_liga),
        danoFisico: state.checklist.dano_fisico === 'sim' ? 'Sim' : 'Não',
        mauUso: state.checklist.mau_uso === 'sim' ? 'Sim' : 'Não',
        contrato: state.regras.contratoObrigatorio ? 'Obrigatório' : 'Não obrigatório',
        observacoes: state.checklist.observacoes || '',
        usuario: ativo.usuario || 'Técnico de TI',
      });
    }
    return '';
  }

  // ── Step 5: Confirmação ───────────────────────────────────────────────────

  function _renderStep5(state) {
    const ativo = state.ativo;
    const assistencia = window.Workflow.getAssistenciaById(state.assistencia);
    const regras = state.regras;
    const cl = state.checklist;

    const contratoBadge = regras.contratoObrigatorio
      ? '<span class="wf-badge wf-badge-warning">Obrigatório</span>'
      : '<span class="wf-badge wf-badge-info">Não obrigatório</span>';

    const mauUsoBadge = cl.mau_uso === 'sim'
      ? '<span class="wf-badge wf-badge-danger">Sim</span>'
      : '<span class="wf-badge wf-badge-success">Não</span>';

    const danoBadge = cl.dano_fisico === 'sim'
      ? '<span class="wf-badge wf-badge-danger">Sim</span>'
      : '<span class="wf-badge wf-badge-success">Não</span>';

    const checklistRows = [
      { label: 'Tipo do problema', value: _getChecklistDisplay('tipo_problema', cl.tipo_problema) },
      { label: 'Equipamento liga', value: _getChecklistDisplay('equipamento_liga', cl.equipamento_liga) },
      { label: 'Dano físico', value: danoBadge },
    ];

    if (cl.dano_fisico === 'sim' && cl.tipo_dano) {
      checklistRows.push({ label: 'Tipo de dano', value: _getChecklistDisplay('tipo_dano', cl.tipo_dano) });
    }
    if (cl.dano_fisico === 'sim' && cl.dano_detalhe) {
      checklistRows.push({ label: 'Detalhe do dano', value: cl.dano_detalhe });
    }

    checklistRows.push({ label: 'Mau uso', value: mauUsoBadge });
    if (cl.mau_uso === 'sim' && cl.mau_uso_detalhe) {
      checklistRows.push({ label: 'Detalhe mau uso', value: cl.mau_uso_detalhe });
    }
    if (cl.observacoes) {
      checklistRows.push({ label: 'Observações', value: cl.observacoes });
    }

    const checklistHtml = checklistRows.map(r => `
      <div class="wf-summary-row">
        <span class="wf-summary-label">${_escapeHtml(r.label)}</span>
        <span class="wf-summary-value">${typeof r.value === 'string' ? _escapeHtml(r.value) : r.value}</span>
      </div>
    `).join('');

    return `
      <div class="wf-section">
        <h3 class="wf-section-title">Resumo do Chamado</h3>
        <p class="wf-hint">Revise as informações antes de criar o chamado no GLPI.</p>

        <div class="wf-summary">
          <div class="wf-summary-group">
            <h4 class="wf-summary-group-title">Equipamento</h4>
            <div class="wf-summary-row">
              <span class="wf-summary-label">Nome</span>
              <span class="wf-summary-value">${_escapeHtml(ativo.nome)}</span>
            </div>
            ${ativo.serial ? `<div class="wf-summary-row"><span class="wf-summary-label">Serial</span><span class="wf-summary-value">${_escapeHtml(ativo.serial)}</span></div>` : ''}
            ${ativo.patrimonio ? `<div class="wf-summary-row"><span class="wf-summary-label">Patrimônio</span><span class="wf-summary-value">${_escapeHtml(ativo.patrimonio)}</span></div>` : ''}
          </div>

          <div class="wf-summary-group">
            <h4 class="wf-summary-group-title">Atendimento</h4>
            <div class="wf-summary-row">
              <span class="wf-summary-label">Assistência</span>
              <span class="wf-summary-value">${assistencia ? _escapeHtml(assistencia.nome) : '—'}</span>
            </div>
          </div>

          <div class="wf-summary-group">
            <h4 class="wf-summary-group-title">Checklist</h4>
            ${checklistHtml}
          </div>

          <div class="wf-summary-group">
            <h4 class="wf-summary-group-title">Regras de Negócio</h4>
            <div class="wf-summary-row">
              <span class="wf-summary-label">Contrato</span>
              <span class="wf-summary-value">${contratoBadge} ${regras.contratoObrigatorio ? 'Obrigatório' : 'Não obrigatório'}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function _getChecklistDisplay(questionId, value) {
    const q = window.Workflow.CHECKLIST_QUESTIONS.find(item => item.id === questionId);
    if (!q || !q.opcoes) return value || 'Não informado';
    const opt = q.opcoes.find(o => o.value === value);
    return opt ? opt.label : (value || 'Não informado');
  }

  // ── Success ───────────────────────────────────────────────────────────────

  function _renderSuccess(state) {
    const s = state.sucesso;
    const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
    const glpiUrl = `${base}/front/ticket.form.php?id=${s.ticketId}`;

    const mauUsoLine = s.mauUso
      ? '<div class="wf-success-detail"><span class="wf-success-detail-label">Mau uso:</span> Sim</div>'
      : '';
    const contratoLine = s.contrato
      ? '<div class="wf-success-detail"><span class="wf-success-detail-label">Contrato:</span> Obrigatório</div>'
      : '<div class="wf-success-detail"><span class="wf-success-detail-label">Contrato:</span> Não obrigatório</div>';

    return `
      <div class="wf-success">
        <div class="wf-success-icon-wrap">
          <div class="wf-success-icon">&#10003;</div>
        </div>
        <h3 class="wf-success-title">Chamado Criado com Sucesso!</h3>
        <p class="wf-success-id">#${s.ticketId}</p>
        <p class="wf-success-msg">${_escapeHtml(s.titulo)}</p>
        <div class="wf-success-details">
          ${mauUsoLine}
          ${contratoLine}
          ${s.assistencia ? `<div class="wf-success-detail"><span class="wf-success-detail-label">Assistência:</span> ${_escapeHtml(s.assistencia)}</div>` : ''}
        </div>
        <div class="wf-success-actions">
          <a class="wf-btn wf-btn-primary" href="${glpiUrl}" target="_blank" rel="noopener">
            Abrir no GLPI
          </a>
          <button class="wf-btn wf-btn-secondary" data-wf-close>Fechar</button>
        </div>
      </div>
    `;
  }

  // ── Renderização principal ────────────────────────────────────────────────

  function render() {
    const state = window.Workflow.getState();
    const labels = window.Workflow.getStepLabels();
    const contentEl = document.getElementById(CONTENT_ID);
    if (!contentEl) return;

    let stepContent = '';
    let footerHtml = '';

    if (state.sucesso) {
      stepContent = _renderSuccess(state);
      footerHtml = '';
    } else {
      switch (state.step) {
        case 1: stepContent = _renderStep1(state); break;
        case 2: stepContent = _renderStep2(state); break;
        case 3: stepContent = _renderStep3(state); break;
        case 4: stepContent = _renderStep4(state); break;
        case 5: stepContent = _renderStep5(state); break;
      }

      const isLastStep = state.step === window.Workflow.TOTAL_STEPS;
      const submitLabel = state.enviando
        ? '<span class="wf-btn-spinner"></span> Criando chamado...'
        : 'Criar Chamado no GLPI';
      const submitDisabled = state.enviando ? 'disabled' : '';

      const errorHtml = state.erro
        ? `<div class="wf-error-banner"><span class="wf-error-icon">!</span> ${_escapeHtml(state.erro)}</div>`
        : '';

      footerHtml = `
        <div class="wf-footer">
          <div class="wf-footer-left">
            ${state.step > 1 ? `<button class="wf-btn wf-btn-ghost" data-wf-prev>← Voltar</button>` : ''}
          </div>
          <div class="wf-footer-right">
            ${errorHtml}
            ${isLastStep
              ? `<button class="wf-btn wf-btn-primary wf-btn-lg" data-wf-submit ${submitDisabled}>${submitLabel}</button>`
              : `<button class="wf-btn wf-btn-primary" data-wf-next>Próximo →</button>`
            }
          </div>
        </div>
      `;
    }

    contentEl.innerHTML = `
      ${!state.sucesso ? _getStepIndicator(state.step, window.Workflow.TOTAL_STEPS, labels, state) : ''}
      <div class="wf-step-content">${stepContent}</div>
      ${footerHtml}
    `;

    _bindEvents();
  }

  // ── Eventos ───────────────────────────────────────────────────────────────

  function _bindEvents() {
    const contentEl = document.getElementById(CONTENT_ID);
    if (!contentEl) return;

    contentEl.querySelectorAll('[data-wf-goto]').forEach(el => {
      el.addEventListener('click', () => {
        const step = parseInt(el.dataset.wfGoto);
        window.Workflow.goToStep(step);
      });
    });

    contentEl.querySelectorAll('[data-wf-next]').forEach(el => {
      el.addEventListener('click', () => window.Workflow.nextStep());
    });

    contentEl.querySelectorAll('[data-wf-prev]').forEach(el => {
      el.addEventListener('click', () => window.Workflow.prevStep());
    });

    contentEl.querySelectorAll('[data-wf-submit]').forEach(el => {
      el.addEventListener('click', () => window.Workflow.submit());
    });

    contentEl.querySelectorAll('[data-wf-close]').forEach(el => {
      el.addEventListener('click', () => window.Workflow.close());
    });

    contentEl.querySelectorAll('[data-wf-assistencia]').forEach(el => {
      el.addEventListener('click', () => {
        window.Workflow.setAssistencia(el.dataset.wfAssistencia);
      });
    });

    contentEl.querySelectorAll('[data-wf-checklist]').forEach(el => {
      const handler = () => {
        const qId = el.dataset.wfChecklist;
        window.Workflow.setChecklistValue(qId, el.type === 'radio' ? el.value : el.value);
      };
      el.addEventListener('change', handler);
      if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'radio')) {
        el.addEventListener('input', handler);
      }
    });

    contentEl.querySelectorAll('[data-wf-flow-action]').forEach(el => {
      el.addEventListener('click', () => {
        const actionId = el.dataset.wfFlowAction;
        const actionType = el.dataset.wfFlowType;

        if (actionType === 'link') {
          const url = el.dataset.wfFlowUrl;
          if (url && url !== '#portal-torino' && url !== '#portal-acer') {
            window.open(url, '_blank');
          }
          window.Workflow.registerAssistanceAction(actionId, { type: 'link', url });
          return;
        }

        if (actionType === 'email') {
          const emailBody = el.dataset.wfFlowEmail;
          const subject = encodeURIComponent('Solicitação de Suporte - ' + (window.Workflow.getState().ativo?.nome || ''));
          window.open(`mailto:?subject=${subject}&body=${encodeURIComponent(emailBody)}`, '_blank');
          window.Workflow.registerAssistanceAction(actionId, { type: 'email' });
          return;
        }

        if (actionType === 'clipboard') {
          const text = el.dataset.wfFlowClipboard;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
              window.Workflow.registerAssistanceAction(actionId, { type: 'clipboard' });
            });
          }
          return;
        }
      });
    });
  }

  // ── Abrir / Fechar modal ─────────────────────────────────────────────────

  function open() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
      render();
    }
  }

  function close() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
    }
  }

  return { open, close, render };

})();
