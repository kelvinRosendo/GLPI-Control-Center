# Sprint 3 — CRUD de Ativos e Integração com a Interface

**Data:** 2026-09-21  
**Status:** Concluído  
**Testes:** 325 total (69 classifier + 129 Sprint 2 + 127 Sprint 3), 0 falhas

---

## 1. Arquitetura dos Serviços

```
Frontend (asset_details_ui.js)
  → GlpiClient (createAsset, updateAsset, deleteAsset, restoreAsset)
    → Backend (endpoints.php)
      → AssetWriteService (create, update, delete, restore)
        → GlpiClient (GLPI API)
      → AssetService (read)
      → CapabilitiesService (contrato v0.3.0)
      → OptionsService (coleções auxiliares)
```

### Novos serviços

| Serviço | Arquivo | Responsabilidade |
|---------|---------|------------------|
| `AssetWriteService` | `services/AssetWriteService.php` | CRUD completo: create, update, delete (logical), restore |
| `AssetService` (expandido) | `services/AssetService.php` | Consulta centralizada (read-only) |
| `CapabilitiesService` (v0.3.0) | `services/CapabilitiesService.php` | Contrato com writeOperations, campos editáveis incluindo dropdowns |
| `OptionsService` (atualizado) | `services/OptionsService.php` | Coleções auxiliares (agora com permissão `computadores/view`) |

---

## 2. Endpoints e Contratos

### Novos endpoints

| Método | Rota | Descrição | Permissão |
|--------|------|-----------|-----------|
| `POST` | `/api/assets/computers` | Criar Computer | `computadores/edit` |
| `POST` | `/api/assets/computers/{id}` | Atualizar Computer | `computadores/edit` |
| `POST` | `/api/assets/computers/{id}/delete` | Excluir logicamente | `computadores/edit` |
| `POST` | `/api/assets/computers/{id}/restore` | Restaurar | `computadores/edit` |
| `POST` | `/api/assets/printers` | Criar Printer | `impressoras/edit` |
| `POST` | `/api/assets/printers/{id}` | Atualizar Printer | `impressoras/edit` |
| `POST` | `/api/assets/printers/{id}/delete` | Excluir logicamente | `impressoras/edit` |
| `POST` | `/api/assets/printers/{id}/restore` | Restaurar | `impressoras/edit` |

### Contrato de capacidades v0.3.0

```json
{
  "version": "0.3.0",
  "writeOperations": {
    "Computer": {
      "create": { "required": ["name"], "optional": [...] },
      "update": { "editable": ["name", "serial", ..., "locations_id", "groups_id", ...] },
      "delete": { "requiresStateCollection": true },
      "restore": { "requiresStateCollection": true }
    },
    "Printer": { ... }
  },
  "editableFields": {
    "Computer": {
      "strings": { "name": "Nome", ... },
      "dropdowns": { "locations_id": "Localização", ... }
    }
  }
}
```

---

## 3. Operações Implementadas por Tipo

| Tipo | Criar | Atualizar | Excluir | Restaurar |
|------|-------|-----------|---------|-----------|
| **Computer** | ✅ POST `/api/assets/computers` | ✅ POST `/api/assets/computers/{id}` | ✅ POST `.../delete` | ✅ POST `.../restore` |
| **Printer** | ✅ POST `/api/assets/printers` | ✅ POST `/api/assets/printers/{id}` | ✅ POST `.../delete` | ✅ POST `.../restore` |
| **Projetor** | — (via Computer) | ✅ existente (lamp/maintenance) | — | — |
| **Ticket** | ✅ existente | ✅ existente | — | — |

---

## 4. Campos Editáveis

### Computer — Strings

| Campo | Label | Tipo |
|-------|-------|------|
| `name` | Nome do ativo | text |
| `serial` | Serial | text |
| `otherserial` | Patrimônio | text |
| `contact` | Contato | text |
| `contact_num` | Telefone / ramal | text |
| `comment` | Observações | textarea |

### Computer — Dropdowns (enviam ID)

| Campo | Label | Coleção |
|-------|-------|---------|
| `locations_id` | Localização | `/api/options/Location` |
| `groups_id` | Grupo | `/api/options/Group` |
| `users_id` | Usuário | `/api/options/User` |
| `states_id` | Estado | `/api/options/State` |

### Printer — Strings

| Campo | Label | Tipo |
|-------|-------|------|
| `name` | Nome da impressora | text |
| `serial` | Serial | text |
| `otherserial` | Patrimônio | text |
| `contact` | Contato | text |
| `contact_num` | Telefone / ramal | text |
| `comment` | Observações | textarea |

### Printer — Dropdowns (enviam ID)

| Campo | Label | Coleção |
|-------|-------|---------|
| `locations_id` | Localização | `/api/options/Location` |
| `users_id` | Usuário | `/api/options/User` |
| `states_id` | Estado | `/api/options/State` |
| `printermodels_id` | Modelo | `/api/options/PrinterModel` |
| `manufacturers_id` | Fabricante | `/api/options/Manufacturer` |

---

## 5. Permissões

### Alterações de autorização

| Recurso | Antes | Depois | Motivo |
|---------|-------|--------|--------|
| `/api/options/*` | `settings/view` | `computadores/view` | Usuários que editam ativos precisam consultar dropdowns |
| `/api/capabilities` | `settings/view` | `settings/view` | Mantido — somente leitura |
| Criar ativo | — | `computadores/edit` ou `impressoras/edit` | Requer permissão de edição |
| Atualizar ativo | `computadores/edit` | `computadores/edit` ou `impressoras/edit` | Printer agora editável |
| Excluir/Restaurar | — | `computadores/edit` ou `impressoras/edit` | Opera via states_id |

