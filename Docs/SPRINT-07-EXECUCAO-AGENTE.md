# Sprint 07 — Execução de Operações pelo Agente de IA

**Objetivo:** Permitir que o agente execute operações autorizadas, com confirmação, prevenção de duplicações e resultados rastreáveis.

**Status:** Concluído (testes simulados, sem GLPI real)

---

## 1. Conferência da Base Existente

### Validações
- **Persistência e isolamento:** Propostas persistidas em `data/proposals/` por arquivo JSON, isoladas por `created_by`
- **Identidade itemtype:id:** Cada proposta contém `itemtype`, `id` e `proposal_id` únicos
- **Validações e autorização:** `validateForExecution()` verifica expiração, date_mod, permissões e status
- **Idempotência:** Chave `agent:{proposal_id}` associada a cada operação via IdempotencyGuard
- **Rastreamento:** OperationTracker com UUID v4 e estados: prepared → executing → verifying → completed | partial | failed | refused
- **Cache:** CacheUpdater atualiza `classified_assets.json` após escrita confirmada
- **Adaptador IA:** AIProvider cURL com autenticação Bearer, modelo configurável

### Total de Testes Correto
| Suite | Total |
|-------|-------|
| Classifier | 69 |
| Sprint 2 | 129 |
| Sprint 3 | 127 |
| Sprint 4 | 96 |
| Sprint 6 | 69 |
| Sprint 7 | 45 |
| **Total** | **535** |

**Nota:** Sprint 6 documentou 491 mas o correto era 490 (69+129+127+96+69). Sprint 7 adiciona 45.

### Status do Provedor
- **Provedor:** OpenCode Go
- **API verificada:** Sim, por documentação e endpoints HTTP
- **Chamada real:** Não realizada — testes usam mocks/simulação
- **Status:** Configurado, funcional em testes simulados

---

## 2. Políticas de Execução

### Configuração
Arquivo: `Backend/config/agent_policies.php`

### Modos de Autonomia

| Modo | Descrição | Operações | Confirmação |
|------|-----------|-----------|-------------|
| `read_only` | Somente consulta | Nenhuma | N/A |
| `prepare_confirm` | Preparar e aguardar confirmação | create, update, delete, restore | Sim |
| `auto_execute` | Execução automática (ações permitidas) | update | Não |

**Padrão:** `prepare_confirm`

### Restrições por Itemtype
- **Computer:** read_only, prepare_confirm, auto_execute
- **Printer:** read_only, prepare_confirm, auto_execute
- **auto_execute:** Somente operação `update`
- **delete:** Nunca em auto_execute

### Restrições por Campo (auto_execute)
- **Permitidos:** comment, otherserial
- **Bloqueados:** name, serial, states_id, locations_id, groups_id, users_id

### Limites de Lote
- Máximo 10 itens por lote
- Máximo 1 item em execução automática
- Lista explícita de alvos antes da confirmação

### Campos Protegidos (nunca definidos pelo agente)
- `entities_id`
- `is_recursive`
- `is_deleted`

### Overrides por Usuário
```php
'user_overrides' => [
  'admin@example.com' => [
    'mode' => 'auto_execute',
    'allowed_auto_operations' => ['create', 'update', 'delete', 'restore'],
  ],
],
```

---

## 3. Proposta Executável

### Estrutura
```json
{
  "proposal_id": "prop_abc123...",
  "status": "pending|executing|executed|failed|cancelled|expired",
  "created_at": "2026-09-21T10:00:00+00:00",
  "expires_at": "2026-09-21T11:00:00+00:00",
  "created_by": "user@email.com",
  "action": "update",
  "itemtype": "Computer",
  "id": 1,
  "asset_name": "CS-001",
  "current_values": { "name": "CS-001" },
  "proposed_values": { "name": "CS-002" },
  "field_sources": { "name": "agent_proposed" },
  "permissions": { "can_write": true },
  "disclaimer": "PRÉVIA — nenhuma alteração executada."
}
```

### Transições de Estado
```
pending → executing → executed
pending → executing → failed
pending → cancelled
pending → expired
failed → pending (retry)
executing → cancelled (só itens não iniciados)
```

---

## 4. Fluxo de Confirmação

### Passo a Passo
1. IA chama `preparar_alteracao` → proposta criada (status: `pending`)
2. Frontend renderiza card de proposta com botões Confirmar/Cancelar
3. Usuário clica "Confirmar" → envia `POST /api/agent/execute`
4. Backend carrega proposta persistida
5. Revalida: owner, status, expiração, política, permissões, date_mod
6. Verifica idempotência (chave `agent:{proposal_id}`)
7. Executa via `AssetWriteService`
8. Atualiza status da proposta para `executed` ou `failed`
9. Retorna resultado com antes/depois

