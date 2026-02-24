/*
        glpi.client.js — Cliente de integração com GLPI
        Responsável por buscar dados reais (quando você ligar o backend).
    faz fetch() para endpoints internos tipo /api/...
    transforma resposta do GLPI para o formato do painel
    concentra regras tipo mapeamento de status e campos

        Exemplos:
    fetchComputadores()
    fetchChromebooksApoio()
    fetchProjetores()

    Importante: nunca colocar token aqui no frontend. Token fica no Backend.
*/