/**
 * GLPI Control Center - security.js
 * Sprint 29: Security
 */
window.Security = (function () {
  'use strict';

  var _config = {
    cspEnabled: true,
    xssProtection: true,
    csrfEnabled: true,
    rateLimitEnabled: true,
    maxRequestsPerMinute: 60,
  };

  var _requestCounts = {};
  var _csrfToken = null;

  function init(config) {
    _config = Object.assign({}, _config, config);
    _generateCsrfToken();
    _setupCSP();
    _setupXSSProtection();
  }

  // CSP
  function _setupCSP() {
    if (!_config.cspEnabled) return;
    var meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http://localhost:8080 http://192.168.1.20:9090;";
    document.head.appendChild(meta);
  }

  // XSS
  function _setupXSSProtection() {
    if (!_config.xssProtection) return;
    var meta = document.createElement('meta');
    meta.httpEquiv = 'X-XSS-Protection';
    meta.content = '1; mode=block';
    document.head.appendChild(meta);
  }

  // CSRF
  function _generateCsrfToken() {
    _csrfToken = _randomToken(32);
    var meta = document.createElement('meta');
    meta.name = 'csrf-token';
    meta.content = _csrfToken;
    document.head.appendChild(meta);
  }

  function getCsrfToken() { return _csrfToken; }

  function getCsrfHeaders() {
    return { 'X-CSRF-Token': _csrfToken };
  }

  // Rate Limiting
  function checkRateLimit(key) {
    if (!_config.rateLimitEnabled) return true;
    var now = Date.now();
    if (!_requestCounts[key]) _requestCounts[key] = [];
    _requestCounts[key] = _requestCounts[key].filter(function (t) { return now - t < 60000; });
    if (_requestCounts[key].length >= _config.maxRequestsPerMinute) return false;
    _requestCounts[key].push(now);
    return true;
  }

  // Input Validation
  function validateInput(input, rules) {
    var errors = [];
    if (rules.required && !input) errors.push('Campo obrigatório');
    if (rules.minLength && input && input.length < rules.minLength) errors.push('Mínimo ' + rules.minLength + ' caracteres');
    if (rules.maxLength && input && input.length > rules.maxLength) errors.push('Máximo ' + rules.maxLength + ' caracteres');
    if (rules.pattern && input && !rules.pattern.test(input)) errors.push('Formato inválido');
    if (rules.email && input && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) errors.push('Email inválido');
    return errors;
  }

  // Token Generation
  function _randomToken(length) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function generateToken(length) { return _randomToken(length || 32); }

  // Safe Storage
  function safeStore(key, value) {
    try { localStorage.setItem('gcc_' + key, JSON.stringify(value)); } catch (e) {}
  }

  function safeRetrieve(key) {
    try { return JSON.parse(localStorage.getItem('gcc_' + key)); } catch (e) { return null; }
  }

  function safeRemove(key) {
    try { localStorage.removeItem('gcc_' + key); } catch (e) {}
  }

  return {
    init: init,
    getCsrfToken: getCsrfToken,
    getCsrfHeaders: getCsrfHeaders,
    checkRateLimit: checkRateLimit,
    validateInput: validateInput,
    generateToken: generateToken,
    safeStore: safeStore,
    safeRetrieve: safeRetrieve,
    safeRemove: safeRemove
  };
})();