### Regra fundamental

- Cada gravação valida novamente a autorização no backend
- O backend não confia nas permissões enviadas pelo frontend
- Quando a conta de integração tem acesso mais amplo que o usuário, as restrições do usuário GCC são aplicadas via `PermissionMiddleware`

---

## 6. Tratamento de Cache e Falhas

### Resultado padronizado de operações

```json
{
  "operation_id": "op_67890...",
  "itemtype": "Computer",
  "id": 123,
  "action": "update",
  "requested_fields": {"name": "CS-002"},
  "status": "completed_verified",
  "verified": true,
  "before": {...},
  "after": {...},
  "changes": [{"field": "name", "previous": "CS-001", "current": "CS-002"}],
  "timestamp": "2026-09-21T..."
}
```

### Status possíveis

| Status | Significado |
|--------|-------------|
| `completed_verified` | Gravação confirmada e releitura verificou |
| `completed_unverified` | Gravação executada mas releitura não confirmou |
| `failed` | Operação não executada |

### Tratamento de exclusão lógica

- Exclusão lógica = definir `states_id` para "Inativo"
- Restaurar = definir `states_id` para "Em uso"
- Requer resolução de ID do estado via coleção `State`
- Se coleção `State` inacessível, retorna erro explícito (não usa fixtures)

---

## 7. Interface Compartilhada

### `asset_details_ui.js`

Componente JavaScript que fornece:

- **`openDetail(itemtype, glpiId, onSave)`** — Abre modal de detalhes/edição
- **`openCreate(itemtype, onSave)`** — Abre modal de criação
- **`close()`** — Fecha o modal

Funcionalidades:
- Renderiza seções e campos conforme contrato de capacidades
- Gera controles de edição para strings e dropdowns
- Valida campos obrigatórios na criação
- Bloqueia botão durante envio
- Erro não fecha o formulário
- Cancelar com alterações não salvas pede confirmação
- Após sucesso, chama callback `onSave` para atualizar listas

### Uso em páginas

```javascript
// Editar ativo existente
AssetDetailsUI.openDetail('Computer', 123, (result) => {
  // Atualizar listas/cards
});

// Criar novo ativo
AssetDetailsUI.openCreate('Computer', (result) => {
  // Atualizar listas
});
```

---

## 8. Unificação dos Endpoints Legados

### Migração realizada

| Endpoint legado | Antes | Depois |
|-----------------|-------|--------|
| `POST /api/assets/computers/{id}` | `Endpoints::updateComputer()` | `Endpoints::updateAsset('Computer', id)` |
| `GET /api/assets/printers/{id}` | `Endpoints::printerDetails()` | Mantido (read) |
| `POST /api/assets/printers/{id}` | Não existia | `Endpoints::updateAsset('Printer', id)` |
| `GET /api/assets/computers` | `Endpoints::computers()` | Mantido (read) |
| `POST /api/assets/computers` | Não existia | `Endpoints::createAsset('Computer')` |
| `POST /api/assets/printers` | Não existia | `Endpoints::createAsset('Printer')` |

### Método removido

- `Endpoints::updateComputer()` — substituído por `Endpoints::updateAsset()`

---

## 9. Testes

### Suite completa: 325 testes, 0 falhas

| Arquivo | Testes | Foco |
|---------|--------|------|
| `test_classifier.php` | 69 | Classificação de ativos (inalterado) |
| `test_sprint2_services.php` | 129 | Capabilities, Options, Reconcile, AssetService (atualizado para v0.3.0) |
| `test_sprint3_crud.php` | 127 | CRUD: allow-lists, operações, mappers, contrato, permissões |

### Cenários testados (Sprint 3)

- Allow-lists de campos para Computer e Printer
- Operações suportadas por itemtype
- Contrato v0.3.0 com writeOperations
- Editable values para Computer (strings + dropdowns)
- Editable values para Printer (strings + dropdowns)
- Dropdowns zerados quando ausentes
- Filtro de campos editáveis (remove id, itemtype, entities_id)
- Preservação de dados brutos no Classifier
- Endpoints de escrita no contrato
- Permissões de options endpoint

---

## 10. Campos e Operações Indisponíveis

| Item | Status | Motivo |
|------|--------|--------|
| Exclusão definitiva | ❌ Não implementado | Sprint 3 usa exclusão lógica (states_id). Exclusão real requer DELETE API que pode não estar disponível. |
| `entities_id` editável | ❌ Não implementado | Requer permissão de administração de entidades. Mantido como somente leitura. |
| `computertypes_id` editável | ❌ Não implementado | Tipo define classificação automática. Alteração manual poderia quebrar regras. |
| `computermodels_id` editável | ❌ Não implementado | Modelo é referência técnica. Incluído apenas para Printer. |
| `operatingsystems_id` editável | ❌ Não implementado | Dados de inventário automático (GLPI Agent). |
| Projetor: campos GLPI editáveis | ❌ Não implementado | Projetores usam campos GCC-exclusive (projectors.json). Campos GLPI são somente leitura. |

---

## 11. Pendências para Sprint 4

1. **Verificar permissões reais da conta de integração** — testar 11 coleções auxiliares com GLPI real
2. **Concorrência de edição** — detectar `date_mod` antes e depois da edição para sobrescrever silenciosamente
3. **Auditoria de operações** — logar cada escrita com antes/depois
4. **Integração com AI** — conectar OpenCode Go para consultas e operações
5. **Deploy VPS** — publicar ambiente de teste
6. **Validação de dropdowns** — verificar se IDs enviados existem no GLPI antes de gravar
7. **Cache pós-escrita** — atualizar `classified_assets.json` após cada operação de escrita
