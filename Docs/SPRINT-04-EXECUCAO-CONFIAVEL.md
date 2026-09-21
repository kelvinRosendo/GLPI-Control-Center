# Sprint 4 — Concluir pendências do CRUD e garantir execução confiável

**Data:** 2026-09-21  
**Status:** Concluído  
**Testes:** 421 total (69 classifier + 129 Sprint 2 + 127 Sprint 3 + 96 Sprint 4), 0 falhas

---

## 1. Matriz de Implementação CRUD

### Operações implementadas por itemtype

| Operação | Computer | Printer | Projetor | Ticket |
|----------|----------|---------|----------|--------|
| Criar | ✅ POST `/api/assets/computers` | ✅ POST `/api/assets/printers` | — (via Computer) | ✅ existente |
| Atualizar | ✅ POST `/api/assets/computers/{id}` | ✅ POST `/api/assets/printers/{id}` | ✅ PUT `/api/projetors/{id}/lamp` | ✅ existente |
| Excluir | ✅ POST `.../delete` (logical) | ✅ POST `.../delete` (logical) | — | — |
| Restaurar | ✅ POST `.../restore` | ✅ POST `.../restore` | — | — |
| Listar | ✅ GET `/api/assets/computers` | ✅ GET `/api/assets/impressoras` | ✅ GET `/api/projetors` | ✅ GET `/api/tickets` |
| Detalhe | ✅ GET `.../computers/{id}` | ✅ GET `.../printers/{id}` | ✅ GET `/api/projetors/{id}` | — |

### Componentes por operação

| Operação | Serviço Backend | Endpoint | Componente Frontend | Teste |
|----------|----------------|----------|---------------------|-------|
| Criar Computer | AssetWriteService.create() | Endpoints::createAsset() | AssetDetailsUI._create() | test_sprint4_execution.php |
| Atualizar Computer | AssetWriteService.update() | Endpoints::updateAsset() | AssetDetailsUI._save() | test_sprint4_execution.php |
| Excluir Computer | AssetWriteService.delete() | Endpoints::deleteAsset() | AssetDetailsUI._delete() | test_sprint4_execution.php |
| Restaurar Computer | AssetWriteService.restore() | Endpoints::restoreAsset() | AssetDetailsUI._restore() | test_sprint4_execution.php |
| Criar Printer | AssetWriteService.create() | Endpoints::createAsset() | AssetDetailsUI._create() | test_sprint4_execution.php |
| Atualizar Printer | AssetWriteService.update() | Endpoints::updateAsset() | AssetDetailsUI._save() | test_sprint4_execution.php |
| Excluir Printer | AssetWriteService.delete() | Endpoints::deleteAsset() | AssetDetailsUI._delete() | test_sprint4_execution.php |
| Restaurar Printer | AssetWriteService.restore() | Endpoints::restoreAsset() | AssetDetailsUI._restore() | test_sprint4_execution.php |

### Limitações

| Item | Status | Motivo |
|------|--------|--------|
| Exclusão definitiva | ❌ Não implementado | GLPI REST não suporta DELETE. Exclusão lógica via states_id. |
| `entities_id` editável | ❌ Não implementado | Requer permissão de administração de entidades. |
| `computertypes_id` editável | ❌ Não implementado | Define classificação automática. |
| Projetor: campos GLPI editáveis | ❌ Não implementado | Campos GCC-exclusive em projectors.json. |
| Validação de dropdowns contra GLPI real | ⚠️ Parcial | DropdownValidator implementado, mas requer GLPI real para testes de integração. |
| Conta de integração | ⚠️ Não verificada | Permissões reais da conta de integração não testadas contra GLPI. |

---

## 2. Lacunas encontradas e concluídas

### Sprint 3 → Sprint 4

| Lacuna Sprint 3 | Implementação Sprint 4 |
|-----------------|----------------------|
| Validação de dropdowns antes de gravar | `DropdownValidator` — valida IDs contra coleções GLPI |
| Controle de concorrência | `AssetWriteService.checkConcurrency()` — date_mod + re-leitura |
| Identificador e estados da operação | `OperationTracker` — UUID v4, 7 estados, persistência |
| Prevenção de duplicações | `IdempotencyGuard` — chave de idempotência, verificação de equivalência |
| Auditoria | `OperationTracker.audit()` — log por dia com operation_id, user_id, campos |
| Atualização do cache pós-escrita | `CacheUpdater` — addAsset, updateAsset, removeAsset, restoreAsset |
| Resultado na interface | `asset_details_ui.js` — estados, idempotency_key, conflito, cache pendente |

