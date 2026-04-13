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
    if (!lista.length) return '<p class="empty-msg">Nenhum chamado encontrado.</p>';
    const statusLabel = { aberto: 'Aberto', em_andamento: 'Em andamento', pendente: 'Pendente', resolvido: 'Resolvido', fechado: 'Fechado' };
    const statusClass = { aberto: 'status-emprestado', em_andamento: 'status-manutencao', pendente: 'status-manutencao', resolvido: 'status-ativo', fechado: 'status-ativo' };
    const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
    const cards = lista.map(t => `
      <div class="asset-card">
        <div class="asset-card-header">
          <span class="asset-name">#${this._escapeHtml(String(t.id))} - ${this._escapeHtml(t.titulo || '')}</span>
          <span class="asset-status ${statusClass[t.status] || 'status-ativo'}">${statusLabel[t.status] || this._escapeHtml(t.status || '')}</span>
        </div>
        <div class="asset-card-body">
          ${t.ativo ? `<span class="asset-meta">Ativo: <strong>${this._escapeHtml(t.ativo)}</strong></span>` : ''}
          ${t.categoria ? `<span class="asset-meta">Categoria: <strong>${this._escapeHtml(t.categoria)}</strong></span>` : ''}
        </div>
        <div class="asset-card-footer">
          <a class="btn-glpi" href="${base}/front/ticket.form.php?id=${this._escapeHtml(String(t.id))}" target="_blank" rel="noopener">Abrir no GLPI</a>
        </div>
      </div>
    `).join('');
    return `<p class="result-count">${lista.length} chamado${lista.length !== 1 ? 's' : ''}</p><div class="asset-grid">${cards}</div>`;
  },

  renderSearchBar(placeholder = 'Buscar por nome, serial ou patrimonio...') {
    const q = window.STATE.search || '';
    const status = window.STATE.status || 'todos';
    return `
      <div class="search-bar-wrapper">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input class="search-input" id="global-search" type="text" placeholder="${this._escapeAttr(placeholder)}" value="${this._escapeAttr(q)}" autocomplete="off" spellcheck="false" />
          ${q ? '<button class="search-clear" id="search-clear" title="Limpar busca">✕</button>' : ''}
        </div>
        <div class="search-filters">
          ${['todos', 'ativo', 'manutencao', 'emprestado'].map(s => `<button class="filter-btn ${status === s ? 'active' : ''}" data-status="${s}">${this._labelStatus(s)}</button>`).join('')}
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

  _renderCard(a, tipo = 'generic') {
    const statusClass = { ativo: 'status-ativo', manutencao: 'status-manutencao', emprestado: 'status-emprestado' }[a.status] || 'status-ativo';
    const statusLabel = { ativo: 'Ativo', manutencao: 'Manutencao', emprestado: 'Emprestado' }[a.status] || 'Ativo';
    const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
    const formPath = tipo === 'impressora' ? 'front/printer.form.php' : 'front/computer.form.php';
    const glpiLink = a.glpiId ? `${base}/${formPath}?id=${a.glpiId}` : '#';
    const canExpand = tipo === 'computer' && !!a.glpiId;
    const infoLines = [];

    if (a.patrimonio) infoLines.push(`<div class="asset-info-line subtle">Patrimonio: ${this._escapeHtml(a.patrimonio)}</div>`);
    if (a.modelo) infoLines.push(`<div class="asset-info-line">Modelo: ${this._escapeHtml(a.modelo)}</div>`);
    if (a.reparticao) infoLines.push(`<div class="asset-info-line">Local: ${this._escapeHtml(a.reparticao)}</div>`);
    if (tipo === 'geekie' || tipo === 'apoio') {
      if (a.grupo) infoLines.push(`<div class="asset-info-line subtle">Grupo: ${this._escapeHtml(a.grupo)}</div>`);
    }

    return `
      <div class="asset-card">
        <div class="asset-card-header">
          <span class="asset-name">${this._highlight(a.nome || '-')}</span>
          <span class="asset-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="asset-card-body">
          <div class="asset-serial">${this._escapeHtml(a.serial || '-')}</div>
          ${infoLines.length ? `<div class="asset-info-group">${infoLines.join('')}</div>` : ''}
        </div>
        <div class="asset-card-footer">
          ${canExpand ? `<button class="btn-expand" data-computer-toggle="${a.glpiId}">Ver dados completos</button>` : ''}
          <a class="btn-glpi" href="${glpiLink}" target="_blank" rel="noopener">Abrir no GLPI</a>
          ${a.glpiId ? `<button class="btn-ticket" onclick='window.Tickets.openModal(${JSON.stringify(a).replace(/'/g, '&#39;')})'>Abrir chamado</button>` : ''}
        </div>
      </div>
    `;
  },

  renderComputerModal(asset, state) {
    const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
    if (!state || state.loading) {
      return `<div class="computer-modal-shell"><div class="computer-modal-header"><div><p class="computer-panel-kicker">Ficha do computador</p><h2>${this._escapeHtml(asset?.nome || 'Computador')}</h2></div><button class="computer-modal-close" data-computer-modal-close="button">Fechar</button></div><div class="computer-panel computer-panel-modal"><div class="computer-panel-message info">Carregando dados completos do GLPI...</div></div></div>`;
    }
    if (state.error && !state.data) {
      return `<div class="computer-modal-shell"><div class="computer-modal-header"><div><p class="computer-panel-kicker">Ficha do computador</p><h2>${this._escapeHtml(asset?.nome || 'Computador')}</h2></div><button class="computer-modal-close" data-computer-modal-close="button">Fechar</button></div><div class="computer-panel computer-panel-modal"><div class="computer-panel-message error">${this._escapeHtml(state.error)}</div><button class="btn-inline-secondary" data-computer-retry="${asset.glpiId}">Tentar novamente</button></div></div>`;
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
            <p class="computer-panel-kicker">Ficha do computador</p>
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
    const tabs = [
      { id: 'home', label: 'Home' },
      { id: 'computadores', label: 'Computadores' },
      { id: 'geekiees', label: 'Geekiees' },
      { id: 'apoio', label: 'Apoio' },
      { id: 'projetores', label: 'Projetores' },
      { id: 'impressoras', label: 'Impressoras' },
      { id: 'chamados', label: 'Chamados' },
      { id: 'assistente', label: 'Assistente' },
    ];
    return tabs.map(t => `<button class="tab-btn ${window.STATE.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
  },

  renderHome() {
    const D = window.DATA;
    const cats = [
      { label: 'Computadores', icon: '🖥️', lista: D.computadores, tab: 'computadores', cor: '#4f7ef7' },
      { label: 'Geekiees', icon: '📗', lista: D.chromebooksGeekiees, tab: 'geekiees', cor: '#00c896' },
      { label: 'Apoio', icon: '📘', lista: Object.values(D.chromebooksApoio || {}).flat(), tab: 'apoio', cor: '#6c5ce7' },
      { label: 'Projetores', icon: '📽️', lista: D.projetores, tab: 'projetores', cor: '#ffc107' },
      { label: 'Impressoras', icon: '🖨️', lista: D.impressoras, tab: 'impressoras', cor: '#ff5555' },
    ];
    const totalAtivos = cats.reduce((sum, cat) => sum + cat.lista.length, 0);
    const cards = cats.map(cat => {
      const total = cat.lista.length;
      const ativos = cat.lista.filter(a => a.status === 'ativo').length;
      const manut = cat.lista.filter(a => a.status === 'manutencao').length;
      const emprestado = cat.lista.filter(a => a.status === 'emprestado').length;
      return `<div class="home-card" data-tab="${cat.tab}" onclick="window.App.go('${cat.tab}')" style="cursor: pointer;"><div class="home-card-icon">${cat.icon}</div><div class="home-card-info"><h3>${this._escapeHtml(cat.label)}</h3><p class="home-card-total">${total} ativos</p><div class="home-card-pills"><span class="pill-ativo">${ativos} ativos</span>${manut ? `<span class="pill-manut">${manut} manutencao</span>` : ''}${emprestado ? `<span class="pill-emp">${emprestado} emprestado${emprestado > 1 ? 's' : ''}</span>` : ''}</div></div></div>`;
    }).join('');
    const chartSvg = this._renderPieChart(cats, totalAtivos);
    return `<div class="home-wrapper"><h2 class="section-title">Resumo de Ativos</h2><div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; margin-bottom: 24px;"><div style="display: flex; align-items: center; gap: 32px; flex-wrap: wrap;"><div style="flex-shrink: 0;">${chartSvg}</div><div style="flex: 1; min-width: 200px;"><h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">Distribuicao por Categoria</h3><div style="display: flex; flex-direction: column; gap: 10px;">${cats.map(cat => { const percentual = totalAtivos > 0 ? ((cat.lista.length / totalAtivos) * 100).toFixed(1) : 0; return `<div style="display: flex; align-items: center; gap: 10px;"><div style="width: 16px; height: 16px; background: ${cat.cor}; border-radius: 4px; flex-shrink: 0;"></div><span style="font-size: 14px; color: var(--text2); flex: 1;">${this._escapeHtml(cat.label)}</span><span style="font-size: 14px; font-weight: 600; color: var(--text);">${cat.lista.length}</span><span style="font-size: 13px; color: var(--text3); min-width: 45px; text-align: right;">(${percentual}%)</span></div>`; }).join('')}<div style="margin-top: 8px; padding-top: 12px; border-top: 1px solid var(--border); display: flex; justify-content: space-between;"><span style="font-size: 15px; font-weight: 600; color: var(--text);">Total</span><span style="font-size: 15px; font-weight: 700; color: var(--accent);">${totalAtivos} ativos</span></div></div></div></div></div><div class="home-grid">${cards}</div></div>`;
  },

  _renderPieChart(cats, total) {
    if (total === 0) return '<div style="width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; color: var(--text3); font-size: 14px;">Sem dados</div>';
    const size = 200;
    const center = size / 2;
    const radius = 80;
    let currentAngle = -90;
    const slices = cats.map(cat => {
      const angle = (cat.lista.length / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);
      const largeArcFlag = angle > 180 ? 1 : 0;
      const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
      return `<path d="${path}" fill="${cat.cor}" opacity="0.9" stroke="var(--surface)" stroke-width="2"/>`;
    }).join('');
    return `<svg width="200" height="200" viewBox="0 0 200 200" style="filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));">${slices}<circle cx="${center}" cy="${center}" r="50" fill="var(--surface)"/><text x="${center}" y="${center - 8}" text-anchor="middle" font-size="28" font-weight="700" fill="var(--text)">${total}</text><text x="${center}" y="${center + 12}" text-anchor="middle" font-size="13" fill="var(--text2)">ativos</text></svg>`;
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
