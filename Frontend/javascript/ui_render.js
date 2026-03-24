/**
 * GLPI Control Center - ui_render.js
 * -----------------------------------------------------------------------------
 * Responsável por construir o HTML de cada tela.
 * Inclui lógica de filtro por busca (nome, serial, patrimônio) e status.
 */

window.UI = {

  // ── Helpers de filtro ──────────────────────────────────────────────────────

  /**
   * Filtra um array de ativos conforme o estado global (busca + status).
   */
  _filtrar(lista) {
    const q = (window.STATE.search || '').toLowerCase().trim();
    const status = (window.STATE.status || 'todos');

    return lista.filter(a => {
      // Filtro de status
      if (status !== 'todos' && a.status !== status) return false;

      // Filtro de busca (nome, serial, patrimônio)
      if (q) {
        const campos = [a.nome, a.serial, a.patrimonio].map(v => (v || '').toLowerCase());
        if (!campos.some(c => c.includes(q))) return false;
      }

      return true;
    });
  },

  // ── Chamados ──────────────────────────────────────────────────────────────

  renderTickets(lista = []) {
    if (!lista.length) {
      return `<p class="empty-msg">Nenhum chamado encontrado.</p>`;
    }

    const statusLabel = {
      aberto:       'Aberto',
      em_andamento: 'Em andamento',
      pendente:     'Pendente',
      resolvido:    'Resolvido',
      fechado:      'Fechado',
    };
    const statusClass = {
      aberto:       'status-emprestado',
      em_andamento: 'status-manutencao',
      pendente:     'status-manutencao',
      resolvido:    'status-ativo',
      fechado:      'status-ativo',
    };
    const prioLabel = {
      muito_baixa: '▽ Muito baixa',
      baixa:       '▽ Baixa',
      media:       '— Média',
      alta:        '△ Alta',
      muito_alta:  '△△ Muito alta',
    };

    const base  = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
    const cards = lista.map(t => `
      <div class="asset-card">
        <div class="asset-card-header">
          <span class="asset-name">#${t.id} — ${t.titulo}</span>
          <span class="asset-status ${statusClass[t.status] || 'status-ativo'}">
            ${statusLabel[t.status] || t.status}
          </span>
        </div>
        <div class="asset-card-body">
          ${t.ativo     ? `<span class="asset-meta">Ativo: <strong>${t.ativo}</strong></span>`         : ''}
          ${t.categoria ? `<span class="asset-meta">Categoria: <strong>${t.categoria}</strong></span>` : ''}
          <span class="asset-meta">Prioridade: <strong>${prioLabel[t.prioridade] || t.prioridade}</strong></span>
          ${t.abertura  ? `<span class="asset-meta">Aberto em: <strong>${t.abertura.substring(0, 10)}</strong></span>` : ''}
        </div>
        <div class="asset-card-footer">
          <a class="btn-glpi" href="${base}/front/ticket.form.php?id=${t.id}" target="_blank" rel="noopener">
            Abrir no GLPI ↗
          </a>
        </div>
      </div>
    `).join('');

    return `
      <p class="result-count">${lista.length} chamado${lista.length !== 1 ? 's' : ''}</p>
      <div class="asset-grid">${cards}</div>
    `;
  },

  // ── Barra de busca global ──────────────────────────────────────────────────

  /**
   * Retorna o HTML da barra de busca + filtro de status.
   * É injetada nas abas que têm lista de ativos.
   */
  renderSearchBar(placeholder = 'Buscar por nome, serial ou patrimônio…') {
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
            placeholder="${placeholder}"
            value="${q.replace(/"/g, '&quot;')}"
            autocomplete="off"
            spellcheck="false"
          />
          ${q ? `<button class="search-clear" id="search-clear" title="Limpar busca">✕</button>` : ''}
        </div>

        <div class="search-filters">
          ${['todos', 'ativo', 'manutencao', 'emprestado'].map(s => `
            <button
              class="filter-btn ${status === s ? 'active' : ''}"
              data-status="${s}"
            >${this._labelStatus(s)}</button>
          `).join('')}
        </div>
      </div>
    `;
  },

  _labelStatus(s) {
    return { todos: 'Todos', ativo: 'Ativo', manutencao: 'Manutenção', emprestado: 'Emprestado' }[s] || s;
  },

  // ── Badge de resultado ─────────────────────────────────────────────────────

  _renderCount(total, filtrado) {
    if (window.STATE.search || window.STATE.status !== 'todos') {
      return `<p class="result-count">${filtrado} de ${total} ativo${total !== 1 ? 's' : ''} encontrado${filtrado !== 1 ? 's' : ''}</p>`;
    }
    return `<p class="result-count">${total} ativo${total !== 1 ? 's' : ''}</p>`;
  },

  // ── Card de ativo ──────────────────────────────────────────────────────────

_renderCard(a, tipo = 'computer') {
  const statusClass = {
    ativo: 'status-ativo',
    manutencao: 'status-manutencao',
    emprestado: 'status-emprestado'
  }[a.status] || 'status-ativo';

  const statusLabel = {
    ativo: 'Ativo',
    manutencao: 'Manutenção',
    emprestado: 'Emprestado'
  }[a.status] || 'Ativo';

  const base = (window.CONFIG?.glpiUrl || '').replace(/\/$/, '');
  const formPath = tipo === 'impressora'
    ? 'front/printer.form.php'
    : 'front/computer.form.php';
  const glpiLink = a.glpiId ? `${base}/${formPath}?id=${a.glpiId}` : '#';

  const nomeHtml = this._highlight(a.nome || '—');

  const infoLines = [];

  // Serial sempre em destaque
  const serialHtml = `
    <div class="asset-serial">
      ${a.serial || '—'}
    </div>
  `;

  // Patrimônio só se existir
  if (a.patrimonio) {
    infoLines.push(`<div class="asset-info-line subtle">🏷 ${a.patrimonio}</div>`);
  }

  // Regras por tipo
  if (tipo === 'computer') {
    if (a.modelo) infoLines.push(`<div class="asset-info-line">💻 ${a.modelo}</div>`);
    if (a.reparticao) infoLines.push(`<div class="asset-info-line">📍 ${a.reparticao}</div>`);
  } else if (tipo === 'impressora') {
    if (a.modelo) infoLines.push(`<div class="asset-info-line">🖨️ ${a.modelo}</div>`);
    if (a.reparticao) infoLines.push(`<div class="asset-info-line">📍 ${a.reparticao}</div>`);
  } else if (tipo === 'projetor') {
    if (a.reparticao) infoLines.push(`<div class="asset-info-line">📍 ${a.reparticao}</div>`);
    if (a.modelo) infoLines.push(`<div class="asset-info-line">📽️ ${a.modelo}</div>`);
  } else if (tipo === 'geekie' || tipo === 'apoio') {
    if (a.modelo) infoLines.push(`<div class="asset-info-line">💻 ${a.modelo}</div>`);
    if (a.grupo) infoLines.push(`<div class="asset-info-line subtle">🏷 ${a.grupo}</div>`);
    if (a.reparticao) infoLines.push(`<div class="asset-info-line">📍 ${a.reparticao}</div>`);
  } else {
    if (a.modelo) infoLines.push(`<div class="asset-info-line">💻 ${a.modelo}</div>`);
    if (a.reparticao) infoLines.push(`<div class="asset-info-line">📍 ${a.reparticao}</div>`);
    if (a.grupo) infoLines.push(`<div class="asset-info-line subtle">🏷 ${a.grupo}</div>`);
  }

  return `
    <div class="asset-card">
      <div class="asset-card-header">
        <span class="asset-name">${nomeHtml}</span>
        <span class="asset-status ${statusClass}">${statusLabel}</span>
      </div>

      <div class="asset-card-body">
        ${serialHtml}
        ${infoLines.length ? `<div class="asset-info-group">${infoLines.join('')}</div>` : ''}
      </div>

      <div class="asset-card-footer">
        <a class="btn-glpi" href="${glpiLink}" target="_blank" rel="noopener">
          Abrir no GLPI ↗
        </a>

        ${a.glpiId ? `
        <button class="btn-ticket" onclick='window.Tickets.openModal(${JSON.stringify(a).replace(/'/g, "&#39;")})'>
          🎫 Abrir chamado
        </button>` : ''}
      </div>
    </div>
  `;
},

  /**
   * Destaca o termo buscado dentro de um texto (case-insensitive).
   */
  _highlight(texto) {
    const q = (window.STATE.search || '').trim();
    if (!q) return texto;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return texto.replace(re, '<mark class="search-highlight">$1</mark>');
  },

  // ── Abas ──────────────────────────────────────────────────────────────────

  renderTabs() {
    const tabs = [
      { id: 'home', label: '🏠 Home' },
      { id: 'computadores', label: '🖥️ Computadores' },
      { id: 'geekiees', label: '📗 Geekiees' },
      { id: 'apoio', label: '📘 Apoio' },
      { id: 'projetores', label: '📽️ Projetores' },
      { id: 'impressoras', label: '🖨️ Impressoras' },
      { id: 'chamados',    label: '🎫 Chamados' },
      { id: 'assistente', label: '🤖 Assistente' },
    ];

    return tabs.map(t => `
      <button
        class="tab-btn ${window.STATE.tab === t.id ? 'active' : ''}"
        data-tab="${t.id}"
      >${t.label}</button>
    `).join('');
  },

  // ── Home ──────────────────────────────────────────────────────────────────

  renderHome() {
    const D = window.DATA;
    const cats = [
      { label: 'Computadores', icon: '🖥️', lista: D.computadores, tab: 'computadores', cor: '#4f7ef7' },
      { label: 'Geekiees', icon: '📗', lista: D.chromebooksGeekiees, tab: 'geekiees', cor: '#00c896' },
      { label: 'Apoio', icon: '📘', lista: Object.values(D.chromebooksApoio || {}).flat(), tab: 'apoio', cor: '#6c5ce7' },
      { label: 'Projetores', icon: '📽️', lista: D.projetores, tab: 'projetores', cor: '#ffc107' },
      { label: 'Impressoras', icon: '🖨️', lista: D.impressoras, tab: 'impressoras', cor: '#ff5555' },
    ];

    // Calcula total de ativos
    const totalAtivos = cats.reduce((sum, cat) => sum + cat.lista.length, 0);

    const cards = cats.map(cat => {
      const total = cat.lista.length;
      const ativos = cat.lista.filter(a => a.status === 'ativo').length;
      const manut = cat.lista.filter(a => a.status === 'manutencao').length;
      const emprestado = cat.lista.filter(a => a.status === 'emprestado').length;

      return `
        <div class="home-card" data-tab="${cat.tab}" onclick="window.App.go('${cat.tab}')" style="cursor: pointer;">
          <div class="home-card-icon">${cat.icon}</div>
          <div class="home-card-info">
            <h3>${cat.label}</h3>
            <p class="home-card-total">${total} ativos</p>
            <div class="home-card-pills">
              <span class="pill-ativo">${ativos} ativos</span>
              ${manut ? `<span class="pill-manut">${manut} manutenção</span>` : ''}
              ${emprestado ? `<span class="pill-emp">${emprestado} emprestado${emprestado > 1 ? 's' : ''}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Gera gráfico de pizza SVG
    const chartSvg = this._renderPieChart(cats, totalAtivos);

    return `
      <div class="home-wrapper">
        <h2 class="section-title">Resumo de Ativos</h2>
        
        <!-- Gráfico de pizza -->
        <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; margin-bottom: 24px;">
          <div style="display: flex; align-items: center; gap: 32px; flex-wrap: wrap;">
            <!-- Canvas do gráfico -->
            <div style="flex-shrink: 0;">
              ${chartSvg}
            </div>
            
            <!-- Legenda -->
            <div style="flex: 1; min-width: 200px;">
              <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">Distribuição por Categoria</h3>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${cats.map(cat => {
                  const percentual = totalAtivos > 0 ? ((cat.lista.length / totalAtivos) * 100).toFixed(1) : 0;
                  return `
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="width: 16px; height: 16px; background: ${cat.cor}; border-radius: 4px; flex-shrink: 0;"></div>
                      <span style="font-size: 14px; color: var(--text2); flex: 1;">${cat.label}</span>
                      <span style="font-size: 14px; font-weight: 600; color: var(--text);">${cat.lista.length}</span>
                      <span style="font-size: 13px; color: var(--text3); min-width: 45px; text-align: right;">(${percentual}%)</span>
                    </div>
                  `;
                }).join('')}
                <div style="margin-top: 8px; padding-top: 12px; border-top: 1px solid var(--border); display: flex; justify-content: space-between;">
                  <span style="font-size: 15px; font-weight: 600; color: var(--text);">Total</span>
                  <span style="font-size: 15px; font-weight: 700; color: var(--accent);">${totalAtivos} ativos</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Cards de categorias -->
        <div class="home-grid">${cards}</div>
      </div>
    `;
  },

  // ── Renderiza gráfico de pizza SVG ────────────────────────────────────────

  _renderPieChart(cats, total) {
    if (total === 0) {
      return `<div style="width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; color: var(--text3); font-size: 14px;">Sem dados</div>`;
    }

    const size = 200;
    const center = size / 2;
    const radius = 80;
    let currentAngle = -90; // Começa no topo

    const slices = cats.map(cat => {
      const percentual = (cat.lista.length / total) * 100;
      const angle = (cat.lista.length / total) * 360;
      
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      // Calcula coordenadas do arco
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

    // Círculo central branco para fazer efeito de donut
    const innerCircle = `<circle cx="${center}" cy="${center}" r="50" fill="var(--surface)"/>`;

    // Texto central com total
    const centerText = `
      <text x="${center}" y="${center - 8}" text-anchor="middle" font-size="28" font-weight="700" fill="var(--text)">${total}</text>
      <text x="${center}" y="${center + 12}" text-anchor="middle" font-size="13" fill="var(--text2)">ativos</text>
    `;

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));">
        ${slices}
        ${innerCircle}
        ${centerText}
      </svg>
    `;
  },

  // ── Lista genérica ────────────────────────────────────────────────────────

  renderAssetList(lista, placeholder, tipo = 'computer') {
    const filtrada = this._filtrar(lista);
    const cardsHtml = filtrada.length
      ? filtrada.map(a => this._renderCard(a, tipo)).join('')
      : `<p class="empty-msg">Nenhum ativo encontrado para a busca.</p>`;

    return `
      ${this.renderSearchBar(placeholder)}
      ${this._renderCount(lista.length, filtrada.length)}
      <div class="asset-grid">${cardsHtml}</div>
    `;
  },

  // ── Carrinhos (Apoio) ─────────────────────────────────────────────────────

  renderCarrinhos() {
    const carrinhos = window.DATA.chromebooksApoio || {};
    const q = (window.STATE.search || '').toLowerCase().trim();
    const status = window.STATE.status || 'todos';

    // Total real (antes do filtro) — soma todos os carrinhos
    const totalGeral = Object.values(carrinhos).flat().length;

    const cols = Object.entries(carrinhos).map(([nome, lista]) => {
      const filtrada = this._filtrar(lista);
      const items = filtrada.length
        ? filtrada.map(a => this._renderCard(a)).join('')
        : `<p class="empty-msg">Nenhum resultado.</p>`;

      return `
        <div class="carrinho-col">
          <h3 class="carrinho-title">${nome} <span class="carrinho-count">${filtrada.length}/${lista.length}</span></h3>
          <div class="carrinho-list">${items}</div>
        </div>
      `;
    }).join('');

    const totalFiltrado = Object.values(carrinhos).flat().filter(a => {
      if (status !== 'todos' && a.status !== status) return false;
      if (q) {
        const campos = [a.nome, a.serial, a.patrimonio].map(v => (v || '').toLowerCase());
        if (!campos.some(c => c.includes(q))) return false;
      }
      return true;
    }).length;

    return `
      ${this.renderSearchBar('Buscar Chromebook por nome, serial…')}
      ${this._renderCount(totalGeral, totalFiltrado)}
      <div class="carrinhos-grid">${cols || '<p class="empty-msg">Nenhum carrinho encontrado.</p>'}</div>
    `;
  },
};
