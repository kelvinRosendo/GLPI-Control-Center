# Contrato de Capacidades — GCC

**Versão:** 0.1.0 (proposta)
**Data:** 21/09/2026

---

## 1. Objetivo

Definir um contrato que permita ao frontend e ao futuro agente de IA descobrir, **por ativo**, quais operações estão disponíveis, quais campos são editáveis, quais validações se aplicam e por que uma operação pode estar indisponível.

---

## 2. Princípios

1. **As capacidades efetivas consideram:** tipo do ativo + implementação disponível + permissões do usuário GCC + permissões da conta de integração GLPI.
2. **O frontend pode usar o contrato para renderizar controles**, mas a autorização deve ser novamente validada no backend.
3. **O agente de IA deve consultar o contrato antes de executar uma operação.**
4. **O contrato é consultivo, não executivo** — o backend sempre tem a última palavra.

---

## 3. Formato Proposto

### 3.1 Endpoint: `GET /api/capabilities`

Retorna o contrato completo para o usuário autenticado.

```json
{
  "ok": true,
  "version": "0.1.0",
  "user": {
    "profile": "SUPORTE",
    "email": "tecnico@colegiosatelite.cloud"
  },
  "itemtypes": {
    "Computer": {
      "label": "Computador",
      "operations": {
        "list": {
          "available": true,
          "method": "GET",
          "endpoint": "/api/assets/computers",
          "description": "Lista computadores filtrados por categoria"
        },
        "detail": {
          "available": true,
          "method": "GET",
          "endpoint": "/api/assets/computers/{id}",
          "description": "Detalhes estruturados do computador"
        },
        "update": {
          "available": true,
          "method": "POST",
          "endpoint": "/api/assets/computers/{id}",
          "description": "Atualiza campos textuais",
          "requiresCsrf": true
        },
        "create": {
          "available": false,
          "reason": "Não implementado no GCC"
        },
        "delete": {
          "available": false,
          "reason": "Não implementado no GCC"
        },
        "restore": {
          "available": false,
          "reason": "Não implementado no GCC"
        }
      },
      "fields": {
        "name": {
          "label": "Nome do ativo",
          "type": "text",
          "editable": true,
          "required": false,
          "glpiField": "name",
          "validation": "trim; max 255 chars"
        },
        "serial": {
          "label": "Serial",
          "type": "text",
          "editable": true,
          "required": false,
          "glpiField": "serial"
        },
        "otherserial": {
          "label": "Patrimônio",
          "type": "text",
          "editable": true,
          "required": false,
          "glpiField": "otherserial"
        },
        "contact": {
          "label": "Contato",
          "type": "text",
          "editable": true,
          "required": false,
          "glpiField": "contact"
        },
        "contact_num": {
          "label": "Telefone / Ramal",
          "type": "text",
          "editable": true,
          "required": false,
          "glpiField": "contact_num"
        },
        "comment": {
          "label": "Observações",
          "type": "textarea",
          "editable": true,
          "required": false,
          "glpiField": "comment"
        },
        "locations_id": {
          "label": "Localização",
          "type": "dropdown",
          "editable": false,
          "glpiField": "locations_id",
          "optionsEndpoint": "/api/options/locations",
          "optionsNote": "Requer implementação"
        },
        "groups_id": {
          "label": "Grupo",
          "type": "dropdown",
          "editable": false,
          "glpiField": "groups_id",
          "optionsEndpoint": "/api/options/groups",
          "optionsNote": "Requer implementação"
        },
        "users_id": {
          "label": "Usuário",
          "type": "dropdown",
          "editable": false,
          "glpiField": "users_id",
          "optionsEndpoint": "/api/options/users",
          "optionsNote": "Requer implementação"
        },
        "states_id": {
          "label": "Estado",
          "type": "dropdown",
          "editable": false,
          "glpiField": "states_id",
          "optionsEndpoint": "/api/options/states",
          "optionsNote": "Requer implementação"
        },
        "computermodels_id": {
          "label": "Modelo",
          "type": "dropdown",
          "editable": false,
          "glpiField": "computermodels_id"
        },
        "computertypes_id": {
          "label": "Tipo",
          "type": "dropdown",
          "editable": false,
          "glpiField": "computertypes_id"
        },
        "manufacturers_id": {
          "label": "Fabricante",
          "type": "dropdown",
          "editable": false,
          "glpiField": "manufacturers_id"
        }
      }
    },
    "Printer": {
      "label": "Impressora",
      "operations": {
        "list": { "available": true, "method": "GET", "endpoint": "/api/assets/impressoras" },
        "detail": { "available": true, "method": "GET", "endpoint": "/api/assets/printers/{id}" },
        "update": {
          "available": false,
          "reason": "Edição de impressoras não implementada no GCC"
        },
        "create": { "available": false, "reason": "Não implementado" },
        "delete": { "available": false, "reason": "Não implementado" }
      },
      "fields": {
        "name": { "label": "Nome", "type": "text", "editable": false, "glpiField": "name" },
        "serial": { "label": "Serial", "type": "text", "editable": false, "glpiField": "serial" },
        "otherserial": { "label": "Patrimônio", "type": "text", "editable": false, "glpiField": "otherserial" }
      }
    },
    "Projector": {
      "label": "Projetor",
      "note": "Itemtype técnico é Computer; categoria GCC é projector",
      "operations": {
        "list": { "available": true, "method": "GET", "endpoint": "/api/projetors" },
        "detail": { "available": true, "method": "GET", "endpoint": "/api/projetors/{id}" },
        "updateLamp": {
          "available": true,
          "method": "PUT",
          "endpoint": "/api/projetors/{id}/lamp",
          "description": "Atualiza horas da lâmpada",
          "requiresCsrf": true
        },
        "registerMaintenance": {
          "available": true,
          "method": "POST",
          "endpoint": "/api/projetors/{id}/maintenance",
          "description": "Registra manutenção",
          "requiresCsrf": true
        },
        "history": { "available": true, "method": "GET", "endpoint": "/api/projetors/{id}/history" },
        "alerts": { "available": true, "method": "GET", "endpoint": "/api/projetors/alerts" },
        "update": {
          "available": false,
          "reason": "Campos do GLPI (nome, local, etc.) não editáveis via GCC"
        }
      },
      "fields": {
        "horas_lampada": {
          "label": "Horas da Lâmpada",
          "type": "integer",
          "editable": true,
          "validation": ">= 0",
          "source": "projectors.json"
        },
        "vida_util_estimada": {
          "label": "Vida Útil Estimada",
          "type": "integer",
          "editable": true,
          "validation": "> 0",
          "source": "projectors.json"
        },
        "notas": {
          "label": "Notas",
          "type": "textarea",
          "editable": false,
          "source": "projectors.json"
        }
      }
    },
    "Ticket": {
      "label": "Chamado",
      "operations": {
        "list": { "available": true, "method": "GET", "endpoint": "/api/tickets" },
        "listByAsset": { "available": true, "method": "GET", "endpoint": "/api/tickets/asset/{id}" },
        "create": {
          "available": true,
          "method": "POST",
          "endpoint": "/api/tickets",
          "requiresCsrf": true,
          "requiredFields": ["titulo", "descricao", "glpiId"]
        },
        "createWorkflow": {
          "available": true,
          "method": "POST",
          "endpoint": "/api/tickets/workflow",
          "requiresCsrf": true,
          "requiredFields": ["glpiId", "assistance", "checklist.tipoProblema"]
        },
        "update": { "available": false, "reason": "Edição de chamados não implementada" },
        "close": { "available": false, "reason": "Fechamento não implementado" }
      }
    }
  },
  "categories": {
    "computer_cs": { "label": "Computadores", "itemtype": "Computer", "editableFields": ["name","serial","otherserial","contact","contact_num","comment"] },
    "chromebook_student": { "label": "Alunos", "itemtype": "Computer", "editableFields": [] },
    "chromebook_support": { "label": "Apoio", "itemtype": "Computer", "editableFields": [] },
    "chromebook_display": { "label": "Exibição", "itemtype": "Computer", "editableFields": [] },
    "projector": { "label": "Projetores", "itemtype": "Computer", "editableFields": ["horas_lampada","vida_util_estimada"] },
    "printer": { "label": "Impressora", "itemtype": "Printer", "editableFields": [] },
    "printer_computer": { "label": "Impressora (cadastrada como Computer)", "itemtype": "Computer", "editableFields": ["name","serial","otherserial","contact","contact_num","comment"] },
    "unclassified": { "label": "Não classificado", "itemtype": "Computer", "editableFields": ["name","serial","otherserial","contact","contact_num","comment"] }
  }
}
```

