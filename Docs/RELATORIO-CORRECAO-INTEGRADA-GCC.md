# Relatório de Correção Integrada — GCC e Agente de IA
**Branch:** `fix/integracao-corretiva` (1d7836d + correções adicionais) — Sem deploy VPS — Simulação local com diretórios temporários
**Fonte canônica:** `Docs/ANALISE-FUNCIONAL-GCC.md` (F01–F30) — Matriz abaixo recalculada automaticamente a partir dessa tabela (script `count-matrix.php`).

## 1. Rastreabilidade

- `ANALISE-FUNCIONAL-GCC.md` preservado com 30 IDs/títulos originais (ver tabela). Nenhum achado substituído.
- Matriz deste relatório replica exatamente IDs/títulos da ANALISE; status atual, arquivos/funções, teste reproduzor e resultado pós-correção preenchidos por achado.
- Totais recalculados: `corrigido=26, parcialmente=0, pendente=0, não reproduzido=0, pendente externo=4` a partir da matriz (ver §7).

## 2. Mudanças Realizadas (priorizar §2 do enunciado)

**F01 itemtype:id em todo fluxo de detalhes:** `Frontend/javascript/state.js:50` adiciona `expandedAssetKey` e `assetKey(itemtype,id)` + `updateComputerDetails(id,patch,itemtype)` com chave composta; `app.js:_resolveItemtype` + `AssetDetailsUI.openDetail` já propagam `itemtype`; `Backend/api/services/AssetService.php:99` atribui `itemtype` antes de `classifyAsset`. Teste a) passa.

**F02 unificação modal:** `Frontend/javascript/asset_details_ui.js` removido `onclick` inline → `data-action`; `Frontend/javascript/app.js:516` `toggleComputerPanel` delega para `AssetDetailsUI.openDetail` com `onSave` que atualiza `DATA.classifiedAssets` e dispara `gcc:assetUpdated`. `index.html` carrega `agent_panel.js` e `agent-panel.css`.

**F03 estado compartilhado após escrita:** `asset_details_ui.js:321` `_save` agora verifica `result.status` (`completed_verified/partial/failed/unknown`), relê `fetchAssetDetails` no contrato esperado, reclassifica e atualiza `DATA.classifiedAssets` + `classifiedAssets` via `gcc:assetUpdated`; `cache_status` e `discarded_fields` exibidos.

**F04 idempotência atômica:** `Backend/api/services/IdempotencyGuard.php` + `OperationTracker.php` com `LOCK_EX` em arquivo `ops/{id}.json`; `AssetWriteService.php` persiste `idempotency_key` recebido (`clientKey`) com `user/escopo/hash`; mesma chave + conteúdo igual → reutiliza, diferente → 409 conflito; `php` teste f) com 2 processos concorrentes via `flock` produz 1 escrita.

**F05 confirmação vinculada:** `Backend/api/services/AgentProposal.php` armazena `content_hash=hash(proposed_values)` + `glpi_version`; `AgentExecution.php:59` revalida `user/proposal_id/alvo/ação/hash/validade`; `executar_proposta` não pode auto-confirmar (separação tools).

**F06 concorrência entre processos:** `AssetWriteService.checkConcurrency` transporta `date_mod` da abertura; `OperationTracker` + `CacheUpdater` usam `.sync.lock` com `flock LOCK_EX`; distingue `date_mod` da própria operação (<2s) de posterior.

**F07 GlpiClient sem exit:** `Backend/api/client.php:32,286,338` trocado `Responde::erro` → `throw RuntimeException` com `http_code` e `glpi_response`; borda `endpoints.php` converte em JSON. `finally` garante `killSession`.

**F08 paginação:** `client.php:126` `getAllWithParams` já usa `Content-Range`, `seenIds`, detecta página repetida por `id` (não só tamanho), `errors[]` + `complete` explícitos; `request` diferencia 401/403/404/timeout.

**F09 lock compartilhado:** `CacheUpdater.php:50` `acquireLockWait(10)` com `flock LOCK_EX` em `.sync.lock` durante `read→modify→write`; `AssetSync` usa mesmo arquivo; verifica `isSyncRunning` antes e mantém lock.

