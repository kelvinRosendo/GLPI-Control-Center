/**
 * GLPI Control Center - test-runner.js
 * -----------------------------------------------------------------------------
 * Framework leve de testes para o navegador.
 *
 * Sprint 23: Testing
 */

window.TestRunner = (function () {
  'use strict';

  const _suites = [];
  let _currentSuite = null;
  let _results = { total: 0, passed: 0, failed: 0, skipped: 0 };
  let _onComplete = null;

  // ════════════════════════════════════════════════════════════════════════════
  // ASSERTIONS
  // ════════════════════════════════════════════════════════════════════════════

  const assert = {
    equal(actual, expected, msg) {
      if (actual !== expected) {
        throw new Error(`${msg || 'Assertion failed'}: expected "${expected}", got "${actual}"`);
      }
    },

    deepEqual(actual, expected, msg) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${msg || 'Deep equal failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },

    notEqual(actual, expected, msg) {
      if (actual === expected) {
        throw new Error(`${msg || 'Assertion failed'}: expected not equal to "${expected}"`);
      }
    },

    ok(value, msg) {
      if (!value) {
        throw new Error(`${msg || 'Assertion failed'}: expected truthy value`);
      }
    },

    throws(fn, msg) {
      try {
        fn();
        throw new Error(`${msg || 'Expected function to throw'}`);
      } catch (e) {
        if (e.message === `${msg || 'Expected function to throw'}`) {
          throw e;
        }
      }
    },

    contains(arr, value, msg) {
      if (!arr.includes(value)) {
        throw new Error(`${msg || 'Array does not contain'}: ${value}`);
      }
    },

    type(value, type, msg) {
      if (typeof value !== type) {
        throw new Error(`${msg || 'Type mismatch'}: expected ${type}, got ${typeof value}`);
      }
    },

    null(value, msg) {
      if (value !== null) {
        throw new Error(`${msg || 'Expected null'}: got ${value}`);
      }
    },

    undefined(value, msg) {
      if (value !== undefined) {
        throw new Error(`${msg || 'Expected undefined'}: got ${value}`);
      }
    },

    greaterThan(actual, expected, msg) {
      if (!(actual > expected)) {
        throw new Error(`${msg || 'Greater than failed'}: ${actual} is not greater than ${expected}`);
      }
    },

    lessThan(actual, expected, msg) {
      if (!(actual < expected)) {
        throw new Error(`${msg || 'Less than failed'}: ${actual} is not less than ${expected}`);
      }
    },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // SUITES & TESTS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Cria uma suíte de testes.
   * @param {string} name - Nome da suíte
   * @param {Function} fn - Função com os testes
   */
  function describe(name, fn) {
    const parentSuite = _currentSuite;
    const suite = { name, tests: [], beforeEach: null, afterEach: null };
    _currentSuite = suite;
    try {
      fn();
      _suites.push(suite);
    } finally {
      _currentSuite = parentSuite;
    }
  }

  /**
   * Define um teste.
   * @param {string} name - Nome do teste
   * @param {Function} fn - Função do teste
   */
  function it(name, fn) {
    if (_currentSuite) {
      _currentSuite.tests.push({ name, fn, skip: false });
    }
  }

  /**
   * Pula um teste.
   * @param {string} name - Nome do teste
   * @param {Function} fn - Função do teste (opcional)
   */
  function xit(name, fn) {
    if (_currentSuite) {
      _currentSuite.tests.push({ name, fn: fn || (() => {}), skip: true });
    }
  }

  /**
   * Define beforeEach para uma suíte.
   * @param {Function} fn
   */
  function beforeEach(fn) {
    if (_currentSuite) {
      _currentSuite.beforeEach = fn;
    }
  }

  /**
   * Define afterEach para uma suíte.
   * @param {Function} fn
   */
  function afterEach(fn) {
    if (_currentSuite) {
      _currentSuite.afterEach = fn;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXECUÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Executa todos os testes.
   * @param {Function} onComplete - Callback ao finalizar
   * @returns {object} Resultados
   */
  function run(onComplete) {
    _onComplete = onComplete;
    _results = { total: 0, passed: 0, failed: 0, skipped: 0, errors: [] };

    console.log('%c Test Runner ', 'background: #4f7ef7; color: white; padding: 4px 8px; border-radius: 4px;', 'Iniciando testes...\n');

    _suites.forEach(suite => {
      console.log(`%c ${suite.name} `, 'background: #333; color: #fff; padding: 2px 6px;', '');

      suite.tests.forEach(test => {
        _results.total++;

        if (test.skip) {
          _results.skipped++;
          console.log(`  ⊘ ${test.name} (skipped)`);
          return;
        }

        try {
          if (suite.beforeEach) suite.beforeEach();
          test.fn(assert);
          if (suite.afterEach) suite.afterEach();
          _results.passed++;
          console.log(`  ✓ ${test.name}`);
        } catch (e) {
          _results.failed++;
          _results.errors.push({ suite: suite.name, test: test.name, error: e.message });
          console.log(`  ✗ ${test.name}`);
          console.log(`    Error: ${e.message}`);
        }
      });
    });

    _printSummary();

    if (_onComplete) _onComplete(_results);

    return _results;
  }

  function _printSummary() {
    const { total, passed, failed, skipped } = _results;
    const color = failed === 0 ? '#48c78e' : '#ff5555';

    console.log('\n%c Resultados ', `background: ${color}; color: white; padding: 4px 8px; border-radius: 4px;`);
    console.log(`  Total: ${total}`);
    console.log(`  Passou: ${passed}`);
    console.log(`  Falhou: ${failed}`);
    console.log(`  Pulados: ${skipped}`);

    if (failed > 0) {
      console.log('\n%c Erros: ', 'background: #ff5555; color: white; padding: 2px 6px;');
      _results.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. [${err.suite}] ${err.test}: ${err.error}`);
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    describe,
    it,
    xit,
    beforeEach,
    afterEach,
    run,
    assert,
    getResults: () => ({ ..._results }),
  };
})();

// Alias global
window.describe = window.TestRunner.describe;
window.it = window.TestRunner.it;
window.xit = window.TestRunner.xit;
window.beforeEach = window.TestRunner.beforeEach;
window.afterEach = window.TestRunner.afterEach;