---

## 4. Exemplo de Uso pelo Frontend

```javascript
const caps = await fetch('/api/capabilities').then(r => r.json());

// Para um Computer:
const computerCaps = caps.itemtypes.Computer;
if (computerCaps.operations.update.available) {
  // Mostrar botão de edição
}

// Para um campo:
const nameField = computerCaps.fields.name;
if (nameField.editable) {
  // Renderizar input text
} else if (nameField.type === 'dropdown' && nameField.optionsEndpoint) {
  // Buscar opções do dropdown e renderizar select
}
```

---

## 5. Exemplo de Uso pelo Agente de IA

```json
{
  "tool": "get_capabilities",
  "args": { "itemtype": "Computer", "category": "computer_cs" }
}
```

Resposta:
```json
{
  "operations": {
    "update": {
      "available": true,
      "endpoint": "/api/assets/computers/{id}",
      "fields": {
        "name": { "editable": true, "type": "text" },
        "serial": { "editable": true, "type": "text" }
      }
    }
  }
}
```

O agente sabe que podeEditar name e serial de um Computer da categoria computer_cs.

---

## 6. Campos de Dropdown — Resolução de ID

Para suportar edição de campos de dropdown, o contrato inclui:

```json
{
  "locations_id": {
    "type": "dropdown",
    "editable": true,
    "optionsEndpoint": "/api/options/locations",
    "valueType": "id"
  }
}
```

O frontend/agente deve:
1. Buscar opções de `/api/options/locations` → `[{id: 1, name: "Sala 101"}, ...]`
2. Enviar `{ "locations_id": 5 }` (ID, não nome)

**Pendência:** Os endpoints `/api/options/*` ainda não existem e precisam ser implementados na Sprint 2.

---

## 7. Restrições do Contrato

| Restrição | Descrição |
|---|---|
| `available: false` | Operação não implementada — não executar |
| `requiresCsrf: true` | Requer header `X-CSRF-Token` |
| `validation` | Regra de validação a ser aplicada antes do envio |
| `source: "projectors.json"` | Dado não está no GLPI — fonte é exclusiva do GCC |
| `optionsNote: "Requer implementação"` | Endpoint de opções não existe ainda |

---

## 8. Status de Implementação

| Componente | Status |
|---|---|
| `GET /api/capabilities` | **Não implementado** — definido como proposta nesta sprint |
| `GET /api/options/*` | **Não implementado** — requer Sprint 2 |
| Campos editáveis de Computer | **Implementado** — hard-coded em `EDITABLE_COMPUTER_FIELDS` |
| Campos editáveis de Projetor | **Implementado** — via `projectors.json` |
| Campos editáveis de Printer | **Não implementado** |
| Tool definitions para IA | **Não implementado** — requer Sprint 2/3 |
