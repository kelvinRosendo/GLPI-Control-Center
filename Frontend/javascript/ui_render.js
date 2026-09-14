/**
 * GLPI Control Center - ui_render.js
 */

window.UI = {
  _filtrar(lista) {
    const q = (window.STATE.search || '').toLowerCase().trim();
    const status = window.STATE.status || 'todos';
    return lista.filter(a => {
      if (status !== 'todos' && a.status !== status) return false;
      if (q) {
        const campos = [a.nome, a.serial, a.patrimonio].map(v => (v || '').toLowerCase());
        if (!campos.some(c => c.includes(q))) return false;
      }
      return true;
    });
  },

  renderTickets(lista = []) {
    const search = (window.STATE.ticketSearch || '').toLowerCase().trim();
    const status = window.STATE.ticketStatus || 'todos';

    const statusLabel = {
      aberto: 'Aberto',
      em_andamento: 'Em andamento',
      pendente: 'Pendente',
      resolvido: 'Resolvido',
      fechado: 'Fechado',
    };

    const statusClass = {
      aberto: 'status-emprestado',
      em_andamento: 'status-manutencao',
      pendente: 'status-manutencao',
      resolvido: 'status-ativo',
      fechado: 'status-ativo',
    };

    const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');

    const filtrada = lista.filter(t => {
      if (status !== 'todos' && t.status !== status) return false;

      if (search) {
        const campos = [
          String(t.id || ''),
          t.titulo || '',
          t.ativo || '',
          t.categoria || '',
        ].map(v => v.toLowerCase());

        if (!campos.some(c => c.includes(search))) return false;
      }

      return true;
    });

    if (!lista.length) {
      return '<p class="empty-msg">Nenhum chamado encontrado.</p>';
    }

    const cards = filtrada.map(t => `
      <div class="asset-card">
        <div class="asset-card-header">
          <span class="asset-name">#${this._escapeHtml(String(t.id))} - ${this._escapeHtml(t.titulo || '')}</span>
          <span class="asset-status ${statusClass[t.status] || 'status-ativo'}">
            ${statusLabel[t.status] || this._escapeHtml(t.status || '')}
          </span>
        </div>

        <div class="asset-card-body">
          ${t.ativo ? `<span class="asset-meta">Ativo: <strong>${this._escapeHtml(t.ativo)}</strong></span>` : ''}
          ${t.categoria ? `<span class="asset-meta">Categoria: <strong>${this._escapeHtml(t.categoria)}</strong></span>` : ''}
        </div>

        <div class="asset-card-footer">
          <a class="btn-glpi" href="${base}/front/ticket.form.php?id=${this._escapeHtml(String(t.id))}" target="_blank" rel="noopener">
            Abrir no GLPI
          </a>
        </div>
      </div>
    `).join('');

    return `
      <div class="search-bar-wrapper">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input
            class="search-input"
            id="ticket-search"
            type="text"
            placeholder="Buscar chamado por numero, titulo, ativo ou categoria..."
            value="${this._escapeAttr(window.STATE.ticketSearch || '')}"
            autocomplete="off"
            spellcheck="false"
          />
          ${window.STATE.ticketSearch ? '<button class="search-clear" id="ticket-search-clear" title="Limpar busca">✕</button>' : ''}
        </div>

        <div class="search-filters">
          ${['todos', 'aberto', 'em_andamento', 'pendente', 'resolvido', 'fechado'].map(s => `
            <button class="filter-btn ${window.STATE.ticketStatus === s ? 'active' : ''}" data-ticket-status="${s}">
              ${s === 'todos' ? 'Todos' : (statusLabel[s] || s)}
            </button>
          `).join('')}
        </div>
      </div>

      <p class="result-count">${filtrada.length} de ${lista.length} chamado${lista.length !== 1 ? 's' : ''}</p>
      <div class="asset-grid">${cards || '<p class="empty-msg">Nenhum chamado encontrado para o filtro.</p>'}</div>
    `;
  },

    renderSearchBar(placeholder = 'Buscar por nome, serial ou patrimonio...') {
    const q = window.STATE.search || '';
    const status = window.STATE.status || 'todos';

    return `
      <div class="search-bar-wrapper">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input
            class="search-input"
            id="global-search"
            type="text"
            placeholder="${this._escapeAttr(placeholder)}"
            value="${this._escapeAttr(q)}"
            autocomplete="off"
            spellcheck="false"
          />
          ${q ? '<button class="search-clear" id="search-clear" title="Limpar busca">✕</button>' : ''}
        </div>

        <div class="search-filters">
          ${['todos', 'ativo', 'manutencao', 'emprestado'].map(s => `
            <button class="filter-btn ${status === s ? 'active' : ''}" data-status="${s}">
              ${this._labelStatus(s)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },


  _labelStatus(s) {
    return { todos: 'Todos', ativo: 'Ativo', manutencao: 'Manutencao', emprestado: 'Emprestado' }[s] || s;
  },

  _renderCount(total, filtrado) {
    if (window.STATE.search || window.STATE.status !== 'todos') {
      return `<p class="result-count">${filtrado} de ${total} ativo${total !== 1 ? 's' : ''} encontrado${filtrado !== 1 ? 's' : ''}</p>`;
    }
    return `<p class="result-count">${total} ativo${total !== 1 ? 's' : ''}</p>`;
  },

  renderSectionLoading(message = 'Carregando dados...') {
    return `
      <div class="empty-state-card">
        <h3>Buscando dados do GLPI</h3>
        <p>${this._escapeHtml(message)}</p>
      </div>
    `;
  },

  renderHomeLoading() {
    return `
      <div class="home-wrapper">
        <h2 class="section-title">Resumo de Ativos</h2>
        <div class="empty-state-card">
          <h3>Conectando ao GLPI</h3>
          <p>O painel ja foi aberto. Agora estamos carregando os ativos em segundo plano para liberar a navegacao mais rapido.</p>
        </div>
      </div>
    `;
  },

  _renderCard(a, tipo = 'generic') {
    const statusClass = { ativo: 'status-ativo', manutencao: 'status-manutencao', emprestado: 'status-emprestado', inativo: 'status-inativo', reservado: 'status-reservado' }[a.status] || 'status-ativo';
    const statusLabel = { ativo: 'Ativo', manutencao: 'Manutencao', emprestado: 'Emprestado', inativo: 'Inativo', reservado: 'Reservado' }[a.status] || 'Ativo';
    const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
    const isPrinter = tipo === 'impressora' || a.itemtype === 'Printer';
    const formPath = isPrinter ? 'front/printer.form.php' : 'front/computer.form.php';
    const rawGlpiLink = a.glpiId ? `${base}/${formPath}?id=${encodeURIComponent(String(a.glpiId))}` : '#';
    const glpiLink = window.Sanitization?.sanitizeUrl(rawGlpiLink) || '#';
    const canExpand = ['computer', 'geekie', 'apoio', 'projetor', 'impressora', 'generic'].includes(tipo) && !!a.glpiId;
    const infoLines = [];

    if (a.patrimonio) infoLines.push(`<div class="asset-info-line asset-info-highlight"><span class="asset-info-label">Patrimonio</span><span class="asset-info-value">${this._escapeHtml(a.patrimonio)}</span></div>`);
    if (a.modelo) infoLines.push(`<div class="asset-info-line"><span class="asset-info-label">Modelo</span><span class="asset-info-value">${this._escapeHtml(a.modelo)}</span></div>`);
    if (a.reparticao) infoLines.push(`<div class="asset-info-line"><span class="asset-info-label">Local</span><span class="asset-info-value">${this._escapeHtml(a.reparticao)}</span></div>`);
    if (tipo === 'geekie' || tipo === 'apoio') {
      if (a.grupo) infoLines.push(`<div class="asset-info-line asset-info-secondary"><span class="asset-info-label">Grupo</span><span class="asset-info-value">${this._escapeHtml(a.grupo)}</span></div>`);
    }

    // Impressoras: Fabricante
    let printerExtra = '';
    if (tipo === 'impressora') {
      const printerLines = [];
      if (a.fabricante) printerLines.push(`<div class="asset-info-line"><span class="asset-info-label">Fabricante</span><span class="asset-info-value">${this._escapeHtml(a.fabricante)}</span></div>`);
      if (printerLines.length) {
        printerExtra = `<div class="asset-info-group">${printerLines.join('')}</div>`;
      }
    }

    return `
      <div class="asset-card">
        <div class="asset-card-header">
          <span class="asset-name">${this._highlight(a.nome || '-')}</span>
          <span class="asset-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="asset-card-body">
          <div class="asset-serial">
            <span class="asset-serial-label">Serial</span>
            <span class="asset-serial-value">${this._escapeHtml(a.serial || '-')}</span>
          </div>
          ${infoLines.length ? `<div class="asset-info-group">${infoLines.join('')}</div>` : ''}
          ${printerExtra}
        </div>
        <div class="asset-card-footer">
          ${canExpand ? `<button class="btn-expand" data-computer-toggle="${a.glpiId}" data-itemtype="${this._escapeAttr(a.itemtype || 'Computer')}">Ver dados completos</button>` : ''}
          <a class="btn-glpi" href="${this._escapeHtml(glpiLink)}" target="_blank" rel="noopener noreferrer">Abrir no GLPI</a>
          ${a.glpiId ? `<button class="btn-ticket" data-open-workflow="${this._escapeHtml(String(a.glpiId))}" data-itemtype="${this._escapeAttr(a.itemtype || 'Computer')}">Abrir chamado</button>` : ''}
        </div>
      </div>
    `;
  },

  renderComputerModal(asset, state, itemtype = 'Computer') {
    const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
    const isPrinter = itemtype === 'Printer';
    const formPath = isPrinter ? 'front/printer.form.php' : 'front/computer.form.php';
    const glpiLink = asset.glpiId ? `${base}/${formPath}?id=${encodeURIComponent(String(asset.glpiId))}` : '#';

    if (!state || state.loading) {
      return `<div class="computer-modal-shell"><div class="computer-modal-header"><div><p class="computer-panel-kicker">Ficha completa do ativo</p><h2>${this._escapeHtml(asset?.nome || 'Ativo')}</h2></div><button class="computer-modal-close" data-computer-modal-close="button">Fechar</button></div><div class="computer-panel computer-panel-modal"><div class="computer-panel-message info">Carregando dados completos do GLPI...</div></div></div>`;
    }
    if (state.error && !state.data) {
      return `<div class="computer-modal-shell"><div class="computer-modal-header"><div><p class="computer-panel-kicker">Ficha completa do ativo</p><h2>${this._escapeHtml(asset?.nome || 'Ativo')}</h2></div><button class="computer-modal-close" data-computer-modal-close="button">Fechar</button></div><div class="computer-panel computer-panel-modal"><div class="computer-panel-message error">${this._escapeHtml(state.error)}</div><button class="btn-inline-secondary" data-computer-retry="${asset.glpiId}">Tentar novamente</button></div></div>`;
    }

    const detail = state.data;
    const draft = state.draft || detail.editableValues || {};
    const sections = (detail.sections || []).map(section => `
      <section class="computer-section">
        <div class="computer-section-header"><h4>${this._escapeHtml(section.title)}</h4></div>
        <div class="computer-fields-grid">${(section.fields || []).map(field => this._renderDetailField(field, draft)).join('')}</div>
      </section>
    `).join('');

    const readOnlyHint = isPrinter
      ? 'Impressoras são somente leitura neste momento.'
      : 'Campos em azul podem ser editados aqui. Relações e dropdowns continuam somente leitura por enquanto.';

    return `
      <div class="computer-modal-shell">
        <div class="computer-modal-header">
          <div>
            <p class="computer-panel-kicker">Ficha completa do ativo</p>
            <h2>${this._escapeHtml(detail.asset?.nome || asset.nome || 'Ativo')}</h2>
          </div>
          <div class="computer-modal-header-actions">
            <a class="btn-glpi" href="${this._escapeHtml(glpiLink)}" target="_blank" rel="noopener">Abrir no GLPI</a>
            <button class="computer-modal-close" data-computer-modal-close="button">Fechar</button>
          </div>
        </div>
        <div class="computer-panel computer-panel-modal">
          <div class="computer-panel-top">
            <div><h3>${this._escapeHtml(detail.asset?.nome || asset.nome || 'Ativo')}</h3></div>
            <div class="computer-summary-chip-group">
              ${detail.asset?.modelo ? `<span class="computer-summary-chip">${this._escapeHtml(detail.asset.modelo)}</span>` : ''}
              ${detail.asset?.reparticao ? `<span class="computer-summary-chip">${this._escapeHtml(detail.asset.reparticao)}</span>` : ''}
              <span class="computer-summary-chip">${this._escapeHtml(itemtype)}</span>
            </div>
          </div>
          ${state.successMessage ? `<div class="computer-panel-message success">${this._escapeHtml(state.successMessage)}</div>` : ''}
          ${state.error ? `<div class="computer-panel-message error">${this._escapeHtml(state.error)}</div>` : ''}
          ${isPrinter ? `
            <div class="computer-detail-form">
              ${sections}
              <div class="computer-panel-actions">
                <span class="computer-panel-hint">${readOnlyHint}</span>
              </div>
            </div>
          ` : `
            <form class="computer-detail-form" data-computer-form="${asset.glpiId}">
              ${sections}
              <div class="computer-panel-actions">
                <button type="submit" class="btn-save-inline" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Salvando...' : 'Salvar alterações'}</button>
                <span class="computer-panel-hint">${readOnlyHint}</span>
              </div>
            </form>
          `}
        </div>
      </div>
    `;
  },

  _renderDetailField(field, draft) {
    const value = draft?.[field.key] ?? field.value ?? '';
    if (field.editable) {
      if (field.inputType === 'textarea') {
        return `<label class="computer-field editable full"><span>${this._escapeHtml(field.label)}</span><textarea class="computer-input computer-input-textarea" data-computer-input="${field.key}" name="${this._escapeAttr(field.key)}" rows="4">${this._escapeHtml(value)}</textarea></label>`;
      }
      return `<label class="computer-field editable"><span>${this._escapeHtml(field.label)}</span><input class="computer-input" data-computer-input="${field.key}" type="text" name="${this._escapeAttr(field.key)}" value="${this._escapeAttr(value)}" /></label>`;
    }
    return `<div class="computer-field readonly"><span>${this._escapeHtml(field.label)}</span><div class="computer-readonly-value">${this._escapeHtml(field.displayValue || '-')}</div></div>`;
  },

  _highlight(texto) {
    const str = String(texto ?? '');
    const safeText = this._escapeHtml(str);
    const q = (window.STATE.search || '').trim();
    if (!q) return safeText;
    const normalizedQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normalizedText = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const idx = normalizedText.indexOf(normalizedQ);
    if (idx === -1) return safeText;
    let origIdx = 0;
    let normCount = 0;
    while (normCount < idx && origIdx < str.length) {
      const ch = str[origIdx];
      const decomposed = ch.normalize('NFD');
      normCount += decomposed.length;
      origIdx++;
    }
    const matchEnd = origIdx;
    let matchNormCount = 0;
    while (matchNormCount < normalizedQ.length && matchEnd < str.length) {
      const ch = str[matchEnd];
      const decomposed = ch.normalize('NFD');
      matchNormCount += decomposed.length;
      matchEnd++;
    }
    const before = this._escapeHtml(str.slice(0, origIdx));
    const match = this._escapeHtml(str.slice(origIdx, matchEnd));
    const after = this._escapeHtml(str.slice(matchEnd));
    return `${before}<mark class="search-highlight">${match}</mark>${after}`;
  },

  renderTabs() {
    // Usar módulos visíveis do perfil do usuário
    let tabs = [];
    if (window.UserContext?.isAuthenticated()) {
      const visibleModules = window.UserContext.getVisibleModules();
      tabs = visibleModules.map(mod => ({
        id: mod.key,
        label: mod.label,
      }));
    } else {
      // Fallback: todos os módulos (para quando não autenticado)
      tabs = [
        { id: 'home', label: 'Home' },
        { id: 'computadores', label: 'Computadores' },
        { id: 'geekiees', label: 'Geekiees' },
        { id: 'apoio', label: 'Carrinhos' },
        { id: 'projetores', label: 'Projetores' },
        { id: 'impressoras', label: 'Impressoras' },
        { id: 'chamados', label: 'Chamados' },
        { id: 'relatorios', label: 'Relatórios' },
        { id: 'auditoria', label: 'Auditoria' },
        { id: 'assistente', label: 'Assistente' },
      ];
    }
    return tabs.map(t => `<button class="tab-btn ${window.STATE.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
  },

  renderAssetList(lista, placeholder, tipo = 'generic') {
    const filtrada = this._filtrar(lista);
    const cardsHtml = filtrada.length ? filtrada.map(a => this._renderCard(a, tipo)).join('') : '<p class="empty-msg">Nenhum ativo encontrado para a busca.</p>';
    return `${this.renderSearchBar(placeholder)}${this._renderCount(lista.length, filtrada.length)}<div class="asset-grid">${cardsHtml}</div>`;
  },

  renderCarrinhos() {
    const carrinhos = window.DATA.chromebooksApoio || {};
    const cartNames = Object.keys(carrinhos).sort();
    const totalGeral = Object.values(carrinhos).flat().length;

    if (cartNames.length === 0) {
      return `
        <div class="search-bar-wrapper">${this.renderSearchBar('Buscar Chromebook por nome, serial...')}</div>
        <p class="result-count">0 carrinhos</p>
        <p class="empty-msg">Nenhum carrinho encontrado no GLPI.</p>
      `;
    }

    const cols = cartNames.map(nome => {
      const lista = carrinhos[nome];
      const filtrada = this._filtrar(lista);
      const items = filtrada.length ? filtrada.map(a => this._renderCard(a, 'apoio')).join('') : '<p class="empty-msg">Nenhum resultado.</p>';
      return `<div class="carrinho-col"><h3 class="carrinho-title">${this._escapeHtml(nome)} <span class="carrinho-count">${filtrada.length}/${lista.length}</span></h3><div class="carrinho-list">${items}</div></div>`;
    }).join('');

    const totalFiltrado = Object.values(carrinhos).flat().filter(a => {
      const status = window.STATE.status || 'todos';
      const q = (window.STATE.search || '').toLowerCase().trim();
      if (status !== 'todos' && a.status !== status) return false;
      if (q) {
        const campos = [a.nome, a.serial, a.patrimonio].map(v => (v || '').toLowerCase());
        if (!campos.some(c => c.includes(q))) return false;
      }
      return true;
    }).length;

    return `${this.renderSearchBar('Buscar Chromebook por nome, serial...')}${this._renderCount(totalGeral, totalFiltrado)}<div class="carrinhos-grid">${cols}</div>`;
  },

  renderSalas() {
    const salas = window.DATA.chromebooksSalas || {};
    const salaNames = Object.keys(salas).sort();
    const totalGeral = Object.values(salas).flat().length;

    if (salaNames.length === 0) {
      return `
        <div class="search-bar-wrapper">${this.renderSearchBar('Buscar Chromebook por nome, serial...')}</div>
        <p class="result-count">0 salas/turmas</p>
        <p class="empty-msg">Nenhuma sala/turma encontrada no GLPI.</p>
      `;
    }

    const cols = salaNames.map(nome => {
      const lista = salas[nome];
      const filtrada = this._filtrar(lista);
      const items = filtrada.length ? filtrada.map(a => this._renderCard(a, 'apoio')).join('') : '<p class="empty-msg">Nenhum resultado.</p>';
      return `<div class="carrinho-col"><h3 class="carrinho-title">${this._escapeHtml(nome)} <span class="carrinho-count">${filtrada.length}/${lista.length}</span></h3><div class="carrinho-list">${items}</div></div>`;
    }).join('');

    const totalFiltrado = Object.values(salas).flat().filter(a => {
      const status = window.STATE.status || 'todos';
      const q = (window.STATE.search || '').toLowerCase().trim();
      if (status !== 'todos' && a.status !== status) return false;
      if (q) {
        const campos = [a.nome, a.serial, a.patrimonio].map(v => (v || '').toLowerCase());
        if (!campos.some(c => c.includes(q))) return false;
      }
      return true;
    }).length;

    return `${this.renderSearchBar('Buscar Chromebook por nome, serial...')}${this._renderCount(totalGeral, totalFiltrado)}<div class="carrinhos-grid">${cols}</div>`;
  },

  _escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  _escapeAttr(value) {
    return this._escapeHtml(value);
  },

  /**
   * Renderiza seção de classificação do ativo no modal de detalhes.
   */
  renderClassificationSection(asset) {
    if (!asset || !asset.category) return '';

    const confidence = asset.classificationConfidence ?? 0;
    let confidenceClass = 'high';
    let confidenceLabel = 'Alta';
    if (confidence < 0.7) {
      confidenceClass = 'low';
      confidenceLabel = 'Baixa';
    } else if (confidence < 0.9) {
      confidenceClass = 'medium';
      confidenceLabel = 'Média';
    }

    const warnings = asset.classificationWarnings ?? [];
    const warningsHtml = warnings.length > 0
      ? `<div class="classification-warnings">${warnings.map(w => `<div class="warning-item">⚠ ${this._escapeHtml(w)}</div>`).join('')}</div>`
      : '';

    return `
      <section class="computer-section">
        <div class="computer-section-header"><h4>Classificação</h4></div>
        <div class="computer-fields-grid">
          <div class="computer-field readonly">
            <span>Categoria</span>
            <div class="computer-readonly-value">${this._escapeHtml(asset.categoryLabel || asset.category || '-')}</div>
          </div>
          <div class="computer-field readonly">
            <span>Finalidade</span>
            <div class="computer-readonly-value">${this._escapeHtml(asset.purpose || '-')}</div>
          </div>
          <div class="computer-field readonly">
            <span>Confiança</span>
            <div class="computer-readonly-value">
              <span class="classification-confidence classification-confidence-${confidenceClass}">${confidenceLabel}</span>
              <span class="classification-confidence-value">(${Math.round(confidence * 100)}%)</span>
            </div>
          </div>
          <div class="computer-field readonly">
            <span>Fonte</span>
            <div class="computer-readonly-value">${this._escapeHtml(asset.classificationSource || '-')}</div>
          </div>
          <div class="computer-field readonly">
            <span>Versão da regra</span>
            <div class="computer-readonly-value">${this._escapeHtml(asset.classificationVersion || '-')}</div>
          </div>
          <div class="computer-field readonly">
            <span>Grupo completo</span>
            <div class="computer-readonly-value">${this._escapeHtml(asset.groupPath || '-')}</div>
          </div>
          <div class="computer-field readonly">
            <span>Estado bruto</span>
            <div class="computer-readonly-value">${this._escapeHtml(asset.stateRaw || '-')}</div>
          </div>
          <div class="computer-field readonly">
            <span>Estado normalizado</span>
            <div class="computer-readonly-value">${this._escapeHtml(asset.stateSummary || '-')}</div>
          </div>
        </div>
        ${warningsHtml}
      </section>
    `;
  },

  /**
   * Renderiza dados brutos do GLPI para um ativo.
   */
  renderRawDataSection(raw) {
    if (!raw) return '';
    const escaped = this._escapeHtml(JSON.stringify(raw, null, 2));
    return `
      <section class="computer-section">
        <div class="computer-section-header"><h4>Dados brutos do GLPI</h4></div>
        <pre class="raw-data">${escaped}</pre>
      </section>
    `;
  },

  /**
   * Renderiza tabela de inventário com busca global, filtros, ordenação e paginação.
   * Busca na coleção completa → busca → filtros → ordenação → paginação.
   */
  renderInventoryTable() {
    const classified = window.DATA.classifiedAssets || [];
    if (classified.length === 0) {
      return `
        <div class="inventory-header">
          <h2>Inventario Geral</h2>
          <p>Execute uma sincronizacao para carregar os ativos do GLPI.</p>
        </div>
        <div class="empty-state-card">
          <h3>Nenhum ativo classificado</h3>
          <p>Execute uma sincronizacao para carregar os ativos do GLPI.</p>
        </div>
      `;
    }

    const q = (window.STATE.search || '').trim();
    const catFilter = window.STATE.categoryFilter || 'all';
    const itemTypeFilter = window.STATE.itemtypeFilter || 'all';
    const stateFilter = window.STATE.stateFilter || 'all';
    const sortField = window.STATE.inventorySort || 'name';
    const sortDir = window.STATE.inventorySortDir || 'asc';
    const hasActiveFilters = q || catFilter !== 'all' || itemTypeFilter !== 'all' || stateFilter !== 'all';

    let filtered = window.AssetClassifier.filterAssets(classified, {
      search: q || undefined,
      category: catFilter !== 'all' ? catFilter : undefined,
      itemtype: itemTypeFilter !== 'all' ? itemTypeFilter : undefined,
      stateSummary: stateFilter !== 'all' ? stateFilter : undefined,
    });

    const _sortCompare = (a, b) => {
      const va = (a[sortField] ?? '').toString().toLowerCase();
      const vb = (b[sortField] ?? '').toString().toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    };
    filtered.sort(_sortCompare);

    const page = window.STATE.inventoryPage || 1;
    const perPage = 25;
    const totalPages = Math.ceil(filtered.length / perPage);
    const paged = filtered.slice((page - 1) * perPage, page * perPage);

    const categories = window.AssetClassifier.getUniqueValues(classified, 'category');
    const itemtypes = window.AssetClassifier.getUniqueValues(classified, 'itemtype');
    const states = window.AssetClassifier.getUniqueValues(classified, 'stateSummary');

    const _sortIcon = (field) => {
      if (sortField !== field) return '';
      return sortDir === 'asc' ? ' &#9650;' : ' &#9660;';
    };

    const _th = (field, label) => `<th class="sortable-th${sortField === field ? ' sorted' : ''}" data-sort-field="${field}">${label}${_sortIcon(field)}</th>`;

    const _categoryBadge = (cat, label) => {
      const cls = this._escapeAttr(cat || 'unknown');
      return `<span class="badge badge-${cls}">${this._escapeHtml(label || cat || '-')}</span>`;
    };

    const rows = paged.map(a => `
      <tr class="inventory-row" data-asset-id="${this._escapeAttr(String(a.id))}" data-itemtype="${this._escapeAttr(a.itemtype || 'Computer')}">
        <td class="inv-name">${this._highlight(a.name || '-')}</td>
        <td class="inv-category">${_categoryBadge(a.category, a.categoryLabel)}</td>
        <td class="inv-itemtype">${this._escapeHtml(a.itemtype || '-')}</td>
        <td class="inv-state">${this._escapeHtml(a.stateSummary || '-')}</td>
        <td class="inv-group" title="${this._escapeAttr(a.groupPath || '')}">${this._escapeHtml(a.groupPath || '-')}</td>
        <td class="inv-serial">${this._escapeHtml(a.serial || '-')}</td>
        <td class="inv-actions">
          <button class="btn-expand btn-sm" data-computer-toggle="${a.id}" data-itemtype="${this._escapeAttr(a.itemtype || 'Computer')}">Ver dados completos</button>
        </td>
      </tr>
    `).join('');

    const paginationHtml = totalPages > 1 ? `
      <div class="inventory-pagination">
        <button class="btn-page" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&laquo; Anterior</button>
        <span class="page-info">Pagina ${page} de ${totalPages} (${filtered.length} ativos)</span>
        <button class="btn-page" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Proxima &raquo;</button>
      </div>
    ` : `<div class="inventory-pagination"><span class="page-info">${filtered.length} ativo${filtered.length !== 1 ? 's' : ''}</span></div>`;

    const clearFiltersBtn = hasActiveFilters
      ? '<button class="btn-clear-filters" id="clear-inventory-filters">Limpar filtros</button>'
      : '';

    return `
      <div class="inventory-header">
        <h2>Inventario Geral</h2>
        <p>${classified.length} ativos classificados no sistema</p>
      </div>
      <div class="inventory-toolbar">
        <div class="inventory-search">
          <span class="inventory-search-icon">&#128269;</span>
          <input type="text" class="inventory-search-input" id="inventory-search"
            placeholder="Buscar por nome, serial, patrimonio, grupo..."
            value="${this._escapeAttr(q)}" />
          ${q ? '<button class="inventory-search-clear" id="inventory-search-clear">&times;</button>' : ''}
        </div>
        <div class="inventory-filters">
          <select class="filter-select" id="filter-category">
            <option value="all">Todas categorias</option>
            ${categories.map(c => `<option value="${this._escapeAttr(c)}" ${catFilter === c ? 'selected' : ''}>${this._escapeHtml(c)}</option>`).join('')}
          </select>
          <select class="filter-select" id="filter-itemtype">
            <option value="all">Todos tipos</option>
            ${itemtypes.map(t => `<option value="${this._escapeAttr(t)}" ${itemTypeFilter === t ? 'selected' : ''}>${this._escapeHtml(t)}</option>`).join('')}
          </select>
          <select class="filter-select" id="filter-state">
            <option value="all">Todos estados</option>
            ${states.map(s => `<option value="${this._escapeAttr(s)}" ${stateFilter === s ? 'selected' : ''}>${this._escapeHtml(s)}</option>`).join('')}
          </select>
          ${clearFiltersBtn}
        </div>
      </div>
      <p class="inventory-count">${filtered.length} de ${classified.length} ativo${classified.length !== 1 ? 's' : ''}</p>
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              ${_th('name', 'Nome')}${_th('categoryLabel', 'Categoria')}${_th('itemtype', 'Tipo')}${_th('stateSummary', 'Estado')}${_th('groupPath', 'Grupo/Turma')}${_th('serial', 'Serial')}<th>Acoes</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7" class="empty-msg">Nenhum ativo encontrado.</td></tr>'}</tbody>
        </table>
      </div>
      ${paginationHtml}
    `;
  },

  /**
   * Renderiza indicadores de classificação no dashboard.
   */
  renderClassificationIndicators() {
    const D = window.DATA;
    const stats = D.classificationStats;
    if (!stats) return '';

    const sync = D.syncReport || {};
    const status = D.syncStatus || {};
    const lastSync = D.lastSuccessfulSync;
    const syncDate = lastSync ? new Date(lastSync).toLocaleString('pt-BR') : 'Nunca';

    let syncMessage = '';
    if (status.status === 'partial') {
      syncMessage = '<div class="sync-warning">⚠ A sincronização foi concluída parcialmente. Algumas categorias não puderam ser atualizadas.</div>';
    } else if (status.status === 'failed') {
      syncMessage = '<div class="sync-error">✖ A última sincronização falhou.</div>';
    }

    return `
      <div class="classification-indicators">
        <div class="classification-card">
          <h4>Classificação</h4>
          <div class="ind-grid">
            <div class="ind-item"><span class="ind-value">${stats.total}</span><span class="ind-label">Total</span></div>
            <div class="ind-item"><span class="ind-value">${stats.unclassified ?? 0}</span><span class="ind-label">Não classificados</span></div>
            <div class="ind-item"><span class="ind-value">${stats.warnings ?? 0}</span><span class="ind-label">Avisos</span></div>
            <div class="ind-item"><span class="ind-value">${syncDate}</span><span class="ind-label">Última sync</span></div>
          </div>
          ${syncMessage}
        </div>
      </div>
    `;
  },

  /**
   * Renderiza seção de aviso para ativos sem classificação.
   */
  renderUnclassifiedWarning() {
    const classified = window.DATA.classifiedAssets || [];
    const unclassified = classified.filter(a => a.category === 'unclassified');
    if (unclassified.length === 0) return '';

    return `
      <div class="unclassified-warning">
        <h4>Ativos não classificados (${unclassified.length})</h4>
        <p>Estes ativos precisam de revisão manual.</p>
        <div class="unclassified-list">
          ${unclassified.map(a => `
            <div class="unclassified-item">
              <span class="asset-name">${this._escapeHtml(a.name || '(sem nome)')}</span>
              <span class="asset-meta">${this._escapeHtml(a.serial || '')} ${this._escapeHtml(a.groupPath || '')}</span>
              ${a.classificationWarnings?.length ? `<span class="warning-item">⚠ ${this._escapeHtml(a.classificationWarnings[0])}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  /**
   * Renderiza seção de detalhes com classificação e dados brutos.
   */
  renderAssetDetailSections(asset) {
    if (!asset) return '';
    return this.renderClassificationSection(asset) + this.renderRawDataSection(asset._raw);
  },
};
