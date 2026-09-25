# Correção da consulta de chamados — 25/09/2026

O perfil usado pelo GCC conseguia consultar Ticket e Item_Ticket, mas recebia HTTP 403 em Location e ITILCategory. O painel tratava a restrição desses cadastros auxiliares como falha de toda a consulta e retornava 502.

Quando somente esses cadastros retornam 403, o GCC consulta os nomes através dos próprios chamados com expand_dropdowns. Os IDs originais de entidades e vínculos são preservados. A resposta informa a restrição nos avisos. Não foram alteradas permissões do GLPI.

Falhas na leitura de chamados ou vínculos, erros de transporte, paginação incompleta e mudança do conjunto de IDs continuam interrompendo o relatório para não apresentar rankings incompletos. O cache de ativos aceita tanto lista direta quanto o formato com items.

Validação real: a consulta concluiu e identificou o chamado L-0009 (ID 78) como Projetor, Sala 16. A validação executou o controlador com o cliente GLPI real; não equivale a uma verificação visual na sessão autenticada do usuário.

Validação automatizada: 26 verificações do controlador, 38 de agregação/paginação, 36 de inventário e 11 testes JavaScript passaram. O teste do controlador usa dados isolados e cobre permissões restritas, preservação de IDs, formatos de cache, falhas obrigatórias e encerramento da sessão.

Esta correção está na branch codex/dashboard-chamados-salas. Publicação na VPS depende da integração e implantação dessa versão.
