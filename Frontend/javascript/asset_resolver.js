/**
 * GLPI Control Center - asset_resolver.js
 * -----------------------------------------------------------------------------
 * Resolve tipo de ativo → rota de navegação.
 *
 * Sprint 30: Pesquisa Global de Ativos
 */

window.AssetResolver = (function () {
  'use strict';

  const TYPE_MAP = {
    computadores: { tab: 'computadores', label: 'Computador' },
    chromebooks_geekiees: { tab: 'geekiees', label: 'Chromebook Geekie' },
    chromebooks_apoio: { tab: 'apoio', label: 'Chromebook Apoio' },
    projetores: { tab: 'projetores', label: 'Projetor' },
    impressoras: { tab: 'impressoras', label: 'Impressora' },
  };

  function resolve(searchResult) {
    if (!searchResult || !searchResult.type) return null;
    return TYPE_MAP[searchResult.type] || null;
  }

  function navigate(searchResult) {
    const route = resolve(searchResult);
    if (!route || !route.tab) return;

    if (window.App?.go) {
      window.App.go(route.tab);
    }
  }

  function getLabel(type) {
    const entry = TYPE_MAP[type];
    return entry ? entry.label : 'Ativo';
  }

  function getTab(type) {
    const entry = TYPE_MAP[type];
    return entry ? entry.tab : null;
  }

  function getAllTypes() {
    return Object.keys(TYPE_MAP).map(key => ({
      type: key,
      tab: TYPE_MAP[key].tab,
      label: TYPE_MAP[key].label,
    }));
  }

  return {
    resolve,
    navigate,
    getLabel,
    getTab,
    getAllTypes,
  };
})();
