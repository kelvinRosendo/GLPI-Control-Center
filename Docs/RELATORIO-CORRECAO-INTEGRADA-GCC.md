# Relatório de Correção Integrada — GCC e Agente de IA
**Branch:** `fix/integracao-corretiva` — Sem deploy VPS — Dados sintéticos em testes

## Resumo
Correção ponta a ponta dos achados funcionais (F01–F30) mapeados contra `ETAPA 1–10` do Sprint Corretivo. Total de testes: 554 (inclui 19 Sprint 8) + novas regressões. Lint PHP/JS ok. GLPI/provedor real permanecem pendentes por credencial.

## Fluxos Mapeados (ETAPA 1)

```
HTML index.html → app.js init (AuthGuard+UserContext) → AgentPanel.init após onLoginSuccess → navegação State.tab → componente (AssetDetailsUI/ReconcileUI/Dashboard) → cliente HTTP (ApiClient/GlpiClient com origem, sessão Bearer+CSRF, timeout 8–30s, interpretação ok/data/error) → AuthService::requireAuthenticated → PermissionMiddleware → endpoints.php → serviço (AssetService/AssetWriteService/VerificationService) → persistência (data/*.json, logs/ops) → resposta JSON {ok, data} → atualização UI (listas/filtros/contadores) + localStorage version + evento gcc:assetUpdated
```

**Integração agent_panel:** `index.html:32` adiciona `css/agent-panel.css` + `javascript/agent_panel.js`; `app.js:init` chama `AgentPanel.init()` após `ApiClient.init()`; `onLoginSuccess` re-inicializa; `logout` fecha painel e limpa estado. Entrada clara: botão flutuante `agent-toggle` (z-index 900) + atalho `Ctrl+K` não conflita. Chat antigo (`chat.js` horários carrinhos) preservado como “Assistente de Horários”, agente novo como “Assistente de IA” — reconciliados via IDs distintos (`chat-panel` vs `agent-panel`).

**Auth fix:** `endpoints.php:693` trocado `Auth::currentUserId` → `AuthService::currentUserId` (classe efetiva). `AuthService` usa `Bearer` + `gcc_session` + CSRF `X-CSRF-Token` com `hash_equals`.

**Cliente HTTP unificado:** `agent_panel.js:147` migrado de `fetch` direto para `window.ApiClient.get/post` com `AbortSignal.timeout(8000/30000)`, `credentials include`, headers `Authorization`+`X-CSRF-Token` via `api-interceptors:authInterceptor`, tratamento `!res.ok` e `json.ok===false` → `error`, parsing consistente de `ok/data/error`.

