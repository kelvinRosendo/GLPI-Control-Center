/**
 * GLPI Control Center - tests/integration.js
 * -----------------------------------------------------------------------------
 * Testes de integração entre módulos.
 *
 * Sprint 23: Testing
 */

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Integração Search + SearchStorage
// ════════════════════════════════════════════════════════════════════════════

describe('Integração: Search + SearchStorage', function () {

  beforeEach(function () {
    window.DATA = {
      computadores: [
        { nome: 'PC-001', serial: 'SN001', patrimonio: 'P001' },
        { nome: 'PC-002', serial: 'SN002', patrimonio: 'P002' },
      ],
      projetores: [
        { nome: 'PROJ-001', patrimonio: 'P100', sala: 'Sala 1' },
      ],
    };
    SearchStorage.invalidateCache();
    SearchStorage.clearHistory();
  });

  it('deve buscar em múltiplos módulos', function (assert) {
    const results = SearchStorage.searchAll('PC');
    assert.greaterThan(results.length, 1);
  });

  it('deve adicionar ao histórico após busca', function (assert) {
    SearchStorage.addToHistory('notebook');
    const history = SearchStorage.getHistory();
    assert.ok(history.some(h => h.query === 'notebook'));
  });

  it('deve normalizar resultados', function (assert) {
    const results = SearchStorage.searchAll('PC-001');
    assert.ok(results.length > 0);
    assert.equal(results[0].type, 'computadores');
    assert.equal(results[0].typeLabel, 'Computador');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Integração Settings + Theme
// ════════════════════════════════════════════════════════════════════════════

describe('Integração: Settings + Theme', function () {

  it('deve sincronizar tema', function (assert) {
    const original = Settings.get('appearance.theme');
    Settings.set('appearance.theme', original === 'dark' ? 'light' : 'dark');
    const theme = Theme.get();
    assert.ok(theme === 'dark' || theme === 'light');
    Settings.set('appearance.theme', original);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Integração Notifications + Audit
// ════════════════════════════════════════════════════════════════════════════

describe('Integração: Notifications + Audit', function () {

  it('deve registrar evento de notificação', function (assert) {
    const before = window.AuditStorage?.getAll()?.length || 0;
    window.Audit?.log('test_notification', { module: 'test' });
    const after = window.AuditStorage?.getAll()?.length || 0;
    assert.greaterThan(after, before);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Integração KeyboardShortcuts + App
// ════════════════════════════════════════════════════════════════════════════

describe('Integração: KeyboardShortcuts + App', function () {

  it('deve ter atalho de busca registrado', function (assert) {
    const shortcuts = KeyboardShortcuts.getAll();
    const searchShortcut = shortcuts.find(s => s.action === 'search:open');
    assert.ok(searchShortcut);
    assert.equal(searchShortcut.key, 'k');
    assert.ok(searchShortcut.ctrl);
  });

  it('deve ter atalhos de navegação', function (assert) {
    const shortcuts = KeyboardShortcuts.getAll();
    const navShortcuts = shortcuts.filter(s => s.action.startsWith('nav:'));
    assert.greaterThan(navShortcuts.length, 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Integração Cache + Módulos
// ════════════════════════════════════════════════════════════════════════════

describe('Integração: Cache + Módulos', function () {

  beforeEach(function () {
    Cache.clearAll();
  });

  it('deve caches resultados de busca', function (assert) {
    Cache.createStore('search', { ttl: 60000 });
    Cache.set('search', 'pc', [{ name: 'PC-001' }]);
    const cached = Cache.get('search', 'pc');
    assert.ok(cached);
    assert.equal(cached.length, 1);
  });

  it('deve invalidar cache expirado', function (assert) {
    Cache.createStore('short', { ttl: 1 });
    Cache.set('short', 'key', 'value');
    // Simular expiração
    const store = Cache.createStore('short');
    store.timestamps.key = Date.now() - 100;
    const result = Cache.get('short', 'key');
    assert.null(result);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Integração LoadingStates + Cache
// ════════════════════════════════════════════════════════════════════════════

describe('Integração: LoadingStates + Cache', function () {

  it('deve gerenciar loaders', function (assert) {
    assert.equal(LoadingStates.getActiveCount(), 0);
  });

  it('deve limpar todos os loaders', function (assert) {
    LoadingStates.hideAll();
    assert.equal(LoadingStates.getActiveCount(), 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Integração PC + Sidebar
// ════════════════════════════════════════════════════════════════════════════

describe('Integração: PC + Sidebar', function () {

  it('deve filtrar módulos por perfil', function (assert) {
    const keys = PC.getVisibleModuleKeys();
    assert.type(keys, 'object');
    assert.ok(Array.isArray(keys));
  });

  it('deve retornar modules keys como strings', function (assert) {
    const keys = PC.getVisibleModuleKeys();
    keys.forEach(key => {
      assert.type(key, 'string');
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Integração AuditStorage + AuditAnalytics
// ════════════════════════════════════════════════════════════════════════════

describe('Integração: AuditStorage + AuditAnalytics', function () {

  it('deve calcular métricas a partir dos dados', function (assert) {
    const metrics = AuditAnalytics.getMetrics();
    assert.type(metrics.total, 'number');
    assert.ok(metrics.total >= 0);
  });

  it('deve calcular tendências', function (assert) {
    const trends = AuditAnalytics.getTrends();
    assert.ok(trends.today);
    assert.ok(trends.thisWeek);
    assert.ok(typeof trends.today.change === 'number');
  });

  it('deve retornar timeline', function (assert) {
    const timeline = AuditAnalytics.getTimeline(7);
    assert.equal(timeline.length, 7);
    assert.ok(timeline[0].date);
    assert.type(timeline[0].count, 'number');
  });
});
