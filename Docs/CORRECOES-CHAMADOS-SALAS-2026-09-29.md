# Correções dos chamados das salas — entrega 29/09/2026

Base: `codex/dashboard-chamados-salas`, HEAD `88738a2`.
Origem: `Docs/REVISAO-CAIXA-PRETA-2026-09-29.md` e o diagnóstico do usuário.
Nada foi commitado, publicado ou implantado. Nenhum chamado real foi alterado:
todas as execuções usam fixtures isoladas, `GCC_ROOM_TICKET_*_FILE` em
`sys_get_temp_dir()` e servidores locais com respostas HTTP controladas.

## REGRA PRINCIPAL DO PRODUTO

O atendimento acontece apenas na interface operacional do PC. O **Modo TV é
exclusivamente informativo**. Isso é a regra que organiza todas as correções
abaixo.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `Backend/api/services/RoomTicketsGlpi.php` | **novo** — contrato do GLPI 10 isolado: atores (`Ticket_User`), solução (`ITILSolution`), leitura estrita e validação de contrato |
| `Backend/api/services/RoomTicketsService.php` | Tabela única `ACTIONS` com `availableActions()`; `statusId()` estrito; removidos `assignee`/`assigneeField` baseados em `users_id_recipient`; `kanbanCard` passa a expor `actions` |
| `Backend/api/room_tickets.php` | Assume/mover reescritos sobre o contrato correto; lock por chamado; `requestId` vinculado a autor+conteúdo; `glpiFollowup` correto; respostas de erro com metadados |
| `Backend/api/services/RoomTicketWorkStore.php` | `withTicketLock()`; `rememberRequest()` com impressão digital e desfecho; `recordMove`/`recordSolution` recebem `requestId`; campo `glpi` na solução |
| `Backend/api/client.php` | `getCollection()` com total real e falha fechada; o `range` do chamador tem precedência, senão a paginação relia sempre a primeira página |
| `.gitignore` | Travas por chamado (`room-ticket-work.json.lock-*`) são de execução e não entram no repositório |
| `Frontend/javascript/api-client.js` | Lê o corpo de respostas de erro; mensagem segura por status; metadados filtrados; fallback para HTML/vazio/rede/timeout |
| `Frontend/javascript/room-tickets-tv.js` | Somente leitura: sem assumir, aceitar, atribuir, mover, concluir ou reabrir; controle de tela cheia; status real do chamado |
| `Frontend/javascript/room-tickets-kanban.js` | Ações vindas do backend; arraste correto; `requestId` por intenção; foco/cursor preservados; mensagens 409/422/403/502 acionáveis |
| `Frontend/javascript/room-tickets.js` | Diálogo de detalhes persistente; busca/foco/cursor preservados; ciclo de consulta unificado; filtro não desabilita durante atualização |
| `Frontend/javascript/room-tickets-monitor.js` | `requestId` por intenção (não por escopo); `setActiveQuery`; `start()` não limpa sessão expirada; cache de outra aba não fica artificialmente recente |
| `Frontend/css/room-tickets.css` | Centralização explícita do diálogo, altura máxima e rolagem interna |
| `Frontend/css/room-tickets-tv.css` | Aviso de "somente leitura" no cartão da TV |
| `Backend/tests/accept_subprocess.php` | Harness com atores, `ITILSolution` e cenários novos |
| `Backend/tests/test_room_tickets_kanban.php` | Contrato de atores, ações por status, lock, dedupe |
| `Backend/tests/test_room_tickets_endpoint.php` | Autor ≠ responsável, solução `ITILSolution`, corrida, falha parcial, requestId |
| `Frontend/test-room-tickets.cjs` | Fixture com `createElement`/`classList`; relógio fixo no teste de horário; cartões com `actions` |
| `Frontend/test-api-client-errors.cjs` | **novo** — `ApiClient` real contra respostas HTTP de verdade |
| `Frontend/test-room-tickets-blackbox.cjs` + `-boot.js` | **novos** — caixa preta com módulos reais, **todos os CSS do `index.html`** e 409/502 reais; Chrome por `CHROME_BIN`, `PATH` (`google-chrome`, `chromium`) ou caminho fixo, para rodar no CI Linux |
| `Frontend/test-room-tickets-tv-browser.cjs` | Inversão da expectativa: TV não tem ação de atendimento |
| `Frontend/test-room-tickets-kanban-browser.cjs` | Cartões com `actions` do backend |
| `.github/workflows/room-tickets.yml` | Suítes novas no CI |