### Validações na Confirmação
- Usuário é o dono da proposta
- Proposta está pendente
- Proposta não expirou
- Política permite a operação
- Usuário tem permissão de escrita
- Ativo não foi modificado desde a leitura (date_mod)
- Não existe operação equivalente em andamento

---

## 5. Execução via AssetWriteService

### Integração
```
AgentExecution → AssetWriteService → GlpiClient → GLPI API
                                    ↓
                              OperationTracker
                                    ↓
                              DropdownValidator
                                    ↓
                              IdempotencyGuard
                                    ↓
                              CacheUpdater
```

### Operações Suportadas
| Operação | Via AssetWriteService | Método |
|----------|----------------------|--------|
| create | `$service->create()` | POST /{itemtype} |
| update | `$service->update()` | PUT /{itemtype}/{id} |
| delete | `$service->delete()` | PUT /{itemtype}/{id} (states_id=Inativo) |
| restore | `$service->restore()` | PUT /{itemtype}/{id} (states_id=Em uso) |

---

## 6. Execução em Lote

### Endpoint
`POST /api/agent/execute/batch`

### Payload
```json
{
  "proposal_ids": ["prop_abc...", "prop_def..."]
}
```

### Resposta
```json
{
  "batch_id": "batch_a1b2c3...",
  "total": 2,
  "success": 1,
  "failed": 1,
  "skipped": 0,
  "partial": true,
  "items": [
    { "proposal_id": "prop_abc...", "success": true, "status": "completed_verified" },
    { "proposal_id": "prop_def...", "success": false, "status": "failed", "error": "..." }
  ]
}
```

### Comportamento
- Cada item tem estado e resultado próprios
- Lote não é atômico: parte pode falhar
- Cancelamento impede itens não iniciados
- Máximo 10 itens por lote

---

## 7. Idempotência e Recuperação

### Chave de Idempotência
- Formato: `agent:{proposal_id}`
- Associada a cada proposta via IdempotencyGuard

### Proteções
- Clique duplo: retorna operação existente
- Repetição da ferramenta: retorna resultado existente
- Reconexão: proposta recuperada por ID
- Timeout: marca como failed, permite retry
- Reinício: estado da proposta preservado em disco

### Recuperação de Falha
- GLPI gravado + cache falhou: marca `partial`, cache pode ser atualizado depois
- GLPI falhou: marca `failed`, permite retry
- Resultado desconhecido: marca `failed` com aviso

---

## 8. Auditoria

### Dados Registrados
- Timestamp
- Proposal ID
- User ID (sessão)
- Action, itemtype, id
- Evento (executed, failed, rejected_*, expired, etc.)
- Contexto (operation_id, reason, etc.)

### Arquivo
`logs/agent_audit_YYYY-MM-DD.log` (JSON por linha)

### Eventos
- `executed` — Proposta executada com sucesso
- `execution_failed` — Falha na execução
- `rejected_owner_mismatch` — Tentativa de executar proposta de outro usuário
- `rejected_policy` — Política não permite a operação
- `rejected_no_permission` — Sem permissão de escrita
- `rejected_stale` — Ativo modificado desde a leitura
- `expired` — Proposta expirada
- `already_executed` — Proposta já executada
- `already_in_progress` — Proposta em execução

---

## 9. Interface do Agente

### Card de Proposta
- **Header:** Ação (Editar/Excluir/etc.) + nome do ativo
- **Body:** Lista de campos com valores atuais → propostos
- **Disclaimer:** Aviso de que é prévia
- **Ações:** Botões "Confirmar" e "Cancelar"

### Estados Visuais
- **Pendente:** Borda verde, botões ativos
- **Executando:** Botão "Executando..." desabilitado
- **Executado:** Borda verde, fundo verde claro, botões ocultos
- **Cancelado:** Borda cinza, opaco, botões ocultos

### Mobile (≤767px)
- Painel tela inteira
- Botões de toque mínimos 44px (WCAG 2.1)
- Conteúdo rolável

---

## 10. Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/agent/execute` | Executar proposta confirmada |
| POST | `/api/agent/execute/batch` | Executar lote de propostas |
| GET | `/api/agent/policies` | Consultar políticas de autonomia |
| GET | `/api/agent/proposals` | Listar propostas do usuário |
| POST | `/api/agent/proposal/cancel` | Cancelar proposta |

### GET /api/agent/proposals
Query params: `status`, `action`, `itemtype` (filtros opcionais)

---

## 11. Ferramentas do Agente (Sprint 07)

