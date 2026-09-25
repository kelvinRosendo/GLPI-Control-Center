# Sprint 2 — Consultas Unificadas e Reconciliação

**Data:** 2026-09-21  
**Status:** Concluído

## Objetivos

- Serviço de consultas centralizado (read-only) para Computer e Printer
- Contrato de capacidades (capabilities contract) para o frontend
- Endpoint de coleções auxiliares (dropdowns, referências)
- Serviço de reconciliação entre GLPI (fonte oficial) e cache GCC
- UI de reconciliação para administradores

## Arquivos Criados/Modificados

### Backend — Serviços (`Backend/api/services/`)

| Arquivo | Descrição |
|---------|-----------|
| `AssetService.php` | Consulta centralizada de ativos. Métodos: `all()`, `byCategory()`, `printers()`, `get()`, `fromCache()` |
| `OptionsService.php` | Coleções auxiliares com allow-list (11 coleções). Fixtures para testes sem GLPI |
| `CapabilitiesService.php` | Gera contrato v0.2.0 com categorias, campos editáveis, endpoints, permissões |
| `ReconcileService.php` | Compara GLPI vs cache GCC por `itemtype:id`. Classifica em: synced, divergent, only_glpi, only_gcc |

### Backend — Endpoints

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `GET /api/capabilities` | GET | Contrato de capacidades do backend |
| `GET /api/options/{collection}` | GET | Itens de coleção auxiliar. `?simulated=1` para fixtures |
| `GET /api/reconcile/compare` | GET | Comparação GLPI × GCC. `?category=filtro` opcional |

### Frontend

| Arquivo | Descrição |
|---------|-----------|
| `javascript/reconcile_ui.js` | UI de reconciliação com filtros, resumo e tabela de divergências |
| `index.html` | Script tag adicionada para `reconcile_ui.js` |

### Rotas em `endpoints.php`

- `/api/capabilities` → `CapabilitiesService::getContract()` (via match block)
- `/api/options/{collection}` → `OptionsService::fetch()` (via default handler com regex)
- `/api/reconcile/compare` → `ReconcileService::compare()` (via default handler)
- Regras de autorização adicionadas: `capabilities` → settings/view, `options` → settings/view, `reconcile` → auditoria/view

### Testes

| Arquivo | Testes |
|---------|--------|
| `tests/test_sprint2_services.php` | 127 testes (Capabilities, Options, Reconcile, AssetService::fromCache, contrato completo) |
| `tests/test_classifier.php` | 69 testes (inalterados, todos passando) |

**Total: 196 testes, 0 falhas**

## Contrato de Capacidades (v0.2.0)

```json
{
  "version": "0.2.0",
  "catalog": { "version": "1.0.0", "categories": {...} },
  "assetTypes": {
    "Computer": { "queryable": true, "categories": {...} },
    "Printer": { "queryable": true, "categories": {...} }
  },
  "editableFields": {
    "Computer": { "fields": ["name", "serial", ...] }
  },
  "auxiliaryCollections": [
    { "name": "Group", "endpoint": "/api/options/Group" },
    ...
  ],
  "endpoints": { "assets": {...}, "auxiliary": {...}, "reconcile": {...} },
  "permissions": { "modules": {...}, "profiles": ["ADMIN", "SUPORTE"] },
  "stateMapping": { "em uso": "em_uso", ... }
}
```

## Coleções Auxiliares Permitidas

Group, State, Location, Manufacturer, ComputerModel, ComputerType, User, Entity, PrinterModel, PrinterType, ItilCategory

## Reconciliação

Compara ativos por chave `itemtype:id` e identifica:
- **synced**: idênticos no GLPI e GCC
- **divergent**: existem em ambos mas com campos diferentes (name, serial, otherserial, comment, stateSummary)
- **only_glpi**: existe no GLPI mas não no cache GCC
- **only_gcc**: existe no cache GCC mas não no GLPI

## Notas

- `OptionsService` retorna 403 explícito se GLPI bloquear a coleção (diferente de lista vazia)
- `ReconcileService` usa o cache `classified_assets.json` como fonte GCC
- `AssetService::fromCache()` é estática e não precisa de conexão GLPI
- Fixtures de `OptionsService` são usados para testes sem GLPI real
- Conta de integração (GLPI_USER_TOKEN + GLPI_APP_TOKEN) precisa de permissão para as 11 coleções auxiliares

## Pendente (Sprint 3)

- Verificar permissões reais da conta de integração contra as 11 coleções
- Integrar `AssetService` nos endpoints legados (unificar consultas)
- Adapters v1→v2 para mappers existentes
- Deploy VPS e criação da conta OpenCode Go
