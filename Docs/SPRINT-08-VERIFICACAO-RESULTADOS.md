# Sprint 08 — Verificação das Operações e Reconciliação GLPI × GCC

Status: Concluído (testes simulados, GLPI real não testado) — 554 testes passando

## 1. Arquitetura da Verificação

```
Proposta (pending) → AgentExecution.executeProposal() → AssetWriteService (GLPI write)
        ↓
OperationTracker (prepared→executing→verifying→completed/partial/failed)
        ↓
VerificationService.verify() — 5 camadas independentes:
  execution (tracker state) | glpi (releitura) | cache (classified_assets.json) | api (representação) | frontend (confirm)
        ↓
FieldNormalizer (reuso reconciliação) + divergências + limitações
        ↓
Comprovante (/api/operations/{id}/receipt) + histórico (history.*.json) + BatchStore
```

**Princípios**
- Resposta da escrita GLPI é evidência distinta da releitura posterior.
- Nenhuma credencial ou resposta completa é persistida (apenas summary).
- Recuperação de cache reusa `CacheUpdater` com lock/version, sem reescrever GLPI.

Arquivos novos:
- `Backend/api/services/FieldNormalizer.php`
- `Backend/api/services/VerificationService.php`
- `Backend/api/services/BatchStore.php`

Alterados:
- `Backend/api/services/OperationTracker.php` (+ updateVerificationMeta)
- `Backend/api/services/AgentExecution.php` (integração verificação + lote persistido)
- `Backend/api/endpoints.php` (+9 rotas Sprint 08, autorização)
- `Frontend/javascript/agent_panel.js` (receipts, reverify, frontend-confirm, localStorage version)

## 2. Contratos e Endpoints

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| GET | `/api/operations/{id}/receipt` | Comprovante individual (campos, camadas, divergências, link) | usuário dono |
| POST | `/api/operations/{id}/verify` | Repetir verificação sem repetir escrita (retry limitado, timeout 5s, 3 tentativas) | dono |
| POST | `/api/operations/{id}/recover-cache` | Recupera cache se GLPI confirmado e cache desatualizado (respeita lock) | dono |
| POST | `/api/operations/{id}/frontend-confirm` | Confirmação do frontend vinculada a operationId + user + api_version | dono |
| GET | `/api/operations/{id}/history` | Histórico append de verificações (nunca apaga evidências) | dono |
| GET | `/api/batches/{batchId}` | Lote persistido com itens, estados e totais | dono |
| GET | `/api/batches` | Lista lotes do usuário | dono |
| GET | `/api/agent/policies` | Políticas (existente, precedência verificada) | — |
| POST | `/api/agent/execute` | Agora retorna `verification` embutido | — |
| POST | `/api/agent/execute/batch` | Agora persiste lote em `data/batches/` | — |

Autorização: `authorizeRequest` exige `computadores:view` para `/api/operations/*` e `/api/batches/*`; verificação de `user_id` por ID evita leitura cross-user mesmo conhecendo UUID. Retenção usa logs diários (`logs/ops/`, `data/verifications/*.history.*`).

Exemplo receipt:
```json
{
  "operation_id":"uuid",
  "asset":"Computer:456",
  "action":"update",
  "overall":"verified",
  "layers":{"execution":{"state":"confirmed"},"glpi":{"state":"confirmed"},"cache":{"state":"confirmed"},"api":{"state":"confirmed"},"frontend":{"state":"pending"}},
  "divergences":[],
  "human_result":"operação concluída e verificada",
  "link":"/api/operations/uuid/receipt"
}
```

## 3. Estados por Camada (independentes)

| Camada | Estados | Significado |
|--------|---------|-------------|
| execution | confirmed/partial/failed/pending | tracker state mapeado |
| glpi | confirmed/divergent/unknown/not_applicable | releitura vs esperado (timeout→unknown, nunca repete escrita) |
| cache | confirmed/pending/outdated/unknown | compara `raw` vs GLPI observado + date_mod; `pending` se inexistente |
| api | confirmed/pending/outdated | espelha cache (API serve cache classificado) |
| frontend | confirmed/pending | `data/verifications/{id}.frontend.json` ou aguardando (aba fechada) |

Overall: `verified` (todas confirmadas), `verified_glpi` (GLPI confirmado, cache pendente é parcial mas não falha), `partial_cache_pending`, `divergent`, `unknown`, `verified_local` (GCC-only), `failed`.

Exemplo do spec:
```
execução: concluída
GLPI: confirmado
cache: pendente
API: desatualizada
frontend: não confirmado
=> overall partial_cache_pending — não vira falha, recuperação disponível
```

## 4. Critérios de Comparação (FieldNormalizer)

Reutiliza normalização de `ReconcileService`, com distinções:

- **Dropdown**: compara ID numérico (`{id:5}` vs `5` → igual), rótulo isolado → `unverifiable`.
- **Vazio/null/zero**: dropdown null→0, comentário null→'', otherserial null→'' (semântica por campo).
- **Entidades HTML**: `&amp;` → `&` antes de comparar, mas valor original preservado em `divergences[].expected/observed`.
- **Datas**: normaliza para UTC ISO (`Y-m-d\TH:i:s\Z`) quando parseável; fuso tratado.
- **Zeros à esquerda**: `serial`/`otherserial` preservados como string (`00123` ≠ `123`).
- **Derivados**: `stateSummary`, `category`, `location` etc nunca comparados como campo oficial.
- **Diferenças reais**: exibidas com `normalized_expected/observed` sem esconder original; `unverifiable` marcado explicitamente.

