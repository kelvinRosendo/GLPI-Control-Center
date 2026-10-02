/**
 * Lista vertical compacta dos chamados das salas — apresentação das telas
 * estreitas (celular e tablet em retrato).
 *
 * Este módulo APENAS renderiza, como o Kanban e o modo TV:
 * - os dados vêm do relatório (`room-tickets.js`), que consulta o monitor
 *   compartilhado a cada 60 s; nenhuma consulta nova acontece aqui;
 * - os botões de atendimento usam exatamente as ações que o BACKEND declarou
 *   para o status do chamado (`card.actions`) e carregam `data-rt-move`, o
 *   mesmo atributo do Kanban. Quem abre o formulário é
 *   `RoomTicketsKanban.onClick`, ou seja, a lógica de assumir, mover e
 *   concluir NÃO é duplicada aqui;
 * - os filtros rápidos são os AGRUPAMENTOS DE STATUS JÁ DEFINIDOS PELO BACKEND
 *   (`RoomTicketsService::KANBAN_COLUMNS`), lidos de `data.kanban.columns`.
 *   Nenhum mapeamento novo é inventado aqui, e as contagens vêm das próprias
 *   colunas, que o servidor calcula sobre o conjunto filtrado inteiro.
 *
 * A aba "Todos" usa a paginação que já existe (`data.pagination` /
 * `data.items`) e deixa explícito o tamanho do conjunto, para que a primeira
 * página nunca seja apresentada como a lista completa.
 */
