# Kanban de chamados, responsável e ciclo de atendimento

Data: 28/09/2026
Branch: codex/dashboard-chamados-salas
Escopo: Kanban de três colunas, sincronização de status com o GLPI, "assumir
chamado" com identificação do responsável, conclusão com solução, histórico
consultável, alerta global com som verificado, atualização automática com cache
e tema sóbrio. Sem merge e sem deploy nesta etapa.

> Nenhum chamado real foi alterado: todas as verificações usam simulação de
> API. A compatibilidade com a instância do GLPI ainda precisa de homologação
> manual (ver seção 10).

## 1. Colunas do Kanban e contagens

| Coluna | Status do GLPI | Identificação no cartão |
| --- | --- | --- |
| **Abertos** | 1 Novo | — |
| **Em andamento** | 2 Em atendimento · 3 Planejado · 4 Pendente | Pendente recebe **Aguardando** |
| **Concluídos** | 5 Resolvido · 6 Fechado | — |

Regras de contagem:

- `count` de cada coluna cobre o **conjunto filtrado inteiro**, não a página da
  tabela e não a lista de 30 chamados recentes do monitor.
- `items` traz até `kanban_limit` cartões por coluna (padrão 25, máximo 100).
  `hasMore` e o botão "Mostrar mais" ampliam o limite explicitamente
  (`kanban_limit`, também preservado na URL como `rt_kanban_limit`).
- Dentro da coluna, o cartão mais antigo vem primeiro.
- Status fora da tabela (0 ou ≥ 7) não entra em coluna e é contabilizado em
  `kanban.unmapped`.

Cada cartão mostra número, sala, resumo do problema, equipamento, abertura,
status e responsável. "Detalhes" abre o painel existente.

Movimentação: botões acessíveis por coluna (sempre disponíveis) e arrastar e
soltar como complemento. Ambos usam exatamente a mesma ação:

| Coluna | Ações |
| --- | --- |
| Abertos | Assumir chamado · Concluir |
| Em andamento | Concluir · Marcar aguardando · Retomar |
| Concluídos | Reabrir chamado |

## 2. Endpoints

| Método | Rota | Permissão | Efeito |
| --- | --- | --- | --- |
| GET | `/api/tickets/salas?…&kanban_limit=25` | `chamados view` | lista + `data.kanban` |
| POST | `/api/tickets/salas/{id}/assumir` | `chamados edit` | responsável + Em andamento + alerta reconhecido |
| POST | `/api/tickets/salas/{id}/mover` | `chamados edit` | pendente · retomar · concluir · reabrir |
| GET | `/api/tickets/salas/{id}/historico` | `chamados view` | histórico do GCC (sem sessão do GLPI) |
| GET | `/api/tickets/salas/responsaveis` | `chamados view` | técnicos do GLPI para o formulário |
| POST | `/api/tickets/salas/{id}/aceite` | `chamados edit` | aceite (somente leitura, sem escrita no GLPI) |
| GET | `/api/tickets/salas/aceites?ids=…` | `chamados view` | sincronização de aceites entre telas |

Taxas: `room-ticket-assume` 30/min, `room-ticket-move` 60/min,
`room-ticket-technicians` 30/min, `room-ticket-history` 120/min.

Corpo das escritas:

```jsonc
// assumir
{ "handler": "Ana Ribeiro", "requestId": "rt-assumir-78-abc123" }
// mover
{ "action": "concluir", "solution": "Troca do cabo HDMI.", "requestId": "rt-mover-concluir-78-abc123" }
```

`requestId` (8–64 caracteres) torna o envio repetido idempotente: a segunda
chegada devolve o primeiro resultado, sem nova escrita no GLPI.

## 3. Sincronização com o GLPI

- **Concluído = Resolvido (5)**. O GCC nunca fecha o chamado em definitivo.
  Chamados já fechados (6) aparecem em Concluídos e podem ser reabertos.
- A transição é validada contra o **status atual lido do GLPI** antes de
  escrever (`RoomTicketsService::TRANSITIONS`); transições inválidas devolvem
  409 e não gravam nada.
- A gravação é `PUT /Ticket/{id}` com `status`, mais o responsável e a
  `resolution` quando aplicam — uma única escrita por movimentação.
- **Confirmação por releitura**: depois de gravar, o backend relê o chamado e
  compara o status e o responsável observados com os pedidos. Sem confirmação,
  a resposta é 502 e a interface **não** confirma a movimentação.
- A solução é registrada pelo mecanismo de ITIL do GLPI
  (`POST /ITILFollowup` com `type_followup: 3`) além do campo `resolution` do
  chamado. Se essa parte falhar, a resposta é **parcial** (`partial: true` com
  os passos executados) e a solução permanece salva no GCC — sem duplicar a
  gravação em uma nova tentativa.