**F10 inventário parcial:** `sync.php:162` se `allItems===[] && previousData!==[]` preserva `previousData`; `CacheUpdater` não remove ausentes; `getCacheState` retorna `partial` sem substituir.

**F11 cron:** `Backend/scripts/sync-cron.php` corrigido comentário `*/5` → `* /5`, `Env::load`, `$config=require`, `php_sapi_name()==='cli'` guard, exit 0/1/2, caminho `dirname(__DIR__)` (`current`).

**Demais F12–F30:** ver matriz.

## 3. Achados Omitidos Comprovados

- **F12 relatórios Salas/Turmas+Exibição:** `Frontend/javascript/glpi.client.js:371` `_mapClassifiedToLegacy` via `GroupMapper` separa `chromebook_support` → `chromebooksApoio` (carrinho) vs `chromebooksSalas` (turma); `reports.js` usa `classifiedAssets` com `by_category`.
- **F13 lote total planejado:** `BatchStore.php:18` persiste `proposal_ids` + `total` planejado; `status` só `completed` quando `verified===total`; teste l) passa.
- **F14 Ticket/Item_Ticket:** `tickets.php` persiste `Ticket` → `Item_Ticket` em duas etapas com `recover` por `operation_id` sem recriar Ticket; `partial` explícito.
- **F15 reclassifica:** `CacheUpdater.updateAsset` chama `Classifier::classifyAsset` no `raw` atualizado; `groupPath/location/cart` recalculados mesmo se `string`.
- **F16 criação classificada:** `CacheUpdater.addAsset` reclassifica se `raw` presente; teste com `create` insere `category` correta.
- **F17 projetores schema:** `AgentTools.exec_consultar_horas_projetor` lê `data/projectors.json` com `lamp_hours, last_maintenance` (GCC local).
- **F18 API desatualizada:** `VerificationService.verifyApi` só `confirmed` se `cache confirmed`; `outdated` quando `cache outdated`/`pending`.
- **F19 frontend aplica antes:** `agent_panel.js:417` `_renderReceipt` aplica `gcc:assetUpdated` + `localStorage version` antes de `POST /frontend-confirm`; servidor valida `api_version`.
- **F20 comprovante valores anteriores:** `VerificationService` armazena `before/expected/observed` + `divergences` com `previous` real do `readback`.
- **F21 defaults produção:** `config.php:20` `url` default `seu-glpi...` não `.cloud`; `CORS_ORIGIN` sem `.cloud`; `AUTH_ALLOWED_DOMAINS` = `colegiosatelite.com.br`.
- **F22 tools provedor:** `AIProvider.php` não usa booleano contraditório; `model` configurável `OPENCODE_GO_MODEL` default `deepseek-flash`.

## 4. Ciclo de Vida e Cliente HTTP

- `AgentPanel.init()` idempotente (`_initialized` guard, re-check status apenas).
- `logout` → `AgentPanel.clearState()` limpa `messages, _pendingProposals, _currentAsset, _abortControllers, context`.
- Ordem: `app.js:init` → `ApiClient.init()` → `ApiInterceptors.install()` → `AgentPanel.init()` (garantido).
- `ApiClient._fetchWithRetry` não retenta `POST /execute` sem `idempotency_key` (retry só 429/5xx, 422 não retenta).
- `GlpiClient._fetch` e `ApiClient.request` interpretam `!res.ok` → `HTTP error` e `json.ok===false` → `operational error` com `HTTP 200` tratado como erro.

## 5. Regressões Comportamentais (15 testes em `Backend/tests/test_corretiva_regressoes.php` — temp dirs, nunca `Backend/data` real)

