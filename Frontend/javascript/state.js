/*
 * state.js - Estado global do app
 */

window.STATE = {
  tab: 'home',
  search: '',
  status: 'todos',
  reparticao: 'todas',
  expandedComputerId: null,
  computerDetailsById: {},
};

window.State = {
  setTab(tabId) {
    window.STATE.tab = tabId;
  },

  setSearch(value) {
    window.STATE.search = String(value ?? '');
  },

  setStatus(value) {
    window.STATE.status = value || 'todos';
  },

  setReparticao(value) {
    window.STATE.reparticao = value || 'todas';
  },

  setExpandedComputer(id) {
    window.STATE.expandedComputerId = id ?? null;
  },

  updateComputerDetails(id, patch) {
    const current = window.STATE.computerDetailsById[id] || {};
    window.STATE.computerDetailsById[id] = {
      ...current,
      ...patch,
    };
  },

  setComputerDraftValue(id, key, value) {
    const current = window.STATE.computerDetailsById[id] || {};
    window.STATE.computerDetailsById[id] = {
      ...current,
      draft: {
        ...(current.draft || {}),
        [key]: value,
      },
    };
  },

  resetFilters() {
    window.STATE.search = '';
    window.STATE.status = 'todos';
    window.STATE.reparticao = 'todas';
  },
};
