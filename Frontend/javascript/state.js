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
  tickets: [],
  ticketsLoaded: false,
  ticketsLoading: false,
  ticketsError: '',
  ticketSearch: '',
  ticketStatus: 'todos',
  ticketPeriod: 'all',
  ticketCustomStart: null,
  ticketCustomEnd: null,

};

window.State = {
  getTab() {
    return window.STATE.tab;
  },

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

  setTickets(list) {
    window.STATE.tickets = Array.isArray(list) ? list : [];
    window.STATE.ticketsLoaded = true;
    window.STATE.ticketsLoading = false;
    window.STATE.ticketsError = '';
  },

  setTicketsLoading(value) {
    window.STATE.ticketsLoading = Boolean(value);
  },

  setTicketsError(message) {
    window.STATE.ticketsError = String(message || '');
    window.STATE.ticketsLoading = false;
  },

  setTicketSearch(value) {
    window.STATE.ticketSearch = String(value ?? '');
  },

  setTicketStatus(value) {
    window.STATE.ticketStatus = value || 'todos';
  },

  setTicketPeriod(value) {
    window.STATE.ticketPeriod = value || 'all';
  },

  setTicketCustomDates(start, end) {
    window.STATE.ticketCustomStart = start || null;
    window.STATE.ticketCustomEnd = end || null;
  },


  resetFilters() {
    window.STATE.search = '';
    window.STATE.status = 'todos';
    window.STATE.ticketSearch = '';
    window.STATE.ticketStatus = 'todos';
    window.STATE.ticketPeriod = 'all';
    window.STATE.ticketCustomStart = null;
    window.STATE.ticketCustomEnd = null;
    window.STATE.reparticao = 'todas';
  },
};
