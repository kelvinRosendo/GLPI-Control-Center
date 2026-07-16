/**
 * GLPI Control Center - workflow_ui.js
 * -----------------------------------------------------------------------------
 * Renderização da interface do Workflow Inteligente de Chamados.
 *
 * Responsável por:
 * - Abrir/fechar o modal do workflow
 * - Renderizar cada etapa do wizard
 * - Vincular eventos de UI (cliques, inputs)
 *
 * Não contém lógica de negócio — ver workflow.js.
 */

window.WorkflowUI = (() => {

  const MODAL_ID = 'workflow-modal';
  const CONTENT_ID = 'workflow-content';

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _getStepIndicator(currentStep, totalSteps, labels) {
    let html = '<div class="wf-steps">';
    for (let i = 1; i <= totalSteps; i++) {
      const isActive = i === currentStep;
      const isCompleted = i < currentStep;
      const cls = isActive ? 'wf-step active' : (isCompleted ? 'wf-step completed' : 'wf-step');
      html += `<div class="${cls}" data-wf-goto="${i}">
        <span class="wf-step-num">${isCompleted ? '&#10003;' : i}</span>
        <span class="wf-step-label">${_escapeHtml(labels[i - 1])}</span>
      </div>`;
    }
    html += '</div>';
    return html;
  }

  // ── Renderização de cada etapa ────────────────────────────────────────────

  function _renderStep1(state) {
    const ativo = state.ativo;
    if (!ativo) {
      return '<p class="wf-empty">Nenhum equipamento selecionado.</p>';
    }

    return `
      <div class="wf-section">
        <h3 class="wf-section-title">Equipamento Selecionado</h3>
        <div class="wf-equipment-card">
          <div class="wf-equip-row">
            <span class="wf-equip-label">Nome</span>
            <span class="wf-equip-value">${_escapeHtml(ativo.nome)}</span>
          </div>
          ${ativo.serial ? `
          <div class="wf-equip-row">
            <span class="wf-equip-label">Serial</span>
            <span class="wf-equip-value">${_escapeHtml(ativo.serial)}</span>
          </div>` : ''}
          ${ativo.patrimonio ? `
          <div class="wf-equip-row">
            <span class="wf-equip-label">Patrimônio</span>
            <span class="wf-equip-value">${_escapeHtml(ativo.patrimonio)}</span>
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
          <div class="wf-equip-row">
            <span class="wf-equip-label">ID GLPI</span>
            <span class="wf-equip-value">${_escapeHtml(String(ativo.glpiId))}</span>
          </div>
        </div>
      </div>
    `;
  }

  function _renderStep2(state) {
    const assistencias = window.Workflow.getAssistencias();
    const selected = state.assistencia;

    const cards = assistencias.map(a => {
      const isSelected = selected === a.id;
      return `
        <div class="wf-assist-card ${isSelected ? 'selected' : ''}"
             data-wf-assistencia="${a.id}">
          <div class="wf-assist-name">${_escapeHtml(a.nome)}</div>
          <div class="wf-assist-desc">${_escapeHtml(a.descricao)}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="wf-section">
        <h3 class="wf-section-title">Assistência Técnica <span class="wf-required">*</span></h3>
        <p class="wf-hint">Selecione a assistência responsável pelo atendimento.</p>
        <div class="wf-assist-grid">${cards}</div>
      </div>
    `;
  }

  function _renderStep3(state) {
    const questions = window.Workflow.getChecklistQuestions();
    const respostas = state.checklist;

    const fields = questions.map(q => {
      if (q.condicional && !q.condicional(respostas)) return '';

      const value = respostas[q.id] || '';

      if (q.tipo === 'select') {
        const options = q.opcoes.map(o =>
          `<option value="${_escapeHtml(o.value)}" ${value === o.value ? 'selected' : ''}>${_escapeHtml(o.label)}</option>`
        ).join('');
        return `
          <div class="wf-field">
            <label class="wf-label">${_escapeHtml(q.label)}${q.obrigatorio ? ' <span class="wf-required">*</span>' : ''}</label>
            <select class="wf-input" data-wf-checklist="${q.id}">
              ${options}
            </select>
          </div>
        `;
      }

      if (q.tipo === 'radio') {
        const radios = q.opcoes.map(o => `
          <label class="wf-radio-label">
            <input type="radio" name="wf-${q.id}" value="${_escapeHtml(o.value)}"
              ${value === o.value ? 'checked' : ''}
              data-wf-checklist="${q.id}" />
            <span>${_escapeHtml(o.label)}</span>
          </label>
        `).join('');
        return `
          <div class="wf-field">
            <label class="wf-label">${_escapeHtml(q.label)}${q.obrigatorio ? ' <span class="wf-required">*</span>' : ''}</label>
            <div class="wf-radio-group">${radios}</div>
          </div>
        `;
      }

      if (q.tipo === 'textarea') {
        return `
          <div class="wf-field">
            <label class="wf-label">${_escapeHtml(q.label)}${q.obrigatorio ? ' <span class="wf-required">*</span>' : ''}</label>
            <textarea class="wf-input wf-textarea" data-wf-checklist="${q.id}"
              placeholder="Digite aqui...">${_escapeHtml(value)}</textarea>
          </div>
        `;
      }

      return '';
    }).join('');

    return `
      <div class="wf-section">
        <h3 class="wf-section-title">Checklist de Inspeção</h3>
        <p class="wf-hint">Responda as perguntas sobre o equipamento.</p>
        <div class="wf-checklist">${fields}</div>
      </div>
    `;
  }

  function _renderStep4(state) {
    const ativo = state.ativo;
    const assistencia = window.Workflow.getAssistenciaById(state.assistencia);
    const regras = state.regras;
    const checklist = state.checklist;

    const mauUsoLabel = checklist.mau_uso === 'sim' ? 'Sim' : 'Não';
    const contratoLabel = regras.contratoObrigatorio ? 'Obrigatório' : 'Não obrigatório';
    const contratoBadge = regras.contratoObrigatorio
      ? '<span class="wf-badge wf-badge-warning">Obrigatório</span>'
      : '<span class="wf-badge wf-badge-info">Não obrigatório</span>';

    const tipoProblema = _getChecklistDisplay('tipo_problema', checklist.tipo_problema);

    const observacoes = checklist.observacoes
      ? `<div class="wf-summary-row"><span class="wf-summary-label">Observações</span><span class="wf-summary-value">${_escapeHtml(checklist.observacoes)}</span></div>`
      : '';

    const mauUsoDetalhe = (checklist.mau_uso === 'sim' && checklist.mau_uso_detalhe)
      ? `<div class="wf-summary-row"><span class="wf-summary-label">Detalhe do mau uso</span><span class="wf-summary-value">${_escapeHtml(checklist.mau_uso_detalhe)}</span></div>`
      : '';

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
            ${ativo.serial ? `
            <div class="wf-summary-row">
              <span class="wf-summary-label">Serial</span>
              <span class="wf-summary-value">${_escapeHtml(ativo.serial)}</span>
            </div>` : ''}
            ${ativo.patrimonio ? `
            <div class="wf-summary-row">
              <span class="wf-summary-label">Patrimônio</span>
              <span class="wf-summary-value">${_escapeHtml(ativo.patrimonio)}</span>
            </div>` : ''}
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
            <div class="wf-summary-row">
              <span class="wf-summary-label">Tipo do problema</span>
              <span class="wf-summary-value">${_escapeHtml(tipoProblema)}</span>
            </div>
            <div class="wf-summary-row">
              <span class="wf-summary-label">Mau uso</span>
              <span class="wf-summary-value">${_escapeHtml(mauUsoLabel)}</span>
            </div>
            ${mauUsoDetalhe}
            ${observacoes}
          </div>

          <div class="wf-summary-group">
            <h4 class="wf-summary-group-title">Regras de Negócio</h4>
            <div class="wf-summary-row">
              <span class="wf-summary-label">Contrato</span>
              <span class="wf-summary-value">${contratoBadge} ${contratoLabel}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function _renderSuccess(state) {
    return `
      <div class="wf-success">
        <div class="wf-success-icon">&#10003;</div>
        <h3 class="wf-success-title">Chamado Criado com Sucesso!</h3>
        <p class="wf-success-id">Chamado #${state.sucesso.ticketId}</p>
        <p class="wf-success-msg">${_escapeHtml(state.sucesso.titulo)}</p>
        <div class="wf-success-actions">
          <a class="wf-btn wf-btn-primary" href="${_getGlpiTicketUrl(state.sucesso.ticketId)}" target="_blank" rel="noopener">
            Abrir no GLPI
          </a>
          <button class="wf-btn wf-btn-secondary" data-wf-close>Fechar</button>
        </div>
      </div>
    `;
  }

  function _getGlpiTicketUrl(ticketId) {
    const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
    return `${base}/front/ticket.form.php?id=${ticketId}`;
  }

  function _getChecklistDisplay(questionId, value) {
    const q = window.Workflow.CHECKLIST_QUESTIONS.find(item => item.id === questionId);
    if (!q || !q.opcoes) return value || 'Não informado';
    const opt = q.opcoes.find(o => o.value === value);
    return opt ? opt.label : (value || 'Não informado');
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
      }

      const prevDisabled = state.step <= 1 ? 'disabled' : '';
      const isLastStep = state.step === window.Workflow.TOTAL_STEPS;
      const submitLabel = state.enviando ? 'Criando chamado...' : 'Criar Chamado';
      const submitDisabled = state.enviando ? 'disabled' : '';

      footerHtml = `
        <div class="wf-footer">
          <div class="wf-footer-left">
            ${state.step > 1 ? `<button class="wf-btn wf-btn-secondary" data-wf-prev ${prevDisabled}>Voltar</button>` : ''}
          </div>
          <div class="wf-footer-right">
            ${state.erro ? `<span class="wf-error">${_escapeHtml(state.erro)}</span>` : ''}
            ${isLastStep
              ? `<button class="wf-btn wf-btn-primary" data-wf-submit ${submitDisabled}>${submitLabel}</button>`
              : `<button class="wf-btn wf-btn-primary" data-wf-next>Próximo</button>`
            }
          </div>
        </div>
      `;
    }

    contentEl.innerHTML = `
      ${!state.sucesso ? _getStepIndicator(state.step, window.Workflow.TOTAL_STEPS, labels) : ''}
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
        let value;
        if (el.type === 'radio') {
          value = el.value;
        } else {
          value = el.value;
        }
        window.Workflow.setChecklistValue(qId, value);
      };
      el.addEventListener('change', handler);
      if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'radio')) {
        el.addEventListener('input', handler);
      }
    });
  }

  // ── Abrir / Fechar modal ─────────────────────────────────────────────────

  function open() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.display = 'flex';
      render();
    }
  }

  function close() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // ── Exposição pública ─────────────────────────────────────────────────────

  return {
    open,
    close,
    render,
  };

})();