---

## 3. Estados e Contratos das Operações

### Máquina de estados

```
prepared → executing → verifying → completed
                     ↘          ↘ partial
                      → failed    → failed
         → refused
failed → executing (retry)
partial → verifying (re-check)
```

### Estados possíveis

| Estado | Significado | Transições possíveis |
|--------|-------------|---------------------|
| `prepared` | Payload validado, pronto para enviar | → executing, → refused |
| `executing` | Enviado ao GLPI, aguardando resposta | → verifying, → failed |
| `verifying` | Releitura após gravação | → completed, → partial, → failed |
| `completed` | Gravação + releitura + cache confirmados | (terminal) |
| `partial` | Gravação OK mas releitura ou cache falhou | → verifying |
| `failed` | Gravação não executada | → executing (retry) |
| `refused` | Rejeitado por validação, concorrência ou idempotência | (terminal) |

### Resultado padronizado

```json
{
  "operation_id": "uuid-v4",
  "itemtype": "Computer",
  "id": 123,
  "action": "update",
  "requested_fields": {"name": "CS-002"},
  "user_id": "user@email.com",
  "state": "completed",
  "status": "completed_verified",
  "verified": true,
  "cache_status": "updated",
  "timestamp": "2026-09-21T...",
  "attempts": 1,
  "before": {...},
  "after": {...},
  "changes": [...]
}
```

### Status possíveis

| Status | Significado |
|--------|-------------|
| `completed_verified` | Gravação + releitura + cache confirmados |
| `completed_partial` | Gravação OK, mas releitura ou cache pendente |
| `completed_unverified` | Gravação executada, releitura não confirmou |
| `failed` | Operação não executada |

---

## 4. Estratégia de Concorrência

### Implementação

1. **Leitura antes da escrita (before)**: `readAsset()` captura estado atual incluindo `date_mod`
2. **Re-leitura antes do PUT**: `checkConcurrency()` compara `date_mod` antes/depois
3. **Re-leitura após o PUT**: Verifica se a gravação foi aplicada
4. **date_mod pós-gravação**: Detecta escritas concorrentes durante a operação

### Limitações documentadas

- **Janela de concorrência**: Entre a re-leitura de verificação e o PUT, outro usuário pode modificar o ativo. O GLPI REST API não suporta `If-Match` ou actual updates atômicos.
- **`date_mod` não é exclusão mútua**: Alterações feitas diretamente no GLPI (fora do GCC) podem ocorrer entre a leitura e a escrita.
- **Recomendação**: Para ativos críticos, verificar o `date_mod` na resposta e alertar o usuário.

### Fluxo de concorrência

```
1. Usuário A abre formulário → readAsset() → before = {date_mod: "10:00"}
2. Usuário B modifica o mesmo ativo → date_mod = "10:05"
3. Usuário A clica Salvar
4. checkConcurrency() → re-leitura → current.date_mod = "10:05" ≠ "10:00"
5. → refused: "O ativo foi modificado por outro usuário"
6. → exibe conflict com valores atuais e propostos
```

---

## 5. Idempotência

### Chave de idempotência

Formato: `{action}:{itemtype}:{id}:{hash dos campos ordenados}`

Exemplo: `update:Computer:123:a1b2c3d4`

### Comportamento

| Situação | Comportamento |
|----------|--------------|
| Chave inexistente | Cria nova operação |
| Chave existe + mesma operação concluída | Retorna operação existente (não re-executa) |
| Chave existe + operação em execução | Bloqueia (não cria duplicata) |
| Chave existe + operação preparada | Reutiliza operação |
| Chave existe + operação falhou | Permite retry |
| Chave existe + payload diferente | Rejeita (erro de idempotência) |

### Frontend

O frontend gera a chave automaticamente e envia no campo `idempotency_key` do body. Após timeout, não repete cegamente — exibe mensagem informando que a operação pode ter sido executada.

---

## 6. Coordenação com Sincronização

### Mecanismo

- `CacheUpdater` verifica se há sync em execução antes de escrever
- Se sync estiver rodando, aguarda até 10 segundos
- Se não conseguir aguardar, retorna `cache_partial: true`
- `AssetSync` usa lock de arquivo (`LOCK_EX | LOCK_NB`) para exclusão mútua

### Risco documentado

Uma sincronização iniciada antes da edição pode publicar um snapshot antigo por cima do valor recém-gravado. Para mitigar:
- `CacheUpdater` verifica o lock de sync
- Após escrita, o cache é atualizado atomicamente
- Sync incremental faz merge por ID, preservando dados locais

