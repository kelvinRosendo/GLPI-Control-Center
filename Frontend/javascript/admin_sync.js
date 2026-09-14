/**
 * GLPI Control Center - admin_sync.js
 * -----------------------------------------------------------------------------
 * Painel de sincronização para administradores.
 *
 * Requer permissão ADMIN para executar sincronizações.
 * Exibe status, relatório e botões de ação.
 */

'use strict';

window.AdminSync = (() => {
  let _initialized = false;
  let _pollTimer = null;

  function init() {
    if (_initialized) return;
    _initialized = true;
    _bindEvents();
  }

  function _bindEvents() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-sync-action]');
      if (!btn) return;
      const action = btn.dataset.syncAction;
      if (action === 'full') _runFullSync();
      if (action === 'incremental') _runIncrementalSync();
    });

    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-sync-page]');
      if (!btn) return;
      window.State.setInventoryPage(Number(btn.dataset.syncPage));
      window.App._renderContent();
    });
  }

  async function _runFullSync() {
    const user = window.UserContext?.getCurrentUser();
    if (!user || user.perfil !== 'admin') {
      alert('Apenas administradores podem executar sincronização completa.');
      return;
    }

    if (!confirm('Executar sincronização completa? Isso vai buscar todos os ativos do GLPI.')) {
      return;
    }

    window.DATA.syncInProgress = true;
    window.DATA.syncError = null;
    window.App._renderContent();

    try {
      const result = await window.AssetClassifier.runFullSync();
      if (result.ok) {
        window.DATA.syncReport = result.data;
        window.DATA.syncPartial = false;
        // Recarregar ativos
        const loadResult = await window.AssetClassifier.fetchAllClassified();
        if (loadResult.ok) {
          window.DATA.classifiedAssets = loadResult.data;
          window.DATA.classifiedAssetsLoaded = true;
          window.DATA.classificationStats = window.AssetClassifier.computeStats(loadResult.data);
        }
        window.DATA.syncStatus = { status: 'completed', last_run: new Date().toISOString() };
      } else {
        window.DATA.syncError = result.error;
        window.DATA.syncStatus = { status: 'failed', last_run: new Date().toISOString() };
      }
    } catch (e) {
      window.DATA.syncError = e.message;
      window.DATA.syncStatus = { status: 'failed', last_run: new Date().toISOString() };
    }

    window.DATA.syncInProgress = false;
    window.App._renderContent();

    if (window.Dashboard?.isLoaded()) {
      window.Dashboard.recalculate();
    }
  }

  async function _runIncrementalSync() {
    const user = window.UserContext?.getCurrentUser();
    if (!user || user.perfil !== 'admin') {
      alert('Apenas administradores podem executar sincronização incremental.');
      return;
    }

    window.DATA.syncInProgress = true;
    window.DATA.syncError = null;
    window.App._renderContent();

    try {
      const result = await window.AssetClassifier.runIncrementalSync();
      if (result.ok) {
        window.DATA.syncReport = result.data;
        const loadResult = await window.AssetClassifier.fetchAllClassified();
        if (loadResult.ok) {
          window.DATA.classifiedAssets = loadResult.data;
          window.DATA.classifiedAssetsLoaded = true;
          window.DATA.classificationStats = window.AssetClassifier.computeStats(loadResult.data);
        }
      } else {
        window.DATA.syncError = result.error;
      }
    } catch (e) {
      window.DATA.syncError = e.message;
    }

    window.DATA.syncInProgress = false;
    window.App._renderContent();
  }

  function render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const user = window.UserContext?.getCurrentUser();
    const isAdmin = user?.perfil === 'admin';
    const D = window.DATA;
    const report = D.syncReport || {};
    const status = D.syncStatus || {};
    const cache = D.cacheState || {};
    const inProgress = D.syncInProgress;
    const error = D.syncError;

    const lastSync = report.completed_at
      ? new Date(report.completed_at).toLocaleString('pt-BR')
      : D.lastSuccessfulSync
        ? new Date(D.lastSuccessfulSync).toLocaleString('pt-BR')
        : 'Nunca';

    const duration = report.duration ? `${Math.round(report.duration / 1000)}s` : '-';
    const total = report.total ?? '-';
    const pages = report.pages ?? '-';
    const newCount = report.new_assets ?? '-';
    const updatedCount = report.updated_assets ?? '-';
    const removedCount = report.removed_assets ?? '-';
    const unclassified = D.classificationStats?.unclassified ?? 0;
    const errors = report.errors ?? [];

    const cacheState = cache.state || 'unknown';
    const cacheStateLabels = {
      not_created: 'Não criado',
      valid: 'Válido',
      empty: 'Vazio',
      partial: 'Parcial',
      invalid: 'Inválido',
      stale: 'Desatualizado',
      unknown: 'Desconhecido',
    };
    const cacheStateIcons = {
      not_created: '○',
      valid: '●',
      empty: '○',
      partial: '◐',
      invalid: '✖',
      stale: '◑',
      unknown: '?',
    };
    const cacheStateClass = cacheState === 'valid' ? 'ok' : cacheState === 'partial' || cacheState === 'stale' ? 'warn' : 'error';

    const cacheItemCount = cache.items_count ?? '-';
    const cacheFileSize = cache.file_size ? `${Math.round(cache.file_size / 1024)}KB` : '-';
    const cacheDataDate = cache.data_date ? new Date(cache.data_date).toLocaleString('pt-BR') : '-';
    const cacheMessage = cache.message || '';
    const catalogVersion = cache.catalog_version ?? '-';

    el.innerHTML = `
      <div class="sync-panel">
        <h3>Sincronização GLPI</h3>

        <div class="sync-info-grid">
          <div class="sync-info-item"><span class="sync-label">Status:</span> <span class="sync-value sync-status-${status.status || 'unknown'}">${status.status || 'desconhecido'}</span></div>
          <div class="sync-info-item"><span class="sync-label">Última sync:</span> <span class="sync-value">${lastSync}</span></div>
          <div class="sync-info-item"><span class="sync-label">Duração:</span> <span class="sync-value">${duration}</span></div>
          <div class="sync-info-item"><span class="sync-label">Total:</span> <span class="sync-value">${total}</span></div>
          <div class="sync-info-item"><span class="sync-label">Páginas:</span> <span class="sync-value">${pages}</span></div>
          <div class="sync-info-item"><span class="sync-label">Novos:</span> <span class="sync-value">${newCount}</span></div>
          <div class="sync-info-item"><span class="sync-label">Atualizados:</span> <span class="sync-value">${updatedCount}</span></div>
          <div class="sync-info-item"><span class="sync-label">Removidos:</span> <span class="sync-value">${removedCount}</span></div>
          <div class="sync-info-item"><span class="sync-label">Não classificados:</span> <span class="sync-value sync-warning">${unclassified}</span></div>
        </div>

        <div class="cache-state-info">
          <h4>Estado do Cache</h4>
          <div class="sync-info-grid">
            <div class="sync-info-item"><span class="sync-label">Estado:</span> <span class="sync-value cache-state-${cacheStateClass}">${cacheStateIcons[cacheState] || '?'} ${cacheStateLabels[cacheState] || cacheState}</span></div>
            <div class="sync-info-item"><span class="sync-label">Ativos:</span> <span class="sync-value">${cacheItemCount}</span></div>
            <div class="sync-info-item"><span class="sync-label">Tamanho:</span> <span class="sync-value">${cacheFileSize}</span></div>
            <div class="sync-info-item"><span class="sync-label">Dados de:</span> <span class="sync-value">${cacheDataDate}</span></div>
            <div class="sync-info-item"><span class="sync-label">Catálogo:</span> <span class="sync-value">v${catalogVersion}</span></div>
          </div>
          ${cacheMessage ? `<div class="cache-state-message">${cacheMessage}</div>` : ''}
        </div>

        ${status.status === 'partial' ? '<div class="sync-warning">⚠ A sincronização foi concluída parcialmente. Algumas categorias não puderam ser atualizadas.</div>' : ''}
        ${error ? `<div class="sync-error">✖ ${String(error).replace(/</g, '&lt;')}</div>` : ''}
        ${errors.length > 0 ? `<div class="sync-errors"><strong>Erros:</strong><ul>${errors.map(e => `<li>${String(e).replace(/</g, '&lt;')}</li>`).join('')}</ul></div>` : ''}

        ${isAdmin ? `
          <div class="sync-actions">
            <button class="btn-primary" data-sync-action="incremental" ${inProgress ? 'disabled' : ''}>
              ${inProgress ? 'Sincronizando...' : 'Sincronização Incremental'}
            </button>
            <button class="btn-danger" data-sync-action="full" ${inProgress ? 'disabled' : ''}>
              ${inProgress ? 'Sincronizando...' : 'Sincronização Completa'}
            </button>
          </div>
        ` : '<div class="sync-notice">Apenas administradores podem executar sincronizações.</div>'}
      </div>
    `;
  }

  function startPolling(intervalMs = 30000) {
    _stopPolling();
    _pollTimer = setInterval(async () => {
      if (window.DATA.syncInProgress) return;
      try {
        const result = await window.AssetClassifier.fetchSyncStatus();
        if (result.ok && result.data.status !== window.DATA.syncStatus?.status) {
          window.DATA.syncStatus = result.data;
          if (result.data.status === 'completed' || result.data.status === 'partial') {
            const loadResult = await window.AssetClassifier.fetchAllClassified();
            if (loadResult.ok) {
              window.DATA.classifiedAssets = loadResult.data;
              window.DATA.classifiedAssetsLoaded = true;
              window.DATA.classificationStats = window.AssetClassifier.computeStats(loadResult.data);
              window.DATA.lastSuccessfulSync = new Date().toISOString();
            }
          }
          if (window.STATE.tab === 'admin-sync') {
            window.App._renderContent();
          }
        }
      } catch {
        // Polling silencioso
      }
    }, intervalMs);
  }

  function _stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  return {
    init,
    render,
    startPolling,
    stopPolling: _stopPolling,
  };
})();