| Ferramenta | Descrição | Confirmação |
|------------|-----------|-------------|
| `preparar_alteracao` | Cria proposta SEM executar | N/A |
| `executar_proposta` | Executa proposta confirmada | Sim (usuário clica botão) |
| `cancelar_proposta` | Cancela proposta pendente | Não |
| `consultar_politicas` | Retorna políticas de autonomia | Não |

---

## 12. Segurança

- Comentários/nomes do GLPI são dados externos, nunca interpretados como instruções
- Chave da API nunca exposta ao navegador
- Dados GLPI nunca enviados ao modelo
- Políticas nunca concede permissões que o usuário não tem
- Modelo não pode alterar políticas, aprovar a própria proposta ou atribuir privilégios
- Propostas isoladas por usuário
- Campos protegidos nunca definidos pelo agente
- Execução requer confirmação explícita (botão)

---

## 13. Testes

### Total: 45 testes

### Cobertura
| Categoria | Testes |
|-----------|--------|
| Políticas | 6 |
| AgentExecution | 7 |
| AgentProposal (Sprint 07) | 5 |
| AgentTools (Sprint 07) | 9 |
| Execução (Validações) | 7 |
| Lote | 3 |
| Segurança | 5 |
| Origem dos Dados | 2 |

### Todos os Sprints: 535 testes
| Suite | Total |
|-------|-------|
| Classifier | 69 |
| Sprint 2 | 129 |
| Sprint 3 | 127 |
| Sprint 4 | 96 |
| Sprint 6 | 69 |
| Sprint 7 | 45 |
| **Total** | **535** |

---

## 14. Arquivos Criados/Modificados

### Criados
- `Backend/config/agent_policies.php` — Políticas de autonomia
- `Backend/api/services/AgentExecution.php` — Serviço de execução
- `Backend/tests/test_sprint7_execution.php` — 45 testes
- `Docs/SPRINT-07-EXECUCAO-AGENTE.md` — Esta documentação

### Modificados
- `Backend/api/services/AgentProposal.php` — updateStatus(), listByUser(), cancel() melhorado
- `Backend/api/services/AgentTools.php` — 3 novas ferramentas (executar_proposta, cancelar_proposta, consultar_politicas)
- `Backend/api/endpoints.php` — 4 novas rotas (/execute, /execute/batch, /policies, /proposals)
- `Frontend/javascript/agent_panel.js` — Cards de proposta com Confirmar/Cancelar
- `Frontend/css/agent-panel.css` — Estilos de cards de proposta

---

## 15. Preparação para Sprint 8

### Pendente
- [ ] Testes com GLPI real
- [ ] Teste visual do painel no navegador
- [ ] Validação de execução com AssetWriteService real
- [ ] Teste de concorrência real
- [ ] Audit trail completo pós-execução

### Configuração para Produção
1. Definir `OPENCODE_GO_API_KEY` no `.env`
2. Revisar `agent_policies.php` para o ambiente
3. Configurar overrides de usuário se necessário
4. Testar com modelo real antes de liberar

---

## Resposta Final

### 1. Arquivos Funcionais Alterados
- `agent_policies.php`, `AgentExecution.php`, `AgentProposal.php`, `AgentTools.php`
- `agent_panel.js`, `agent-panel.css`
- 4 novas rotas em `endpoints.php`

### 2. Operações Disponíveis por Tipo
- **Computer:** create, update, delete (lógico), restore
- **Printer:** create, update, delete (lógico), restore

### 3. Políticas Habilitadas por Padrão
- **Modo:** prepare_confirm (requer confirmação)
- **auto_execute:** Somente update em campos comment e otherserial
- **delete:** Nunca automático
- **Lote:** Máximo 10 itens

### 4. Fluxo Completo de Confirmação
1. IA prepara proposta → card aparece no painel
2. Usuário clica "Confirmar" → POST /api/agent/execute
3. Backend revalida tudo → executa via AssetWriteService
4. Retorna resultado com antes/depois
5. Card atualiza visualmente (executado/cancelado/erro)

### 5. Funcionamento dos Lotes e Recuperação
- Lote processa cada item independentemente
- Estado e resultado próprios por item
- Cancelamento impede itens não iniciados
- Falha parcial registrada com clareza
- Idempotência previne duplicações

### 6. Testes Executados
- 45 testes Sprint 7 passando
- 535 testes totais (todos os sprints)
- GLPI real: testes pulam graceful quando não configurado

### 7. Validações Reais e Visuais Pendentes
- Teste visual do painel no navegador
- Teste com chave real do OpenCode Go
- Teste com GLPI real
- Validação de execução real
- Teste de concorrência real

### 8. Preparação para Sprint 8
- Sprint 8 aprofundará verificação GLPI × cache × API × frontend
- Esta sprint já distingue execução confirmada de falha ou resultado desconhecido
- Pronto para integrar com reconciliação e comprovantes
