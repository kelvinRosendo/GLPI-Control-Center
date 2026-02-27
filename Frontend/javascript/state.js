/*
        state.js — Estado global do app

    - Centraliza as variáveis que mudam:
     aba atual (home/computadores/apoio…)
     texto de busca
     filtros (status, repartição)
     usuário logado (se aplicável)

    - Também pode expor funções tipo:
     setTab('apoio')
     setSearch('Apoio-01')
     resetFilters()

    Benefício: evita estado espalhado e facilita manutenção.
*/

/**
 * GLPI Control Center - state.js
 * -----------------------------------------------------------------------------
 * Estado global da aplicação (Single Source of Truth).
 *
 * Por que existe:
 * - Centraliza o "estado" do app (aba atual, busca, filtros)
 * - Evita variáveis soltas e duplicadas entre arquivos
 * - Facilita re-renderização: muda o estado -> App.render()
 *
 * Observação:
 * - Neste projeto Vanilla, o estado fica em window.STATE.
 * - Em projetos com React/Vue isso seria equivalente a um store (context/redux/pinia).
 */

window.STATE = {
  // Aba atual do sistema
  tab: "home",

  // Campo de busca (nome, serial, patrimônio)
  search: "",

  // Filtro por status (todos | ativo | manutencao | emprestado)
  status: "todos",

  // Filtro por repartição (usado em algumas categorias)
  reparticao: "todas",
};

/**
 * Métodos utilitários para atualizar o estado.
 * Isso ajuda a manter um padrão (em vez de mexer direto no objeto em todo lugar).
 */
window.State = {
  /**
   * Troca de aba
   */
  setTab(tabId) {
    window.STATE.tab = tabId;
  },

  /**
   * Atualiza texto de busca
   */
  setSearch(value) {
    window.STATE.search = String(value ?? "");
  },

  /**
   * Atualiza filtro de status
   */
  setStatus(value) {
    window.STATE.status = value || "todos";
  },

  /**
   * Atualiza filtro de repartição
   */
  setReparticao(value) {
    window.STATE.reparticao = value || "todas";
  },

  /**
   * Reseta filtros para o padrão
   */
  resetFilters() {
    window.STATE.search = "";
    window.STATE.status = "todos";
    window.STATE.reparticao = "todas";
  },
};