window.RoomTicketsList = (() => {
  'use strict';

  const TYPES = { projector: 'Projetor', pc: 'PC', mouse: 'Mouse', keyboard: 'Teclado',
    chromebook: 'Chromebook', cart: 'Carrinho', other: 'Outros', unknown: 'Não identificado' };
  // Rótulos do status exatamente como o servidor os devolve
  // (RoomTicketsService::statusLabel). "Planejado" (3) e "Pendente" (4) são
  // status REAIS distintos dentro de "Em andamento" e nunca são fundidos.
  const STATUS_LABELS = {
    1: 'Novo', 2: 'Em atendimento', 3: 'Planejado',
    4: 'Pendente', 5: 'Resolvido', 6: 'Fechado',
  };
  const GROUPS = [
    { key: 'abertos', label: 'Abertos', tone: 'open' },
    { key: 'andamento', label: 'Em andamento', tone: 'progress' },
    { key: 'concluidos', label: 'Concluídos', tone: 'done' },
  ];
  const ALL = 'todos';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function formatDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/);
    return match ? match[3] + '/' + match[2] + '/' + match[1] + (match[4] ? ' ' + match[4] : '') : '—';
  }

  function isAll(group) { return !group || group === ALL; }

  /** Rótulo do status real: o do servidor quando existe, senão pelo `statusId`. */
  function statusLabel(item) {
    if (item?.statusLabel) return String(item.statusLabel);
    return STATUS_LABELS[Number(item?.statusId)] || 'Status desconhecido';
  }

  function statusTone(item) {
    if (Number(item?.statusId) === 4 || item?.waiting) return 'waiting';
    return { 1: 'open', 2: 'progress', 3: 'progress', 5: 'done', 6: 'done' }[Number(item?.statusId)] || 'unknown';
  }

  /**
   * Responsável: distingue o nome INFORMADO no GCC do técnico ATRIBUÍDO no
   * GLPI. Um aceite de alerta nunca vira responsável.
   */
  function ownerOf(item) {
    const work = item?.work || null;
    const assigned = work?.handlerName || '';
    if (assigned) {
      return {
        text: assigned,
        note: work.handlerSource === 'glpi_user'
          ? 'técnico do GLPI' + (work.glpiUserId ? ' · ID ' + work.glpiUserId : '')
          : 'informado no GCC, sem correspondência exata no GLPI',
        isGlpi: work.handlerSource === 'glpi_user',
      };
    }
    const glpi = item?.assignee?.name || '';
    if (glpi) {
      return { text: glpi, note: 'técnico do GLPI' + (item.assignee?.userId ? ' · ID ' + item.assignee.userId : ''), isGlpi: true };
    }
    return { text: '', note: '', isGlpi: false };
  }

  function equipmentOf(item) {
    const types = (item?.types || []).map(key => TYPES[key] || key).filter(Boolean);
    if (types.length) return types.join(', ');
    // Sem tipo identificado: o vínculo textual do chamado ainda é informação real.
    const assets = (item?.assets || []).map(asset => asset?.name).filter(Boolean);
    return assets.length ? assets.join(', ') : '';
  }

  /**
   * Um item da lista. `actions` só é preenchido quando o servidor publicou as
   * ações deste status (`card.actions`); sem elas, o item oferece apenas a
   * abertura dos detalhes — a interface nunca offers uma ação que o GLPI vá
   * recusar, nem improvisa uma que o servidor não declarou.
   */
  function itemHtml(item, options = {}) {
    const actions = Array.isArray(options.actions) ? options.actions : [];
    const owner = ownerOf(item);
    const equipment = equipmentOf(item);
    const room = String(item?.room || '').trim() || 'Sala não identificada';
    const reference = String(item?.reference || '').trim();
    const open = formatDate(item?.openedAt);
    const accepted = Boolean(item?.acknowledgement);
    const actionButtons = actions.map(entry =>
      '<button type="button" data-rt-move="' + esc(entry.action) + '" data-rt-ticket="' + esc(item.id) + '"' +
      ' class="rt-item-action' + (entry.kind === 'responsavel' || entry.kind === 'solucao' ? ' is-primary' : '') + '">' +
      esc(entry.label) + '</button>').join('');
    return '<li class="rt-item" data-rt-item="' + esc(item.id) + '">' +
      '<div class="rt-item-head">' +
      '<p class="rt-item-room">' + esc(room) + (item?.review ? ' <small>revisar</small>' : '') + '</p>' +
      '<span class="rt-status rt-status--' + statusTone(item) + '">' + esc(statusLabel(item)) + '</span>' +
      '</div>' +
      '<h3 class="rt-item-title">' + esc(item?.title || 'Sem título') + '</h3>' +
      '<p class="rt-item-ident">' +
      '<span class="rt-item-ref">#' + esc(item?.id) + (reference ? ' · ' + esc(reference) : '') + '</span>' +
      '<span class="rt-item-equip' + (equipment ? '' : ' is-empty') + '">' + esc(equipment || 'Equipamento não identificado') + '</span>' +
      '</p>' +
      '<p class="rt-item-owner' + (owner.text ? '' : ' is-empty') + '">' +
      '<span class="rt-item-owner-label">Responsável</span> ' +
      (owner.text ? esc(owner.text) + ' <small>' + esc(owner.note) + '</small>'
        : 'não definido' + (accepted ? ' <small>alerta aceito</small>' : '')) +
      '</p>' +
      '<p class="rt-item-open"><span class="rt-item-open-label">Abertura</span> ' + esc(open) + '</p>' +
      (item?.work?.solution
        ? '<p class="rt-item-solution"><span>Solução</span> ' + esc(item.work.solution)
          + (item.work.solutionInGlpi ? '' : ' <small>(não confirmada no GLPI)</small>') + '</p>'
        : '') +
      '<div class="rt-item-actions">' + actionButtons +
      '<button type="button" class="rt-item-detail" data-rt-ticket="' + esc(item?.id) + '">Detalhes</button>' +
      '</div></li>';
  }

  /** Filtros rápidos: as contagens vêm das colunas do próprio backend. */
  function chipsHtml(data, group) {
    const columns = data?.kanban?.columns || null;
    const counts = {};
    for (const meta of GROUPS) counts[meta.key] = columns?.[meta.key]?.count ?? null;
    const total = data?.pagination?.total ?? data?.summary?.total ?? 0;
    const chip = (key, label, count, tone) =>
      '<button type="button" data-rt-group="' + esc(key) + '" class="rt-chip rt-chip--' + tone + '"' +
      ' aria-pressed="' + (group === key ? 'true' : 'false') + '">' + esc(label) +
      (count === null ? '' : ' <span class="rt-chip-count">' + count + '</span>') + '</button>';
    return '<div class="rt-chips" role="group" aria-label="Filtros rápidos de status">' +
      GROUPS.map(meta => chip(meta.key, meta.label, counts[meta.key], meta.tone)).join('') +
      chip(ALL, 'Todos', total, 'all') + '</div>';
  }

  function groupNote(data, group) {
    const column = data?.kanban?.columns?.[group];
    const unmapped = Number(data?.kanban?.unmapped || 0);
    const shown = (column?.items || []).length;
    const count = Number(column?.count || 0);
    const parts = [];
    if (column) {
      parts.push('Exibindo ' + shown + ' de ' + count + ' chamado' + (count === 1 ? '' : 's')
        + ' nesta coluna, do conjunto consultado.');
    }
    if (unmapped) parts.push(unmapped + ' chamado' + (unmapped === 1 ? '' : 's') + ' com status fora dos três agrupamentos.');
    return parts.length ? '<p class="rt-list-note">' + parts.map(esc).join(' ') + '</p>' : '';
  }

  function moreButton(data, group) {
    const column = data?.kanban?.columns?.[group];
    if (!column?.hasMore) return '';
    const remaining = Math.max(0, Number(column.count || 0) - Number(column.shown || 0));
    return '<button type="button" class="rt-list-more" data-rt-action="more" data-rt-column="' + esc(group) + '">' +
      'Mostrar mais ' + remaining + '</button>';
  }

  function paginationHtml(data) {
    const pagination = data?.pagination;
    if (!pagination) return '';
    const page = Number(pagination.page || 1);
    const pages = Math.max(1, Number(pagination.pages || 1));
    const total = Number(pagination.total || 0);
    return '<div class="rt-pagination" role="group" aria-label="Paginação dos chamados">' +
      '<button type="button" data-rt-action="previous"' + (page <= 1 ? ' disabled' : '') + '>Anterior</button>' +
      '<span class="rt-pagination-info">Página ' + page + ' de ' + pages + ' · ' + total +
      ' chamado' + (total === 1 ? '' : 's') + ' no filtro</span>' +
      '<button type="button" data-rt-action="next"' + (page >= pages ? ' disabled' : '') + '>Próxima</button>' +
      '</div>';
  }

  function emptyHtml() {
    return '<p class="rt-list-empty" data-rt-empty="true">Nenhum chamado encontrado para estes filtros.</p>';
  }

  /**
   * `data.kanban` é a fonte dos filtros rápidos. Se uma resposta chegar sem
   * ele (por exemplo, um recorte antigo em cache), a lista usa a paginação
   * normal em vez de inventar um agrupamento.
   */
  function render(data, group) {
    if (!data) return '';
    const selected = isAll(group) ? ALL : group;
    const columns = data.kanban?.columns || null;
    const effective = (!columns || !GROUPS.some(meta => meta.key === selected)) ? ALL : selected;
    const column = effective === ALL ? null : data.kanban.columns[effective];
    const items = effective === ALL ? (data.items || []) : (column?.items || []);
    const period = formatDate(data.filters?.from) + ' a ' + formatDate(data.filters?.to);
    const total = data.kanban?.total ?? data.pagination?.total ?? 0;

    const body = items.length
      ? '<ul class="rt-list" data-rt-list="' + esc(effective) + '">' + items
        .map(item => itemHtml(item, { actions: effective === ALL ? [] : (item?.actions || []) })).join('') + '</ul>'
      : emptyHtml();

    return chipsHtml(data, effective) +
      '<p class="rt-list-scope">Período ' + esc(period) + ' · ' + total + ' chamado' + (total === 1 ? '' : 's') +
      ' no conjunto consultado · horário de Brasília</p>' +
      (effective === ALL
        ? '<p class="rt-list-note" data-rt-list-note="todos">Lista completa do filtro, '
          + ((data.items || []).length) + ' nesta página. Use os filtros rápidos acima para assumir, '
          + 'aguardar ou concluir direto no item.</p>'
        : groupNote(data, effective)) +
      body +
      (effective === ALL ? paginationHtml(data) : moreButton(data, effective));
  }

  function renderPhone(data, group) {
    const key = GROUPS.some(meta => meta.key === group) ? group : 'abertos';
    const column = data.kanban?.columns?.[key];
    const tabs = GROUPS.map(meta => '<button type="button" data-rt-group="' + meta.key +
      '" aria-pressed="' + (key === meta.key) + '">' +
      ({ abertos: 'Para atender', andamento: 'Em atendimento', concluidos: 'Concluídos' })[meta.key] +
      ' <small>' + (data.kanban?.columns?.[meta.key]?.count ?? 0) + '</small></button>').join('');
    if (!column) return '<p class="rt-message" role="status">Atualize para consultar a fila de atendimento.</p>';
    const items = column.items || [];
    return '<nav class="rt-phone-tabs" aria-label="Fila de chamados">' + tabs + '</nav>' +
      (items.length ? '<ul class="rt-phone-list">' + items.map(item => {
        const assume = (item.actions || []).find(action => action.action === 'assumir');
        const owner = item.work?.handlerName || item.assignee?.name || '';
        return '<li class="rt-phone-ticket" data-rt-item="' + Number(item.id) + '">' +
          '<div class="rt-phone-room"><strong>' + esc(item.room || 'Sala não identificada') + '</strong><small>#' + Number(item.id) + '</small></div>' +
          '<p>' + esc(item.title || 'Novo chamado') + '</p>' +
          '<small>' + esc(formatDate(item.openedAt)) + (owner ? ' · ' + esc(owner) : '') + '</small>' +
          '<div class="rt-phone-actions">' + (assume ? '<button type="button" class="rt-primary" data-rt-move="assumir" data-rt-ticket="' + Number(item.id) + '">Vou atender</button>' : '') +
          '<button type="button" data-rt-ticket="' + Number(item.id) + '">Detalhes</button></div></li>';
      }).join('') + '</ul>' : '<p class="rt-list-empty">' + (key === 'abertos' ? 'Nenhum chamado aguardando atendimento.' : 'Nenhum chamado nesta fila.') + '</p>') + moreButton(data, key);
  }

  return { render, renderPhone, GROUPS, ALL };
})();