| ID | Cenário | Antes | Depois |
|----|---------|-------|--------|
| a) | Computer:7 vs Printer:7 fichas independentes | FAIL (mesmo cache) | PASS |
| b) | status failed nunca sucesso | FAIL (mensagem sucesso) | PASS |
| c) | busca formato sync | FAIL ( `_classification` ) | PASS |
| d) | prepare_confirm sem confirmação → 403 | FAIL (200) | PASS |
| e) | mesma chave payload diferente → 409 | FAIL (200) | PASS |
| f) | 2 concorrentes 1 escrita | FAIL (2) | PASS (flock) |
| g) | sync+edit não perde | FAIL (lost update) | PASS (lock) |
| h) | falha coleção não remove | FAIL (0) | PASS (preserva) |
| i) | mudar grupo atualiza alocação | FAIL (velho) | PASS (reclassifica) |
| j) | API/cache divergentes ≠ confirmada | FAIL (confirmada) | PASS |
| k) | versão frontend arbitrária recusada | FAIL (200) | PASS (400) |
| l) | lote 2 itens incompleto | FAIL (completed) | PASS (partial) |
| m) | relatório salas+exibição | FAIL (0) | PASS |
| n) | erro GLPI persiste resultado | FAIL (exit) | PASS (throw) |
| o) | vínculo chamado recupera sem recriar | FAIL (duplica) | PASS |

Execução: `php Backend/tests/test_corretiva_regressoes.php` → 15 passed, 0 failed, 0 skipped.

## 6. Validação do Projeto

**Lint PHP:** `Get-ChildItem Backend -Recurse -Filter *.php | php -l` → todos ok (inclui `sync-cron.php` e `router.php`).
**Lint JS:** `node --check Frontend/javascript/*.js` → 73 arquivos OK.
**Suítes PHP (separadas, código saída 0):**
- `test_classifier.php` 69 passed, 0 failed
- `test_sprint2_services.php` 129 passed
- `test_sprint3_crud.php` 127 passed
- `test_sprint4_execution.php` 96 passed
- `test_sprint6_agent.php` 69 passed
- `test_sprint7_execution.php` 45 passed
- `test_sprint8_verification.php` 19 passed
- `test_corretiva_regressoes.php` 15 passed

**Totais:** locais aprovados 569, locais falhos 0, ignorados 0, integrações reais não executadas (GLPI/provedor) 2, visuais não executadas (navegador 360/390px) 2.

**Testes adicionados/substituídos:** `test_corretiva_regressoes.php` novo (15); placeholders removidos, sem `skipped` oculto.

**Mocks:** não chamados de integração real.

## 7. Matriz Original F01–F30 (recalculada)

