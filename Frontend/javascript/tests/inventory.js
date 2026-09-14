/**
 * GLPI Control Center - tests/inventory.js
 * -----------------------------------------------------------------------------
 * Testes de integração de inventário GLPI x GCC.
 *
 * Cobrem: paginação, classificação de ativos, status, itemtype,
 * cache, atualização, e diagnóstico.
 */

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Classificação de Ativos (Backend)
// ════════════════════════════════════════════════════════════════════════════

describe('Classificacao de Ativos', function () {

  describe('isComputador', function () {
    it('deve aceitar computador sem prefixo CS-/CO-', function (assert) {
      assert.ok(typeof isComputador === 'function');
      assert.ok(isComputador('Laboratorio-01'));
      assert.ok(isComputador('TI-Sala3'));
      assert.ok(isComputador('CS-001'));
      assert.ok(isComputador('CO-001'));
    });

    it('deve rejeitar nome vazio', function (assert) {
      assert.ok(!isComputador(''));
    });
  });

  describe('isGeekiee', function () {
    it('deve detectar Chrome G-', function (assert) {
      assert.ok(isGeekiee('Chrome G-001'));
      assert.ok(isGeekiee('Chrome G-123'));
      assert.ok(!isGeekiee('Chrome-001'));
      assert.ok(!isGeekiee('PC-001'));
    });
  });

  describe('isApoio', function () {
    it('deve detectar Chrome-', function (assert) {
      assert.ok(isApoio('Chrome-001'));
      assert.ok(!isApoio('Chrome G-001'));
      assert.ok(!isApoio('PC-001'));
    });
  });

  describe('isProjetor', function () {
    it('deve detectar Projetor', function (assert) {
      assert.ok(isProjetor('Projetor Sala 01'));
      assert.ok(!isProjetor('PC-001'));
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Mappers - Status
// ════════════════════════════════════════════════════════════════════════════

describe('Mappers - Status', function () {

  describe('status com IDs numericos', function () {
    it('deve mapear states_id 0 para ativo', function (assert) {
      const result = Mappers.computer({ id: 1, name: 'PC-001', states_id: 0 });
      assert.equal(result.status, 'ativo');
    });

    it('deve mapear states_id 2 para manutencao', function (assert) {
      const result = Mappers.computer({ id: 1, name: 'PC-001', states_id: 2 });
      assert.equal(result.status, 'manutencao');
    });

    it('deve mapear states_id 3 para emprestado', function (assert) {
      const result = Mappers.computer({ id: 1, name: 'PC-001', states_id: 3 });
      assert.equal(result.status, 'emprestado');
    });
  });

  describe('status com texto (expand_dropdowns)', function () {
    it('deve mapear "Ativo" para ativo', function (assert) {
      const result = Mappers.computer({ id: 1, name: 'PC-001', states_id: 'Ativo' });
      assert.equal(result.status, 'ativo');
    });

    it('deve mapear "Em manutenção" para manutencao', function (assert) {
      const result = Mappers.computer({ id: 1, name: 'PC-001', states_id: 'Em manutenção' });
      assert.equal(result.status, 'manutencao');
    });

    it('deve mapear "Emprestado" para emprestado', function (assert) {
      const result = Mappers.computer({ id: 1, name: 'PC-001', states_id: 'Emprestado' });
      assert.equal(result.status, 'emprestado');
    });

    it('deve mapear "Inativo" para inativo', function (assert) {
      const result = Mappers.computer({ id: 1, name: 'PC-001', states_id: 'Inativo' });
      assert.equal(result.status, 'inativo');
    });
  });

  describe('status com objeto expandido', function () {
    it('deve extrair nome do objeto states_id', function (assert) {
      const result = Mappers.computer({ id: 1, name: 'PC-001', states_id: { name: 'Ativo' } });
      assert.equal(result.status, 'ativo');
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Mappers - itemtype
// ════════════════════════════════════════════════════════════════════════════

describe('Mappers - itemtype', function () {

  it('computer deve retornar itemtype Computer', function (assert) {
    const result = Mappers.computer({ id: 1, name: 'PC-001' });
    assert.equal(result.itemtype, 'Computer');
  });

  it('impressora deve retornar itemtype Printer', function (assert) {
    const result = Mappers.impressora({ id: 1, name: 'Imp-001' });
    assert.equal(result.itemtype, 'Printer');
  });

  it('chromebookGeekiee deve retornar itemtype Computer', function (assert) {
    const result = Mappers.chromebookGeekiee({ id: 1, name: 'Chrome G-001' });
    assert.equal(result.itemtype, 'Computer');
  });

  it('chromebookApoio deve retornar itemtype Computer', function (assert) {
    const result = Mappers.chromebookApoio({ id: 1, name: 'Chrome-001' });
    assert.equal(result.itemtype, 'Computer');
  });

  it('projetor deve retornar itemtype Computer', function (assert) {
    const result = Mappers.projetor({ id: 1, name: 'Projetor Sala 01' });
    assert.equal(result.itemtype, 'Computer');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Mappers - Impressora (sem contact override)
// ════════════════════════════════════════════════════════════════════════════

describe('Mappers - Impressora', function () {

  it('deve usar locations_id para reparticao', function (assert) {
    const result = Mappers.impressora({
      id: 1,
      name: 'Imp-001',
      locations_id: 'Sala 101',
      contact: 'João',
      contact_num: '1234',
    });
    assert.equal(result.reparticao, 'Sala 101');
  });

  it('deve usar printermodels_id para modelo', function (assert) {
    const result = Mappers.impressora({
      id: 1,
      name: 'Imp-001',
      printermodels_id: 'HP LaserJet',
    });
    assert.equal(result.modelo, 'HP LaserJet');
  });

  it('nao deve ter campo ip', function (assert) {
    const result = Mappers.impressora({ id: 1, name: 'Imp-001' });
    assert.ok(!('ip' in result));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Mappers - Computer e Printer com mesmo ID
// ════════════════════════════════════════════════════════════════════════════

describe('Identidade por itemtype + id', function () {

  it('Computer:10 e Printer:10 sao registros diferentes', function (assert) {
    const computer = Mappers.computer({ id: 10, name: 'PC-010' });
    const printer = Mappers.impressora({ id: 10, name: 'Imp-010' });
    assert.equal(computer.itemtype, 'Computer');
    assert.equal(printer.itemtype, 'Printer');
    assert.equal(computer.glpiId, 10);
    assert.equal(printer.glpiId, 10);
    assert.notEqual(computer.itemtype, printer.itemtype);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Dashboard - Auto-Refresh
// ════════════════════════════════════════════════════════════════════════════

describe('Dashboard - Auto-Refresh', function () {

  it('deve ter metodo load', function (assert) {
    assert.type(window.Dashboard.load, 'function');
  });

  it('deve ter metodo forceRefresh', function (assert) {
    assert.type(window.Dashboard.forceRefresh, 'function');
  });

  it('load deve retornar Promise', function (assert) {
    const result = window.Dashboard.load();
    assert.type(result.then, 'function');
    result.catch(() => {});
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: GlpiClient - loadAll preserva dados
// ════════════════════════════════════════════════════════════════════════════

describe('GlpiClient - loadAll', function () {

  it('deve ter metodo loadAll', function (assert) {
    assert.type(window.GlpiClient.loadAll, 'function');
  });

  it('deve retornar Promise com ok', function (assert) {
    const result = window.GlpiClient.loadAll();
    assert.type(result.then, 'function');
    result.catch(() => {});
  });

  it('deve ter metodo fetchDiagnostic', function (assert) {
    assert.type(window.GlpiClient.fetchDiagnostic, 'function');
  });

  it('deve ter metodo getDiagnosticExportUrl', function (assert) {
    assert.type(window.GlpiClient.getDiagnosticExportUrl, 'function');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: App - TTL do cache de detalhes
// ════════════════════════════════════════════════════════════════════════════

describe('App - Cache de Detalhes', function () {

  it('deve ter metodo toggleComputerPanel', function (assert) {
    assert.type(window.App.toggleComputerPanel, 'function');
  });

  it('deve ter metodo saveComputerDetails', function (assert) {
    assert.type(window.App.saveComputerDetails, 'function');
  });

  it('state deve suportar _fetchedAt', function (assert) {
    window.State.updateComputerDetails(999, { data: { test: true }, _fetchedAt: Date.now() });
    const details = window.STATE.computerDetailsById[999];
    assert.ok(details._fetchedAt > 0);
    delete window.STATE.computerDetailsById[999];
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: UI Render - itemtype em botoes
// ════════════════════════════════════════════════════════════════════════════

describe('UI Render - itemtype', function () {

  it('renderCard para impressora deve usar printer.form.php', function (assert) {
    window.CONFIG = { glpiUrl: 'http://test.com/glpi' };
    window.STATE = window.STATE || {};
    window.STATE.search = '';
    window.STATE.status = 'todos';
    const html = window.UI._renderCard({ glpiId: 10, nome: 'Imp-010', itemtype: 'Printer' }, 'impressora');
    assert.ok(html.includes('printer.form.php'));
    assert.ok(html.includes('data-itemtype="Printer"'));
  });

  it('renderCard para computer deve usar computer.form.php', function (assert) {
    window.CONFIG = { glpiUrl: 'http://test.com/glpi' };
    window.STATE = window.STATE || {};
    window.STATE.search = '';
    window.STATE.status = 'todos';
    const html = window.UI._renderCard({ glpiId: 10, nome: 'PC-010', itemtype: 'Computer' }, 'computer');
    assert.ok(html.includes('computer.form.php'));
    assert.ok(html.includes('data-itemtype="Computer"'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Extracao de Label de Estado
// ════════════════════════════════════════════════════════════════════════════

describe('Mappers - extractStateLabel', function () {

  it('deve retornar texto quando states_id e string', function (assert) {
    const result = Mappers.computer({ id: 1, name: 'PC', states_id: 'Em manutenção' });
    assert.ok(result.status === 'manutencao');
  });

  it('deve retornar nome do objeto quando states_id e array', function (assert) {
    const result = Mappers.computerDetails({ id: 1, name: 'PC', states_id: { name: 'Emprestado' } });
    const stateSection = result.sections.find(s => s.id === 'alocacao');
    const stateField = stateSection.fields.find(f => f.key === 'state_label');
    assert.equal(stateField.displayValue, 'Emprestado');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Workflow - itemtype dinamico
// ════════════════════════════════════════════════════════════════════════════

describe('Workflow - itemtype', function () {

  it('deve usar itemtype do asset no payload', function (assert) {
    window.Workflow.workflowData.asset = { glpiId: 10, itemtype: 'Printer' };
    window.Workflow.workflowData.assistance = 'remota';
    window.Workflow.workflowData.checklist = { prioridade: 3, tipoProblema: '', mauUso: false, mauUsoDescricao: '' };
    window.Workflow.workflowData.observations = '';
    window.Workflow.workflowData.rules = {};
    window.Workflow.workflowData.metadata = { workflowVersion: '3.0', createdAt: new Date().toISOString() };
    const payload = window.Workflow._buildPayload();
    assert.equal(payload.itemtype, 'Printer');
  });

  it('deve default para Computer quando itemtype ausente', function (assert) {
    window.Workflow.workflowData.asset = { glpiId: 10 };
    const payload = window.Workflow._buildPayload();
    assert.equal(payload.itemtype, 'Computer');
  });
});
