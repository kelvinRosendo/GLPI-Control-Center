/**
 * GLPI Control Center - sanitization.js
 * Sprint 29: Security
 */
window.Sanitization = (function () {
  'use strict';

  var _htmlMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;' };
  var _attrMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
  var _dangerousProtocols = ['javascript:', 'vbscript:'];

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"'/]/g, function (s) { return _htmlMap[s]; });
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (s) { return _attrMap[s]; });
  }

  function escapeCSS(str) {
    if (!str) return '';
    return String(str).replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&');
  }

  function escapeJS(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }

  function sanitizeUrl(url) {
    if (!url) return '';
    var trimmed = String(url).trim().replace(/&colon;/gi, ':').replace(/[\u0000-\u001F\u007F\s]+/g, '');
    var lower = trimmed.toLowerCase();
    for (var i = 0; i < _dangerousProtocols.length; i++) {
      if (lower.startsWith(_dangerousProtocols[i])) return '';
    }
    if (lower.startsWith('data:')) {
      return /^data:image\/(?:png|gif|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(trimmed) ? trimmed : '';
    }
    if (!lower.startsWith('http://') && !lower.startsWith('https://') && !lower.startsWith('/')) return '';
    return trimmed;
  }

  function sanitizeInput(input, options) {
    if (!input) return '';
    var result = String(input);
    if (options && options.maxLength) result = result.substring(0, options.maxLength);
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    return result.trim();
  }

  function stripTags(str) {
    if (!str) return '';
    return String(str).replace(/<[^>]*>/g, '');
  }

  function sanitizeFilename(filename) {
    if (!filename) return '';
    return String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
  }

  function isSafeUrl(url) {
    return sanitizeUrl(url) === url;
  }

  function detectXSS(input) {
    if (!input) return false;
    var patterns = [/<script[\s>]/i, /javascript:/i, /on\w+\s*=/i, /<iframe[\s>]/i, /<object[\s>]/i, /<embed[\s>]/i, /<form[\s>]/i];
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(input)) return true;
    }
    return false;
  }

  return {
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    escapeCSS: escapeCSS,
    escapeJS: escapeJS,
    sanitizeUrl: sanitizeUrl,
    sanitizeInput: sanitizeInput,
    stripTags: stripTags,
    sanitizeFilename: sanitizeFilename,
    isSafeUrl: isSafeUrl,
    detectXSS: detectXSS
  };
})();
