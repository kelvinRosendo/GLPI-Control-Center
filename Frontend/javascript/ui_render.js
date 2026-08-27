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
    const statusClass = { ativo: 'status-ativo', manutencao: 'status-manutencao', emprestado: 'status-emprestado' }[a.status] || 'status-ativo';
    const statusLabel = { ativo: 'Ativo', manutencao: 'Manutencao', emprestado: 'Emprestado' }[a.status] || 'Ativo';
    const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
    const formPath = tipo === 'impressora' ? 'front/printer.form.php' : 'front/computer.form.php';
    const glpiLink = a.glpiId ? `${base}/${formPath}?id=${a.glpiId}` : '#';
    const canExpand = ['computer', 'geekie', 'apoio', 'projetor'].includes(tipo) && !!a.glpiId;
    const infoLines = [];

    if (a.patrimonio) infoLines.push(`<div class="asset-info-line asset-info-highlight"><span class="asset-info-label">Patrimonio</span><span class="asset-info-value">${this._escapeHtml(a.patrimonio)}</span></div>`);
    if (a.modelo) infoLines.push(`<div class="asset-info-line"><span class="asset-info-label">Modelo</span><span class="asset-info-value">${this._escapeHtml(a.modelo)}</span></div>`);
    if (a.reparticao) infoLines.push(`<div class="asset-info-line"><span class="asset-info-label">Local</span><span class="asset-info-value">${this._escapeHtml(a.reparticao)}</span></div>`);
    if (tipo === 'geekie' || tipo === 'apoio') {
      if (a.grupo) infoLines.push(`<div class="asset-info-line asset-info-secondary"><span class="asset-info-label">Grupo</span><span class="asset-info-value">${this._escapeHtml(a.grupo)}</span></div>`);
    }

    // Impressoras: IP e Fabricante
    let printerExtra = '';
    if (tipo === 'impressora') {
      const printerLines = [];
      if (a.ip) printerLines.push(`<div class="asset-info-line asset-info-ip"><span class="asset-info-label">&#127760; IP</span><span class="asset-info-value">${this._escapeHtml(a.ip)}</span></div>`);
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
          ${canExpand ? `<button class="btn-expand" data-computer-toggle="${a.glpiId}">Ver dados completos</button>` : ''}
          <a class="btn-glpi" href="${glpiLink}" target="_blank" rel="noopener">Abrir no GLPI</a>
          ${a.glpiId ? `<button class="btn-ticket" onclick='window.Workflow.open(${JSON.stringify(a).replace(/'/g, '&#39;')})'>Abrir chamado</button>` : ''}
        </div>
      </div>
    `;
  },

  renderComputerModal(asset, state) {
    const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
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

    return `
      <div class="computer-modal-shell">
        <div class="computer-modal-header">
          <div>
            <p class="computer-panel-kicker">Ficha completa do ativo</p>
            <h2>${this._escapeHtml(detail.asset?.nome || asset.nome || 'Ativo')}</h2>
          </div>
          <div class="computer-modal-header-actions">
            <a class="btn-glpi" href="${base}/front/computer.form.php?id=${asset.glpiId}" target="_blank" rel="noopener">Abrir no GLPI</a>
            <button class="computer-modal-close" data-computer-modal-close="button">Fechar</button>
          </div>
        </div>
        <div class="computer-panel computer-panel-modal">
          <div class="computer-panel-top">
            <div><h3>${this._escapeHtml(detail.asset?.nome || asset.nome || 'Ativo')}</h3></div>
            <div class="computer-summary-chip-group">
              ${detail.asset?.modelo ? `<span class="computer-summary-chip">${this._escapeHtml(detail.asset.modelo)}</span>` : ''}
              ${detail.asset?.reparticao ? `<span class="computer-summary-chip">${this._escapeHtml(detail.asset.reparticao)}</span>` : ''}
            </div>
          </div>
          ${state.successMessage ? `<div class="computer-panel-message success">${this._escapeHtml(state.successMessage)}</div>` : ''}
          ${state.error ? `<div class="computer-panel-message error">${this._escapeHtml(state.error)}</div>` : ''}
          <form class="computer-detail-form" data-computer-form="${asset.glpiId}">
            ${sections}
            <div class="computer-panel-actions">
              <button type="submit" class="btn-save-inline" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Salvando...' : 'Salvar alteracoes'}</button>
              <span class="computer-panel-hint">Campos em azul podem ser editados aqui. Relacoes e dropdowns continuam somente leitura por enquanto.</span>
            </div>
          </form>
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
    const safeText = this._escapeHtml(texto);
    const q = (window.STATE.search || '').trim();
    if (!q) return safeText;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return safeText.replace(re, '<mark class="search-highlight">$1</mark>');
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
    const q = (window.STATE.search || '').toLowerCase().trim();
    const status = window.STATE.status || 'todos';
    const totalGeral = Object.values(carrinhos).flat().length;
    const cols = Object.entries(carrinhos).map(([nome, lista]) => {
      const filtrada = this._filtrar(lista);
      const items = filtrada.length ? filtrada.map(a => this._renderCard(a, 'apoio')).join('') : '<p class="empty-msg">Nenhum resultado.</p>';
      return `<div class="carrinho-col"><h3 class="carrinho-title">${this._escapeHtml(nome)} <span class="carrinho-count">${filtrada.length}/${lista.length}</span></h3><div class="carrinho-list">${items}</div></div>`;
    }).join('');
    const totalFiltrado = Object.values(carrinhos).flat().filter(a => {
      if (status !== 'todos' && a.status !== status) return false;
      if (q) {
        const campos = [a.nome, a.serial, a.patrimonio].map(v => (v || '').toLowerCase());
        if (!campos.some(c => c.includes(q))) return false;
      }
      return true;
    }).length;
    return `${this.renderSearchBar('Buscar Chromebook por nome, serial...')}${this._renderCount(totalGeral, totalFiltrado)}<div class="carrinhos-grid">${cols || '<p class="empty-msg">Nenhum carrinho encontrado.</p>'}</div>`;
  },

  _escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  _escapeAttr(value) {
    return this._escapeHtml(value);
  },
};
