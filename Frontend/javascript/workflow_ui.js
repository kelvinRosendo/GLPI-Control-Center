/**
 * GLPI Control Center - workflow_ui.js
 * -----------------------------------------------------------------------------
 * Renderização, eventos e interface do Workflow Wizard.
 *
 * Responsabilidades:
 * - Criar/destruir modal no DOM
 * - Renderizar cada etapa do wizard
 * - Gerenciar barra de progresso
 * - Atachar eventos em botões e campos
 * - Feedback visual (sucesso, erro, enviando)
 *
 * NÃO contém regra de negócio. Consulte workflow.js para lógica e validações.
 */

window.WorkflowUI = {
  _modalEl: null,

  // ── Abertura / Fechamento ──────────────────────────────────────────────────

  open(ativo) {
    this._createModal();
    this.render();
  },

  close() {
    if (this._modalEl) {
      this._modalEl.remove();
      this._modalEl = null;
    }
    document.body.classList.remove('modal-open');
  },

  // ── Renderização Principal ─────────────────────────────────────────────────

  render() {
    if (!this._modalEl) return;

    const s = window.Workflow.state;

    let bodyHtml = '';
    if (s.currentStep === 0) {
      bodyHtml = '';
    } else if (s.currentStep === 1) {
      bodyHtml = this._renderStep1();
    } else if (s.currentStep === 2) {
      bodyHtml = this._renderStep2();
    } else if (s.currentStep === 3) {
      bodyHtml = this._renderStep3();
    } else if (s.currentStep === 4) {
      bodyHtml = this._renderStep4();
    } else if (s.currentStep === 5) {
      bodyHtml = this._renderDone();
    }

    if (s.sending) {
      bodyHtml = this._renderSending();
    }

    const contentEl = this._modalEl.querySelector('.workflow-content');
    if (contentEl) {
      contentEl.innerHTML = bodyHtml;
    }

    this._updateProgress();
    this._updateFooter();
    this._updateFeedback();
    this._bindStepEvents();
  },

  // ── Progress Bar ───────────────────────────────────────────────────────────

  _renderProgressBar() {
    const s = window.Workflow.state;
    const labels = window.Workflow.STEP_LABELS;

    const steps = labels.map((label, i) => {
      const stepNum = i + 1;
      let cls = 'workflow-step';
      if (stepNum === s.currentStep) cls += ' active';
      else if (s.completedSteps.includes(stepNum)) cls += ' completed';

      const clickable = s.completedSteps.includes(stepNum) || stepNum === s.currentStep;
      const onclick = clickable ? `onclick="window.Workflow.goTo(${stepNum})"` : '';

      return `
        <div class="${cls}" ${onclick}>
          <div class="workflow-step-circle">
            ${s.completedSteps.includes(stepNum) && stepNum !== s.currentStep ? '&#10003;' : stepNum}
          </div>
          <span class="workflow-step-label">${this._esc(label)}</span>
        </div>
        ${i < labels.length - 1 ? '<div class="workflow-step-connector"></div>' : ''}
      `;
    }).join('');

    return `<div class="workflow-progress">${steps}</div>`;
  },

  _updateProgress() {
    const progressEl = this._modalEl.querySelector('.workflow-progress');
    if (progressEl) {
      progressEl.outerHTML = this._renderProgressBar();
    }
  },

  // ── Step 1: Confirmação do Equipamento ─────────────────────────────────────

  _renderStep1() {
    const asset = window.Workflow.workflowData.asset;
    const statusLabel = { ativo: 'Ativo', manutencao: 'Manutenção', emprestado: 'Emprestado' }[asset.status] || asset.status || '-';
    const statusClass = { ativo: 'wf-status-ativo', manutencao: 'wf-status-manutencao', emprestado: 'wf-status-emprestado' }[asset.status] || 'wf-status-ativo';

    return `
      <div class="workflow-step-body">
        <h3 class="workflow-step-title">Confirmar Equipamento</h3>
        <p class="workflow-step-subtitle">Verifique se os dados abaixo correspondem ao equipamento selecionado.</p>

        <div class="wf-info-card">
          <div class="wf-info-row">
            <span class="wf-info-label">Nome</span>
            <span class="wf-info-value">${this._esc(asset.nome || '-')}</span>
          </div>
          <div class="wf-info-row">
            <span class="wf-info-label">Patrimônio</span>
            <span class="wf-info-value mono">${this._esc(asset.patrimonio || '-')}</span>
          </div>
          <div class="wf-info-row">
            <span class="wf-info-label">Serial</span>
            <span class="wf-info-value mono">${this._esc(asset.serial || '-')}</span>
          </div>
          <div class="wf-info-row">
            <span class="wf-info-label">Situação</span>
            <span class="wf-info-value"><span class="${statusClass}">${this._esc(statusLabel)}</span></span>
          </div>
          <div class="wf-info-row">
            <span class="wf-info-label">Localização</span>
            <span class="wf-info-value">${this._esc(asset.reparticao || '-')}</span>
          </div>
        </div>
      </div>
    `;
  },

  // ── Step 2: Selecionar Assistência ─────────────────────────────────────────

  _renderStep2() {
    const assistencias = window.WORKFLOW_CONFIG.assistencias || [];
    const selected = window.Workflow.workflowData.assistance;

    const cards = assistencias.map(a => {
      const isSelected = selected === a.id;
      return `
        <button class="wf-assistencia-card ${isSelected ? 'selected' : ''}"
                data-wf-assistencia="${a.id}">
          <span class="wf-assistencia-label">${this._esc(a.label)}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="workflow-step-body">
        <h3 class="workflow-step-title">Selecionar Assistência</h3>
        <p class="workflow-step-subtitle">Escolha a assistência responsável por este chamado.</p>

        <div class="wf-assistencia-grid">
          ${cards}
        </div>
      </div>
    `;
  },

  // ── Step 3: Checklist ──────────────────────────────────────────────────────

  _renderStep3() {
    const cl = window.Workflow.workflowData.checklist;
    const prioridades = window.WORKFLOW_CONFIG.prioridades || [];
    const tipos = window.WORKFLOW_CONFIG.tiposProblema || [];

    const prioridadeOptions = prioridades.map(p =>
      `<option value="${p.id}" ${cl.prioridade === p.id ? 'selected' : ''}>${this._esc(p.label)}</option>`
    ).join('');

    const tipoOptions = tipos.map(t =>
      `<option value="${t.id}" ${cl.tipoProblema === t.id ? 'selected' : ''}>${this._esc(t.label)}</option>`
    ).join('');

    return `
      <div class="workflow-step-body">
        <h3 class="workflow-step-title">Checklist Inicial</h3>
        <p class="workflow-step-subtitle">Preencha as informações sobre o problema identificado.</p>

        <div class="wf-form">
          <div class="wf-field">
            <label class="wf-label">Prioridade</label>
            <select class="wf-select" data-wf-field="prioridade">
              ${prioridadeOptions}
            </select>
          </div>

          <div class="wf-field">
            <label class="wf-label">Tipo do Problema <span class="wf-required">*</span></label>
            <select class="wf-select" data-wf-field="tipoProblema">
              <option value="">Selecione...</option>
              ${tipoOptions}
            </select>
          </div>

          <div class="wf-field">
            <label class="wf-label">Existe mau uso?</label>
            <div class="wf-toggle-group">
              <button class="wf-toggle ${cl.mauUso ? 'active' : ''}" data-wf-mauuso="true">Sim</button>
              <button class="wf-toggle ${!cl.mauUso ? 'active' : ''}" data-wf-mauuso="false">Não</button>
            </div>
          </div>

          ${cl.mauUso ? `
            <div class="wf-field" id="wf-mauuso-desc-field">
              <label class="wf-label">Descreva o mau uso</label>
              <textarea class="wf-textarea" data-wf-field="mauUsoDescricao"
                placeholder="Ex: Tela com manchas, carcaça quebrada, teclado danificado...">${this._esc(cl.mauUsoDescricao)}</textarea>
            </div>
          ` : ''}

          <div class="wf-field">
            <label class="wf-label">Observações</label>
            <textarea class="wf-textarea" data-wf-field="observations"
              placeholder="Informações adicionais sobre o problema...">${this._esc(window.Workflow.workflowData.observations)}</textarea>
          </div>
        </div>
      </div>
    `;
  },

  // ── Step 4: Confirmação ────────────────────────────────────────────────────

  _renderStep4() {
    const wd = window.Workflow.workflowData;
    const cl = wd.checklist;

    return `
      <div class="workflow-step-body">
        <h3 class="workflow-step-title">Confirmar Chamado</h3>
        <p class="workflow-step-subtitle">Revise os dados antes de criar o chamado no GLPI.</p>

        <div class="wf-summary">
          <div class="wf-summary-section">
            <h4 class="wf-summary-heading">Equipamento</h4>
            <div class="wf-summary-row"><span>Nome</span><span>${this._esc(wd.asset.nome || '-')}</span></div>
            <div class="wf-summary-row"><span>Patrimônio</span><span class="mono">${this._esc(wd.asset.patrimonio || '-')}</span></div>
            <div class="wf-summary-row"><span>Serial</span><span class="mono">${this._esc(wd.asset.serial || '-')}</span></div>
          </div>

          <div class="wf-summary-section">
            <h4 class="wf-summary-heading">Assistência</h4>
            <div class="wf-summary-row"><span>Responsável</span><span>${this._esc(window.Workflow.getAssistenciaLabel(wd.assistance))}</span></div>
          </div>

          <div class="wf-summary-section">
            <h4 class="wf-summary-heading">Checklist</h4>
            <div class="wf-summary-row"><span>Prioridade</span><span>${this._esc(window.Workflow.getPrioridadeLabel(cl.prioridade))}</span></div>
            <div class="wf-summary-row"><span>Tipo do problema</span><span>${this._esc(window.Workflow.getTipoProblemaLabel(cl.tipoProblema))}</span></div>
            <div class="wf-summary-row"><span>Mau uso</span><span>${cl.mauUso ? 'Sim' : 'Não'}</span></div>
            ${cl.mauUso && cl.mauUsoDescricao ? `<div class="wf-summary-row"><span>Descrição mau uso</span><span>${this._esc(cl.mauUsoDescricao)}</span></div>` : ''}
          </div>

          ${wd.observations ? `
            <div class="wf-summary-section">
              <h4 class="wf-summary-heading">Observações</h4>
              <p class="wf-summary-text">${this._esc(wd.observations)}</p>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  // ── Estado: Enviando ───────────────────────────────────────────────────────

  _renderSending() {
    return `
      <div class="workflow-step-body workflow-sending">
        <div class="wf-spinner"></div>
        <p>Criando chamado no GLPI...</p>
      </div>
    `;
  },

  // ── Estado: Concluído ──────────────────────────────────────────────────────

  _renderDone() {
    return `
      <div class="workflow-step-body workflow-done">
        <div class="wf-done-icon">&#10003;</div>
        <h3 class="workflow-step-title">Chamado Criado com Sucesso!</h3>
        <p class="workflow-step-subtitle">O chamado foi registrado no GLPI e vinculado ao equipamento.</p>
      </div>
    `;
  },

  // ── Footer (botões) ────────────────────────────────────────────────────────

  _renderFooter() {
    const s = window.Workflow.state;
    const isDone = s.currentStep === 5;
    const isSending = s.sending;
    const isFirst = s.currentStep <= 1;
    const isLast = s.currentStep === 4;

    if (isDone || isSending) return '';

    return `
      <div class="workflow-footer">
        ${!isFirst ? `<button class="workflow-btn-secondary" data-wf-nav="back">Voltar</button>` : '<div></div>'}
        ${isLast
          ? `<button class="workflow-btn-primary" data-wf-nav="submit" ${isSending ? 'disabled' : ''}>Criar Chamado</button>`
          : `<button class="workflow-btn-primary" data-wf-nav="next" ${!s.canAdvance ? 'disabled' : ''}>Próximo</button>`
        }
      </div>
    `;
  },

  _updateFooter() {
    const footerEl = this._modalEl.querySelector('.workflow-footer');
    if (footerEl) {
      footerEl.outerHTML = this._renderFooter();
    }
  },

  // ── Feedback ───────────────────────────────────────────────────────────────

  _renderFeedback() {
    const s = window.Workflow.state;
    if (!s.error) return '';

    return `<div class="workflow-feedback error">${this._esc(s.error)}</div>`;
  },

  _updateFeedback() {
    const existing = this._modalEl.querySelector('.workflow-feedback');
    if (existing) existing.remove();

    const feedbackHtml = this._renderFeedback();
    if (feedbackHtml) {
      const content = this._modalEl.querySelector('.workflow-content');
      if (content) {
        content.insertAdjacentHTML('afterbegin', feedbackHtml);
      }
    }
  },

  // ── Criação do Modal ───────────────────────────────────────────────────────

  _createModal() {
    if (this._modalEl) this._modalEl.remove();

    const div = document.createElement('div');
    div.id = 'workflow-modal';
    div.className = 'workflow-modal';
    div.innerHTML = `
      <div class="workflow-modal-backdrop" data-wf-close="backdrop"></div>
      <div class="workflow-dialog">
        <div class="workflow-header">
          <div class="workflow-header-left">
            <span class="workflow-header-icon">&#128196;</span>
            <div>
              <h2 class="workflow-header-title">Novo Chamado</h2>
              <p class="workflow-header-subtitle">Workflow de abertura de chamado</p>
            </div>
          </div>
          <button class="workflow-close-btn" data-wf-close="button">&times;</button>
        </div>

        ${this._renderProgressBar()}

        <div class="workflow-content"></div>

        ${this._renderFooter()}
      </div>
    `;

    document.body.appendChild(div);
    this._modalEl = div;
    document.body.classList.add('modal-open');
  },

  // ── Bind Events ────────────────────────────────────────────────────────────

  _bindStepEvents() {
    if (!this._modalEl) return;

    this._modalEl.querySelectorAll('[data-wf-close]').forEach(el => {
      el.addEventListener('click', () => window.Workflow.close());
    });

    this._modalEl.querySelectorAll('[data-wf-nav]').forEach(el => {
      el.addEventListener('click', () => {
        const action = el.dataset.wfNav;
        if (action === 'next') window.Workflow.next();
        else if (action === 'back') window.Workflow.back();
        else if (action === 'submit') window.Workflow.submit();
      });
    });

    this._modalEl.querySelectorAll('[data-wf-assistencia]').forEach(el => {
      el.addEventListener('click', () => {
        window.Workflow.setAssistencia(el.dataset.wfAssistencia);
      });
    });

    this._modalEl.querySelectorAll('[data-wf-field]').forEach(el => {
      el.addEventListener('input', () => {
        const field = el.dataset.wfField;
        const value = el.tagName === 'SELECT' ? el.value : el.value;

        if (field === 'prioridade') {
          window.Workflow.setPrioridade(value);
        } else if (field === 'observations') {
          window.Workflow.setObservations(value);
        } else {
          window.Workflow.setChecklistField(field, value);
        }
      });

      el.addEventListener('change', () => {
        const field = el.dataset.wfField;
        const value = el.value;

        if (field === 'prioridade') {
          window.Workflow.setPrioridade(value);
        } else if (field === 'tipoProblema') {
          window.Workflow.setChecklistField('tipoProblema', value);
        }
      });
    });

    this._modalEl.querySelectorAll('[data-wf-mauuso]').forEach(el => {
      el.addEventListener('click', () => {
        const value = el.dataset.wfMauuso === 'true';
        window.Workflow.setChecklistField('mauUso', value);
        this.render();
      });
    });
  },

  // ── Helpers ────────────────────────────────────────────────────────────────

  _esc(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};
