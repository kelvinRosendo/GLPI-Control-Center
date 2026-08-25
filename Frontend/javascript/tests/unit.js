/**
 * GLPI Control Center - tests/unit.js
 * -----------------------------------------------------------------------------
 * Testes unitários dos módulos core.
 *
 * Sprint 23: Testing
 */

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Utils
// ════════════════════════════════════════════════════════════════════════════

describe('Utils', function () {

  describe('debounce', function () {
    it('deve retornar função', function (assert) {
      const fn = Utils.debounce(() => {}, 100);
      assert.type(fn, 'function');
    });

    it('deve limitar chamadas', function (assert) {
      let count = 0;
      const fn = Utils.debounce(() => count++, 50);
      fn(); fn(); fn();
      assert.equal(count, 0);
    });
  });

  describe('throttle', function () {
    it('deve retornar função', function (assert) {
      const fn = Utils.throttle(() => {}, 100);
      assert.type(fn, 'function');
    });
  });

  describe('deepMerge', function () {
    it('deve merge profundo', function (assert) {
      const a = { x: 1, y: { z: 2 } };
      const b = { y: { w: 3 }, k: 4 };
      const result = Utils.deepMerge(a, b);
      assert.deepEqual(result, { x: 1, y: { z: 2, w: 3 }, k: 4 });
    });

    it('deve sobrescrever valores', function (assert) {
      const a = { x: 1 };
      const b = { x: 2 };
      const result = Utils.deepMerge(a, b);
      assert.equal(result.x, 2);
    });
  });

  describe('deepClone', function () {
    it('deve clonar objeto', function (assert) {
      const obj = { a: 1, b: { c: 2 } };
      const clone = Utils.deepClone(obj);
      assert.deepEqual(clone, obj);
      clone.b.c = 99;
      assert.equal(obj.b.c, 2);
    });
  });

  describe('escapeHtml', function () {
    it('deve escapar HTML', function (assert) {
      const result = Utils.escapeHtml('<script>alert("xss")</script>');
      assert.ok(!result.includes('<script>'));
    });

    it('deve retornar string vazia para null', function (assert) {
      assert.equal(Utils.escapeHtml(null), '');
      assert.equal(Utils.escapeHtml(undefined), '');
    });
  });

  describe('formatNumber', function () {
    it('deve formatar número', function (assert) {
      const result = Utils.formatNumber(1234567);
      assert.ok(result.includes('1'));
      assert.ok(result.includes('234'));
      assert.ok(result.includes('567'));
    });
  });

  describe('timeAgo', function () {
    it('deve retornar "Agora" para agora', function (assert) {
      const result = Utils.timeAgo(new Date());
      assert.equal(result, 'Agora');
    });
  });

  describe('formatBytes', function () {
    it('deve formatar bytes', function (assert) {
      assert.equal(Utils.formatBytes(0), '0 B');
      assert.ok(Utils.formatBytes(1024).includes('KB'));
      assert.ok(Utils.formatBytes(1048576).includes('MB'));
    });
  });

  describe('isEmpty', function () {
    it('deve detectar valores vazios', function (assert) {
      assert.ok(Utils.isEmpty(null));
      assert.ok(Utils.isEmpty(undefined));
      assert.ok(Utils.isEmpty(''));
      assert.ok(Utils.isEmpty('  '));
      assert.ok(Utils.isEmpty([]));
      assert.ok(Utils.isEmpty({}));
    });

    it('deve detectar valores não vazios', function (assert) {
      assert.ok(!Utils.isEmpty(0));
      assert.ok(!Utils.isEmpty(false));
      assert.ok(!Utils.isEmpty('hello'));
      assert.ok(!Utils.isEmpty([1]));
      assert.ok(!Utils.isEmpty({ a: 1 }));
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Cache
// ════════════════════════════════════════════════════════════════════════════

describe('Cache', function () {

  beforeEach(function () {
    Cache.clearAll();
  });

  describe('createStore', function () {
    it('deve criar store', function (assert) {
      const store = Cache.createStore('test1');
      assert.ok(store);
    });

    it('deve retornar mesmo store', function (assert) {
      const s1 = Cache.createStore('test2');
      const s2 = Cache.createStore('test2');
      assert.equal(s1, s2);
    });
  });

  describe('set/get', function () {
    it('deve armazenar e recuperar', function (assert) {
      Cache.createStore('test3');
      Cache.set('test3', 'key', 'value');
      assert.equal(Cache.get('test3', 'key'), 'value');
    });

    it('deve retornar null para chave inexistente', function (assert) {
      Cache.createStore('test4');
      assert.null(Cache.get('test4', 'nonexistent'));
    });
  });

  describe('del', function () {
    it('deve remover valor', function (assert) {
      Cache.createStore('test5');
      Cache.set('test5', 'key', 'value');
      Cache.del('test5', 'key');
      assert.null(Cache.get('test5', 'key'));
    });
  });

  describe('clear', function () {
    it('deve limpar store', function (assert) {
      Cache.createStore('test6');
      Cache.set('test6', 'a', 1);
      Cache.set('test6', 'b', 2);
      Cache.clear('test6');
      assert.null(Cache.get('test6', 'a'));
      assert.null(Cache.get('test6', 'b'));
    });
  });

  describe('getStats', function () {
    it('deve retornar estatísticas', function (assert) {
      Cache.createStore('test7');
      Cache.set('test7', 'key', 'value');
      Cache.get('test7', 'key');
      Cache.get('test7', 'missing');
      const stats = Cache.getStats('test7');
      assert.equal(stats.entries, 1);
      assert.equal(stats.hits, 1);
      assert.equal(stats.misses, 1);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: SearchStorage
// ════════════════════════════════════════════════════════════════════════════

describe('SearchStorage', function () {

  describe('history', function () {
    it('deve adicionar ao histórico', function (assert) {
      SearchStorage.clearHistory();
      SearchStorage.addToHistory('notebook');
      const history = SearchStorage.getHistory();
      assert.ok(history.length > 0);
      assert.equal(history[0].query, 'notebook');
    });

    it('deve limpar histórico', function (assert) {
      SearchStorage.addToHistory('test');
      SearchStorage.clearHistory();
      assert.equal(SearchStorage.getHistory().length, 0);
    });
  });

  describe('searchAll', function () {
    it('deve retornar array', function (assert) {
      const results = SearchStorage.searchAll('');
      assert.type(results, 'object');
    });

    it('deve buscar por query', function (assert) {
      window.DATA = { computadores: [{ nome: 'PC-001', serial: 'SN123' }] };
      const results = SearchStorage.searchAll('PC');
      assert.greaterThan(results.length, 0);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: NotificationPreferences
// ════════════════════════════════════════════════════════════════════════════

describe('NotificationPreferences', function () {

  describe('getAll', function () {
    it('deve retornar preferências', function (assert) {
      const prefs = NotificationPreferences.getAll();
      assert.ok(prefs);
      assert.ok(prefs.categories);
      assert.ok(prefs.channels);
    });
  });

  describe('isCategoryEnabled', function () {
    it('deve verificar categoria', function (assert) {
      assert.ok(NotificationPreferences.isCategoryEnabled('WORKFLOW'));
    });
  });

  describe('set', function () {
    it('deve atualizar preferência', function (assert) {
      NotificationPreferences.set('categories.WORKFLOW', false);
      assert.ok(!NotificationPreferences.isCategoryEnabled('WORKFLOW'));
      NotificationPreferences.set('categories.WORKFLOW', true);
    });
  });

  describe('reset', function () {
    it('deve resetar para padrão', function (assert) {
      NotificationPreferences.set('categories.WORKFLOW', false);
      NotificationPreferences.reset();
      assert.ok(NotificationPreferences.isCategoryEnabled('WORKFLOW'));
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: Settings
// ════════════════════════════════════════════════════════════════════════════

describe('Settings', function () {

  describe('get', function () {
    it('deve retornar configuração', function (assert) {
      const theme = Settings.get('appearance.theme');
      assert.ok(theme);
    });

    it('deve retornar undefined para path inválido', function (assert) {
      assert.undefined(Settings.get('invalid.path.here'));
    });
  });

  describe('getCategories', function () {
    it('deve retornar categorias', function (assert) {
      const cats = Settings.getCategories();
      assert.ok(cats.length > 0);
    });
  });

  describe('getDefaults', function () {
    it('deve retornar padrões', function (assert) {
      const defaults = Settings.getDefaults();
      assert.ok(defaults.appearance);
      assert.ok(defaults.notifications);
    });
  });

  describe('exportSettings', function () {
    it('deve exportar JSON', function (assert) {
      const json = Settings.exportSettings();
      assert.type(json, 'string');
      const parsed = JSON.parse(json);
      assert.ok(parsed.appearance);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: KeyboardShortcuts
// ════════════════════════════════════════════════════════════════════════════

describe('KeyboardShortcuts', function () {

  describe('getAll', function () {
    it('deve retornar atalhos', function (assert) {
      const shortcuts = KeyboardShortcuts.getAll();
      assert.ok(shortcuts.length > 0);
    });
  });

  describe('register', function () {
    it('deve registrar atalho', function (assert) {
      const before = KeyboardShortcuts.getAll().length;
      KeyboardShortcuts.register({
        key: 't',
        ctrl: true,
        action: 'test:action',
        label: 'Test',
        category: 'Test',
      });
      const after = KeyboardShortcuts.getAll().length;
      assert.greaterThan(after, before);
      KeyboardShortcuts.unregister('test:action');
    });
  });

  describe('isEnabled', function () {
    it('deve retornar booleano', function (assert) {
      assert.type(KeyboardShortcuts.isEnabled(), 'boolean');
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: PC (PermissionChecker)
// ════════════════════════════════════════════════════════════════════════════

describe('PC (PermissionChecker)', function () {

  describe('isAdmin', function () {
    it('deve retornar booleano', function (assert) {
      assert.type(PC.isAdmin(), 'boolean');
    });
  });

  describe('getVisibleModuleKeys', function () {
    it('deve retornar array', function (assert) {
      const keys = PC.getVisibleModuleKeys();
      assert.type(keys, 'object');
    });
  });

  describe('getProfile', function () {
    it('deve retornar perfil ou null', function (assert) {
      const profile = PC.getProfile();
      assert.ok(profile === null || typeof profile === 'string');
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTES: AuditAnalytics
// ════════════════════════════════════════════════════════════════════════════

describe('AuditAnalytics', function () {

  describe('getMetrics', function () {
    it('deve retornar métricas', function (assert) {
      const metrics = AuditAnalytics.getMetrics();
      assert.type(metrics.total, 'number');
      assert.type(metrics.today, 'number');
      assert.type(metrics.errors, 'number');
    });
  });

  describe('getTrends', function () {
    it('deve retornar tendências', function (assert) {
      const trends = AuditAnalytics.getTrends();
      assert.ok(trends.today);
      assert.ok(trends.thisWeek);
    });
  });

  describe('getTopUsers', function () {
    it('deve retornar array', function (assert) {
      const users = AuditAnalytics.getTopUsers(5);
      assert.type(users, 'object');
    });
  });

  describe('exportJSON', function () {
    it('deve exportar JSON', function (assert) {
      const json = AuditAnalytics.exportJSON();
      assert.type(json, 'string');
    });
  });

  describe('exportCSV', function () {
    it('deve exportar CSV', function (assert) {
      const csv = AuditAnalytics.exportCSV();
      assert.type(csv, 'string');
      assert.ok(csv.includes(';'));
    });
  });
});