## 1. Modo TV separado da operação

`room-tickets-tv.js` não tem mais nenhum botão de atendimento, nem `accept`
exportado, nem despacho de `roomtickets:assume-request`. Clicar em **todos** os
botões da TV não abre formulário nenhum (verificado em navegador real). O que
sobra é apresentação: rotação, som, tela cheia e saída.

A TV mostra **quem está atendendo** (responsável do GCC ou ator ASSIGN do
GLPI) e o **status real** do chamado (Novo, Em atendimento, Pendente,
Resolvido, Fechado). "Alerta aceito" deixou de ser apresentado como se fosse
atendimento: o campo passou a se chamar "Alerta · Lido / Não lido", separado do
status.

Entrar no Modo TV não interrompe a atualização: o monitor continua rodando por
baixo da sobreposição, e a TV se inscreve nele.

**Limite declarado:** isto é isolamento de interface, não de segurança. Quem
está na TV continua usando a sessão do GCC, e a proteção real segue sendo a
permissão `chamados edit` no backend (`endpoints.php:423`). Se um dia existir
uma sessão exclusiva de TV, ela precisa ser somente leitura no backend também.

## 2. Formulários centralizados

`dialog.rt-action-form` ganhou centralização explícita (`margin: auto`,
`inset: 0`, `position: fixed`), `max-height` com `88vh/88dvh` e rolagem
interna. Foco inicial, navegação por teclado e fechamento acessível foram
verificados em navegador com a pilha completa de estilos.

O alerta novo não empurra o formulário: o formulário é `position: fixed` com
altura limitada, e o teste compara a coordenada `top` antes e depois de injetar
um elemento de alerta.

**A validação usa todos os CSS do `index.html`, na ordem de produção** — foi
exatamente a ausência deles que fez a primeira rodada de testes não reproduzir
o defeito. `test-room-tickets-blackbox.cjs` carrega os 24 arquivos de CSS reais.

## 3. HTTP 409, 422, 403 e 502

`api-client.js` agora lê o corpo da resposta de erro uma única vez e o
interpreta. O que era `Error("HTTP 409")` passou a ser
`Error("Este chamado já está com Ana Ribeiro.")` com
`error.meta.currentHandler` e `error.meta.allowedActions`.

- `message` vem de `error`/`message` do servidor, com limite de tamanho, e
  nunca de HTML, JSON aninhado ou stack trace.
- `meta` carrega só o que a interface precisa: `reason`, `currentHandler`,
  `currentStatusLabel`, `currentUserId`, `allowedActions`, `partial`, `applied`
  e `steps`. Campos desconhecidos são descartados.
- Fallback por status quando o servidor não explica (HTML, corpo vazio, JSON
  inválido, rede caída, timeout).
- 4xx não é repetido; 5xx, 429 e rede são.

Na interface:

- **409** explica o conflito, mostra o responsável atual e diz quais ações
  ficaram disponíveis. Recusa de reuso de `requestId` orienta a abrir o
  formulário de novo.
- **403** diz que falta permissão, sem jargão de backend.
- **422** aponta o que corrigir.
- **502 parcial** distingue: o status mudou, a etapa `solucao_glpi` falhou, e a
  orientação é conferir o histórico — **não** reenviar às cegas.

O `ApiClient` real é exercitado contra respostas HTTP de verdade
(`test-api-client-errors.cjs`), não por mocks que já entregam a mensagem.

## 4. Contrato com o GLPI

