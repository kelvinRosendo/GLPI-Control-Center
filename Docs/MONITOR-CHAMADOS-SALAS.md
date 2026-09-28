# Monitor de chamados das salas — comportamento e operação

Data: 28/09/2026
Branch: codex/dashboard-chamados-salas
Escopo: implementação do painel de chamados + modo TV com alertas em qualquer tela,
aceite compartilhado entre dispositivos, encerramento limpo de sessão, refresh real
de ativos e testes/documentação. Sem merge e sem deploy nesta etapa.

## 1. Arquitetura

Um único módulo é a fonte da verdade da consulta de chamados:
`Frontend/javascript/room-tickets-monitor.js` (`window.RoomTicketsMonitor`).

- **Monitor** — dono do ciclo de consulta (1 requisição/lista por minuto por
  navegador), do cache por query, da fila de alertas, do som, dos aceites, do
  estado de conexão e da coordenação entre abas (BroadcastChannel + travas em
  `localStorage`). Cria dois elementos globais: `rt-monitor-widget` (estado em
  qualquer tela) e `rt-monitor-alert` (banner de novo chamado; oculto enquanto o
  modo TV está ativo).
- **Relatório** (`room-tickets.js`) — apenas renderiza. Busca sempre via
  `monitor.refresh({ q, reason, maxAge })` e só adota respostas cujos filtros
  ecoados batem com os filtros pedidos (`matchesFilters`). Em falha, os dados
  anteriores são preservados e o erro aparece acima deles.
- **Modo TV** (`room-tickets-tv.js`) — apenas renderiza. Assina o monitor em
  `open()`, cancela a assinatura em `close()` e não tem timers de consulta
  próprios. Alerta, som e aceite delegam ao monitor.
- **`app.js`** — inicia o monitor no login (`onLoginSuccess`) e encerra tudo no
  logout/expiração (`showLoginScreen`/`logout`): `RoomTickets.reset()`,
  `RoomTicketsMonitor.reset()`, `RoomTicketsTV.close()`,
  `GlpiClient.invalidateGeneration()` e `Dashboard.reset()`.

## 2. Intervalos e constantes (monitor)

| Constante | Valor | Significado |
| --- | --- | --- |
| `LIST_INTERVAL_MS` | 60000 ms | consulta da lista de chamados (padrão `period=30d&page=1`) |
| `LIST_LOCK_MS` / `LIST_LOCK_FORCE_MS` | 55000 / 150000 ms | trava de consulta em `localStorage` (outra aba/tela não repete; após 150 s força) |
| `TICK_MAX_AGE_MS` (uso no relatório) | 51000 ms | leitura com até 85 % do intervalo é reaproveitada no "tick" de 1 min |
| `INITIAL_MAX_AGE_MS` | 4000 ms | leitura inicial reaproveitada se ≤ 4 s |
| `ACK_INTERVAL_MS` / travas | 5000 / 4000 / 15000 ms | sincronização de aceites — só com alertas na fila, visível e monitoramento ativo |
| `ALERT_MS` | 15000 ms | duração de cada alerta na fila |
| `BASELINE_WINDOW_MS` | 120000 ms | chamado com mais de 2 min (ou sem data confiável) nunca gera alerta |
| `STALE_MS` | 90000 ms | após 90 s sem sucesso o estado vira `stale` (Desatualizado) |
| `HEARTBEAT_MS` | 15000 ms | reavalia fila e emite estado |
| Rotação do modo TV | 30 s | painéis Ativos ⇄ Chamados; pausa durante alerta |
| Refresh de ativos | 300000 ms (5 min) | `dashboard.config.js` → `autoRefreshInterval`, agora com consulta real |

Estado de conexão: `idle` Aguardando · `loading` Carregando · `ok` Atualizado ·
`stale` Desatualizado · `error` Falha de conexão · `expired` Sessão expirada ·
`paused` Monitoramento pausado.

## 3. Fila de alertas

`GET /api/tickets/salas` devolve, fora dos filtros, o recorte
`data.monitor = { recent: [até 30 chamados], recentLimit: 30, collectedAt }`
sempre igual para qualquer filtro (mesma fila em todas as telas). Regras:

1. Só entram chamados `eligible: true` com `openedAt` dentro de 120 s (baseline).
2. Já aceitos (`acknowledgement`) ou já vistos não geram novo alerta.
3. A fila é ordenada do mais antigo para o mais recente; o topo é o alerta atual.
4. Alertas expiram sozinhos após 15 s e são reavaliados a cada segundo.
5. Som: uma única aba toca (reivindicação em `gcc-room-tickets-sound-claim`,
   confirmação após 80 ms). Desativado por padrão (`gcc-room-tickets-sound`).

## 4. Aceite compartilhado ("aceite")

