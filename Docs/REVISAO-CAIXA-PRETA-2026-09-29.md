# Revisão independente e teste de caixa preta — 29/09/2026

Base: branch codex/dashboard-chamados-salas, HEAD 88738a2.
Escopo: diagnóstico fornecido pelo usuário, Kanban, erros HTTP, formulário de atendimento e Modo TV. Nenhum código de produção ou chamado real foi alterado.

## Método e limites

- Inspeção do código e comparação com o diagnóstico recebido.
- Navegação manual por teclado no navegador, usando módulos reais de relatório, Kanban, monitor, TV e ApiClient.
- Servidor temporário local com chamados fictícios e respostas HTTP controladas. POST /assumir responde 409 com mensagem de conflito; POST /mover responde 502 com mensagem de falha parcial. Não há conexão desse servidor com o GLPI.
- Segunda rodada visual incluiu todos os CSS locais referenciados pelo index.html, na ordem de produção. A primeira rodada, com apenas os CSS de chamados, não reproduzia a posição incorreta do formulário.
- Não havia aplicação escutando nas portas locais 3000/8080 durante a checagem. Não foi validada a instância real nem determinada a causa exata de um 409/502 específico observado pelo usuário.
- Teste isolado de interface não equivale a homologação completa: autenticação, regras e escrita no GLPI real permanecem pendentes. Som audível não foi confirmado.

## Resultados de caixa preta

| Cenário | Resultado |
|---|---|
| Abrir TV e selecionar Chamados | Há botões Assumir chamado e Aceitar alerta. Incompatível com TV somente leitura. |
| Assumir pela TV | Abre formulário de atendimento sobre a TV. Não foi enviada gravação real. |
| Formulário com estilos completos | Reproduzido no canto superior esquerdo, com rolagem; com apenas os CSS de chamados ficava centralizado. |
| Assumir contra HTTP 409 controlado | Interface mostra apenas HTTP 409; não mostra a mensagem de responsável já definido enviada pelo servidor. |
| Concluir contra HTTP 502 controlado | Interface mostra apenas HTTP 502; não informa que a resposta descrevia falha parcial. |
| Digitar busca sem aplicar e atualizar | Texto digitado é perdido. Atualização manual usa o mesmo redesenho relevante para o timer. |
| Cartão Em atendimento | Exibe Retomar mesmo sem estar pendente, além de Marcar aguardando. |
| Relógio de atualização | Avança durante consultas automáticas no ambiente isolado. Isso não é push nem tempo real instantâneo. |

## Defeitos confirmados no código

1. TV permite operações. Frontend/javascript/room-tickets-tv.js:137-138,161-162,256-271. Remover ações de atendimento, formulários e respectivos manipuladores do modo de exibição. Manter ações no PC; TV apenas reflete estado, responsável e novos chamados. Ocultar botões não substitui isolamento de permissões se a TV tiver sessão própria.
2. Formulário fora do centro. Frontend/css/styles.css:27-31 e design-system.css:264-268 zeram margens globalmente; dialog.rt-action-form em room-tickets.css:156 não restaura margin:auto. O formulário vive fora de .rt-dashboard e não recebe a regra de centralização dos detalhes. Corrigir centralização e altura máxima responsiva; testar com CSS completo, não só CSS do módulo.
3. Erros ilegíveis. Frontend/javascript/api-client.js:142-151 cria Error('HTTP ...') sem interpretar JSON no caminho de erro. Preservar mensagem segura e metadados, com fallback para respostas não JSON. Conflito 409 deve identificar a situação; 502 não pode sugerir simplesmente reenviar quando já houve gravação parcial.
4. Reutilização permanente de requestId. room-tickets-monitor.js:405-410 guarda ID por ação/chamado e hardClear não limpa esse mapa. Uma nova execução legítima pode receber resultado antigo. Separar nova intenção de reenvio da mesma operação e vincular idempotência a usuário e conteúdo no servidor.
5. Histórico de solução falso. Backend/api/room_tickets.php:506 usa qualquer passo ok para declarar glpiFollowup:true, inclusive quando o passo solucao_glpi falhou. Conferir especificamente o passo correspondente.
6. Corrida de atribuição. Verificação e escrita remota em room_tickets.php:363-395 não são protegidas como uma operação única. O created:false de recordAssignment não é tratado. Risco confirmado por inspeção; concorrência real não foi executada nesta revisão.
7. Falha parcial e repetição. rememberRequest ocorre apenas no sucesso; recordMove não recebe requestId. Necessário persistir resultado por etapa e reconciliar tentativas ambíguas. Duplicação de efeitos remotos depende da etapa que já ocorreu; não é correto afirmar que um POST explicitamente recusado já criou uma entrada.
8. Arraste errado. room-tickets-kanban.js:386-390 transforma Aberto -> Em andamento em pendente. Backend só permite pendente a partir de 2/3; o caminho produz conflito pela regra atual. Deve abrir Assumir. Evidência por código, sem arraste manual nesta rodada.
9. Atualização destrutiva. room-tickets.js redesenha root.innerHTML; busca não aplicada é perdida (reproduzido), detalhes abertos também são removidos pelo mesmo caminho (inspeção).