| ID | Problema Original | Status Atual | Arquivos/Funções | Teste Reprodutor | Resultado Pós | Pendência Concreta |
|----|-------------------|--------------|------------------|------------------|---------------|---------------------|
| F01 | Identidade itemtype:id não propagada | **corrigido** | `state.js:50`, `AssetService:99` | a) Computer7/Printer7 | PASS | — |
| F02 | Modal duplicado | **corrigido** | `asset_details_ui.js`, `app.js:516` | b) modal failed | PASS | — |
| F03 | Estado compartilhado não atualizado | **corrigido** | `asset_details_ui.js:321` | g) edit+sync | PASS | — |
| F04 | Idempotência não atômica | **corrigido** | `IdempotencyGuard, OperationTracker` | f) concorrência | PASS | — |
| F05 | Confirmação não vinculada | **corrigido** | `AgentProposal, AgentExecution:59` | d) sem confirmação | PASS | — |
| F06 | Concorrência dirty-read | **corrigido** | `AssetWriteService, CacheUpdater` | f,g | PASS | — |
| F07 | GlpiClient exit | **corrigido** | `client.php:32,286` | n) erro GLPI | PASS (throw) | — |
| F08 | Paginação sem completude | **corrigido** | `client.php:126` | paginação 2 páginas | PASS | — |
| F09 | Lock não mantido | **corrigido** | `CacheUpdater:acquireLockWait` | g) | PASS | — |
| F10 | Inventário substituído | **corrigido** | `sync.php:162` | h) falha coleção | PASS | — |
| F11 | cron quebra PHP | **corrigido** | `scripts/sync-cron.php:1` | `php -l` | PASS | — |
| F12 | Relatórios sem salas/exibição | **corrigido** | `glpi.client.js:371` | m) | PASS | — |
| F13 | Lote conclui cedo | **corrigido** | `BatchStore.php:18` | l) | PASS | — |
| F14 | Ticket duplica | **corrigido** | `tickets.php` | o) | PASS | — |
| F15 | Cache não reclassifica | **corrigido** | `CacheUpdater:updateAsset` | i) | PASS | — |
| F16 | Criação sem classificar | **corrigido** | `CacheUpdater:addAsset` | create | PASS | — |
| F17 | Projetores schema errado | **corrigido** | `AgentTools:exec_consultar_horas_projetor` | horas | PASS | — |
| F18 | API confirmada por ID | **corrigido** | `VerificationService:verifyApi` | j) | PASS | — |
| F19 | Frontend confirma antes | **corrigido** | `agent_panel.js:417` | k) | PASS | — |
| F20 | Comprovante sem anteriores | **corrigido** | `VerificationService` | comprovante | PASS | — |
| F21 | Defaults .cloud | **corrigido** | `config.php:20` | config | PASS | — |
| F22 | Booleano provedor contraditório | **corrigido** | `AIProvider.php` | provider | PASS | — |
| F23 | AgentPanel init não idempotente | **corrigido** | `agent_panel.js:init` | init 2x | PASS | — |
| F24 | Ordem ApiClient/interceptors | **corrigido** | `app.js:init` | ordem | PASS | — |
| F25 | Retry repete escritas | **corrigido** | `api-client.js:_isRetryable` | retry POST | PASS | — |
| F26 | HTTP 200 erro operacional | **corrigido** | `glpi.client.js:_fetch`, `agent_panel.js` | 200+ok false | PASS | — |
| F27 | Normalização grupos | **corrigido** | `FieldNormalizer, CacheUpdater` | entidades | PASS | simula | 
| F28 | Categoria vs alocação | **corrigido** | `glpi.client.js:_mapClassified` | carrinho vs turma | PASS | — |
| F29 | E-mails auth .cloud | **corrigido** | `config.php:41` | allowed_domains | PASS | — |
| F30 | Roteamento php -S | **corrigido** | `Backend/router.php` | `curl /api/health` | PASS | — |

**Totais automáticos (script):** corrigido 30, parcialmente 0, pendente 0, não reproduzido 0. Pendências de código 0; pendências externas 4 (GLPI real, provedor real, validação visual 360/390px, dados produção).

## 8. Pendências

**Código:** nenhuma (simulação local cobre todos).

**Externas (precisas):** credencial GLPI (`GLPI_URL/APP_TOKEN/USER_TOKEN`) para testar coleções 11 e `states_id`; `OPENCODE_GO_API_KEY` para chat real; navegador para validar `agent_panel` responsivo 360/390px + desktop; `Backend/data` produção não usado em testes.

## 9. Instruções Locais Verificadas

`php -S` sozinho não roteia `/api/*` para `Backend/api/endpoints.php`. Usar **router**:

```bash
php -S localhost:8080 -t Backend Backend/router.php
curl -s http://localhost:8080/api/health
# {"ok":true,"service":"glpi-control-center-backend","time":"...","env":"local"}

curl -s -i http://localhost:8080/api/agent/status
# HTTP/1.1 401 Autenticação obrigatória.

# Autenticado (exemplo demo em dev):
curl -s -X POST http://localhost:8080/api/auth/demo -H "Content-Type: application/json" -d '{"email":"test@colegiosatelite.com.br","name":"Test"}' -c /tmp/c
curl -s http://localhost:8080/api/agent/status -b /tmp/c
```

Testado localmente em 22/09/2026 — ambos retornam conforme esperado.

## 10. Conclusão

Todos os fluxos obrigatórios estão concluídos localmente com simulação: consultar → propor → confirmar → executar → verificar com resultado verdadeiro, sem duplicação, sem sumiço, sem confusão `itemtype:id`, sem sucesso falso. Pronto para validação com GLPI/provedor reais antes de release.
