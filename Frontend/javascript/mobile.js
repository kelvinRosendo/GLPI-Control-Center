/**
 * GLPI Control Center - mobile.js
 * -----------------------------------------------------------------------------
 * Detecção de dispositivo e utilitários mobile.
 *
 * Sprint 25: Responsive Design
 */

window.Mobile = (function () {
  'use strict';

  let _initialized = false;
  let _isMobile = false;
  let _isTablet = false;
  let _isTouch = false;
  let _orientation = 'portrait';

  // ════════════════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  function init() {
    if (_initialized) return;
    _initialized = true;

    _detect();
    _bindEvents();
    _applyClasses();
  }

  function _detect() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    _isMobile = w < 768;
    _isTablet = w >= 768 && w < 1024;
    _isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    _orientation = w > h ? 'landscape' : 'portrait';
  }

  function _bindEvents() {
    // Resize com debounce
    let resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        _detect();
        _applyClasses();
        _emit('resize', { mobile: _isMobile, tablet: _isTablet, orientation: _orientation });
      }, 150);
    });

    // Orientação
    window.addEventListener('orientationchange', function () {
      setTimeout(function () {
        _detect();
        _applyClasses();
        _emit('orientationChange', { orientation: _orientation });
      }, 100);
    });
  }

  function _applyClasses() {
    const root = document.documentElement;
    root.classList.toggle('is-mobile', _isMobile);
    root.classList.toggle('is-tablet', _isTablet);
    root.classList.toggle('is-desktop', !_isMobile && !_isTablet);
    root.classList.toggle('is-touch', _isTouch);
    root.classList.toggle('is-portrait', _orientation === 'portrait');
    root.classList.toggle('is-landscape', _orientation === 'landscape');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ════════════════════════════════════════════════════════════════════════════

  function isMobile() { return _isMobile; }
  function isTablet() { return _isTablet; }
  function isDesktop() { return !_isMobile && !_isTablet; }
  function isTouch() { return _isTouch; }
  function getOrientation() { return _orientation; }
  function getWidth() { return window.innerWidth; }
  function getHeight() { return window.innerHeight; }

  /**
   * Retorna breakpoint atual.
   * @returns {'xs'|'sm'|'md'|'lg'|'xl'}
   */
  function getBreakpoint() {
    const w = window.innerWidth;
    if (w < 480) return 'xs';
    if (w < 768) return 'sm';
    if (w < 1024) return 'md';
    if (w < 1280) return 'lg';
    return 'xl';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Verifica se elemento está visível.
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  }

  /**
   * Scroll suave para elemento.
   * @param {HTMLElement|string} target
   */
  function scrollTo(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Previne scroll no body.
   * @param {boolean} prevent
   */
  function preventScroll(prevent) {
    document.body.style.overflow = prevent ? 'hidden' : '';
  }

  /**
   * Vibra o dispositivo (se suportado).
   * @param {number|number[]} pattern
   */
  function vibrate(pattern) {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════════════════════

  function _emit(eventName, detail) {
    document.dispatchEvent(new CustomEvent(`mobile:${eventName}`, { detail }));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════════════════════

  return {
    init,
    isMobile,
    isTablet,
    isDesktop,
    isTouch,
    getOrientation,
    getBreakpoint,
    getWidth,
    getHeight,
    isVisible,
    scrollTo,
    preventScroll,
    vibrate,
  };
})();