## Correção importante no diagnóstico recebido

O P1 não deve ser aceito como comprovado na forma escrita. No código oficial GLPI 10, parseDropdowns expande campos de chave estrangeira. Isso não demonstra que status e urgency sejam convertidos em rótulos. Uma fixture que substitui status por texto comprova apenas que o parser não aceita esse texto, não que a API real o produza. Assim, a afirmação de que todas as escritas falham por esse motivo não foi validada.

Há, porém, um problema mais concreto no contrato de atribuição: RoomTicketsService::assignee/assigneeField usa users_id_recipient como técnico. No GLPI 10 esse campo é Writer, enquanto atribuição é uma relação de ator ASSIGN. Portanto, simplesmente trocar expand_dropdowns para false não resolve a atribuição. Também há risco de confirmação falsa ao escrever o campo errado. Validar versão instalada e implementar o contrato correto de atores e solução antes de testar escrita real.

Fontes primárias consultadas:
- API::parseDropdowns: https://github.com/glpi-project/glpi/blob/10.0/bugfixes/src/Api/API.php
- Writer e atores: https://github.com/glpi-project/glpi/blob/10.0/bugfixes/src/CommonITILObject.php
- Ticket/ator atribuído: https://github.com/glpi-project/glpi/blob/10.0/bugfixes/src/Ticket.php

## Testes executados

- PHP test_room_tickets_endpoint.php: 210 verificações passaram, com dublês de GLPI.
- PHP test_room_tickets_kanban.php: 88 verificações passaram.
- Node test-room-tickets.cjs: 26 testes, 25 passaram e 1 falhou. A expectativa de horário não admite a data de ontem; falha dependente do calendário, conforme diagnóstico.
- As suítes automatizadas de navegador existentes não foram reexecutadas. Foi feita a navegação manual isolada descrita acima, incluindo ApiClient real e CSS completo.

## Contrato desejado e prioridade

1. PC: assumir, escolher responsável, mover, concluir e reabrir. Formulário centralizado e persistente durante atualizações.
2. TV: somente exibição de salas, chamados, status, responsáveis, indicadores e alertas. Nenhuma escrita de atendimento pela TV.
3. Monitor: consulta automática de 60 segundos, última coleta real e sinalização de cache. Se for necessário atualização imediata entre PCs e TV, implementar propagação pelo servidor (SSE/WebSocket ou consulta curta); BroadcastChannel só atende abas da mesma origem no mesmo navegador.
4. Antes de publicar: corrigir contrato GLPI, mensagens 409/502, idempotência, concorrência e histórico de falhas parciais; depois interface e regressões com CSS completo.

Parecer: não liberar a escrita do Kanban em produção como validada. Há falhas confirmadas de contrato, interface e tratamento de erros. Os pontos restantes P11-P15 do diagnóstico não receberam validação independente completa nesta rodada.