### Correção da hipótese anterior

A revisão independente está certa e o diagnóstico anterior estava errado em um
ponto: `parseDropdowns` (`src/Api/API.php:2567`) só expande campos que casam
`isForeignKeyField` (`src/DbUtils.php:69-73`, regex `._id(_.+)?$`). Portanto
`status`, `urgency`, `impact` e `priority` **continuam inteiros** com
`expand_dropdowns=true`. A hipótese de que todas as escritas falhariam por
status textual **não se sustenta** e as fixtures antigas estavam certas nesses
campos.

O que de fato está errado é o contrato de atribuição:

| Antes | Agora |
| --- | --- |
| `users_id_recipient` tratado como técnico | `users_id_recipient` é o **Writer** (autor, search option 22 em `CommonITILObject.php:4531`). Nunca lido como responsável e nunca escrito. |
| `assigneeField()` escrevia `users_id_recipient` | Atribuição por `_actors.assign` (`Ticket::prepareInputForUpdate` → `transformActorsInput`) |
| Leitura por `users_id_recipient` | Leitura por `GET /Ticket/{id}/Ticket_User`, `type = ASSIGN (2)` |
| Conclusão com `resolution` + `ITILFollowup {type_followup: 3}` | Conclusão com `POST /ITILSolution` (`itemtype`, `items_id`, `content`, `solutiontypes_id` opcional) e confirmação por releitura |

Não existe `resolution`, `resolution_id`, `type_followup` nem
`ITILFollowup.tickets_id` no GLPI 10.0.x — as três linhas "anteriores" enviavam
campos inexistentes. `ITILSolution.post_addItem` força o status para
`SOLVED (5)` ou `CLOSED (6)` conforme `autoclose_delay`, e isso é lido e
reportado em vez de presumido.

Todo esse conhecimento está em um arquivo só,
`Backend/api/services/RoomTicketsGlpi.php`, com as fontes citadas no cabeçalho.
Se a versão mudar, corrige-se um lugar.

**Nada disso foi validado contra a instância real.** A verificação foi por
código-fonte oficial (tag `10.0.19`) e por testes com dublês coerentes. A
versão instalada é a do README (GLPI 10.0.19) e precisa ser confirmada no
ambiente — ver seção "Pendências".

### Sessão antes do `exit`

`withGlpiSession` continua encerrando a sessão no `finally`, e toda resposta
passa por `answer()`, que é chamado **depois** do encerramento. O harness de
subprocesso (com o `Responde` real) cobre sucesso, 404, 422, 502, conflito e
falha do `killSession`, e continua provando que `KILL_SESSION` sempre precede o
JSON.

## 5. Repetição, concorrência e falhas parciais

**requestId.** O identificador pertence à *intenção*: um por abertura de
formulário. Reenviar a mesma operação depois de uma falha mantém o
identificador; reabrir o formulário cria outro. "Concluir, reabrir e concluir
de novo" são três operações com três identificadores — verificado em navegador.
O logout limpa tudo, e o servidor rejeita reutilização incompatível (outro
chamado, outra ação, outro conteúdo ou outro autor) com 409 explicativo.

**Concorrência.** `RoomTicketWorkStore::withTicketLock()` serializa a sequência
verificar → gravar entre requisições do GCC, por chamado. O resultado
`created: false` do store é tratado explicitamente: quando outro técnico
registrou primeiro, a resposta é 409 com o responsável que ficou, e o registro
do servidor é preservado. Houve um teste que injeta a corrida exatamente na
janela entre a verificação e a gravação.

**Limite de atomicidade, declarado:** a API do GLPI não oferece transação. O
lock protege apenas requisições do GCC. Uma alteração feita direto no GLPI
durante a operação continua sendo uma condição de corrida — tratada por
releitura, que nunca aceita um estado não confirmado, e nunca por sobrescrita
silenciosa.

