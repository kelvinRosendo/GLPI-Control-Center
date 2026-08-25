/**
 * GLPI Control Center - perf-metrics.js
 * Sprint 28: Performance Audit
 */
window.PerfMetrics = (function () {
  'use strict';
  var _history = [];
  var THRESHOLDS = {
    fcp: { good: 1800, poor: 3000 },
    lcp: { good: 2500, poor: 4000 },
    fid: { good: 100, poor: 300 },
    cls: { good: 0.1, poor: 0.25 },
    ttfb: { good: 800, poor: 1800 }
  };

  function analyze() {
    var m = window.PerfMonitor ? window.PerfMonitor.getMetrics() : {};
    var r = { timestamp: new Date().toISOString(), scores: {}, issues: [], recommendations: [] };
    r.scores.fcp = _score('fcp', m.fcp);
    r.scores.lcp = _score('lcp', m.lcp);
    r.scores.fid = _score('fid', m.fid);
    r.scores.cls = _score('cls', m.cls);
    r.scores.ttfb = _score('ttfb', m.ttfb);
    _addIssues(r, m);
    _addRecommendations(r);
    _history.push(r);
    if (_history.length > 50) _history.shift();
    return r;
  }

  function _score(name, value) {
    if (value === undefined || value === null) return { label: 'N/A', color: '#565f89' };
    var t = THRESHOLDS[name];
    if (!t) return { label: 'N/A', color: '#565f89' };
    if (value <= t.good) return { label: 'Bom', color: '#9ece6a', value: value };
    if (value <= t.poor) return { label: 'Razoável', color: '#e0af68', value: value };
    return { label: 'Ruim', color: '#f7768e', value: value };
  }

  function _addIssues(r, m) {
    if (m.fcp && m.fcp > 3000) r.issues.push('FCP muito alto: ' + Math.round(m.fcp) + 'ms');
    if (m.lcp && m.lcp > 4000) r.issues.push('LCP muito alto: ' + Math.round(m.lcp) + 'ms');
    if (m.fid && m.fid > 300) r.issues.push('FID alto: ' + Math.round(m.fid) + 'ms');
    if (m.cls && m.cls > 0.25) r.issues.push('CLS alto: ' + m.cls.toFixed(3));
    if (m.ttfb && m.ttfb > 1800) r.issues.push('TTFB alto: ' + Math.round(m.ttfb) + 'ms');
    if (m.memoryUsed && m.memoryLimit && m.memoryUsed > m.memoryLimit * 0.8) {
      r.issues.push('Uso de memória alto');
    }
  }

  function _addRecommendations(r) {
    r.recommendations.push('Minificar CSS e JavaScript');
    r.recommendations.push('Usar lazy loading para imagens');
    r.recommendations.push('Ativar compressão GZIP no servidor');
    r.recommendations.push('Usar cache do navegador para assets estáticos');
    r.recommendations.push('Considerar usar CDN para assets');
  }

  function getHistory() { return _history.slice(); }
  function clearHistory() { _history.length = 0; }

  function getSummary() {
    var last = _history[_history.length - 1];
    return last || analyze();
  }

  function exportReport() {
    return JSON.stringify({ history: _history, summary: getSummary() }, null, 2);
  }

  return {
    analyze: analyze,
    getHistory: getHistory,
    clearHistory: clearHistory,
    getSummary: getSummary,
    exportReport: exportReport
  };
})();
