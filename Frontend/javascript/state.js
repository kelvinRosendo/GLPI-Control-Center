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
  inventoryPage: 1,
  inventorySort: 'name',
  inventorySortDir: 'asc',
  categoryFilter: 'all',
  itemtypeFilter: 'all',
  stateFilter: 'all',
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

  // Novo: suporte a itemtype:id para evitar colisão Computer:7 vs Printer:7
  setExpandedComputer(id, itemtype = null) {
    window.STATE.expandedComputerId = id ?? null;
    // Chave composta canônica
    if (id !== null && itemtype) {
      window.STATE.expandedAssetKey = `${itemtype}:${id}`;
    } else if (id !== null) {
      window.STATE.expandedAssetKey = `Computer:${id}`;
    } else {
      window.STATE.expandedAssetKey = null;
    }
  },

  // Helper canônico: itemtype:id
  assetKey(itemtype, id) { return `${itemtype}:${id}`; },

  updateComputerDetails(id, patch, itemtype = null) {
    // Suporta chave composta quando itemtype informado
    const key = itemtype ? `${itemtype}:${id}` : String(id);
    const current = window.STATE.computerDetailsById[key] || window.STATE.computerDetailsById[id] || {};
    window.STATE.computerDetailsById[key] = {
      ...current,
      ...patch,
    };
    // Espelhar para compatibilidade legada
    if (key !== String(id)) window.STATE.computerDetailsById[id] = window.STATE.computerDetailsById[key];
  },

  setComputerDraftValue(id, key, value, itemtype = null) {
    const k = itemtype ? `${itemtype}:${id}` : String(id);
    const current = window.STATE.computerDetailsById[k] || window.STATE.computerDetailsById[id] || {};
    window.STATE.computerDetailsById[k] = {
      ...current,
      draft: {
        ...(current.draft || {}),
        [key]: value,
      },
    };
    if (k !== String(id)) window.STATE.computerDetailsById[id] = window.STATE.computerDetailsById[k];
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

  setInventoryPage(page) {
    window.STATE.inventoryPage = Math.max(1, Number(page) || 1);
  },

  setInventorySort(field) {
    if (window.STATE.inventorySort === field) {
      window.STATE.inventorySortDir = window.STATE.inventorySortDir === 'asc' ? 'desc' : 'asc';
    } else {
      window.STATE.inventorySort = field;
      window.STATE.inventorySortDir = 'asc';
    }
    window.STATE.inventoryPage = 1;
  },

  setCategoryFilter(value) {
    window.STATE.categoryFilter = value || 'all';
    window.STATE.inventoryPage = 1;
  },

  setItemtypeFilter(value) {
    window.STATE.itemtypeFilter = value || 'all';
    window.STATE.inventoryPage = 1;
  },

  setStateFilter(value) {
    window.STATE.stateFilter = value || 'all';
    window.STATE.inventoryPage = 1;
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
    window.STATE.inventoryPage = 1;
    window.STATE.inventorySort = 'name';
    window.STATE.inventorySortDir = 'asc';
    window.STATE.categoryFilter = 'all';
    window.STATE.itemtypeFilter = 'all';
    window.STATE.stateFilter = 'all';
  },
};