### Dados preservados

- `projectors.json` — dados exclusivos do GCC (horas_lampada, manutenções, etc.)
- `classified_assets.json` — metadados de classificação (category, categoryLabel, etc.)
- `sync_status.json` — estado da última sincronização

---

## 7. Auditoria

### Formato do log

```json
{
  "timestamp": "2026-09-21T14:30:00+00:00",
  "operation_id": "uuid-v4",
  "user_id": "user@email.com",
  "itemtype": "Computer",
  "id": 123,
  "action": "update",
  "event": "update_completed",
  "state": "completed",
  "context": {
    "glpi_success": true,
    "readback_verified": true,
    "cache_updated": true,
    "fields_changed": 2
  }
}
```

### Eventos registrados

| Evento | Significado |
|--------|-------------|
| `operation_registered` | Operação criada e persistida |
| `operation_executing` | Enviada ao GLPI |
| `operation_timeout` | Timeout na execução |
| `dropdown_validation_failed` | Dropdown inválido bloqueou operação |
| `concurrency_conflict` | Conflito de concorrência detectado |
| `create_completed` | Criação concluída |
| `update_completed` | Atualização concluída |
| `delete_completed` | Exclusão lógica concluída |
| `restore_completed` | Restauração concluída |
| `*_exception` | Exceção durante operação |
| `asset_not_found` | Ativo não encontrado no GLPI |
| `no_editable_fields` | Nenhum campo editável no payload |
| `state_resolution_failed` | Não conseguiu resolver ID do estado |

### Restrições

- Logs ficam em `Backend/logs/ops/` (operações) e `Backend/logs/audit_*.log` (auditoria)
- Não registra tokens, senhas ou cabeçalhos de autenticação
- Acesso restrito ao diretório de logs
- Retenção: logs diários com data no nome

---

## 8. Procedimentos de Recuperação

### Falha de gravação GLPI

1. Operação marcada como `failed`
2. Retry disponível (failed → executing)
3. Usuário pode tentar novamente
4. Auditoria registra a falha

### Falha de releitura

1. Operação marcada como `partial`
2. Dados podem estar inconsistentes
3. Usuário é alertado para verificar manualmente
4. Re-check disponível (partial → verifying)

### Falha de cache

1. GLPI atualizado com sucesso
2. Cache não atualizado → `cache_status: "pending"`
3. Mensagem ao usuário: "GLPI foi atualizado. Atualização do GCC está pendente."
4. Próxima sincronização irá corrigir o cache
5. `CacheUpdater` permite retry separado (só cache, sem repetir GLPI)

### Timeout

1. Frontend detecta timeout via AbortController
2. Mensagem: "Timeout. Operação pode ter sido executada."
3. `IdempotencyGuard.recoverFromTimeout()` marca como `failed` após timeout configurável
4. Não repete automaticamente — investiga se operação aconteceu

---

## 9. Testes

### Suite completa: 421 testes, 0 falhas

| Arquivo | Testes | Foco |
|---------|--------|------|
| `test_classifier.php` | 69 | Classificação de ativos |
| `test_sprint2_services.php` | 129 | Capabilities, Options, Reconcile, AssetService |
| `test_sprint3_crud.php` | 127 | CRUD: allow-lists, operações, mappers, contrato |
| `test_sprint4_execution.php` | 96 | Confiabilidade: tracker, validação, idempotência, cache, estados |

### Cenários testados (Sprint 4)

- OperationTracker: UUID v4, 7 estados, transições válidas/inválidas, persistência, auditoria
- DropdownValidator: mapeamento campo→coleção, campos não-dropdown
- IdempotencyGuard: geração de chave, verificação de equivalência, bloqueio de duplicatas
- CacheUpdater: updateAsset, addAsset, removeAsset, restoreAsset
- Máquina de estados: caminho feliz, falha, parcial, recusado, retry
- Preservação de dados de projetores
- Computer e Printer com mesmo ID
- Timeout e recuperação
- Regressão: allow-lists, capabilities, mappers

### Testes não executados (requerem GLPI real)

| Teste | Motivo |
|-------|--------|
| Validação de dropdown contra coleção real | Requer sessão GLPI |
| Escrita e releitura reais | Requer conta de integração |
| Concorrência real entre usuários | Requer múltiplas sessões |
| Verificação de permissões da conta de integração | Requer acesso ao GLPI |
| Cache pós-escrita com sync concorrente | Requer ambiente integrado |

---

## 10. Pendências externas de permissões