## 5. Recuperação

- `POST /verify` repete apenas releitura/comparação (mesmo `operation_id`, novos `verified_at`, append em `history`).
- Se GLPI confirmado e GCC desatualizado: `POST /recover-cache` usa `CacheUpdater` (aguarda lock até 10s, `LOCK_EX`, `atomicSave`, preserva `projectors.json`), verifica `date_mod` para não sobrescrever dados mais novos.
- Se houver mudança concorrente posterior legítima: registra `concurrent_modification_after_write` em `limitations`, não restaura valor anterior, informa que registro mudou.
- Nunca remove ativo ou sobrescreve dados por comparação parcial não encontrar registro (`only_gcc` tratado como pendente, não delete).

## 6. Comprovantes

**Individual**: painel do agente (`agent_panel.js` `_renderReceipt`) + `GET /receipt` + histórico. Campos: ativo `itemtype:id`, ação, antes/depois (via `requested_fields`), resultado por camada, horários (`verified_at`, `checked_at`), divergências, `cache_version`, link detalhes, botão "verificar novamente". Respostas do agente consomem `operation.verification.overall` estruturado — parcial/unknown nunca vira sucesso.

Exemplo sucesso:
```
Operação OP-123 — Computer:456 — atualizar patrimônio
GLPI: valor confirmado após nova consulta
Cache GCC: atualizado
API GCC: correspondente
Frontend: versão aplicada
Resultado: operação concluída e verificada.
```

Parcial:
```
GLPI confirmado, cache pendente (lock), API desatualizada, frontend não confirmado
Ação: verificar novamente / recuperar cache quando voltar
```

Unknown:
```
GLPI: desconhecido (timeout após 3 tentativas, não repetir escrita)
Resultado: resultado desconhecido — tente verificar novamente
```

**Lote**: `BatchStore` persiste `batch_id`, `proposal_ids`, `items[]` (alvo, ação, execution state, verification, divergências), `totals` = `{total, verified, pending_verification, partial, failed, cancelled, unknown}`, `status` (`completed` só se todos verified, caso contrário `partial`/`failed`). Não apresenta "lote concluído com sucesso" com falhas ocultas. Itens consultáveis individualmente via `GET /batches/{id}`.

## 7. Políticas e Execução (item 1 do spec)

- `default_mode = prepare_confirm` com `require_confirmation=true`; `delete` nunca em `auto_execute` (apenas `update` permitido em `auto_execute` e só para `comment`/`otherserial`).
- Precedência: `default_mode` → `user_overrides[userId].mode` (ativação explícita). Sem override, permanece `prepare_confirm`. Validado em `test_sprint8_verification.php:prepare_confirm prevalece`.
- Lote: `max_items_per_batch=10`, `max_auto_items_per_batch=1`, `require_item_list_before_confirm=true`. Persistido em `data/batches/*.json` sobrevive ao fechamento da aba; consulta de resultados via `GET /batches/*`; distingue `verified/pending/failed` por item.

## 8. Testes

**Sprint 08: 19 testes, 0 falhas** (`test_sprint8_verification.php`)

Cobertura: gravação+releitura, escrita positiva mas valor não aplicado, GLPI correto/cache antigo, frontend sem confirmação, exclusão 404 ambíguo, exclusão lógica not_applicable vs comprovada, transformação legítima (trim), serial zeros à esquerda, alteração concorrente, falha verificação sem repetição, reexecução (history append), lote misto + totais, lote sem sucesso oculto, operação local GLPI não aplicável, acesso indevido (isolamento), prepare_confirm.

**Total geral: 554 testes, 0 falhas**
Classifier 69 + Sprint2 129 + Sprint3 127 + Sprint4 96 + Sprint6 69 + Sprint7 45 + Sprint8 19 = 554

Executados: `php Backend/tests/test_*.php` (simulados, sem GLPI real). Escrita real, GLPI real, navegador: pendentes (ver abaixo).

## 9. Validações Reais e Visuais Pendentes

- Chamada real ao provedor OpenCode Go (tool calling com modelo).
- Escrita real contra GLPI (create/update/delete/restore + releitura).
- Validação de dropdowns contra coleções GLPI reais.
- Concorrência real multi-usuário e `date_mod` drift.
- Teste visual do painel no navegador (receipts, batch, version aplicada).
- Sincronização real com cache (`CacheUpdater` vs `AssetSync` lock).

Não apresentar mocks como validação real — documentado como pendente.

## 10. Requisitos para Sprint 9 (produção)

- Configurar `GLPI_URL`, `GLPI_APP_TOKEN`, `GLPI_USER_TOKEN` em `.env` e testar conta de integração.
- Definir `OPENCODE_GO_API_KEY`/`MODEL`, testar `agent_panel` em desktop/mobile.
- Executar `test_sprint8` contra GLPI de homologação com registros autorizados (não editar ativos reais arbitrariamente).
- Habilitar retenção/proteção de dados (`logs/ops`, `data/verifications`) e rotacionamento.
- Deploy VPS somente após validações reais; manter `docs/PENDENCIAS-INTEGRACAO.md` atualizado.
