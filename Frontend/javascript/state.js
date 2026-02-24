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