| Pendência | Impacto | Próximo passo |
|-----------|---------|---------------|
| Verificar perfil da conta de integração no GLPI | Pode faltar permissão de escrita em coleções auxiliares | Consultar GLPI como admin e documentar perfil |
| Verificar escopo de entidades da conta | Pode não ter acesso a todas as entidades | Testar com `GET /Entity` e documentar |
| Validar coleções auxiliares com GLPI real | 11 coleções não testadas contra API real | Executar testes manuais com credenciais |
| Testar escrita real (create/update/delete) | Operações não testadas contra GLPI | Criar ativo de teste e documentar resultado |

---

## 11. Pendências para Sprint 5

1. **Responsividade** — Adaptar layouts para mobile/tablet
2. **Testes de integração** — Executar suite completa contra GLPI real
3. **Cache pós-escrita** — Melhorar coordenação com sync incremental
4. **Concorrência avançada** — Implementar `If-Match` quando GLPI suportar
5. **Relatório de operações** — Dashboard de auditoria no frontend
6. **Retry automático** — Backoff exponencial para timeouts
7. **Notificação de falha** — Email/alerta quando operação fica em estado `partial`

---

## 12. Resposta Final

### 1. Arquivos funcionais alterados (além de testes e documentos)

| Arquivo | Ação | Responsabilidade |
|---------|------|------------------|
| `Backend/api/services/AssetWriteService.php` | Atualizado | CRUD com concorrência, validação, auditoria, cache |
| `Backend/api/services/OperationTracker.php` | Novo | IDs persistentes, estados, auditoria |
| `Backend/api/services/DropdownValidator.php` | Novo | Validação de IDs de dropdowns |
| `Backend/api/services/IdempotencyGuard.php` | Novo | Prevenção de duplicações |
| `Backend/api/services/CacheUpdater.php` | Novo | Atualização do cache pós-escrita |
| `Backend/api/endpoints.php` | Atualizado | Passa user_id e idempotency_key |
| `Backend/api/auth.php` | Atualizado | Método currentUserId() |
| `Frontend/javascript/asset_details_ui.js` | Atualizado | Idempotência, conflito, estados, cache |

### 2. Operações disponíveis por itemtype

| Tipo | Criar | Atualizar | Excluir | Restaurar |
|------|-------|-----------|---------|-----------|
| **Computer** | ✅ | ✅ | ✅ (lógico) | ✅ |
| **Printer** | ✅ | ✅ | ✅ (lógico) | ✅ |
| **Projetor** | — | ✅ (lamp) | — | — |
| **Ticket** | ✅ (legado) | ✅ (legado) | — | — |

### 3. Pendências da Sprint 3 resolvidas

| Pendência | Status |
|-----------|--------|
| Validação de dropdowns antes de gravar | ✅ DropdownValidator implementado |
| Controle de concorrência | ✅ date_mod + re-leitura implementados |
| Identificador e estados da operação | ✅ OperationTracker com UUID v4 |
| Auditoria das operações | ✅ Audit trail por dia |
| Atualização do cache pós-escrita | ✅ CacheUpdater com atomicSave |
| Prevenção de duplicações | ✅ IdempotencyGuard com chaves |
| Resultado na interface | ✅ Estados, conflito, cache pendente |

### 4. Evidências de prevenção de duplicações e recuperação

- **IdempotencyGuard**: test_sprint4_execution.php — 9 testes de chave, bloqueio, retry
- **OperationTracker**: test_sprint4_execution.php — 24 testes de estados e persistência
- **Timeout**: test_sprint4_execution.php — teste de recuperação pós-timeout
- **CacheUpdater**: test_sprint4_execution.php — 8 testes de update, add, remove, restore

### 5. Testes executados e o que não pôde ser validado

| Categoria | Executados | Não validados |
|-----------|-----------|---------------|
| Unitários (sem GLPI) | 421 | — |
| Integração (com GLPI) | 0 | DropdownValidator, escrita real, permissões |
| Concorrência real | 0 | Múltiplos usuários simultâneos |
| Browser | 0 | Formulários, modais, feedback |

### 6. Pendências externas de permissões

- Perfil da conta de integração não verificado
- Escopo de entidades não testado
- 11 coleções auxiliares não validadas contra GLPI real
- Escritas reais não executadas

### 7. Preparação para Sprint 5 de responsividade

- `asset_details_ui.js` já usa CSS classes responsivas
- Layouts existentes precisam de media queries para mobile
- Modais já são scrolláveis
- Formulários precisam de labels visíveis em telas pequenas