**Falhas parciais.** Cada etapa é persistida como aconteceu, inclusive nas
falhas. O desfecho é lembrado mesmo em falha parcial, então reenviar a mesma
operação devolve o primeiro resultado em vez de criar uma segunda solução no
GLPI. `recordMove` e `recordSolution` agora recebem o `requestId` e
efetivamente deduplicam. `glpiFollowup` foi corrigido: `glpi` reflete
especificamente a etapa da solução, e o sucesso da mudança de status não a
comprova — há teste para isso.

## 6. Ações do Kanban

Cada cartão carrega `actions`, calculado pelo backend a partir da tabela única
`RoomTicketsService::ACTIONS`. A interface não tem mais tabela de ações: botões
e arraste leem a mesma lista, então nunca há botão que o servidor vá recusar.

- Aberto → Em andamento abre **Assumir chamado** (antes abria "Marcar
  aguardando", que o backend recusa com 409).
- "Retomar" aparece só quando aplicável.
- "Marcar aguardando" não aparece para quem já está aguardando.
- Arraste sem ação válida explica em vez de falhar em silêncio.

## 7. Interface preservada durante atualizações

- Diálogo de detalhes virou um elemento **persistente** fora de
  `.rt-dashboard`, com o próprio listener de clique. (Descobrir que ele
  precisava do listener foi um efeito colateral do próprio teste de regressão.)
- A busca digitada e não aplicada, o foco e a posição do cursor atravessam o
  redesenho.
- O filtro só é desabilitado durante a **primeira** carga; durante a
  atualização automática ele permanece utilizável, senão o campo não aceitaria
  foco.
- Dados antigos continuam visíveis; o horário exibido é o de `meta.collectedAt`
  da última consulta bem-sucedida; cache desatualizado é sinalizado.
- Ciclo de consulta unificado: o monitor é o único dono do intervalo, com
  `setActiveQuery` registrando a visão ativa. Antes eram **duas** varreduras
  completas do GLPI por minuto — uma do monitor e outra do `startTimer()` do
  relatório. O `startTimer()` agora só repinta o carimbo de horário; quem busca
  é o monitor, e o relatório se redesenha sozinho pela inscrição em
  `bindMonitor`. Isso tem regressão própria.
- Um cache recebido de outra aba não é mais tratado como recém-consultado: a
  idade (carimbo e `lastSuccessAt`) vem do `collectedAt` do servidor, não da
  hora de recepção do `BroadcastChannel`. Antes, um dado de 90 s chegado de
  outra aba passava por fresco e adiava a leitura real por um ciclo inteiro.

## 8. Testes executados

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Agregação | `php Backend/tests/test_room_tickets.php` | **63 verificações** |
| Kanban, contrato, concorrência | `php Backend/tests/test_room_tickets_kanban.php` | **115 verificações** |
| Endpoint, corrida, falha parcial | `php Backend/tests/test_room_tickets_endpoint.php` | **250 checks** (inclui técnico além da primeira página de usuários) |
| Aceite compartilhado | `php Backend/tests/test_room_ticket_acknowledgements.php` | **16 verificações** |
| Inventário | `php Backend/tests/test_inventory_sync.php` | **36 verificações** |
| Regressão corretiva | `php Backend/tests/test_corretiva_regressoes.php` | **15 passaram, 0 falharam** |
| UI simulada | `node --test Frontend/test-room-tickets.cjs` | **29 passaram, 0 falharam** |
| `ApiClient` real × HTTP | `node --test Frontend/test-api-client-errors.cjs` | **10 passaram, 0 falharam** |
| Inventário (front) | `node --test Frontend/test-inventory-sync.cjs` | **5 passaram, 0 falharam** |
| Navegador, relatório | `node Frontend/test-room-tickets-browser.cjs` | **24 × 2 viewports** |
| Navegador, Kanban | `node Frontend/test-room-tickets-kanban-browser.cjs` | **47 × 2 viewports** |
| Navegador, TV | `node Frontend/test-room-tickets-tv-browser.cjs` | **27 × 2 viewports** |
| **Caixa preta, CSS completo** | `node Frontend/test-room-tickets-blackbox.cjs` | **52 checks em 7 cenários** |
| Sintaxe | `php -l` (todos os PHP) e `node --check` (todos os JS) | **OK** |

O teste dependente da data foi corrigido com **relógio fixo** — o
comportamento do produto ("a data aparece quando difere de hoje") não foi
alterado, e o teste agora cobre os dois casos.

### O que a caixa preta cobre de verdade

`test-room-tickets-blackbox.cjs` sobe um servidor local, abre o Chromium
headless com **os 24 CSS do `index.html` na ordem real** e os módulos reais
(`api-client.js`, monitor, Kanban, relatório e TV) — sem dublê de módulo. O
`ApiClient` real fala HTTP de verdade, e 409 e 502 são responses reais do
servidor. Nenhum botão é acionado chamando função interna: os cenários clicam
nos elementos, como o técnico faria.

Cenários: formulário centralizado (1600×1000), formulário em tela estreita
(500×900), TV somente leitura (1920×1080), arraste e ações por status,
mensagens 409/502, interface preservada, e três intenções com identificadores
distintos.

### Defeitos que os testes agora caçam

Cinco regressões foram acrescentadas porque as suítes antigas passavam com o
defeito presente:

1. **Paginação de usuários.** `getCollection()` sobrescrevia o `range` do
   chamador, então `readTechnicians()` relia a primeira página e perdia técnicos
   além dela. Há cenário com 250 usuários em que o técnico pedido é o número
   250.
2. **Duas varreduras por minuto.** O teste para o timer do relatório exige que
   ele **não** gere leitura: o monitor é parado, dispara-se o timer que sobrou e
   a contagem de consultas tem de continuar igual.
3. **Cache de outra aba.** Um payload com `collectedAt` de 90 s chegando por
   `BroadcastChannel` tem de continuar velho: o teste confere a idade e exige
   que um `refresh` com `maxAge` de 51 s vá mesmo ao GLPI.
4. **Redesenho pela inscrição.** A tela tem de refletir o dado novo de outra aba
   sem depender do timer do relatório.
5. **Documento isolado** (`writeTicket`): a decisão de `dismiss` +
   `invalidate` + `changed` mora na função de escrita, não na interface.

## Pendências da integração real com o GLPI

**Nada foi validado contra a instância. Não declarar a integração validada.**

1. **Versão instalada.** O README diz GLPI 10.0.19; confirmar. O contrato
   usado (`_actors`, `ITILSolution`, `Ticket_User`) é o da 10.0.x.
2. **`_actors` no PUT.** Confirmar que a conta de integração tem
   `canAssign()` e que o `PUT /Ticket/{id}` aceita `_actors.assign`. Uma
   atualização que só troque status deve continuar funcionando — o envio de
   `_actors` só acontece quando houve correspondência exata com um técnico.
3. **`Ticket_User` legível.** `GET /Ticket/{id}/Ticket_User` e
   `GET /Ticket_User` podem estar bloqueados pelo perfil. Na lista isso já é
   tolerado com aviso; no assumir/mover é erro explícito.
4. **`SolutionType`.** Se houver **mais de um** tipo de solução e
   `GCC_ROOM_TICKET_SOLUTION_TYPE_ID` não estiver definido, a conclusão é
   recusada com 422 listando os tipos. Definir a variável, ou confirmar que
   existe um único tipo.
5. **`autoclose_delay`.** Se for 0, o GLPI leva o chamado a **Fechado (6)** ao
   criar a solução. A interface reporta o status observado; é preciso decidir
   se isso é aceitável na operação.
6. **Direito de solução.** `ITILSolution::canCreateItem()` exige `canSolve()`
   no perfil do usuário de integração.
7. **Volume.** A lista lê `/Ticket`, `/Location`, `/ITILCategory`,
   `/Item_Ticket` e a relação de atores com orçamento de 45 s. Medir em
   produção.
8. **Regras de atendimento.** Campos obrigatórios e recusas do GLPI para 1→2 e
   →5, e para reabrir 5/6 → 1.

## Limitações de sincronização entre PC e TV

- O `BroadcastChannel` só alcança abas **do mesmo navegador**. Entre o PC e a
  TV em computadores diferentes, a propagação leva até um ciclo de consulta.
- **Latência atual entre PC e TV: até 60 segundos.** Isso é polling, não
  tempo real; não chamar de atualização instantânea.
- A interface diz "atualiza a cada minuto", e é o que acontece.
- Uma escrita no PC marca a query como inválida (`invalidate`) e dispara
  `load('after-write')` **naquela tela**; outras abas do mesmo navegador
  recebem por broadcast; **a TV em outro computador só vê no ciclo seguinte**.
- Propagação pelo servidor (SSE/WebSocket, ou consulta curta com carga
  controlada) é o caminho para reduzir a latência. **Não foi implementada**:
  exige decisão de carga e de infraestrutura.

## Procedimento de homologação sem risco para chamados operacionais

Usar **um chamado de teste descartável**, criado no GLPI, com referência `L-`
de teste e sala de teste. Nunca reaproveitar chamado operacional.

1. Abrir o chamado de teste (status Novo, sala de teste).
2. `GET /Ticket/{id}?expand_dropdowns=true` e registrar `status`, `urgency`,
   `locations_id`, `itilcategories_id` e `users_id_recipient` — confirmar
   `status` e `urgency` como inteiros.
3. `GET /Ticket/{id}/Ticket_User` — confirmar que responde e o formato das
   linhas.
4. No GCC (PC): **Assumir chamado** com o nome exato de um técnico do GLPI.
   Conferir: status = Em atendimento, ator ASSIGN com aquele usuário,
   `users_id_recipient` **inalterado** (é o autor).
5. Assumir com um nome que **não** existe no GLPI: confirmar que o chamado
   vai para Em atendimento, que o responsável fica como "informado" e que
   **nenhum** ator foi criado.
6. Reabrir a tela de outro computador e conferir que o responsável aparece.
7. **Concluir** com solução: conferir `GET /Ticket/{id}/ITILSolution` com o
   texto, o status resultante (5 ou 6 conforme `autoclose_delay`) e a solução
   na timeline do GLPI.
8. **Reabrir** o chamado de teste e concluir de novo: confirmar que a
   segunda conclusão foi gravada como solução nova e que o histórico do GCC
   mostra as três movimentações.
9. **Conflito:** com dois navegadores autenticados como usuários diferentes,
   assumir o mesmo chamado simultaneamente. Um deles deve receber a mensagem
   de conflito com o responsável atual; **nenhum** dos dois pode sobrescrever
   o outro silenciosamente. Repetir com o GLPI aberto em outro perfil.
10. **Falha parcial:** apontar `GLPI_URL` para um endereço inválido só para o
    GCC, tentar concluir, e conferir que a interface diz que não foi
    confirmado e **não** orienta reenvio automático. Restaurar a configuração.
11. **Modo TV:** abrir o modo TV e confirmar que não há botão de assumir,
    aceitar, concluir ou reabrir, e que o status e o responsável aparecem.
12. Após cada passo, conferir `Backend/logs/` por `ACCESS_DENIED` e por
    `ContractException` (`[room-tickets] ... formato desconhecido`), que
    indicariam contrato divergente.

## Parecer

**Bloqueado para publicação.** Há correções de contrato, interface e tratamento
de erro confirmadas e cobertas por testes, mas a integração com o GLPI real
**não** foi exercitada: nenhuma escrita real foi feita, por decisão explícita.
O caminho crítico — `POST /ITILSolution`, `_actors.assign` no `PUT /Ticket`,
`GET /Ticket/{id}/Ticket_User` — ainda não foi demonstrado contra a instância.

Próximo passo obrigatório: o procedimento de homologação acima, com um chamado
de teste descartável, antes de qualquer liberação para produção.