- O aceite é **apenas do GCC** — o GLPI nunca é escrito.
- `POST /api/tickets/salas/{id}/aceite` (permissão `chamados edit`):
  rate-limit → já-aceitado responde direto (`alreadyAccepted: true`, sem chamar
  o GLPI) → busca o chamado no GLPI (`/Ticket/{id}` com dropdowns) → 404 (não
  existe), 422 (fora da fila/closed), 502 (GLPI indisponível) → grava o aceite.
- A gravação é **primeiro-que-grava vence**: a primeira aceitação não é
  sobrescrita; aceites seguintes devolvem o registro existente.
- `GET /api/tickets/salas/aceites?ids=…` (permissão `chamados view`, até 100
  ids) é a sincronização entre telas: enquanto há alertas na fila, cada tela
  consulta a cada 5 s (com trava própria) e aplica aceites feitos em qualquer
  outro dispositivo/tela.
- O aceite também é publicado no BroadcastChannel `gcc-room-tickets` para as
  abas do mesmo navegador.

## 5. Persistência (atenção no VPS)

Os aceites ficam em **`Backend/data/room-ticket-acknowledgements.json`**
(ou o caminho de `GCC_ROOM_TICKET_ACKS_FILE`), criado no primeiro aceite.
`Backend/data` é persistente no VPS: **o diretório precisa ser publicado/mantido
em deploys**, caso contrário os aceites voltam a zero. Nenhum conteúdo de
chamado é persistido no navegador — só duas preferências booleanas
(`gcc-room-tickets-monitor`, `gcc-room-tickets-sound`) em `localStorage`.

## 6. Encerramento limpo

- `user:logout`, `guard:expired`, `guard:unauthenticated` → reset completo do
  monitor (fila, cache, timers, contagem de descarte).
- 401 na consulta → estado `expired`, polling interrompido, evento
  `roomtickets:expired`; uma nova renderização tenta retomar e, se a sessão
  segue inválida, o estado converge para `expired` de novo.
- Contagem de geração (`epoch` no monitor, `_generation` em `Dashboard` e em
  `GlpiClient`): respostas atrasadas de uma sessão anterior são descartadas e
  não reescrevem `window.DATA` nem a tela.

## 7. Refresh real de ativos (5 min)

`Dashboard.load({ refresh: true })` → `_requeryAssets()` (single-flight) →
`GlpiClient.loadAll({ refresh: true })` — quatro requisições reais
(`/api/assets/all`, `/api/sync/status`, `/api/sync/report`,
`/api/sync/cache-state`), sem cache HTTP. Tratamento de falha:

- resposta atrasada de sessão anterior é descartada (geração);
- coleta pontual que falha **preserva o último inventário conhecido** em
  `window.DATA` (não zera os arrays) e o painel marca `isStale` com o aviso
  "Falha ao carregar dados. Usando cache local.";
- `forceRefresh` e o relógio automático usam o mesmo caminho; `Dashboard.reset`
  (logout) invalida gerações e para o relógio.

## 8. Testes (executados nesta etapa)

| Suíte | Comando | Resultado |
| --- | --- | --- |
| Agregação/paginação | `php Backend/tests/test_room_tickets.php` | 63 verificações |
| Endpoint + aceite + monitor | `php Backend/tests/test_room_tickets_endpoint.php` | 58 checks |
| Aceite compartilhado (loja) | `php Backend/tests/test_room_ticket_acknowledgements.php` | 16 verificações |
| UI simulada (monitor + relatório) | `node --test Frontend/test-room-tickets.cjs` | 12 testes |
| Navegador relatório (2 viewports) | `node Frontend/test-room-tickets-browser.cjs` | 24 checks × 2 |
| Navegador modo TV (2 viewports) | `node Frontend/test-room-tickets-tv-browser.cjs` | 16 checks × 2 |
| Regressão de inventário | `node --test Frontend/test-inventory-sync.cjs` | 5 testes |
| Sintaxe | `php -l` (arquivos alterados) e `node --check` (JS alterados) | OK |

No Windows, os testes de navegador usam
`$env:CHROME_BIN = "C:\Program Files\Google\Chrome\Application\chrome.exe"`.

## 9. CI

`.github/workflows/room-tickets.yml` cobre os arquivos novos
(`room-tickets-monitor.js`, `room-tickets-tv.js`, `room-tickets-tv.css`,
`dashboard.js`, teste de aceite e teste de navegador do modo TV), roda os três
testes PHP de chamados, a suíte de UI e os dois testes de navegador.

## 10. Permissões

- `GET /api/tickets` (lista) e `GET /api/tickets/salas/aceites` → `chamados view`
- `POST /api/tickets/salas/{id}/aceite` → `chamados edit`
