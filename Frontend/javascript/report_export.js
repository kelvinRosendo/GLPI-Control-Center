/**
 * GLPI Control Center - report_export.js
 * -----------------------------------------------------------------------------
 * Módulo de exportação da Central de Relatórios.
 *
 * Responsabilidades:
 * - Exportar dados para CSV (implementado)
 * - Estrutura preparada para PDF, Excel, JSON (futuro)
 * - Converter dados processados em formato de arquivo
 * - Gerenciar download no browser
 * - Emitir eventos de progresso
 *
 * NÃO renderiza HTML. Consulte reports_ui.js.
 * NÃO contém lógica de dados. Consulte reports.js.
 *
 * Sprint 7: Central de Relatórios (CSV implementado, outros preparados)
 */

window.ReportExport = {

  // ── Estado ───────────────────────────────────────────────────────────────

  _state: {
    exporting: false,
    progress: 0,
    format: null,
    error: '',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Exporta dados no formato especificado.
   * @param {string} format - 'csv', 'excel', 'pdf', 'json'
   * @param {array} data - Dados a serem exportados
   * @param {object} config - Configuração do relatório
   * @param {object} options - Opções adicionais (nome do arquivo, etc)
   * @returns {{ ok: boolean, error?: string }}
   */
  async export(format, data, config, options = {}) {
    if (this._state.exporting) {
      return { ok: false, error: 'Exportação já em andamento.' };
    }

    if (!data || !data.length) {
      return { ok: false, error: 'Nenhum dado para exportar.' };
    }

    const exporterConfig = window.REPORTS_CONFIG.exportadores[format];
    if (!exporterConfig) {
      return { ok: false, error: `Formato '${format}' não suportado.` };
    }

    if (!exporterConfig.enabled) {
      return { ok: false, error: `Exportação para ${exporterConfig.label} ainda não disponível.` };
    }

    this._state.exporting = true;
    this._state.progress = 0;
    this._state.format = format;
    this._state.error = '';

    this._emit('export:start', { format, total: data.length });

    try {
      switch (format) {
        case 'csv':
          await this._exportCSV(data, config, options);
          break;
        case 'excel':
          await this._exportExcel(data, config, options);
          break;
        case 'pdf':
          await this._exportPDF(data, config, options);
          break;
        case 'json':
          await this._exportJSON(data, config, options);
          break;
        default:
          throw new Error(`Formato '${format}' não implementado.`);
      }

      this._state.progress = 100;
      this._emit('export:complete', { format, count: data.length });

      // Registrar auditoria
      if (window.Audit) {
        window.Audit.register({
          action: 'relatorio_exportado',
          module: 'reports',
          descricao: `Relatório exportado em ${format.toUpperCase()} (${data.length} registros)`,
          extras: { format, count: data.length, reportTitle: config?.titulo || 'Desconhecido' },
        });
      }

      this._state.exporting = false;
      return { ok: true };

    } catch (err) {
      this._state.error = err.message || 'Erro na exportação.';
      this._state.exporting = false;
      this._emit('export:error', { format, error: this._state.error });
      return { ok: false, error: this._state.error };
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CSV
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Exporta dados para CSV.
   * @param {array} data
   * @param {object} config
   * @param {object} options
   */
  async _exportCSV(data, config, options) {
    this._state.progress = 20;
    this._emit('export:progress', { format: 'csv', progress: 20 });

    // 1. Converter dados para linhas CSV
    const headers = config.campos.map(c => c.label);
    const rows = data.map((row, index) => {
      const values = config.campos.map(campo => {
        let value = row[campo.key] ?? '';
        return this._escapeCSV(String(value));
      });

      this._state.progress = 20 + Math.floor((index / data.length) * 60);
      if (index % 50 === 0) {
        this._emit('export:progress', { format: 'csv', progress: this._state.progress });
      }

      return values.join(',');
    });

    // 2. Montar conteúdo completo
    const csvContent = [
      headers.map(h => this._escapeCSV(h)).join(','),
      ...rows,
    ].join('\r\n');

    this._state.progress = 85;
    this._emit('export:progress', { format: 'csv', progress: 85 });

    // 3. Adicionar BOM para UTF-8
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], {
      type: window.REPORTS_CONFIG.exportadores.csv.mimeType,
    });

    // 4. Gerar nome do arquivo
    const filename = this._generateFilename(config, 'csv');

    // 5. Trigger download
    this._downloadBlob(blob, filename);

    this._state.progress = 100;
    this._emit('export:progress', { format: 'csv', progress: 100 });
  },

  /**
   * Escapa um valor para CSV (ASFMT: RFC 4180).
   * @param {string} value
   * @returns {string}
   */
  _escapeCSV(value) {
    if (!value) return '';
    // Se contém vírgula, aspas ou quebra de linha, envolver em aspas
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EXCEL (Preparado, não implementado)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Exporta dados para Excel (futuro).
   * Estrutura preparada para implementação com SheetJS (xlsx).
   *
   * @param {array} data
   * @param {object} config
   * @param {object} options
   */
  async _exportExcel(data, config, options) {
    // Estrutura preparada para futura implementação:
    //
    // 1. Carregar biblioteca SheetJS dinamicamente
    //    const XLSX = await this._loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
    //
    // 2. Criar worksheet a partir dos dados
    //    const wsData = [headers, ...rows];
    //    const ws = XLSX.utils.aoa_to_sheet(wsData);
    //
    // 3. Aplicar formatação
    //    ws['!cols'] = headers.map(() => ({ wch: 20 }));
    //
    // 4. Criar workbook e adicionar worksheet
    //    const wb = XLSX.utils.book_new();
    //    XLSX.utils.book_append_sheet(wb, ws, config.titulo);
    //
    // 5. Gerar e fazer download
    //    XLSX.writeFile(wb, filename);

    throw new Error('Exportação para Excel será implementada em Sprint futura.');
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PDF (Preparado, não implementado)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Exporta dados para PDF (futuro).
   * Estrutura preparada para implementação com jsPDF.
   *
   * @param {array} data
   * @param {object} config
   * @param {object} options
   */
  async _exportPDF(data, config, options) {
    // Estrutura preparada para futura implementação:
    //
    // 1. Carregar jsPDF dinamicamente
    //    const { jsPDF } = await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    //    await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    //
    // 2. Criar documento com orientação adequada
    //    const doc = new jsPDF({ orientation: headers.length > 5 ? 'landscape' : 'portrait' });
    //
    // 3. Adicionar cabeçalho
    //    doc.setFontSize(16);
    //    doc.text(config.titulo, 14, 22);
    //    doc.setFontSize(10);
    //    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
    //    doc.text(`Total: ${data.length} registros`, 14, 36);
    //
    // 4. Adicionar tabela
    //    doc.autoTable({
    //      head: [headers],
    //      body: rows,
    //      startY: 42,
    //      styles: { fontSize: 8 },
    //      headStyles: { fillColor: [79, 126, 247] },
    //    });
    //
    // 5. Salvar
    //    doc.save(filename);

    throw new Error('Exportação para PDF será implementada em Sprint futura.');
  },

  // ══════════════════════════════════════════════════════════════════════════
  // JSON (Preparado, não implementado)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Exporta dados para JSON (futuro).
   *
   * @param {array} data
   * @param {object} config
   * @param {object} options
   */
  async _exportJSON(data, config, options) {
    // Estrutura preparada:
    //
    // const payload = {
    //   meta: {
    //     reportId: config.id,
    //     titulo: config.titulo,
    //     exportedAt: new Date().toISOString(),
    //     totalRecords: data.length,
    //     filters: options.filters || {},
    //   },
    //   data: data.map(row => {
    //     const clean = {};
    //     config.campos.forEach(c => { clean[c.key] = row[c.key]; });
    //     return clean;
    //   }),
    // };
    //
    // const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    // this._downloadBlob(blob, this._generateFilename(config, 'json'));

    throw new Error('Exportação para JSON será implementada em Sprint futura.');
  },

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Gera nome do arquivo baseado no relatório.
   * @param {object} config
   * @param {string} extension
   * @returns {string}
   */
  _generateFilename(config, extension) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5).replace(':', '');
    const safeName = config.titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    return `${safeName}_${date}_${time}.${extension}`;
  },

  /**
   * Faz download de um Blob no browser.
   * @param {Blob} blob
   * @param {string} filename
   */
  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Cleanup después de um breve delay
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  /**
   * Carrega script dinamicamente (para futuras dependências).
   * @param {string} url
   * @returns {Promise}
   */
  _loadScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Falha ao carregar: ${url}`));
      document.head.appendChild(script);
    });
  },

  // ── Getters Públicos ─────────────────────────────────────────────────────

  /**
   * Verifica se está exportando.
   * @returns {boolean}
   */
  isExporting() {
    return this._state.exporting;
  },

  /**
   * Retorna progresso atual (0-100).
   * @returns {number}
   */
  getProgress() {
    return this._state.progress;
  },

  /**
   * Retorna formato atual em exportação.
   * @returns {string|null}
   */
  getFormat() {
    return this._state.format;
  },

  /**
   * Retorna erro atual.
   * @returns {string}
   */
  getError() {
    return this._state.error;
  },

  /**
   * Retorna snapshot do estado.
   * @returns {object}
   */
  getState() {
    return { ...this._state };
  },

  // ── Eventos ──────────────────────────────────────────────────────────────

  /**
   * Emite um CustomEvent no document.
   * @param {string} eventName
   * @param {object} detail
   */
  _emit(eventName, detail) {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  },
};