- O campo de atribuição do técnico é **descoberto no próprio registro lido**
  (`users_id_recipient` no GLPI 10, `users_id_assign` em versões antigas),
  com sobrescrita por `GCC_ROOM_TICKET_ASSIGN_FIELD`. Nada é enviado quando não
  há correspondência: nenhum usuário é inventado.
- Campos obrigatórios e regras de atendimento do GLPI **não são contornados**:
  qualquer recusa do GLPI (400/403) é traduzida em mensagem compreensível e a
  tela mantém o estado anterior.

## 4. Assumir chamado e responsável

O formulário pergunta **"Quem do TI foi resolver o problema?"**, preenchido com
o usuário conectado, com seleção da equipe (técnicos do GLPI) **ou** texto
livre. Se a lista não puder ser lida, o texto livre continua funcionando e o
motivo é informado.

São registrados separadamente:

| Campo | Origem |
| --- | --- |
| Quem vai atender | nome informado no formulário |
| Quem registrou | sessão autenticada (`PermissionMiddleware`) |
| Técnico atribuído | ID do GLPI, apenas com correspondência exata |
| Data e hora | servidor (`America/Sao_Paulo`) |
| Identificador | ID do chamado |

`handlerSource` distingue `glpi_user` (atribuído) de `informado` (nome sem
correspondência exata ou ambíguo). Correspondência exige igualdade após
normalização de caixa, acentos e espaços, e um único resultado — dois usuários
com o mesmo nome significam **nenhuma** atribuição.

Ao confirmar: o chamado vai para **Em andamento** no GLPI, o responsável e o
movimento entram no histórico, o alerta compartilhado é reconhecido e todas as
telas são atualizadas.

Concorrência: se outro técnico já assumiu (registro do GCC ou responsável no
GLPI), a resposta é **409** com o responsável atual e nada é sobrescrito. A
repetição do mesmo técnico no mesmo status é idempotente.

**Aceites antigos são preservados**: um aceite apenas confirma leitura. Ele
nunca vira atendimento, e um cartão só aceito continua exibindo "Responsável
não definido".

## 5. Conclusão e histórico

"Concluir" pergunta **"Como o problema foi resolvido?"** e exige a descrição
(mínimo de 5 caracteres) antes de enviar.

`GET /api/tickets/salas/{id}/historico` devolve, sem abrir sessão do GLPI:

- `assignment` — quem vai atender, origem, técnico atribuído, autor e horário;
- `solution` — texto, autor, horário e se foi registrada no histórico do GLPI;
- `moves` — ação, origem, destino, autor, horário, `confirmed` e `partial`;
- `acknowledgement` — o aceite, quando existe.

`localStorage` **não** é fonte de responsáveis nem de histórico: é usado apenas
para duas preferências booleanas e para as travas de coordenação entre abas.

## 6. Persistência (VPS)

| Arquivo | Conteúdo | Variável de ambiente |
| --- | --- | --- |
| `Backend/data/room-ticket-work.json` | responsável, solução e histórico | `GCC_ROOM_TICKET_WORK_FILE` |
| `Backend/data/room-ticket-acknowledgements.json` | aceites (primeiro que grava vence) | `GCC_ROOM_TICKET_ACKS_FILE` |

`Backend/data` é persistente no release do VPS: **o diretório precisa ser
mantido em deploys**, caso contrário responsáveis e histórico voltam a zero.
Retenção: 365 dias para o histórico, 24 h para as chaves de idempotência.

## 7. Atualização automática e cache

- Consulta a cada **60 s** pelo monitor compartilhado (uma requisição por
  navegador, com trava em `localStorage`).
- Após assumir, mover, concluir ou reabrir: a tela atualiza na hora, o cache de
  leitura é **invalidado** e as outras abas recebem a mudança pelo
  `BroadcastChannel`.
- Enquanto a consulta acontece, os **últimos dados válidos continuam na tela**:
  o quadro não pisca, não esvazia e filtros, foco e formulários em preenchimento
  são preservados.
- Exibido na barra de ferramentas: "Última atualização: HH:mm:ss" (horário de
  Brasília, com a data quando diferente do dia), o estado do monitor, um
  indicador discreto durante a atualização e o botão "Atualizar agora".
- Em falha com dados em tela: "Exibindo dados em cache — tentando reconectar".
  A recuperação é automática no próximo ciclo.
- O horário exibido é o da **última consulta bem-sucedida ao GLPI**
  (`meta.collectedAt`), nunca a leitura do cache.
- O cache é somente leitura: nenhuma mudança de status ou responsável é
  confirmada sem gravação no servidor.
- Respostas atrasadas após logout, troca de sessão ou consulta mais recente são
  descartadas (geração no monitor, no dashboard e no cliente HTTP). No logout o
  monitor é parado, a fila é limpa e as preferências de URL são removidas.

