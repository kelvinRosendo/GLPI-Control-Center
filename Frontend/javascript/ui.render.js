/*
ui.render.js — Renderização de telas

        Responsável por montar o HTML da interface.
    renderizar tabs
    renderizar home cards
    renderizar listas por categoria
    renderizar os carrinhos (colunas scrolláveis)
    “atualizar UI” quando o state muda

        Exemplos:
    renderTabs()
    renderHome()
    renderCarrinhos()
    renderAssetGrid()

Ele pega o estado + dados e “desenha” a UI.
*/

/**
 * GLPI Control Center - ui.render.js
 * -----------------------------------------------------------------------------
 * Responsável por:
 * - Renderização das telas
 * - Construção dinâmica do HTML
 * - Leitura do STATE para decidir o que exibir
 */

window.UI = {

  /* ==========================================================================
     1) TABS
     ========================================================================== */

  renderTabs() {
    const tabs = [
      { id: "home", label: "🏠 Home" },
      { id: "computadores", label: "💻 Computadores" },
      { id: "geekiees", label: "🟢 Chromebooks (Geekiees)" },
      { id: "apoio", label: "🔵 Chromebooks (Apoio)" },
      { id: "projetores", label: "📽️ Projetores" },
      { id: "impressoras", label: "🖨️ Impressoras" }
    ];

    const bar = document.getElementById("tabs-bar");
    if (!bar) return;

    bar.innerHTML = tabs.map(tab => `
      <button 
        class="tab-btn ${STATE.tab === tab.id ? "active" : ""}" 
        data-tab="${tab.id}">
        ${tab.label}
      </button>
    `).join("");

    // Bind clique
    bar.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        App.go(tabId);
      });
    });
  },


  /* ==========================================================================
     2) HOME
     ========================================================================== */

  renderHome() {
    return `
      <div class="section-title">
        Visão Geral
      </div>

      <div class="home-grid">
        ${this.homeCard("💻", "Computadores", DEMO.computadores.length, "computadores")}
        ${this.homeCard("🟢", "Chromebooks Geekiees", DEMO.chromebooksGeekiees.length, "geekiees")}
        ${this.homeCard("🔵", "Chromebooks Apoio", this.countApoio(), "apoio")}
        ${this.homeCard("📽️", "Projetores", DEMO.projetores.length, "projetores")}
        ${this.homeCard("🖨️", "Impressoras", DEMO.impressoras.length, "impressoras")}
      </div>
    `;
  },

  homeCard(icon, label, total, tab) {
    return `
      <div class="home-card" data-tab="${tab}">
        <div class="home-card-icon">${icon}</div>
        <div class="home-card-total">${total}</div>
        <div class="home-card-label">${label}</div>
      </div>
    `;
  },

  countApoio() {
    return Object.values(DEMO.chromebooksApoio)
      .flat()
      .length;
  },


  /* ==========================================================================
     3) LISTA PADRÃO DE ATIVOS
     ========================================================================== */

  renderAssetList(title, list) {
    if (!list.length) {
      return `
        <div class="empty">
          <div class="empty-icon">📭</div>
          <h3>Nenhum ativo encontrado</h3>
        </div>
      `;
    }

    return `
      <div class="section-title">${title}</div>
      <div class="asset-grid">
        ${list.map(a => this.assetCard(a)).join("")}
      </div>
    `;
  },

  assetCard(a) {
    return `
      <div class="asset-card">
        <div class="asset-card-header">
          <span class="asset-name">${a.nome}</span>
          ${this.statusBadge(a.status)}
        </div>

        <div class="asset-meta">
          <span>Serial:</span> ${a.serial}
        </div>
        <div class="asset-meta">
          <span>Patrimônio:</span> ${a.patrimonio}
        </div>

        <a class="glpi-btn" target="_blank" 
           href="${CONFIG.glpiUrl}/front/computer.form.php?id=${a.glpiId}">
          🔗 Abrir no GLPI
        </a>
      </div>
    `;
  },

  statusBadge(status) {
    const map = {
      ativo: "Ativo",
      manutencao: "Manutenção",
      emprestado: "Emprestado"
    };

    return `
      <span class="status-badge ${status}">
        ${map[status] || status}
      </span>
    `;
  },


  /* ==========================================================================
     4) CARRINHOS APOIO
     ========================================================================== */

  renderCarrinhos() {
    let html = `
      <div class="section-title">
        🔵 Chromebooks Apoio / Empréstimo
      </div>

      <div class="carrinhos-grid">
    `;

    for (const [carrinho, items] of Object.entries(DEMO.chromebooksApoio)) {
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

                <div class="carrinho-meta">
                  Serial: ${a.serial}
                </div>

                <div class="carrinho-meta">
                  Patrimônio: ${a.patrimonio}
                </div>

                <a class="mini-glpi-btn"
                   target="_blank"
                   href="${CONFIG.glpiUrl}/front/computer.form.php?id=${a.glpiId}">
                  🔗 Abrir no GLPI
                </a>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  },


  /* ==========================================================================
     5) ROTEAMENTO DE TELAS
     ========================================================================== */

  renderComputadores() {
    return this.renderAssetList("💻 Computadores", DEMO.computadores);
  },

  renderGeekiees() {
    return this.renderAssetList("🟢 Chromebooks Geekiees", DEMO.chromebooksGeekiees);
  },

  renderProjetores() {
    return this.renderAssetList("📽️ Projetores", DEMO.projetores);
  },

  renderImpressoras() {
    return this.renderAssetList("🖨️ Impressoras", DEMO.impressoras);
  }

};