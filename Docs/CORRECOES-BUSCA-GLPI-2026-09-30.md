# Correções de 30/09/2026

- GLPI real: leitura de Ticket (59 registros), Item_Ticket (48) e Ticket_User permitida; Location, ITILCategory e User restritos. O 403 em User escapava de readActorIndex e virava 502 da lista inteira. Nomes agora são opcionais: conserva os IDs reais e informa a restrição em meta.warnings. Operações de atribuição continuam sujeitas às validações existentes.
- Validado o controlador completo em leitura real: 9 chamados no período de 30 dias. Não houve criação ou alteração de chamados; sessões de leitura foram encerradas.
- Inventário: somente os resultados são substituídos ao digitar; campo, foco e seleção permanecem. Corrigida também a exceção de incremento de const no destaque da busca e a contagem de caracteres acentuados.
- TV: ausência de dados por erro, carregamento e sessão expirada têm mensagens próprias; vazio confirmado continua mostrando nenhum chamado.
- Regressões: endpoint com User restrito, navegador com módulos reais para digitação contínua, edição, limpeza, paginação, busca sem resultados e estados da TV. O teste novo está no CI.

As mensagens de origem não autorizada do Google nas capturas são independentes desta correção; a autenticação exibida nas capturas concluiu com HTTP 200. Não foi alterada a configuração do cliente OAuth no Google. Sem deploy nesta rodada.
