/**
 * GLPI Control Center - glpi.client.js
 * -----------------------------------------------------------------------------
 * Cliente JavaScript para comunicação com o backend PHP.
 *
 * ATUALIZADO: Timeout em fetch, rotas por itemtype, campos editáveis.
 */

window.GlpiClient = {
  get baseUrl() {
    return (window.CONFIG?.backendUrl ?? 'http://localhost:8080').replace(/\/$/, '');
  },

  /**
   * Fetch com timeout e tratamento de erro consistente.
   */
  async _fetch(path, options = {}) {
    const session = window.UserContext?.getSession?.();
    const timeout = options.timeout || 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const config = {
      method: options.method || 'GET',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(session?.csrfToken ? { 'X-CSRF-Token': session.csrfToken } : {}),
        ...(options.headers || {}),
      },
    };

    if (options.body !== undefined) {
      config.body = JSON.stringify(options.body);
    }

    try {
      const res = await fetch(this.baseUrl + path, config);
      clearTimeout(timer);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '');
        throw new Error(`Backend HTTP ${res.status} em ${path}${errorBody ? ': ' + errorBody.slice(0, 200) : ''}`);
      }

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error ?? 'Erro desconhecido no backend');
      }

      return json;
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        throw new Error(`Timeout ao buscar ${path} (${timeout / 1000}s)`);
      }
      throw e;
    }
  },

  async fetchComputadores() {
    const json = await this._fetch('/api/assets/computers');
    return json.data ?? [];
  },

  /**
   * Busca detalhes de qualquer ativo por itemtype.
   */
  async fetchAssetDetails(glpiId, itemtype = 'Computer') {
    const endpoint = itemtype === 'Printer'
      ? `/api/assets/printers/${glpiId}`
      : `/api/assets/computers/${glpiId}`;
    const json = await this._fetch(endpoint);
    return json.data ?? null;
  },

  /**
   * Atualiza ativo (Computer e Printer suportados).
   */
  async updateAsset(glpiId, itemtype, input) {
    const endpoint = itemtype === 'Printer'
      ? `/api/assets/printers/${glpiId}`
      : `/api/assets/computers/${glpiId}`;
    const json = await this._fetch(endpoint, {
      method: 'POST',
      body: { input },
    });
    return json.data ?? null;
  },

  /**
   * Cria um novo ativo.
   */
  async createAsset(itemtype, input) {
    const endpoint = itemtype === 'Printer'
      ? '/api/assets/printers'
      : '/api/assets/computers';
    const json = await this._fetch(endpoint, {
      method: 'POST',
      body: { input },
    });
    return json.data ?? null;
  },

  /**
   * Exclui logicamente um ativo.
   */
  async deleteAsset(glpiId, itemtype) {
    const endpoint = itemtype === 'Printer'
      ? `/api/assets/printers/${glpiId}/delete`
      : `/api/assets/computers/${glpiId}/delete`;
    const json = await this._fetch(endpoint, { method: 'POST' });
    return json.data ?? null;
  },

  /**
   * Restaura um ativo excluído logicamente.
   */
  async restoreAsset(glpiId, itemtype) {
    const endpoint = itemtype === 'Printer'
      ? `/api/assets/printers/${glpiId}/restore`
      : `/api/assets/computers/${glpiId}/restore`;
    const json = await this._fetch(endpoint, { method: 'POST' });
    return json.data ?? null;
  },

  async fetchChromebooksGeekiees() {
    const json = await this._fetch('/api/assets/chromebooks-geekiees');
    return json.data ?? [];
  },

  async fetchChromebooksApoio() {
    const json = await this._fetch('/api/assets/chromebooks-apoio');
    return json.data ?? {};
  },

  async fetchChromebooksExibicao() {
    const json = await this._fetch('/api/assets/chromebooks-exibicao');
    return json.data ?? [];
  },

  async fetchProjetores() {
    const json = await this._fetch('/api/assets/projetores');
    return json.data ?? [];
  },

  async fetchProjectorsEnriched() {
    const json = await this._fetch('/api/projetors');
    return json;
  },

  async fetchProjectorDetail(glpiId) {
    const json = await this._fetch(`/api/projetors/${glpiId}`);
    return json.data ?? null;
  },

  async updateProjectorLamp(glpiId, data) {
    const json = await this._fetch(`/api/projetors/${glpiId}/lamp`, {
      method: 'PUT',
      body: data,
    });
    return json;
  },

  async registerProjectorMaintenance(glpiId, data) {
    const json = await this._fetch(`/api/projetors/${glpiId}/maintenance`, {
      method: 'POST',
      body: data,
    });
    return json;
  },

  async fetchProjectorHistory(glpiId) {
    const json = await this._fetch(`/api/projetors/${glpiId}/history`);
    return json.data ?? [];
  },

  async fetchProjectorAlerts() {
    const json = await this._fetch('/api/projetors/alerts');
    return json;
  },

  async triggerProjectorCheck() {
    const json = await this._fetch('/api/projetors/check', { method: 'POST' });
    return json;
  },

  async fetchImpressoras() {
    const json = await this._fetch('/api/assets/impressoras');
    return json.data ?? [];
  },

  async fetchTickets() {
    const json = await this._fetch('/api/tickets');
    return json.data ?? [];
  },

  async createWorkflowTicket(payload) {
    const json = await this._fetch('/api/tickets/workflow', {
      method: 'POST',
      body: payload,
    });
    return json.data ?? null;
  },

  async registerAssistanceAction(payload) {
    const json = await this._fetch('/api/tickets/workflow/assistance-action', {
      method: 'POST',
      body: payload,
    });
    return json.data ?? null;
  },

  async fetchDiagnostic() {
    const json = await this._fetch('/api/diagnostic/compare');
    return json;
  },

  getDiagnosticExportUrl() {
    return this.baseUrl + '/api/diagnostic/export';
  },

  async fetchClassifiedAssets() {
    this._assetSource = null;
    const json = await this._fetch('/api/assets/all');
    this._assetSource = json.source;
    return json.data ?? [];
  },

  async fetchSyncStatus() {
    const json = await this._fetch('/api/sync/status');
    return json.data ?? {};
  },

  async fetchSyncReport() {
    const json = await this._fetch('/api/sync/report');
    return json.data ?? {};
  },

  async fetchCacheState() {
    const json = await this._fetch('/api/sync/cache-state');
    return json.data ?? {};
  },

  async runFullSync() {
    const json = await this._fetch('/api/sync/run', { method: 'POST', body: {}, timeout: 120000 });
    return json.data ?? null;
  },

  async runIncrementalSync() {
    const json = await this._fetch('/api/sync/incremental', { method: 'POST', body: {}, timeout: 120000 });
    return json.data ?? null;
  },

  /**
   * Carrega todos os dados. Uma única chamada — sem duplicação.
   */
  async loadAll() {
    const previous = window.DATA || {};

    let classified = null;
    let syncStatus = null;
    let syncReport = null;
    let cacheState = null;
    const classifiedErrors = [];

    const results = await Promise.allSettled([
      this.fetchClassifiedAssets(),
      this.fetchSyncStatus(),
      this.fetchSyncReport(),
      this.fetchCacheState(),
    ]);

    const [cResult, sResult, rResult, csResult] = results;

    if (cResult.status === 'fulfilled') {
      classified = cResult.value ?? [];
    } else {
      classifiedErrors.push(`assets/all: ${cResult.reason?.message ?? cResult.reason}`);
    }

    if (sResult.status === 'fulfilled') {
      syncStatus = sResult.value ?? null;
    }

    if (rResult.status === 'fulfilled') {
      syncReport = rResult.value ?? null;
    }

    if (csResult.status === 'fulfilled') {
      cacheState = csResult.value ?? null;
    }

    const useClassified = Array.isArray(classified) && classified.length > 0;
    let mapped = {};
    const legacyErrors = [];

    if (!useClassified) {
      const legacyResults = await Promise.allSettled([
        this.fetchComputadores(),
        this.fetchChromebooksGeekiees(),
        this.fetchChromebooksApoio(),
        this.fetchChromebooksExibicao(),
        this.fetchProjetores(),
        this.fetchImpressoras(),
      ]);

      const names = ['computadores', 'chromebooksGeekiees', 'chromebooksApoio', 'chromebooksExibicao', 'projetores', 'impressoras'];
      const legacy = legacyResults.map((r, i) => {
        if (r.status === 'rejected') {
          legacyErrors.push(`${names[i]}: ${r.reason?.message ?? r.reason}`);
          return names[i] === 'chromebooksApoio' ? {} : [];
        }
        return r.value;
      });

      mapped.computadores = legacy[0];
      mapped.chromebooksGeekiees = legacy[1];
      mapped.chromebooksApoio = legacy[2];
      mapped.chromebooksExibicao = legacy[3];
      mapped.projetores = legacy[4];
      mapped.impressoras = legacy[5];
    } else {
      mapped = this._mapClassifiedToLegacy(classified);
    }

    const uiState = {
      syncInProgress: previous.syncInProgress ?? false,
      syncError: previous.syncError ?? null,
      syncPartial: previous.syncPartial ?? false,
      syncErrors: previous.syncErrors ?? [],
    };

    window.DATA = {
      computadores: mapped.computadores ?? previous.computadores ?? [],
      chromebooksGeekiees: mapped.chromebooksGeekiees ?? previous.chromebooksGeekiees ?? [],
      chromebooksApoio: mapped.chromebooksApoio ?? previous.chromebooksApoio ?? {},
      chromebooksSalas: mapped.chromebooksSalas ?? previous.chromebooksSalas ?? {},
      chromebooksExibicao: mapped.chromebooksExibicao ?? previous.chromebooksExibicao ?? [],
      projetores: mapped.projetores ?? previous.projetores ?? [],
      impressoras: mapped.impressoras ?? previous.impressoras ?? [],
      classifiedAssets: classified ?? previous.classifiedAssets ?? [],
      classifiedAssetsLoaded: useClassified,
      classificationStats: useClassified
        ? window.AssetClassifier?.computeStats(classified) ?? previous.classificationStats
        : previous.classificationStats,
      syncStatus: syncStatus ?? previous.syncStatus,
      syncReport: syncReport ?? previous.syncReport,
      cacheState: cacheState ?? previous.cacheState,
      lastSuccessfulSync: syncReport?.sync_info?.status === 'success'
        ? syncReport.sync_info.completed_at : previous.lastSuccessfulSync,
      ...uiState,
    };

    const allErrors = [...classifiedErrors, ...legacyErrors];

    if (classifiedErrors.length === 0 && useClassified) {
      if (this._assetSource !== 'glpi' && (!cacheState || !['valid', 'empty'].includes(cacheState.state))) {
        return { ok: false, partial: true, errors: [cacheState?.message || 'Inventário ainda não verificado.'] };
      }
      return { ok: true, errors: [] };
    }

    if (classifiedErrors.length === 0 && !useClassified && classified !== null) {
      return { ok: false, errors: [], partial: false, noSync: true };
    }

    if (allErrors.length > 0 && Object.keys(mapped).some(k => mapped[k]?.length)) {
      return { ok: false, errors: allErrors, partial: true };
    }

    return { ok: false, errors: allErrors, partial: false };
  },

  _mapClassifiedToLegacy(classified) {
    if (!Array.isArray(classified) || classified.length === 0) return {};
    const map = { computadores: [], chromebooksGeekiees: [], chromebooksApoio: {}, chromebooksSalas: {}, chromebooksExibicao: [], projetores: [], impressoras: [] };
    for (const asset of classified) {
      const cat = asset.category;
      if (cat === 'computer_cs') {
        map.computadores.push(this._toLegacyAsset(asset));
      } else if (cat === 'chromebook_student') {
        const cls = window.GroupMapper?.classifyChromebookStudent(asset) || { type: 'none' };
        if (cls.type === 'turma') {
          const key = cls.turmaName;
          if (!map.chromebooksSalas[key]) map.chromebooksSalas[key] = [];
          map.chromebooksSalas[key].push(this._toLegacyAsset(asset));
        } else {
          map.chromebooksGeekiees.push(this._toLegacyAsset(asset));
        }
      } else if (cat === 'chromebook_support') {
        const cls = window.GroupMapper?.classifyChromebookSupport(asset) || { type: 'none' };
        if (cls.type === 'cart') {
          const key = cls.cartName;
          if (!map.chromebooksApoio[key]) map.chromebooksApoio[key] = [];
          map.chromebooksApoio[key].push(this._toLegacyAsset(asset));
        } else if (cls.type === 'turma') {
          const key = cls.turmaName;
          if (!map.chromebooksSalas[key]) map.chromebooksSalas[key] = [];
          map.chromebooksSalas[key].push(this._toLegacyAsset(asset));
        } else {
          map.computadores.push(this._toLegacyAsset(asset));
        }
      } else if (cat === 'chromebook_display') {
        map.chromebooksExibicao.push(this._toLegacyAsset(asset));
      } else if (cat === 'projector') {
        map.projetores.push(this._toLegacyAsset(asset));
      } else if (cat === 'printer' || cat === 'printer_computer') {
        map.impressoras.push(this._toLegacyAsset(asset));
      } else {
        map.computadores.push(this._toLegacyAsset(asset));
      }
    }
    return map;
  },

  _toLegacyAsset(asset) {
    const stateSummary = asset.stateSummary ?? '';
    let status = 'ativo';
    const s = stateSummary.toLowerCase();
    if (s.includes('finalizado') || s.includes('formado')) status = 'finalizado';
    else if (s.includes('comodato')) status = 'emprestado';
    else if (s.includes('emprest')) status = 'emprestado';
    else if (s.includes('permanente')) status = 'ativo';
    else if (s.includes('devolvid')) status = 'inativo';
    else if (s.includes('substitu')) status = 'inativo';
    else if (s.includes('baixa') || s.includes('perdido')) status = 'inativo';
    else if (s.includes('uso')) status = 'ativo';

    return {
      glpiId: asset.id,
      nome: asset.name ?? '',
      serial: asset.serial ?? '',
      patrimonio: asset.otherserial ?? '',
      status,
      modelo: asset.model ?? '',
      fabricante: asset.manufacturer ?? '',
      reparticao: asset.location ?? '',
      grupo: asset.groupPath ?? '',
      comments: asset.comments ?? '',
      itemtype: asset.itemtype ?? 'Computer',
      category: asset.category,
      categoryLabel: asset.categoryLabel,
      purpose: asset.purpose,
      stateRaw: asset.stateRaw,
      stateSummary: asset.stateSummary,
      cart: asset.cart,
      groupPath: asset.groupPath,
      classificationConfidence: asset.classificationConfidence,
      classificationWarnings: asset.classificationWarnings,
      classificationSource: asset.classificationSource,
      classificationVersion: asset.classificationVersion,
      _raw: asset._raw || asset.raw || null,
    };
  },
};