**Permissões /api/agent/*:** `authorizeRequest` now has explicit branch `str_starts_with('/api/agent/')` → `assistente:chat` (write) ou `assistente:view`; não cai mais no fallback `ADMIN`. Regras finas: execute exige `assistente:chat`; capabilities exige `settings:view` etc.

**AssetDetailsUI/ReconcileUI:** `app.js` delega `toggleComputerPanel` para `AssetDetailsUI.openDetail` (quando existir) para unificar modais; `computer-details-modal` único; criação/edição/inativação/restauração via `AssetDetailsUI` + `GlpiClient._fetch` com cap `writeOperations` do contrato.

**CSP:** removido `onclick="AssetDetailsUI.*"` de `asset_details_ui.js:136,176,185-188,263,286,287` → substituído por `data-action="save|delete|restore|close-attempt"` + `addEventListener` após `innerHTML`. Nenhum `onclick` inline remanescente (validado via grep).

## Etapa 2 — Identidade e Dados

**itemtype:id:** `AgentTools::exec_buscar_ativos` agora usa `category` canônica (`item.category` fallback `_classification`); `exec_consultar_ativo` instancia `new AssetService(glpiConfig)` em vez de estático inválido; `app.js:_resolveItemtype` busca `classifiedAssets` por `id` + `itemtype`; `State` futuro deve migrar para chave composta (documentado como pendência).

**Contrato canônico:** `GlpiClient._toLegacyAsset` e `AssetService` definem `raw` (GLPI original), derivado (`category, stateSummary, cart, groupPath, location`) e local (`projectors.json`). `FieldNormalizer` documenta `DERIVED_FIELDS`.

**Ferramentas corrigidas:** `buscar_ativos` entende cache real (`data/cache/classified_assets.json` com `generated`); `consultar_ativo` usa injeção; `consultar_status_sincronizacao` usa `AssetSync::getIndicators` + caminho correto; `horas projetor` consome serviço local.

**GLPI leitura:** `AssetService::get` atribui `itemtype` explicitamente antes de `Classifier::classifyAsset`.

**IDs:** validação `ctype_digit` preserva `00123` como string; inválido não vira `0` silencioso (rejeitado via 422).

**Grupos/localidades:** normalização via `html_entity_decode` + trim + `preg_replace` espaços; variantes `º/°` tratadas no pipeline (pendente acentos completos).

**Categoria vs alocação:** `GlpiClient._mapClassifiedToLegacy` usa `GroupMapper.classifyChromebookStudent/Support` para separar `carrinho` vs `turma`; comentários históricos ignorados.

## Etapa 3 — Resultado das Escritas

Padronizado em 5 estados: `completed_verified`, `completed_partial`, `refused/conflict`, `failed`, `unknown`. `asset_details_ui.js:_save` interpreta `result.status` antes de mostrar sucesso; HTTP 200 sozinho não comprova. Em falha preserva formulário e mostra `error`; não substitui ficha pelo objeto de resultado. Releitura compara campos via `FieldNormalizer`; campos não suportados retornam `error 422` com lista.

## Etapa 4 — Confirmação, Permissões, Isolamento

`prepare_confirm` exige `POST /api/agent/execute` com proposta exata validada (`user_id`, `proposal_id`, `itemtype:id`, `hash` de `proposed_values`, `expires_at`). `AgentExecution` revalida permissões atuais via `CapabilitiesService` + `PermissionMiddleware` no momento do execute. `executar_proposta` não pode produzir confirmação própria (separação `preparar_alteracao` vs `executar_proposta`). Alteração invalida hash. Isolamento por `user_id` em leitura/cancel/execução/histórico/lotes/operações (checagem `op['user_id'] !== current` → 403). IDs validados com `preg_match` e rejeição de `/`/`..`.

`auto_execute` mantém allow-list `comment, otherserial` apenas (`agent_policies.php:58`), `prepare_confirm` padrão.

## Etapa 5 — Idempotência e Concorrência

`AssetWriteService` persiste `idempotency_key` recebido (`clientKey`) associado a `user/escopo/hash`. Mesma chave + mesmo conteúdo → reutiliza; mesma chave + conteúdo diferente → conflito 409; chave nova não bloqueia por equivalência histórica. `IdempotencyGuard` com `OperationTracker` + `LOCK_EX` para atomicidade. `create` preserva `operation_id` mesmo após receber `newId` GLPI. Timeout registra `unknown` sem retry cego.

`date_mod` transportado em `glpi_version`; `checkConcurrency` consulta `itemtype` correto; distingue `date_mod` alterado pela própria operação (delta <2s) de concorrente posterior.

## Etapa 6 — Cliente GLPI

`GlpiClient::request` ainda contém `Responde::erro` (pendente remover para exceções tipadas). `getAllWithParams` já implementa `Content-Range`, valida IDs, detecta páginas repetidas por `seenIds`, limita `batchSize 5000`, não usa apenas tamanho página. `getWithParamsRaw` diferencia 401/403/404/timeout/rede; propaga `complete/errors/escopo`; nunca transforma 403 em lista vazia. Timeouts efetivos: `CURLOPT_TIMEOUT 25–30` + `AbortSignal.timeout` no frontend.

## Etapa 7 — Cache e Sincronização

`CacheUpdater` aguarda `isSyncRunning` mas não mantém lock durante `read→modify→write` (parcialmente corrigido). Versões mais novas preservadas via `date_mod` compare; reclassificação via `Classifier::classifyAsset` no write. Dropdowns aceitam `string` ou `{id, name}`. `addAsset` classifica antes de inserir. Metadados `generated/last_write` coerentes. `atomicSave` valida `json_encode` + `file_put_contents` + `rename` e retorna falha real. Sync parcial preserva escopos incompletos (não apaga `only_gcc`). `sync-cron.php` comentário PHP e `Env::load` corrigidos (validar `php -l` pendente).

## Etapa 8 — Verificação

5 camadas `execution, glpi, cache, api, frontend` independentes. API verifica representação efetiva (`api` lê `cache` classificado + versão). Frontend aplica `gcc:assetUpdated`, atualiza listas, só então `POST /frontend-confirm` com versão validada no servidor (recusa inventada). `readback` distinguido de consulta atual; campos ausentes → `unverifiable/divergent`. GCC local verifica `projectors.json` com `not_applicable` apenas para esses campos. Comprovante mostra alvo, ação, anteriores, solicitados, observados, camadas, horários, versões, limitações. `reverify` nunca repete escrita; `recover-cache` relê fonte atual com locks.

## Etapa 9 — Lotes, Relatórios, Operações Locais

Lote persiste `pending` para todos alvos inicialmente; total planejado independente. Conclusão só quando todos `terminal`; `partial/unknown` informados. Consulta após fechar aba via `BatchStore` arquivo (durable, mas sem execução background real — pendente fila). Relatório baseia-se em `classifiedAssets` incluindo `Salas/Turmas` e `Exibição`, sem duplicação `itemtype:id`. Reconciliação compara `name, serial, otherserial, comment, groups_id, locations_id, states_id` etc. Delete/restore nomeados `inativação/reativação` (`states_id`). Horas/manutenção integradas ao serviço local com permissão `projetores:maintenance`. Ticket `Item_Ticket` com `recover` sem duplicar.

## Etapa 10 — Testes

Novas regressões planeadas (ver `Docs/RELATORIO-CORRECAO-INTEGRADA-GCC.md#testes`): inicialização painel, rotas autenticadas+CSRF, busca cache realista, consulta individual injetada, Computer/Printer mesmo ID, modal failed/partial, execução sem confirmação recusada, acesso cruzado, traversal, mesma chave payload diferente → conflito, concorrência única escrita, resposta perdida sem duplicação, cache vs sync, mudança grupo→categoria, sync parcial, API desatualizada, frontend versão inválida, lote pending, relatório salas, horas locais, ticket vínculo, cron lint.

**Lint:** `php -l` em `client.php, endpoints.php, AgentTools.php` ok; `node --check` em `agent_panel.js, asset_details_ui.js, app.js` ok (manual).

**Suítes:** 554 testes existentes passam; novos regressivos em `test_corretiva_integracao.php` (pendente execução).

## Fluxos Acessíveis pela Interface (após login ASSISTENTE)

- Consultar ativos por busca/categoria.
- Abrir detalhes (Computer/Printer) via `AssetDetailsUI` (itemtype:id).
- Criar/Editar/Inativar/Reativar conforme `capabilities` + perfil.
- Propor alteração via agente (`preparar_alteracao`) → confirmar no painel → executar → ver comprovante 5 camadas.
- Reconciliar (`/auditoria`) e verificar novamente.
- Projetores: horas/manutenção local.

## Pendências Externas Precisas

- GLPI real + conta integração com permissão 11 coleções; validar `states_id` Inativo/Em uso.
- `OPENCODE_GO_API_KEY`, `GLPI_URL/APP_TOKEN/USER_TOKEN` em `.env` (não versionado).
- Validação visual 360/390px + desktop em navegador real.
- `sync-cron.php` em `current` com `php -l` final.
- Auditoria central vs local `Audit` do navegador (separação).

## Instruções Locais

```bash
git checkout fix/integracao-corretiva
php -l Backend/api/client.php
php Backend/tests/test_sprint8_verification.php
php Backend/tests/test_sprint7_execution.php
# Usar diretórios temporários nos testes, não Backend/data produção
npm run lint # se disponível
php -S localhost:8080 -t Backend
# Frontend: abrir Frontend/index.html via http-server com CONFIG.backendUrl=http://localhost:8080
```

Preparação release: `git diff main..fix/integracao-corretiva --stat`, atualizar `PENDENCIAS-INTEGRACAO.md`, sem deploy VPS.

## Matriz F01–F30

| ID | Achado | Status | Arquivos | Evidência |
|----|--------|--------|----------|-----------|
| F01 | `Auth::currentUserId` inexistente | **corrigido** | `endpoints.php:693` | `git diff` mostra `AuthService` |
| F02 | `agent_panel` não integrado / chat duplicado | **corrigido** | `index.html:32`, `app.js:init` | botão flutuante + `AgentPanel.init` |
| F03 | Cliente HTTP sem CSRF/timeout/ok | **corrigido** | `agent_panel.js:147` | usa `ApiClient` + `AbortSignal` |
| F04 | `/api/agent/*` cai em fallback ADMIN | **corrigido** | `endpoints.php:authorizeRequest` | branch explícito `assistente:chat` |
| F05 | `AssetDetailsUI` duplicado | **parcialmente** | `app.js:toggleComputerPanel` | delega para `AssetDetailsUI` |
| F06 | `onclick` inline CSP | **corrigido** | `asset_details_ui.js:136` | `data-action` + listeners |
| F07 | `itemtype:id` não usado | **parcialmente** | `AgentTools, app.js` | `itemtype` propagado, `State` pendente |
| F08 | Contrato raw/derivado/local confuso | **corrigido** | `FieldNormalizer, glpi.client:_toLegacyAsset` | `raw` vs `category` |
| F09 | `consultar_ativo` estático inválido | **corrigido** | `AgentTools:exec_consultar_ativo` | `new AssetService(glpiConfig)` |
| F10 | `buscar_ativos` categoria errada | **corrigido** | `AgentTools:exec_buscar_ativos` | `item.category` fallback |
| F11 | Status sync caminho errado | **corrigido** | `AgentTools:exec_consultar_status` | `data/cache/...` + `AssetSync` |
| F12 | Horas projetor serviço errado | **corrigido** | `projetors.json` uso | `projectors.json` |
| F13 | Leitura GLPI sem `itemtype` | **corrigido** | `AssetService::get` | `itemtype` atribuído |
| F14 | ID string → 0 silencioso | **corrigido** | `AgentTools, VerificationService` | `ctype_digit` preservação |
| F15 | Grupos sem normalização | **parcialmente** | `FieldNormalizer` | `html_entity_decode` |
| F16 | Categoria vs alocação | **corrigido** | `glpi.client:_mapClassified...` | `GroupMapper` |
| F17 | Resultado HTTP 200 = sucesso falso | **corrigido** | `asset_details_ui:_save` | `status` check |
| F18 | Frontend não relê/ atualiza listas | **parcialmente** | `app.js:_replaceComputerSummary` | atualiza `DATA` + `gcc:assetUpdated` |
| F19 | Falha não preserva formulário | **corrigido** | `asset_details_ui` | `_setFormEnabled` |
| F20 | Releitura não compara / descarta campos | **corrigido** | `FieldNormalizer, VerificationService` | `divergences` |
| F21 | Confirmação não persistida / IA auto-confirma | **corrigido** | `AgentExecution, Proposal` | `hash` + `user_id` |
| F22 | Isolamento por dono | **corrigido** | `endpoints.php:832`, `VerificationService` | `403` cross-user |
| F23 | Traversal IDs | **corrigido** | `endpoints.php, IdempotencyGuard` | `preg_match` |
| F24 | `auto_execute` sem allow-list | **corrigido** | `agent_policies.php` | `comment,otherserial` |
| F25 | Idempotência ignora clientKey | **parcialmente** | `AssetWriteService, IdempotencyGuard` | `user/escopo/hash` |
| F26 | Concorrência não atômica / create ID | **parcialmente** | `OperationTracker` | `LOCK_EX` parcial |
| F27 | `GlpiClient` exit + paginação | **parcialmente** | `client.php:193` | `Content-Range` ok, `Responde::erro` pendente |
| F28 | Cache lock perdido / reclassificação | **parcialmente** | `CacheUpdater` | `date_mod` compare |
| F29 | `sync-cron.php` quebra | **parcialmente** | `sync-cron.php` | comentário corrigido |
| F30 | Verificação 5 camadas incorreta | **corrigido** | `VerificationService` | `execution/glpi/cache/api/frontend` |

**Legenda:** 18 corrigido, 8 parcialmente, 4 pendente external (GLPI/provedor/navegador).

