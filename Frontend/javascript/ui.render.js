/**
 * GLPI Control Center - ui_render.js
 * -----------------------------------------------------------------------------
 * Responsável por:
 * - Renderizar as telas com base no estado (STATE) e dados (DATA)
 * - Construção dinâmica do HTML de cada aba
 *
 * Todos os dados vêm de window.DATA (carregado pelo GlpiClient — dados reais).
 */

window.UI = {

  /* ==========================================================================
     1) TABS
     ========================================================================== */

  renderTabs() {
    const tabs = [
      { id: 'home',        label: '🏠 Home' },
      { id: 'computadores',label: '💻 Computadores' },
      { id: 'geekiees',    label: '🟢 Chromebooks (Geekiees)' },
      { id: 'apoio',       label: '🔵 Chromebooks (Apoio)' },
      { id: 'projetores',  label: '📽️ Projetores' },
      { id: 'impressoras', label: '🖨️ Impressoras' },
    ];

    const bar = document.getElementById('tabs-bar');
    if (!bar) return;

    bar.innerHTML = tabs.map(tab => `
      <button
        class="tab-btn ${STATE.tab === tab.id ? 'active' : ''}"
        data-tab="${tab.id}">
        ${tab.label}
      </button>
    `).join('');

    bar.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => App.go(btn.getAttribute('data-tab')));
    });
  },


  /* ==========================================================================
     2) HOME
     ========================================================================== */

  renderHome() {
    const apoioTotal = Object.values(DATA.chromebooksApoio).flat().length;

    return `
      <div class="section-title">Visão Geral</div>
      <div class="home-grid">
        ${this.homeCard('💻', 'Computadores',          DATA.computadores.length,        'computadores')}
        ${this.homeCard('🟢', 'Chromebooks Geekiees',  DATA.chromebooksGeekiees.length, 'geekiees')}
        ${this.homeCard('🔵', 'Chromebooks Apoio',     apoioTotal,                      'apoio')}
        ${this.homeCard('📽️', 'Projetores',            DATA.projetores.length,          'projetores')}
        ${this.homeCard('🖨️', 'Impressoras',           DATA.impressoras.length,         'impressoras')}
      </div>
    `;
  },

  homeCard(icon, label, total, tab) {
    return `
      <div class="home-card" data-tab="${tab}" onclick="App.go('${tab}')">
        <div class="home-card-icon">${icon}</div>
        <div class="home-card-total">${total}</div>
        <div class="home-card-label">${label}</div>
      </div>
    `;
  },


  /* ==========================================================================
     3) LISTA PADRÃO DE ATIVOS
     ========================================================================== */

  renderAssetList(title, list) {
    if (!list || !list.length) {
      return `
        <div class="empty">
          <div class="empty-icon">📭</div>
          <h3>Nenhum ativo encontrado</h3>
        </div>
      `;
    }

    return `
      <div class="section-title">${title} <small>${list.length} itens</small></div>
      <div class="asset-grid">
        ${list.map(a => this.assetCard(a)).join('')}
      </div>
    `;
  },

  assetCard(a) {
    const reparticao = a.reparticao
      ? `<div class="asset-meta"><span>Local:</span> ${a.reparticao}</div>`
      : '';
    const modelo = a.modelo
      ? `<div class="asset-meta"><span>Modelo:</span> ${a.modelo}</div>`
      : '';

    return `
      <div class="asset-card">
        <div class="asset-card-header">
          <span class="asset-name">${a.nome}</span>
          ${this.statusBadge(a.status)}
        </div>

        <div class="asset-meta"><span>Serial:</span> ${a.serial || '—'}</div>
        <div class="asset-meta"><span>Patrimônio:</span> ${a.patrimonio || '—'}</div>
        ${reparticao}
        ${modelo}

        <a class="glpi-btn" target="_blank"
           href="${CONFIG.glpiUrl}/front/computer.form.php?id=${a.glpiId}">
          🔗 Abrir no GLPI
        </a>
      </div>
    `;
  },

  statusBadge(status) {
    const map = {
      ativo:      'Ativo',
      manutencao: 'Manutenção',
      emprestado: 'Emprestado',
    };
    return `<span class="status-badge ${status}">${map[status] ?? status}</span>`;
  },


  /* ==========================================================================
     4) CARRINHOS APOIO
     ========================================================================== */

  renderCarrinhos() {
    const carrinhos = DATA.chromebooksApoio;

    if (!carrinhos || !Object.keys(carrinhos).length) {
      return `
        <div class="empty">
          <div class="empty-icon">📭</div>
          <h3>Nenhum Chromebook de apoio encontrado</h3>
        </div>
      `;
    }

    let html = `
      <div class="section-title">🔵 Chromebooks Apoio / Empréstimo</div>
      <div class="carrinhos-grid">
    `;

    for (const [carrinho, items] of Object.entries(carrinhos)) {
      html += `
        <div class="carrinho-col">
          <div class="carrinho-header">
            <span class="carrinho-title">${carrinho}</span>
            <span class="carrinho-count">${items.length} dispositivos</span>
          </div>
          <div class="carrinho-cards">
            ${items.map(a => `
              <div class="carrinho-item">
                <div class="carrinho-item-header">
                  <span class="carrinho-item-name">${a.nome}</span>
                  ${this.statusBadge(a.status)}
                </div>
                <div class="carrinho-meta">Serial: ${a.serial || '—'}</div>
                <div class="carrinho-meta">Patrimônio: ${a.patrimonio || '—'}</div>
                <a class="mini-glpi-btn" target="_blank"
                   href="${CONFIG.glpiUrl}/front/computer.form.php?id=${a.glpiId}">
                  🔗 Abrir no GLPI
                </a>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  },


  /* ==========================================================================
     5) TELAS POR CATEGORIA
     ========================================================================== */

  renderComputadores() {
    return this.renderAssetList('💻 Computadores', DATA.computadores);
  },

  renderGeekiees() {
    return this.renderAssetList('🟢 Chromebooks Geekiees', DATA.chromebooksGeekiees);
  },

  renderProjetores() {
    return this.renderAssetList('📽️ Projetores', DATA.projetores);
  },

  renderImpressoras() {
    // Impressoras usam /Printer no GLPI — ajusta o link
    const impressoras = DATA.impressoras.map(p => ({
      ...p,
      _isPrinter: true,
    }));
    return this._renderAssetListPrinters('🖨️ Impressoras', impressoras);
  },

  // Variante para impressoras (link aponta para printer.form.php)
  _renderAssetListPrinters(title, list) {
    if (!list || !list.length) {
      return `
        <div class="empty">
          <div class="empty-icon">📭</div>
          <h3>Nenhuma impressora encontrada</h3>
        </div>
      `;
    }

    return `
      <div class="section-title">${title} <small>${list.length} itens</small></div>
      <div class="asset-grid">
        ${list.map(a => `
          <div class="asset-card">
            <div class="asset-card-header">
              <span class="asset-name">${a.nome}</span>
              ${this.statusBadge(a.status)}
            </div>
            <div class="asset-meta"><span>Serial:</span> ${a.serial || '—'}</div>
            <div class="asset-meta"><span>Patrimônio:</span> ${a.patrimonio || '—'}</div>
            ${a.reparticao ? `<div class="asset-meta"><span>Local:</span> ${a.reparticao}</div>` : ''}
            ${a.modelo     ? `<div class="asset-meta"><span>Modelo:</span> ${a.modelo}</div>` : ''}
            <a class="glpi-btn" target="_blank"
               href="${CONFIG.glpiUrl}/front/printer.form.php?id=${a.glpiId}">
              🔗 Abrir no GLPI
            </a>
          </div>
        `).join('')}
      </div>
    `;
  },


  /* ==========================================================================
     6) LOADING / ERRO
     ========================================================================== */

  renderLoading(msg = 'Carregando dados do GLPI…') {
    return `
      <div class="empty">
        <div class="empty-icon">⏳</div>
        <h3>${msg}</h3>
      </div>
    `;
  },

  renderError(errors = []) {
    const lista = errors.length
      ? `<ul style="margin-top:12px;color:var(--text3);font-size:13px;text-align:left;display:inline-block">
           ${errors.map(e => `<li>${e}</li>`).join('')}
         </ul>`
      : '';
    return `
      <div class="empty">
        <div class="empty-icon">⚠️</div>
        <h3>Erro ao carregar dados do GLPI</h3>
        <p style="margin-top:8px;color:var(--text3);font-size:13px;">
          Verifique se o backend PHP está rodando e o GLPI está acessível.
        </p>
        ${lista}
        <button
          onclick="App.reloadData()"
          style="margin-top:20px;padding:10px 24px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;">
          🔄 Tentar novamente
        </button>
      </div>
    `;
  },
};