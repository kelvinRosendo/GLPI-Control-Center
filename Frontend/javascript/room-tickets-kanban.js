/**
 * Kanban dos chamados das salas.
 *
 * Apenas renderiza: os dados vêm do relatório (que consulta o monitor
 * compartilhado) e toda escrita passa pelo monitor, que confirma no servidor
 * antes de atualizar a tela.
 *
 * O formulário de atendimento vive em um <dialog> persistente fora da área que
 * é redesenhada a cada minuto: a atualização automática e o fim dos 15 s do
 * alerta nunca apagam o que está sendo digitado.
 */
window.RoomTicketsKanban = (() => {
  'use strict';

  const TYPES = { projector: 'Projetor', pc: 'PC', mouse: 'Mouse', keyboard: 'Teclado',
    chromebook: 'Chromebook', cart: 'Carrinho', other: 'Outros', unknown: 'Não identificado' };
  const STATUS_LABELS = {
    aberto: 'Novo', em_andamento: 'Em atendimento', pendente: 'Pendente (Aguardando)',
    resolvido: 'Resolvido', fechado: 'Fechado', desconhecido: 'Desconhecido',
  };
  const COLUMNS = [
    { key: 'abertos', label: 'Abertos', tone: 'open', hint: 'Novos no GLPI' },
    { key: 'andamento', label: 'Em andamento', tone: 'progress', hint: 'Em atendimento, planejado ou aguardando' },
    { key: 'concluidos', label: 'Concluídos', tone: 'done', hint: 'Resolvidos e fechados' },
  ];
  // Não há tabela de ações aqui de propósito: cada cartão traz as ações
  // válidas para o SEU status, calculadas no backend. Esta lista existe apenas
  // para o texto de explicação, nunca para gerar botões.

  let formDialog = null;
  let draft = null;
  let notice = null;
  let technicians = null;
  let techniciansLoaded = false;
  const busy = new Set();

  const monitor = () => window.RoomTicketsMonitor;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  /**
   * Ações disponíveis para o cartão, vindas do BACKEND (`card.actions`).
   * A tabela de transições é do servidor: a interface nunca offers uma ação que
   * o GLPI vá recusar, e botões e arraste usam exatamente a mesma lista.
   */
  function actionsOf(card) {
    if (Array.isArray(card?.actions) && card.actions.length) {
      return card.actions.filter(item => item && typeof item.action === 'string');
    }
    return [];
  }

  function actionFor(card, action) {
    return actionsOf(card).find(item => item.action === action) || null;
  }

  function formatDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/);
    return match ? match[3] + '/' + match[2] + '/' + match[1] + (match[4] ? ' ' + match[4] : '') : '—';
  }

  function operator() {
    return String(window.UserContext?.getUserName?.() || '').trim();
  }

  /** Quem está atendendo: registro do GCC e, quando conhecido, o ator do GLPI. */
  function ownerOf(card) {
    const work = card.work || null;
    const assigned = work?.handlerName || '';
    const glpi = card.assignee?.name || '';
    if (assigned) {
      const source = work.handlerSource === 'glpi_user'
        ? 'técnico do GLPI' : 'informado (sem correspondência no GLPI)';
      return { text: assigned, note: source, userId: work.glpiUserId || 0 };
    }
    if (glpi) return { text: glpi, note: 'técnico do GLPI', userId: card.assignee?.userId || 0 };
    return { text: '', note: '', userId: 0 };
  }

  function statusTone(card) {
    if (card.waiting) return 'waiting';
    return { 1: 'open', 2: 'progress', 3: 'progress', 4: 'waiting', 5: 'done', 6: 'done' }[card.statusId] || 'unknown';
  }

  function cardHtml(card, columnKey) {
    const owner = ownerOf(card);
    const ownerHtml = owner.text
      ? '<span class="rt-kanban-owner" title="' + esc(owner.note) + '">' +
        '<span class="rt-kanban-owner-label">Responsável</span> ' + esc(owner.text) +
        (owner.userId ? ' <small>(GLPI ' + owner.userId + ')</small>' : ' <small>(informado)</small>') +
        '</span>'
      : '<span class="rt-kanban-owner is-empty">Responsável não definido</span>';
    const types = (card.types || []).map(key => TYPES[key] || key).join(', ') || 'Equipamento não identificado';
    const pending = busy.has(Number(card.id));
    // Somente as ações que o backend declarou válidas para este status.
    const actions = actionsOf(card).map(item =>
      '<button type="button" class="rt-kanban-action' + (item.kind === 'responsavel' || item.kind === 'solucao' ? ' is-primary' : '') + '"' +
      ' data-rt-move="' + esc(item.action) + '" data-rt-ticket="' + esc(card.id) + '"' +
      (pending ? ' disabled' : '') + '>' + esc(item.label) + '</button>').join('');
    return '<article class="rt-kanban-card" draggable="true" tabindex="0" data-rt-card="' + esc(card.id) +
      '" data-rt-column="' + esc(columnKey) + '" aria-label="Chamado ' + esc(card.id) + ', ' + esc(card.room) + ', ' + esc(card.statusLabel || '') + '">' +
      '<header class="rt-kanban-card-head"><strong>#' + esc(card.id) + '</strong>' +
      '<span class="rt-status rt-status--' + statusTone(card) + '">' + esc(STATUS_LABELS[card.status] || card.status) + '</span></header>' +
      '<p class="rt-kanban-room">' + esc(card.room) + (card.review ? ' <small>revisar</small>' : '') + '</p>' +
      '<h3 class="rt-kanban-title">' + esc(card.title || 'Sem título') + '</h3>' +
      '<p class="rt-kanban-types">' + esc(types) + '</p>' +
      '<dl class="rt-kanban-meta"><div><dt>Abertura</dt><dd>' + esc(formatDate(card.openedAt)) + '</dd></div>' +
      (card.reference ? '<div><dt>Referência</dt><dd>' + esc(card.reference) + '</dd></div>' : '') + '</dl>' +
      ownerHtml +
      '<div class="rt-kanban-actions">' + actions +
      '<button type="button" class="rt-kanban-detail" data-rt-ticket="' + esc(card.id) + '">Detalhes</button></div>' +
      (card.work?.solution ? '<p class="rt-kanban-solution"><span>Solução</span> ' + esc(card.work.solution)
        + (card.work.solutionInGlpi ? '' : ' <small>(não confirmada no GLPI)</small>') + '</p>' : '') +
      '</article>';
  }

  function columnHtml(column, meta) {
    const cards = (column.items || []).map(card => cardHtml(card, column.key)).join('');
    const remaining = Math.max(0, (column.count || 0) - (column.shown || 0));
    return '<section class="rt-kanban-column rt-kanban-column--' + esc(meta.tone) + '" data-rt-column="' + esc(column.key) +
      '" aria-labelledby="rt-col-' + esc(column.key) + '">' +
      '<header class="rt-kanban-column-head"><h2 id="rt-col-' + esc(column.key) + '">' + esc(meta.label) + '</h2>' +
      '<span class="rt-kanban-count" data-rt-count="' + esc(column.key) + '">' + (column.count || 0) + '</span>' +
      '<p class="rt-kanban-hint">' + esc(meta.hint) + '</p></header>' +
      '<div class="rt-kanban-cards" data-rt-drop="' + esc(column.key) + '">' +
      (cards || '<p class="rt-kanban-empty">Nenhum chamado nesta coluna.</p>') + '</div>' +
      (column.hasMore
        ? '<button type="button" class="rt-kanban-more" data-rt-action="more" data-rt-column="' + esc(column.key) +
          '" data-rt-remaining="' + remaining + '">Mostrar mais ' + remaining + '</button>'
        : '') +
      '</section>';
  }

  /** Quadro completo. `data.kanban` traz contagens do conjunto inteiro. */
  function render(data) {
    const kanban = data?.kanban;
    if (!kanban?.columns) {
      return '<p class="rt-message">O quadro ainda não foi carregado.</p>';
    }
    const noticeHtml = notice
      ? '<p class="rt-message rt-' + (notice.tone === 'error' ? 'error' : 'ok') + '" role="' +
        (notice.tone === 'error' ? 'alert' : 'status') + '" data-rt-notice="' + esc(notice.tone) + '">' +
        esc(notice.text) + '</p>'
      : '';
    const total = kanban.total || 0;
    return noticeHtml +
      '<p class="rt-kanban-legend">Colunas e contagens do conjunto consultado (' + total +
      ' chamados' + (kanban.unmapped ? ', ' + kanban.unmapped + ' sem status conhecido' : '') +
      '). Exibindo até ' + (kanban.limit || 0) + ' por coluna. Arraste um cartão ou use os botões.</p>' +
      '<div class="rt-kanban" data-rt-kanban>' +
      COLUMNS.map(meta => {
        const column = kanban.columns[meta.key];
        if (!column) return '';
        return columnHtml(column, meta);
      }).join('') + '</div>';
  }

  // ── formulário persistente ──────────────────────────────────────────────

  /**
   * Diálogo de atendimento. Vive no `<body>`, fora de `.rt-dashboard`, então
   * a atualização automática nunca o redesenha. A centralização é explícita
   * (`.rt-action-form` em room-tickets.css) porque os estilos globais do GCC
   * zeram as margens de todos os elementos.
   */
  function ensureForm() {
    if (formDialog || typeof document === 'undefined') return formDialog;
    formDialog = document.createElement('dialog');
    formDialog.id = 'rt-action-form';
    formDialog.className = 'rt-action-form';
    formDialog.setAttribute('aria-labelledby', 'rt-action-form-title');
    // O formulário vive fora da área redesenhada: os eventos ficam ligados aqui.
    formDialog.addEventListener('click', event => { onClick(event); });
    formDialog.addEventListener('submit', event => { event.preventDefault(); submit(); });
    // `method="dialog"` fecha o diálogo no envio nativo; o preventDefault acima
    // evita isso, mas o `close` continua sendo tratado para segurança.
    formDialog.addEventListener('cancel', () => { draft = null; });
    document.body.appendChild(formDialog);
    return formDialog;
  }

  /** Identificador único desta INTENÇÃO do usuário. */
  function newRequestId() {
    return 'rt-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function selectHtml(selected) {
    const options = (technicians?.available && technicians.technicians.length)
      ? technicians.technicians.map(user =>
        '<option value="' + esc(user.name) + '"' + (user.name === selected ? ' selected' : '') + '>' +
        esc(user.name) + '</option>').join('')
      : '';
    const label = technicians?.available === false
      ? (technicians?.message || 'Lista de técnicos indisponível. Informe o nome.')
      : (options ? 'Selecione ou informe o nome' : 'Carregando técnicos…');
    return '<label class="rt-field">Quem do TI foi resolver o problema?' +
      '<select name="handlerChoice"' + (options ? '' : ' disabled') + ' data-rt-role="choice">' +
      '<option value="">' + esc(label) + '</option>' + options + '</select>' +
      '<input name="handler" maxlength="160" value="' + esc(selected) + '" ' +
      'placeholder="Nome de quem vai atender" data-rt-role="handler"></label>';
  }

  /**
   * Monta o formulário a partir do rascunho: sempre inclui o aviso de erro e a
   * explicação do servidor (conflito, permissão, dado inválido, falha parcial).
   */
  function formHtml() {
    if (!draft) return '';
    const head = '<header class="rt-form-head"><h2 id="rt-action-form-title">' + esc(draft.title) +
      ' #' + esc(draft.ticketId) + '</h2></header>';
    const ticket = draft.ticket || {};
    const error = draft.message
      ? '<div class="rt-message rt-error" role="alert" data-rt-form-error>' + esc(draft.message) +
        (draft.detail ? '<small class="rt-form-detail">' + esc(draft.detail) + '</small>' : '') + '</div>' : '';
    const actions = '<div class="rt-form-actions"><button type="submit" class="rt-primary">Confirmar</button>' +
      '<button type="button" data-rt-form-action="cancel">Cancelar</button></div>';
    if (draft.kind === 'assumir') {
      return '<form method="dialog" class="rt-form" data-rt-form="assumir">' + head +
        '<p class="rt-muted">' + esc(ticket.room) + ' · ' + esc(ticket.title || '') + '</p>' +
        selectHtml(draft.handler) +
        '<p class="rt-form-hint">O nome informado vira responsável do atendimento. Só é atribuído no GLPI quando existe correspondência exata com um técnico cadastrado. O autor do chamado no GLPI nunca é alterado.</p>' +
        error + actions + '</form>';
    }
    const body = draft.kind === 'concluir'
      ? '<label class="rt-field">Como o problema foi resolvido?' +
        '<textarea name="solution" rows="4" maxlength="4000" data-rt-role="solution">' + esc(draft.solution) +
        '</textarea></label>' +
        '<p class="rt-form-hint">A solução é registrada no histórico do chamado no GLPI e fica no histórico do GCC. Concluir move para Resolvido, sem fechar o chamado.</p>'
      : '<p class="rt-muted">O chamado muda de status no GLPI depois da confirmação do servidor.</p>';
    return '<form method="dialog" class="rt-form" data-rt-form="' + esc(draft.kind) + '">' + head + body +
      error + actions + '</form>';
  }

  /** Desenha o formulário sem perder o rascunho (também usado após uma falha). */
  function paint() {
    const dialog = ensureForm();
    if (!dialog || !draft) return null;
    // Foco e posição do cursor atravessam o redesenho.
    const focused = document.activeElement;
    const focusRole = focused && dialog.contains(focused) ? focused.getAttribute('data-rt-role') : null;
    const selection = focusRole === 'solution' && focused.selectionStart !== undefined
      ? { start: focused.selectionStart, end: focused.selectionEnd } : null;
    dialog.innerHTML = formHtml();
    if (!dialog.open) dialog.showModal();
    const target = focusRole ? dialog.querySelector('[data-rt-role="' + focusRole + '"]') : null;
    const initial = target || dialog.querySelector('[data-rt-role="handler"]')
      || dialog.querySelector('input, select, textarea, button');
    if (initial && typeof initial.focus === 'function') {
      initial.focus();
      if (selection && typeof initial.setSelectionRange === 'function') {
        try { initial.setSelectionRange(selection.start, selection.end); } catch { /* tipo sem seleção */ }
      }
    }
    return dialog;
  }

  function openAssume(ticket) {
    if (!ticket) return;
    const same = draft && draft.kind === 'assumir' && draft.ticketId === Number(ticket.id);
    // Reabrir o formulário é uma nova intenção: novo requestId.
    draft = { kind: 'assumir', ticketId: Number(ticket.id), ticket,
      title: 'Assumir chamado', handler: same ? draft.handler : (operator() || ''),
      message: same ? draft.message : '', detail: same ? draft.detail : '',
      requestId: same ? draft.requestId : newRequestId() };
    if (!techniciansLoaded) loadTechnicians();
    paint();
  }

  function openSolve(ticket, action) {
    if (!ticket) return;
    const kind = action === 'concluir' ? 'concluir' : action;
    const same = draft && draft.kind === kind && draft.ticketId === Number(ticket.id);
    const title = kind === 'concluir' ? 'Como o problema foi resolvido?'
      : kind === 'reabrir' ? 'Reabrir chamado'
      : kind === 'retomar' ? 'Retomar chamado' : 'Marcar como aguardando';
    draft = { kind, ticketId: Number(ticket.id), ticket, title,
      solution: same ? draft.solution : '', message: same ? draft.message : '',
      detail: same ? draft.detail : '', requestId: same ? draft.requestId : newRequestId() };
    paint();
  }

  async function loadTechnicians() {
    techniciansLoaded = true;
    try {
      const result = await monitor()?.technicians?.();
      if (result) technicians = result;
    } catch {
      technicians = { available: false, technicians: [], message: 'Não foi possível listar os técnicos. Informe o nome.' };
    }
    // Só redesenha se o formulário de assumir ainda estiver em preenchimento.
    if (draft?.kind === 'assumir' && formDialog?.open) {
      const handler = formDialog.querySelector('[data-rt-role="handler"]')?.value;
      if (handler !== undefined) draft.handler = handler;
      paint();
    }
  }

  function isOpen() { return Boolean(formDialog?.open); }
  function hasDraft() { return draft !== null; }

  /** Traduz a resposta do servidor em algo que o técnico consiga agir. */
  function explainFailure(failure) {
    const status = Number(failure?.status || 0);
    const meta = failure?.meta || {};
    const message = failure?.message || 'Não foi possível confirmar a alteração.';
    if (status === 409) {
      const lines = [message];
      if (meta.currentHandler) {
        lines.push('Responsável atual: ' + meta.currentHandler
          + (meta.currentStatusLabel ? ' (' + meta.currentStatusLabel + ')' : '') + '.');
      }
      if (Array.isArray(meta.allowedActions) && meta.allowedActions.length) {
        lines.push('O chamado mudou de estado. Agora é possível: '
          + meta.allowedActions.map(a => a.label).join(', ') + '.');
      }
      if (meta.reason === 'requestId_reused' || meta.reason === 'requestId_content_mismatch'
        || meta.reason === 'requestId_other_user') {
        lines.push('Feche e abra o formulário de novo para gerar uma operação válida.');
      }
      return { message: lines.join(' '), detail: '' };
    }
    if (status === 403) {
      return { message: 'Você não tem permissão para alterar chamados.', detail: message };
    }
    if (status === 422) {
      return { message: 'Revise o que foi informado.', detail: message };
    }
    if (status === 502 || meta.partial === true) {
      const applied = meta.applied || {};
      const steps = Array.isArray(meta.steps) ? meta.steps : [];
      const detail = [];
      if (meta.partial === true || applied.status === true) {
        detail.push('O status foi alterado no GLPI.');
      }
      for (const step of steps) {
        if (step.ok === false && step.label) detail.push('Falhou: ' + step.label + '.');
      }
      if (detail.length) {
        return {
          message: 'A alteração ficou pela metade. Confira o histórico do chamado antes de tentar de novo.',
          detail: detail.join(' '),
        };
      }
      return { message: 'O GLPI não confirmou a alteração; nada foi gravado.', detail: message };
    }
    return { message, detail: '' };
  }

  async function submit() {
    const dialog = formDialog;
    // O rascunho é capturado antes de qualquer espera: o navegador pode fechar
    // o diálogo durante o envio, e o tratamento da falha precisa continuar
    // com o que a pessoa digitou.
    const current = draft;
    if (!dialog || !current || busy.has(current.ticketId)) return;
    const form = dialog.querySelector('[data-rt-form]');
    if (!form) return;
    const handlerInput = form.querySelector('[data-rt-role="handler"]');
    const choice = form.querySelector('[data-rt-role="choice"]');
    const solutionInput = form.querySelector('[data-rt-role="solution"]');
    // Preserva o que está digitado, mesmo após uma falha.
    if (handlerInput) current.handler = handlerInput.value;
    if (choice && choice.value) current.handler = choice.value;
    if (solutionInput) current.solution = solutionInput.value;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    const ticketId = current.ticketId;
    const requestId = current.requestId || newRequestId();
    busy.add(ticketId);
    try {
      let result = null;
      if (current.kind === 'assumir') {
        if (!current.handler.trim()) throw new Error('Informe quem do TI foi resolver o problema.');
        result = await monitor()?.assume?.(current.ticket, current.handler.trim(), requestId);
      } else {
        if (current.kind === 'concluir' && current.solution.trim().length < 5) {
          throw new Error('Descreva como o problema foi resolvido para concluir o chamado.');
        }
        result = await monitor()?.move?.(current.ticket, current.kind, current.solution.trim(), requestId);
      }
      busy.delete(ticketId);
      notice = { tone: 'ok', text: result?.partial
        ? 'Movimentação parcial: o histórico do GLPI precisa ser conferido.'
        : 'Chamado #' + ticketId + ' atualizado no GLPI.' };
      if (draft === current) cancel();
      emitChange();
      return result;
    } catch (failure) {
      busy.delete(ticketId);
      // Estado anterior preservado: o rascunho continua e o erro fica visível.
      // O requestId é mantido para que reenviar ESTA operação não duplique
      // efeitos; abrir o formulário de novo gera outro.
      const explained = explainFailure(failure);
      current.message = explained.message;
      current.detail = explained.detail;
      if (draft !== current) return null;
      if (submitButton) submitButton.disabled = false;
      paint();
      return null;
    }
  }

  function cancel() {
    draft = null;
    formDialog?.close();
  }

  function emitChange() {
    if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
    document.dispatchEvent(new CustomEvent('roomtickets:kanban-change', {
      detail: { message: notice?.text || '' },
    }));
  }

  // ── eventos ─────────────────────────────────────────────────────────────

  /** Trata os cliques do Kanban. Devolve true quando o evento foi tratado. */
  function onClick(event) {
    const button = event.target.closest?.('button');
    if (!button) return false;
    if (button.dataset.rtFormAction === 'cancel') { cancel(); return true; }
    const form = event.target.closest?.('form[data-rt-form]');
    if (form && button.type === 'submit') { event.preventDefault(); submit(); return true; }
    if (!button.dataset.rtMove) return false;
    const ticketId = Number(button.dataset.rtTicket);
    const card = findCard(ticketId);
    if (!card) return true;
    // Só executa se o backend declarou esta ação como válida para o status.
    const action = actionFor(card, button.dataset.rtMove);
    if (!action) { notice = { tone: 'error', text: 'Esta ação não é válida para o status atual do chamado.' }; emitChange(); return true; }
    if (action.kind === 'responsavel') openAssume(card);
    else openSolve(card, action.action);
    return true;
  }

  function findCard(id) {
    const data = window.RoomTickets?.getData?.() || monitor()?.getData?.();
    for (const column of Object.values(data?.kanban?.columns || {})) {
      const found = (column.items || []).find(card => Number(card.id) === Number(id));
      if (found) return found;
    }
    return null;
  }

  let dragging = null;

  function onDragStart(event) {
    const card = event.target.closest?.('[data-rt-card]');
    if (!card) return;
    dragging = Number(card.dataset.rtCard);
    card.classList.add('is-dragging');
    if (event.dataTransfer) {
      try {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(dragging));
      } catch { /* arrasto sem payload */ }
    }
  }

  function onDragEnd(event) {
    const card = event.target.closest?.('[data-rt-card]');
    card?.classList.remove('is-dragging');
    for (const node of document.querySelectorAll('.rt-kanban-column.is-drop-target')) {
      node.classList.remove('is-drop-target');
    }
    dragging = null;
  }

  function onDragOver(event) {
    const target = event.target.closest?.('[data-rt-drop]');
    if (!target || dragging === null) return;
    event.preventDefault();
    target.closest('.rt-kanban-column')?.classList.add('is-drop-target');
  }

  function onDragLeave(event) {
    const target = event.target.closest?.('[data-rt-drop]');
    target?.closest('.rt-kanban-column')?.classList.remove('is-drop-target');
  }

  /**
   * Arrastar e soltar é complemento dos botões e usa a MESMA lista de ações
   * válida do backend. A ação de destino é escolhida a partir do que o
   * servidor aceita para o status atual, então nunca há conflito por botão
   * offered-but-refused.
   */
  function onDrop(event) {
    const target = event.target.closest?.('[data-rt-drop]');
    if (!target || dragging === null) return;
    event.preventDefault();
    const column = target.dataset.rtDrop;
    const card = findCard(dragging);
    for (const node of document.querySelectorAll('.rt-kanban-column.is-drop-target')) {
      node.classList.remove('is-drop-target');
    }
    const id = dragging;
    dragging = null;
    if (!card || column === card.column) return;
    // Alvo da coluna, na ordem de preferência; só entra se for válida.
    const wanted = {
      abertos: ['reabrir', 'assumir'],
      andamento: ['assumir', 'retomar', 'pendente'],
      concluidos: ['concluir'],
    }[column] || [];
    const action = wanted.map(name => actionFor(card, name)).find(Boolean);
    if (!action) {
      notice = { tone: 'error', text: 'Não há movimentação válida de #' + id + ' para esta coluna no status atual.' };
      emitChange();
      return;
    }
    if (action.kind === 'responsavel') openAssume(card);
    else openSolve(card, action.action);
  }

  return {
    render,
    onClick,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    isOpen,
    hasDraft,
    openAssume,
    openSolve,
    close: cancel,
    setNotice: value => { notice = value; },
    notice: () => notice,
    busyIds: () => Array.from(busy),
    columns: () => COLUMNS.map(column => column.key),
    /** Usado pelos testes: abre a tela de atendimento do cartão. */
    drop: (card, column) => {
      const wanted = {
        abertos: ['reabrir', 'assumir'],
        andamento: ['assumir', 'retomar', 'pendente'],
        concluidos: ['concluir'],
      }[column] || [];
      const action = wanted.map(name => actionFor(card, name)).find(Boolean);
      if (!action) return null;
      if (action.kind === 'responsavel') openAssume(card);
      else openSolve(card, action.action);
      return action.action;
    },
  };
})();
