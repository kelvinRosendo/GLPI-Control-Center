/**
 * Frontend/javascript/asset_details_ui.js
 * -----------------------------------------------------------------------------
 * Componente compartilhado de detalhes e edição de ativos.
 *
 * Usado em: Inventário Geral, Computadores, Alunos, Apoio, Carrinhos,
 * Salas/Turmas, Exibição, Projetores, Impressoras.
 *
 * Funcionalidades:
 * - Visualização de detalhes por seção
 * - Edição de campos textuais e dropdowns
 * - Criação de novos ativos
 * - Exclusão lógica e restauração
 * - Validação de campos obrigatórios
 * - Loading, bloqueio durante envio, erro não fecha formulário
 */

window.AssetDetailsUI = (function () {
  let _modal = null;
  let _currentAsset = null;
  let _currentItemtype = null;
  let _capabilities = null;
  let _optionsCache = {};
  let _onSaveCallback = null;
  let _pendingOperation = null;
  let _idempotencyKey = null;

  // ══════════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Abre modal de detalhes/edição para um ativo existente.
   */
  async function openDetail(itemtype, glpiId, onSave) {
    _currentItemtype = itemtype;
    _onSaveCallback = onSave || null;

    _ensureModal();
    _showLoading('Carregando detalhes...');

    try {
      const endpoint = itemtype === 'Printer'
        ? `/api/assets/printers/${glpiId}`
        : `/api/assets/computers/${glpiId}`;
      const response = await window.GlpiClient._fetch(endpoint);
      _currentAsset = response?.data ?? null;

      if (!_currentAsset) {
        _showError('Ativo não encontrado.');
        return;
      }

      await _loadCapabilities();
      _renderDetail();
    } catch (e) {
      _showError(`Erro ao carregar: ${e.message}`);
    }
  }

  /**
   * Abre modal de criação para um novo ativo.
   */
  async function openCreate(itemtype, onSave) {
    _currentItemtype = itemtype;
    _currentAsset = null;
    _onSaveCallback = onSave || null;

    _ensureModal();
    _showLoading('Carregando formulário...');

    try {
      await _loadCapabilities();
      _renderCreate();
    } catch (e) {
      _showError(`Erro ao carregar formulário: ${e.message}`);
    }
  }

  /**
   * Fecha o modal.
   */
  function close() {
    if (_modal) {
      _modal.classList.add('hidden');
      _currentAsset = null;
      _currentItemtype = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // INTERNALS
  // ══════════════════════════════════════════════════════════════════════════════

  function _ensureModal() {
    _modal = document.getElementById('computer-details-modal');
    if (!_modal) {
      _modal = document.createElement('div');
      _modal.id = 'computer-details-modal';
      _modal.className = 'computer-modal hidden';
      _modal.innerHTML = `
        <div class="computer-modal-backdrop" data-computer-modal-close="backdrop"></div>
        <div class="computer-modal-dialog">
          <div id="computer-details-modal-content"></div>
        </div>
      `;
      document.body.appendChild(_modal);
    }

    const backdrop = _modal.querySelector('[data-computer-modal-close="backdrop"]');
    if (backdrop) {
      backdrop.onclick = _handleCloseAttempt;
    }

    _modal.classList.remove('hidden');
  }

  function _showLoading(message) {
    const content = document.getElementById('computer-details-modal-content');
    if (content) {
      content.innerHTML = `
        <div class="asset-details-loading">
          <div class="loading-spinner"></div>
          <p>${_escHtml(message)}</p>
        </div>
      `;
    }
  }

  function _showError(message) {
    const content = document.getElementById('computer-details-modal-content');
    if (content) {
      content.innerHTML = `
        <div class="asset-details-error">
          <p class="error-message">${_escHtml(message)}</p>
          <button class="btn btn--secondary" data-action="close">Fechar</button>
        </div>
      `;
      content.querySelector('[data-action="close"]')?.addEventListener('click', close);
    }
  }

  async function _loadCapabilities() {
    if (_capabilities) return;
    try {
      const response = await window.GlpiClient._fetch('/api/capabilities');
      _capabilities = response?.data ?? null;
    } catch (e) {
      console.warn('AssetDetailsUI: erro ao carregar capabilities', e);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DETAIL VIEW
  // ══════════════════════════════════════════════════════════════════════════════

  function _renderDetail() {
    const content = document.getElementById('computer-details-modal-content');
    if (!content || !_currentAsset) return;

    const asset = _currentAsset.asset ?? {};
    const editableValues = _currentAsset.editableValues ?? {};
    const sections = _currentAsset.sections ?? [];
    const itemtype = _currentItemtype;
    const glpiId = asset.glpiId ?? _currentAsset.asset?.glpiId;

    const canEdit = _canEdit();
    const canDelete = _canDelete();
    const canRestore = _canRestore();
    const isActive = _isActive(asset);

    const title = _getAssetTitle(asset, itemtype);

    content.innerHTML = `
      <div class="asset-details-header">
        <h2 class="asset-details-title">${_escHtml(title)}</h2>
        <button class="asset-details-close" data-action="close-attempt">✕</button>
      </div>

      <div class="asset-details-body">
        ${sections.map(section => _renderSection(section, editableValues, canEdit)).join('')}
      </div>

      <div class="asset-details-footer">
        <div class="asset-details-actions">
          ${canEdit ? `<button class="btn btn--primary" id="asset-save-btn" data-action="save">Salvar</button>` : ''}
          ${canDelete && isActive ? `<button class="btn btn--danger" data-action="delete">Excluir</button>` : ''}
          ${canRestore && !isActive ? `<button class="btn btn--success" data-action="restore">Restaurar</button>` : ''}
          <button class="btn btn--secondary" data-action="close-attempt">Fechar</button>
        </div>
        <div id="asset-details-feedback" class="asset-details-feedback"></div>
      </div>
    `;
    content.querySelector('[data-action="save"]')?.addEventListener('click', _save);
    content.querySelector('[data-action="delete"]')?.addEventListener('click', _delete);
    content.querySelector('[data-action="restore"]')?.addEventListener('click', _restore);
    content.querySelectorAll('[data-action="close-attempt"]').forEach(el => el.addEventListener('click', _handleCloseAttempt));
  }

  function _renderSection(section, editableValues, canEdit) {
    if (!section.fields || section.fields.length === 0) return '';

    return `
      <div class="asset-details-section">
        <h3 class="asset-details-section-title">${_escHtml(section.title)}</h3>
        <div class="asset-details-fields">
          ${section.fields.map(field => _renderField(field, editableValues, canEdit)).join('')}
        </div>
      </div>
    `;
  }

  function _renderField(field, editableValues, canEdit) {
    const key = field.key;
    const label = field.label;
    const value = field.value;
    const editable = field.editable && canEdit;
    const inputType = field.inputType || 'text';

    const editableValue = editableValues[key] ?? value;

    if (!editable) {
      return `
        <div class="asset-details-field">
          <label class="asset-details-label">${_escHtml(label)}</label>
          <span class="asset-details-value">${_escHtml(value || '—')}</span>
        </div>
      `;
    }

    if (inputType === 'textarea') {
      return `
        <div class="asset-details-field">
          <label class="asset-details-label">${_escHtml(label)}</label>
          <textarea class="asset-details-input" data-field="${_escHtml(key)}" rows="3">${_escHtml(editableValue)}</textarea>
        </div>
      `;
    }

    return `
      <div class="asset-details-field">
        <label class="asset-details-label">${_escHtml(label)}</label>
        <input class="asset-details-input" type="text" data-field="${_escHtml(key)}" value="${_escHtml(editableValue)}" />
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CREATE VIEW
  // ══════════════════════════════════════════════════════════════════════════════

  function _renderCreate() {
    const content = document.getElementById('computer-details-modal-content');
    if (!content) return;

    const writeOps = _capabilities?.writeOperations?.[_currentItemtype]?.create;
    if (!writeOps) {
      _showError('Criação não suportada para este tipo.');
      return;
    }

    const required = writeOps.required || [];
    const optional = writeOps.optional || [];

    content.innerHTML = `
      <div class="asset-details-header">
        <h2 class="asset-details-title">Criar ${_escHtml(_currentItemtype)}</h2>
        <button class="asset-details-close" data-action="close-attempt">✕</button>
      </div>

      <div class="asset-details-body">
        <div class="asset-details-section">
          <h3 class="asset-details-section-title">Campos obrigatórios</h3>
          <div class="asset-details-fields">
            ${required.map(field => _renderCreateField(field, true)).join('')}
          </div>
        </div>

        ${optional.length > 0 ? `
        <div class="asset-details-section">
          <h3 class="asset-details-section-title">Campos opcionais</h3>
          <div class="asset-details-fields">
            ${optional.map(field => _renderCreateField(field, false)).join('')}
          </div>
        </div>
        ` : ''}
      </div>

      <div class="asset-details-footer">
        <div class="asset-details-actions">
          <button class="btn btn--primary" id="asset-save-btn" data-action="create">Criar</button>
          <button class="btn btn--secondary" data-action="close-attempt">Cancelar</button>
        </div>
        <div id="asset-details-feedback" class="asset-details-feedback"></div>
      </div>
    `;
    content.querySelector('[data-action="create"]')?.addEventListener('click', _create);
    content.querySelectorAll('[data-action="close-attempt"]').forEach(el => el.addEventListener('click', _handleCloseAttempt));
  }

  function _renderCreateField(fieldKey, required) {
    const label = _getFieldLabel(fieldKey);
    const isDropdown = _isDropdownField(fieldKey);

    if (isDropdown) {
      return `
        <div class="asset-details-field">
          <label class="asset-details-label">${_escHtml(label)}${required ? ' *' : ''}</label>
          <select class="asset-details-input" data-field="${_escHtml(fieldKey)}" ${required ? 'required' : ''}>
            <option value="">Selecione...</option>
          </select>
        </div>
      `;
    }

    return `
      <div class="asset-details-field">
        <label class="asset-details-label">${_escHtml(label)}${required ? ' *' : ''}</label>
        <input class="asset-details-input" type="text" data-field="${_escHtml(fieldKey)}" ${required ? 'required' : ''} />
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SAVE / CREATE / DELETE / RESTORE
  // ══════════════════════════════════════════════════════════════════════════════

  async function _save() {
    const btn = document.getElementById('asset-save-btn');
    const feedback = document.getElementById('asset-details-feedback');
    if (!btn || !_currentAsset || !_currentItemtype) return;

    const glpiId = _currentAsset.asset?.glpiId;
    if (!glpiId) return;

    const input = _collectFormValues();
    if (Object.keys(input).length === 0) {
      _showFeedback(feedback, 'Nenhum campo alterado.', 'warning');
      return;
    }

    // Gerar chave de idempotência
    _idempotencyKey = _generateIdempotencyKey('update', _currentItemtype, glpiId, input);

    btn.disabled = true;
    btn.textContent = 'Salvando...';
    _showFeedback(feedback, 'Enviando...', 'info');
    _setFormEnabled(false);

    try {
      const endpoint = _currentItemtype === 'Printer'
        ? `/api/assets/printers/${glpiId}`
        : `/api/assets/computers/${glpiId}`;
      const response = await window.GlpiClient._fetch(endpoint, {
        method: 'POST',
        body: { input, idempotency_key: _idempotencyKey },
      });

      const result = response?.data;
      _pendingOperation = result;
      // Não descartar campos silenciosamente: se backend informou discarded
      if (result?.discarded_fields && result.discarded_fields.length) {
        _showFeedback(feedback, 'Campos não suportados ignorados: ' + result.discarded_fields.join(', '), 'warning');
        // Não considerar integralmente executado
      }
      // Atualizar estado compartilhado com reclassificação antes de fechar
      const updateShared = (assetData) => {
        if (!assetData?.asset) return;
        try {
          // Atualiza lista classificada reclassificando
          const id = assetData.asset.glpiId;
          const it = _currentItemtype;
          if (window.DATA?.classifiedAssets) {
            // Buscar e substituir por versão classificada do cache se disponível
            const idx = window.DATA.classifiedAssets.findIndex(a => a.id === id && a.itemtype === it);
            if (idx >= 0 && assetData.raw) {
              // Reclassificar via pipeline local se disponível
              try {
                const fakeRaw = Object.assign({}, assetData.raw, {itemtype: it});
                // Não temos classifier no frontend, usar assetData diretamente
                Object.assign(window.DATA.classifiedAssets[idx], assetData.asset, {raw: assetData.raw});
              } catch {}
            }
          }
          // Também atualizar coleções legadas
          if (window.GlpiClient?._toLegacyAsset && assetData.raw) {
            // noop, já mapeado no loadAll
          }
          window.dispatchEvent(new CustomEvent('gcc:assetUpdated', {detail: {asset: assetData.asset, result}}));
        } catch {}
      };

      if (result?.status === 'completed_verified') {
        const cacheMsg = result.cache_status === 'updated' ? '' : ' Atualização do GCC pendente.';
        _showFeedback(feedback, `Salvo e verificado!${cacheMsg} Operação: ${result.operation_id}`, 'success');
        // Reler ficha no contrato esperado antes de fechar
        try {
          const detail = await window.GlpiClient.fetchAssetDetails(result.id || glpiId, _currentItemtype);
          updateShared(detail);
        } catch {}
        _currentAsset = null;
        setTimeout(() => { close(); if (_onSaveCallback) _onSaveCallback(result); }, 1200);
      } else if (result?.status === 'completed_partial') {
        const details = [];
        if (!result.verified) details.push('releitura');
        if (result.cache_status !== 'updated') details.push('cache');
        _showFeedback(feedback, `Salvo parcialmente. Pendente: ${details.join(', ')}. Operação: ${result.operation_id}`, 'warning');
        try { const d = await window.GlpiClient.fetchAssetDetails(result.id || glpiId, _currentItemtype); updateShared(d); } catch {}
        setTimeout(() => { close(); if (_onSaveCallback) _onSaveCallback(result); }, 2000);
      } else if (result?.status === 'completed_unverified') {
        _showFeedback(feedback, 'Salvo, mas releitura não confirmou (resultado desconhecido). Operação: ' + (result.operation_id || 'N/A'), 'warning');
        // Não fechar automaticamente em unknown
      } else if (result?.status === 'failed' && result?.conflict) {
        _showConflict(feedback, result.conflict);
        // Preservar formulário, não fechar
      } else if (result?.status === 'failed') {
        _showFeedback(feedback, result?.error || 'Erro ao salvar.', 'error');
        // Preservar formulário
      } else {
        _showFeedback(feedback, result?.error || 'Erro ao salvar.', 'error');
      }
    } catch (e) {
      if (e.message?.includes('Timeout')) {
        _showFeedback(feedback, `Timeout: ${e.message}. Operação pode ter sido executada.`, 'warning');
      } else {
        _showFeedback(feedback, `Erro: ${e.message}`, 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar';
      _setFormEnabled(true);
    }
  }

  async function _create() {
    const btn = document.getElementById('asset-save-btn');
    const feedback = document.getElementById('asset-details-feedback');
    if (!btn || !_currentItemtype) return;

    const input = _collectFormValues();
    const writeOps = _capabilities?.writeOperations?.[_currentItemtype]?.create;
    const required = writeOps?.required || [];

    for (const field of required) {
      if (!input[field] || input[field] === '') {
        _showFeedback(feedback, `Campo obrigatório ausente: ${field}`, 'error');
        return;
      }
    }

    // Gerar chave de idempotência
    _idempotencyKey = _generateIdempotencyKey('create', _currentItemtype, 0, input);

    btn.disabled = true;
    btn.textContent = 'Criando...';
    _showFeedback(feedback, 'Enviando...', 'info');
    _setFormEnabled(false);

    try {
      const endpoint = _currentItemtype === 'Printer'
        ? '/api/assets/printers'
        : '/api/assets/computers';
      const response = await window.GlpiClient._fetch(endpoint, {
        method: 'POST',
        body: { input, idempotency_key: _idempotencyKey },
      });

      const result = response?.data;
      _pendingOperation = result;

      if (result?.status === 'completed_verified' || result?.status === 'completed_unverified') {
        const cacheMsg = result.cache_status === 'updated'
          ? ''
          : ' Atualização do GCC pendente.';
        _showFeedback(feedback, `Criado! ID: ${result.id}.${cacheMsg} Operação: ${result.operation_id}`, 'success');
        setTimeout(() => {
          close();
          if (_onSaveCallback) _onSaveCallback(result);
        }, 1500);
      } else if (result?.status === 'completed_partial') {
        _showFeedback(feedback, `Criado parcialmente. Operação: ${result.operation_id}`, 'warning');
        setTimeout(() => {
          close();
          if (_onSaveCallback) _onSaveCallback(result);
        }, 2000);
      } else {
        _showFeedback(feedback, result?.error || 'Erro ao criar.', 'error');
      }
    } catch (e) {
      _showFeedback(feedback, `Erro: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Criar';
      _setFormEnabled(true);
    }
  }

  async function _delete() {
    if (!_currentAsset || !_currentItemtype) return;
    const glpiId = _currentAsset.asset?.glpiId;
    if (!glpiId) return;

    if (!confirm(`Tem certeza que deseja excluir este ${_currentItemtype}? O ativo será marcado como inativo.`)) {
      return;
    }

    const feedback = document.getElementById('asset-details-feedback');
    _showFeedback(feedback, 'Excluindo...', 'info');

    try {
      const endpoint = _currentItemtype === 'Printer'
        ? `/api/assets/printers/${glpiId}/delete`
        : `/api/assets/computers/${glpiId}/delete`;
      const response = await window.GlpiClient._fetch(endpoint, { method: 'POST' });

      const result = response?.data;
      if (result?.status === 'completed_verified' || result?.status === 'completed_unverified') {
        _showFeedback(feedback, 'Excluído com sucesso!', 'success');
        setTimeout(() => {
          close();
          if (_onSaveCallback) _onSaveCallback(result);
        }, 1000);
      } else {
        _showFeedback(feedback, result?.error || 'Erro ao excluir.', 'error');
      }
    } catch (e) {
      _showFeedback(feedback, `Erro: ${e.message}`, 'error');
    }
  }

  async function _restore() {
    if (!_currentAsset || !_currentItemtype) return;
    const glpiId = _currentAsset.asset?.glpiId;
    if (!glpiId) return;

    if (!confirm(`Tem certeza que deseja restaurar este ${_currentItemtype}?`)) {
      return;
    }

    const feedback = document.getElementById('asset-details-feedback');
    _showFeedback(feedback, 'Restaurando...', 'info');

    try {
      const endpoint = _currentItemtype === 'Printer'
        ? `/api/assets/printers/${glpiId}/restore`
        : `/api/assets/computers/${glpiId}/restore`;
      const response = await window.GlpiClient._fetch(endpoint, { method: 'POST' });

      const result = response?.data;
      if (result?.status === 'completed_verified' || result?.status === 'completed_unverified') {
        _showFeedback(feedback, 'Restaurado com sucesso!', 'success');
        setTimeout(() => {
          close();
          if (_onSaveCallback) _onSaveCallback(result);
        }, 1000);
      } else {
        _showFeedback(feedback, result?.error || 'Erro ao restaurar.', 'error');
      }
    } catch (e) {
      _showFeedback(feedback, `Erro: ${e.message}`, 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════════

  function _collectFormValues() {
    const inputs = document.querySelectorAll('.asset-details-input[data-field]');
    const values = {};

    inputs.forEach(el => {
      const field = el.dataset.field;
      const value = el.tagName === 'SELECT' ? el.value : el.value;
      values[field] = value;
    });

    return values;
  }

  function _showFeedback(el, message, type) {
    if (!el) return;
    el.innerHTML = `<span class="asset-feedback asset-feedback--${type}">${_escHtml(message)}</span>`;
  }

  function _getAssetTitle(asset, itemtype) {
    const name = asset.nome || asset.name || '(sem nome)';
    const id = asset.glpiId || asset.id || '';
    return `${itemtype} #${id} — ${name}`;
  }

  function _isActive(asset) {
    const status = asset.status || '';
    return status === 'ativo' || status === 'active' || status === 'in_use' || status === '';
  }

  function _canEdit() {
    if (!_capabilities) return false;
    const profile = window.UserContext?.getSession?.()?.profile;
    if (profile === 'ADMIN') return true;
    if (profile === 'SUPORTE') {
      const module = _currentItemtype === 'Printer' ? 'impressoras' : 'computadores';
      return _capabilities.permissions?.modules?.[module]?.includes('edit') ?? false;
    }
    return false;
  }

  function _canDelete() {
    if (!_capabilities) return false;
    const profile = window.UserContext?.getSession?.()?.profile;
    if (profile === 'ADMIN') return true;
    if (profile === 'SUPORTE') {
      const module = _currentItemtype === 'Printer' ? 'impressoras' : 'computadores';
      return _capabilities.permissions?.modules?.[module]?.includes('delete') ?? false;
    }
    return false;
  }

  function _canRestore() {
    return _canDelete();
  }

  function _isDropdownField(fieldKey) {
    const dropdownFields = [
      'locations_id', 'groups_id', 'users_id', 'states_id',
      'printermodels_id', 'manufacturers_id', 'computermodels_id',
      'computertypes_id', 'entities_id',
    ];
    return dropdownFields.includes(fieldKey);
  }

  function _getFieldLabel(fieldKey) {
    const labels = {
      name: 'Nome',
      serial: 'Serial',
      otherserial: 'Patrimônio',
      contact: 'Contato',
      contact_num: 'Telefone / ramal',
      comment: 'Observações',
      locations_id: 'Localização',
      groups_id: 'Grupo',
      users_id: 'Usuário',
      states_id: 'Estado',
      printermodels_id: 'Modelo',
      manufacturers_id: 'Fabricante',
      computermodels_id: 'Modelo',
      computertypes_id: 'Tipo',
      entities_id: 'Entidade',
    };
    return labels[fieldKey] || fieldKey;
  }

  function _handleCloseAttempt() {
    const inputs = document.querySelectorAll('.asset-details-input[data-field]');
    let hasChanges = false;

    inputs.forEach(el => {
      if (el.dataset.originalValue !== undefined && el.value !== el.dataset.originalValue) {
        hasChanges = true;
      }
    });

    if (hasChanges) {
      if (!confirm('Existem alterações não salvas. Deseja sair?')) {
        return;
      }
    }

    _pendingOperation = null;
    _idempotencyKey = null;
    close();
  }

  /**
   * Gera chave de idempotência a partir dos parâmetros.
   */
  function _generateIdempotencyKey(action, itemtype, id, fields) {
    const sorted = Object.keys(fields).sort().reduce((acc, key) => {
      acc[key] = fields[key];
      return acc;
    }, {});
    const hash = _simpleHash(JSON.stringify(sorted));
    return `${action}:${itemtype}:${id}:${hash}`;
  }

  function _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Exibe conflito de edição concorrente.
   */
  function _showConflict(feedback, conflict) {
    if (!feedback) return;
    const currentValues = conflict.current_values || {};
    const changes = conflict.changes || [];

    let html = '<div class="asset-conflict">';
    html += '<strong>Conflito de edição concorrente</strong><br>';
    html += '<small>O ativo foi modificado por outro usuário.</small><br>';
    html += `<small>Modificado em: ${conflict.current_date_mod || 'N/A'}</small>`;
    html += '</div>';

    feedback.innerHTML = html;
  }

  /**
   * Habilita/desabilita todos os campos do formulário.
   */
  function _setFormEnabled(enabled) {
    const inputs = document.querySelectorAll('.asset-details-input[data-field]');
    inputs.forEach(el => {
      el.disabled = !enabled;
    });
  }

  function _escHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Expor métodos internos para onclick
  return {
    openDetail,
    openCreate,
    close,
    _save,
    _create,
    _delete,
    _restore,
    _handleCloseAttempt,
  };
})();
