/**
 * GLPI Control Center - perf-monitor.js
 * -----------------------------------------------------------------------------
 * Monitor de performance em tempo real.
 *
 * Rastreia métricas de carregamento, renderização e interação.
 *
 * Sprint 28: Performance Audit
 */

window.PerfMonitor = (function () {
  'use strict';

  let _initialized = false;
  let _enabled = true;
  const _metrics = {};
  const _marks = {};
  const _observers = [];

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    if (_initialized) return;
    _initialized = true;

    _observeNavigation();
    _observePaint();
    _observeLCP();
    _observeFID();
    _observeCLS();
    _observeMemory();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MARKS & MEASURES
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Cria um mark de performance.
   * @param {string} name
   */
  function mark(name) {
    if (!_enabled) return;
    _marks[name] = performance.now();
    performance.mark?.(name);
  }

  /**
   * Mede tempo entre dois marks.
   * @param {string} name - Nome da medida
   * @param {string} start - Mark inicial
   * @param {string} end - Mark final
   * @returns {number} Duração em ms
   */
  function measure(name, start, end) {
    if (!_enabled) return 0;

    const startTime = _marks[start] || 0;
    const endTime = _marks[end] || performance.now();
    const duration = endTime - startTime;

    _metrics[name] = duration;
    performance.measure?.(name, start, end);

    return duration;
  }

  /**
   * Retorna uma mark atual.
   * @param {string} name
   * @returns {number}
   */
  function now(name) {
    const time = performance.now();
    if (name) _marks[name] = time;
    return time;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // WEB VITALS
  // ════════════════════════════════════════════════════════════════════════════

  function _observeNavigation() {
    if (!('PerformanceNavigationTiming' in window)) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        const entries = performance.getEntriesByType('navigation');
        if (entries.length > 0) {
          const nav = entries[0];
          _metrics.ttfb = nav.responseStart - nav.requestStart;
          _metrics.domContentLoaded = nav.domContentLoadedEventEnd - nav.fetchStart;
          _metrics.load = nav.loadEventEnd - nav.fetchStart;
          _metrics.domInteractive = nav.domInteractive - nav.fetchStart;
          _metrics.transferSize = nav.transferSize || 0;
        }
      }, 0);
    });
  }

  function _observePaint() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-paint') {
            _metrics.fp = entry.startTime;
          }
          if (entry.name === 'first-contentful-paint') {
            _metrics.fcp = entry.startTime;
          }
        }
      });
      observer.observe({ type: 'paint', buffered: true });
      _observers.push(observer);
    } catch (e) {
      // Ignorar
    }
  }

  function _observeLCP() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        _metrics.lcp = lastEntry.startTime;
        _metrics.lcpElement = lastEntry.element?.tagName || '';
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      _observers.push(observer);
    } catch (e) {
      // Ignorar
    }
  }

  function _observeFID() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          _metrics.fid = entry.processingStart - entry.startTime;
        }
      });
      observer.observe({ type: 'first-input', buffered: true });
      _observers.push(observer);
    } catch (e) {
      // Ignorar
    }
  }

  function _observeCLS() {
    if (!('PerformanceObserver' in window)) return;

    let clsValue = 0;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        _metrics.cls = clsValue;
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      _observers.push(observer);
    } catch (e) {
      // Ignorar
    }
  }

  function _observeMemory() {
    if (!('memory' in performance)) return;

    setInterval(() => {
      const mem = performance.memory;
      _metrics.memoryUsed = mem.usedJSHeapSize;
      _metrics.memoryTotal = mem.totalJSHeapSize;
      _metrics.memoryLimit = mem.jsHeapSizeLimit;
    }, 5000);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CUSTOM METRICS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Registra métrica customizada.
   * @param {string} name
   * @param {number} value
   */
  function setMetric(name, value) {
    _metrics[name] = value;
  }

  /**
   * Retorna métrica.
   * @param {string} name
   * @returns {number}
   */
  function getMetric(name) {
    return _metrics[name];
  }

  /**
   * Retorna todas as métricas.
   * @returns {object}
   */
  function getMetrics() {
    return { ..._metrics };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TIMER HELPER
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Cronometra uma função.
   * @param {string} name
   * @param {Function} fn
   * @returns {*} Resultado da função
   */
  function time(name, fn) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    _metrics[name] = duration;
    return result;
  }

  /**
   * Cronometra uma função async.
   * @param {string} name
   * @param {Function} fn
   * @returns {Promise<*>}
   */
  async function timeAsync(name, fn) {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    _metrics[name] = duration;
    return result;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CONTROLES
  // ════════════════════════════════════════════════════════════════════════════

  function enable() { _enabled = true; }
  function disable() { _enabled = false; }
  function isEnabled() { return _enabled; }

  function clear() {
    Object.keys(_metrics).forEach(k => delete _metrics[k]);
    Object.keys(_marks).forEach(k => delete _marks[k]);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    mark,
    measure,
    now,
    setMetric,
    getMetric,
    getMetrics,
    time,
    timeAsync,
    enable,
    disable,
    isEnabled,
    clear,
  };
})();
