/**
 * GLPI Control Center - search_events.js
 * -----------------------------------------------------------------------------
 * Eventos do módulo de busca global.
 *
 * Sprint 18: Search Global
 */

window.SearchEvents = (function () {
  'use strict';

  const EVENTS = {
    SEARCH_START: 'search:start',
    SEARCH_RESULTS: 'search:results',
    SEARCH_EMPTY: 'search:empty',
    SEARCH_ERROR: 'search:error',
    SEARCH_CLEAR: 'search:clear',
    SEARCH_FOCUS: 'search:focus',
    SEARCH_BLUR: 'search:blur',
    SEARCH_HISTORY: 'search:history',
    SEARCH_SUGGEST: 'search:suggest',
  };

  let _listeners = {};

  function on(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
    return function off() {
      _listeners[event] = _listeners[event].filter(fn => fn !== callback);
    };
  }

  function emit(event, data) {
    document.dispatchEvent(new CustomEvent(event, { detail: data }));
    if (_listeners[event]) {
      _listeners[event].forEach(fn => fn(data));
    }
  }

  return { EVENTS, on, emit };
})();
