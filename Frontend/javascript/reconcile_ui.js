/**
 * Frontend/javascript/reconcile_ui.js
 * -----------------------------------------------------------------------------
 * UI de reconciliação entre GLPI e cache GCC.
 *
 * Exibe comparação de ativos: sincronizados, divergentes, apenas no GLPI,
 * apenas no GCC. Acessível pelo módulo de Auditoria.
 */

window.ReconcileUI = (function () {
  let _container = null;
  let _currentData = null;

  function render(container) {
    _container = container || document.getElementById('main-content');
    if (!_container) return;

    _container.innerHTML = `
      <div class="reconcile-page">
        <div class="reconcile-header">
          <h1 class="reconcile-title">Reconciliação GLPI × GCC</h1>
          <p class="reconcile-subtitle">Compara ativos do GLPI (fonte oficial) com o cache classificado do GCC.</p>
        </div>

        <div class="reconcile-controls">
          <select id="reconcile-category-filter" class="reconcile-select">
            <option value="">Todas as categorias</option>
          </select>
          <button id="reconcile-run-btn" class="reconcile-btn reconcile-btn--primary">
            Executar Comparação
          </button>
          <span id="reconcile-status" class="reconcile-status"></span>
        </div>

        <div id="reconcile-summary" class="reconcile-summary hidden"></div>
        <div id="reconcile-results" class="reconcile-results"></div>
      </div>
    `;

    _bindEvents();
    _loadCategories();
  }

  function _bindEvents() {
    const runBtn = document.getElementById('reconcile-run-btn');
    if (runBtn) {
      runBtn.addEventListener('click', _runComparison);
    }
  }

  async function _loadCategories() {
    try {
      const caps = await window.GlpiClient._fetch('/api/capabilities');
      const categories = caps?.data?.catalog?.categories || {};
      const select = document.getElementById('reconcile-category-filter');
      if (!select) return;

      Object.entries(categories).forEach(([code, label]) => {
        if (code === 'unclassified') return;
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = label;
        select.appendChild(opt);
      });
    } catch (e) {
      console.warn('ReconcileUI: erro ao carregar categorias', e);
    }
  }

  async function _runComparison() {
    const statusEl = document.getElementById('reconcile-status');
    const resultsEl = document.getElementById('reconcile-results');
    const summaryEl = document.getElementById('reconcile-summary');
    const categoryFilter = document.getElementById('reconcile-category-filter');

    if (!statusEl || !resultsEl) return;

    statusEl.textContent = 'Comparando...';
    statusEl.classList.add('reconcile-status--loading');
    resultsEl.innerHTML = '';
    if (summaryEl) summaryEl.classList.add('hidden');

    const category = categoryFilter?.value || '';
    const url = '/api/reconcile/compare' + (category ? `?category=${encodeURIComponent(category)}` : '');

    try {
      const response = await window.GlpiClient._fetch(url);
      _currentData = response?.data ?? null;

      if (!_currentData) {
        statusEl.textContent = 'Nenhum dado retornado.';
        statusEl.classList.remove('reconcile-status--loading');
        return;
      }

      statusEl.textContent = `Comparação concluída em ${_currentData.summary?.compared_at ? new Date(_currentData.summary.compared_at).toLocaleString('pt-BR') : 'agora'}`;
      statusEl.classList.remove('reconcile-status--loading');

      _renderSummary(summaryEl, _currentData.summary);
      _renderResults(resultsEl, _currentData);
    } catch (e) {
      statusEl.textContent = `Erro: ${e.message}`;
      statusEl.classList.remove('reconcile-status--loading');
    }
  }

  function _renderSummary(el, summary) {
    if (!el || !summary) return;

    el.innerHTML = `
      <div class="reconcile-summary-grid">
        <div class="reconcile-stat reconcile-stat--total">
          <span class="reconcile-stat-value">${summary.total_glpi ?? 0}</span>
          <span class="reconcile-stat-label">GLPI</span>
        </div>
        <div class="reconcile-stat reconcile-stat--total">
          <span class="reconcile-stat-value">${summary.total_gcc ?? 0}</span>
          <span class="reconcile-stat-label">GCC Cache</span>
        </div>
        <div class="reconcile-stat reconcile-stat--synced">
          <span class="reconcile-stat-value">${summary.synced ?? 0}</span>
          <span class="reconcile-stat-label">Sincronizados</span>
        </div>
        <div class="reconcile-stat reconcile-stat--divergent">
          <span class="reconcile-stat-value">${summary.divergent ?? 0}</span>
          <span class="reconcile-stat-label">Divergentes</span>
        </div>
        <div class="reconcile-stat reconcile-stat--glpi-only">
          <span class="reconcile-stat-value">${summary.only_glpi ?? 0}</span>
          <span class="reconcile-stat-label">Só no GLPI</span>
        </div>
        <div class="reconcile-stat reconcile-stat--gcc-only">
          <span class="reconcile-stat-value">${summary.only_gcc ?? 0}</span>
          <span class="reconcile-stat-label">Só no GCC</span>
        </div>
      </div>
    `;
    el.classList.remove('hidden');
  }

  function _renderResults(el, data) {
    if (!el) return;

    const sections = [];

    if (data.divergent?.length > 0) {
      sections.push(_buildSection('Divergentes', data.divergent, 'divergent'));
    }
    if (data.only_glpi?.length > 0) {
      sections.push(_buildSection('Apenas no GLPI', data.only_glpi, 'glpi-only'));
    }
    if (data.only_gcc?.length > 0) {
      sections.push(_buildSection('Apenas no GCC', data.only_gcc, 'gcc-only'));
    }
    if (data.synced?.length > 0) {
      sections.push(_buildSection(`Sincronizados (${data.synced.length})`, data.synced, 'synced'));
    }

    if (sections.length === 0) {
      el.innerHTML = '<p class="reconcile-empty">Nenhuma divergência encontrada.</p>';
      return;
    }

    el.innerHTML = sections.join('');
  }

  function _buildSection(title, items, type) {
    const rows = items.map(item => {
      let detail = '';
      if (type === 'divergent' && item.diffs) {
        detail = item.diffs.map(d =>
          `<span class="reconcile-diff-field">${_escHtml(d.field)}:</span>
           <span class="reconcile-diff-glpi">${_escHtml(d.glpi || '(vazio)')}</span>
           →
           <span class="reconcile-diff-gcc">${_escHtml(d.gcc || '(vazio)')}</span>`
        ).join('<br>');
      } else {
        detail = `${_escHtml(item.itemtype)} #${item.id}`;
      }

      return `
        <tr class="reconcile-row reconcile-row--${type}">
          <td class="reconcile-row-name">${_escHtml(item.name || '(sem nome)')}</td>
          <td class="reconcile-row-category">${_escHtml(item.category || '')}</td>
          <td class="reconcile-row-detail">${detail}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="reconcile-section reconcile-section--${type}">
        <h3 class="reconcile-section-title">${_escHtml(title)}</h3>
        <table class="reconcile-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { render };
})();