## 8. Alerta global e áudio

- O alerta aparece em qualquer tela do GCC, por **15 s** ou até alguém assumir.
- Um `<dialog>` aberto cria a **camada superior** do navegador: subir o z-index
  não bastaria. Enquanto houver diálogo aberto, o alerta é movido para dentro
  dele (primeiro filho, `position: sticky`) e volta ao corpo ao fechar. Isso
  cobre os detalhes e qualquer outro diálogo, inclusive no Modo TV.
- Fila e prevenção de duplicatas são preservadas: chamados mais antigos que
  basam de 2 min não disparam de novo após atualização ou reconexão.

Estado real do áudio (nunca apenas a preferência salva):

| Estado | Rótulo | Significado |
| --- | --- | --- |
| `off` | Som desativado | desligado pelo usuário |
| `ready` | Som pronto | `AudioContext` em execução |
| `blocked` | Som bloqueado — clique em "Ativar som" | o navegador recusou o áudio |
| `unavailable` | Som indisponível neste navegador | sem suporte a Web Audio |

Controles: **Ativar som**, **Testar som**, **Silenciar** e o estado do áudio em
texto. A ativação acontece apenas por interação explícita; a preferência salva
nunca produz "Som pronto" sozinha. Uma aba com áudio bloqueado **não segura a
reivindicação** do som: quem consegue tocar assume e as demais ficam em
silêncio. Não há dependência de notificações do sistema operacional.

> A verificação automatizada confirma o **estado** do áudio e a existence do
> caminho de reprodução, não que alguém ouviu. A confirmação de que o som foi
> ouvido é humana (clique em "Testar som" com volume audible).

## 9. Testes executados

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Agregação/paginação | `php Backend/tests/test_room_tickets.php` | 63 verificações |
| Kanban, responsável, histórico | `php Backend/tests/test_room_tickets_kanban.php` | 88 verificações |
| Endpoint, aceite, assumir, mover | `php Backend/tests/test_room_tickets_endpoint.php` | 210 checks |
| Aceite compartilhado (loja) | `php Backend/tests/test_room_ticket_acknowledgements.php` | 16 verificações |
| UI simulada (monitor, relatório, Kanban) | `node --test Frontend/test-room-tickets.cjs` | 26 testes |
| Navegador relatório | `node Frontend/test-room-tickets-browser.cjs` | 24 checks × 2 viewports |
| Navegador Kanban e formulários | `node Frontend/test-room-tickets-kanban-browser.cjs` | 47 checks × 2 viewports |
| Navegador modo TV | `node Frontend/test-room-tickets-tv-browser.cjs` | 19 checks × 2 viewports (1920×1080 e 500×900) |
| Sintaxe | `php -l` e `node --check` nos arquivos alterados | OK |

Cobertura relevante: mapeamento e contagens; transição aceita e recusada;
conflito entre técnicos; nome informado × técnico atribuído; conclusão com
solução; falha parcial; prevenção de duplicidade; encerramento da sessão do
GLPI antes da resposta (subprocesso com o `Responde` real); atualização
automática, cache antigo e reconexão; preservação de formulário durante
atualização; logout e respostas atrasadas; alerta sobre detalhes e no Modo TV;
ativação, bloqueio e indisponibilidade de áudio.

## 10. Homologação manual pendente (GLPI real)

Nada abaixo foi exercitado contra a instância real; os testes usam simulação.

1. **Nome do campo de atribuição**: confirmar em `/Ticket/{id}?expand_dropdowns=true`
   se a instância usa `users_id_recipient` (esperado no GLPI 10.0.19) ou outro.
2. **Perfil da conta de integração**: a escrita precisa da permissão
   `chamados edit` no GCC **e** de escrita em chamados no GLPI.
3. **`type_followup` da solução**: confirmar o valor aceito pela versão
   (3 = solução) e se o histórico exige algum campo adicional.
4. **`resolution` x `resolution_id`**: validar se a instância aceita a
   descrição em texto livre ou exige o dropdown de resolução.
5. **Regras de atendimento**: validar se a instância exige campos adicionais
   (categoria, técnico ou solução) para mover para Resolvido, e se há regras
   próprias que recusem a transição.
6. **Permissões do formulário**: conferir o que o perfil sem acesso a `/User`
   vê (o texto livre precisa continuar utilizável).
7. **Escrita única de `Backend/data`** no release do VPS.

Procedimento sugerido: abrir um chamado de teste no GLPI, assumir no Kanban,
conferir status e responsável no GLPI, concluir com solução, reabrir e validar
o histórico no GCC e no GLPI. Depois, repetir em um chamado já fechado e em um
atribuído a outro técnico para conferir o conflito.
