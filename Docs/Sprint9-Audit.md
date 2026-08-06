# Sprint 9 — Auditoria Avançada e Linha do Tempo Global

## Visão Geral

Sistema completo de auditoria que registra, armazena e exibe todos os eventos importantes do GLPI Control Center. Inclui linha do tempo estilo GitHub, busca instantânea, filtros avançados e integração com Dashboard e Relatórios.

## Arquivos Criados

| Arquivo | Responsabilidade |
|---------|-----------------|
| `audit.config.js` | Configuração centralizada: categorias, tipos, severidades, ícones |
| `audit_storage.js` | Persistência localStorage + cache + Repository pattern |
| `audit.js` | Core de registro, consulta, enriquecimento de contexto |
| `audit_ui.js` | Timeline, busca, filtros, modal de detalhes, paginação |
| `audit.css` | Estilos completos do módulo (timeline, cards, filtros, modal) |

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `auth.js` | Hooks: login, login_falha, logout |
| `workflow.js` | Hooks: chamado_aberto, chamado_falha |
| `integration-engine.js` | Hooks: integracao_iniciada, integracao_sucesso, integracao_falha, integracao_cancelada |
| `portal-viewer.js` | Hooks: portal_aberto, portal_bloqueado, portal_fallback |
| `projectors_maintenance.js` | Hooks: manutencao_registrada, manutencao_excluida |
| `reports.js` | Hook: relatorio_visualizado + fonte de dados audit |
| `report_export.js` | Hook: relatorio_exportado |
| `dashboard.js` | Hook: dashboard_carregado + widgets de auditoria |
| `dashboard.config.js` | 4 novos widgets de auditoria |
| `dashboard_ui.js` | Renderização dos widgets de auditoria |
| `reports.config.js` | 4 novos relatórios de auditoria + filtros audit_* |
| `ui_render.js` | Tab "Auditoria" adicionada |
| `app.js` | Rota 'auditoria' + init do Audit |
| `index.html` | CSS audit.css + 4 scripts JS |

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    audit.config.js                       │
│         (categorias, tipos, severidades, ícones)         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  auth.js     │  │  workflow.js │  │  integration │  │
│  │  portal.js   │  │  projectors  │  │  reports.js  │  │
│  │  dashboard   │  │  export.js   │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│         ▼                 ▼                 ▼           │
│  ┌──────────────────────────────────────────────────┐   │
│  │              audit.js (Core)                     │   │
│  │  register() · query() · getStats() · onEvent()  │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                   │
│                     ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │           audit_storage.js (Repository)          │   │
│  │  localStorage + cache + paginação + limpeza      │   │
│  └──────────────────────────────────────────────────┘   │
│                     │                                   │
│                     ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │             audit_ui.js (UI)                     │   │
│  │  Timeline · Busca · Filtros · Modal · Pagination │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐                    │
│  │  Dashboard   │  │  Relatórios  │                    │
│  │  4 widgets   │  │  4 reports   │                    │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

## Eventos Rastreados

### Autenticação
| Ação | Severidade | Quando |
|------|-----------|--------|
| `login` | info | Login realizado com sucesso |
| `login_falha` | warning | Credenciais inválidas |
| `logout` | info | Usuário fez logout |

### Workflow
| Ação | Severidade | Quando |
|------|-----------|--------|
| `chamado_aberto` | success | Chamado criado no GLPI |
| `chamado_falha` | error | Falha ao criar chamado |

### Integrações
| Ação | Severidade | Quando |
|------|-----------|--------|
| `integracao_iniciada` | info | Integração com fornecedor iniciada |
| `integracao_sucesso` | success | Ação executada com sucesso |
| `integracao_falha` | error | Falha na execução |
| `integracao_cancelada` | warning | Integração cancelada pelo usuário |

### Portal
| Ação | Severidade | Quando |
|------|-----------|--------|
| `portal_aberto` | info | Portal carregou via iframe |
| `portal_bloqueado` | warning | Fornecedor bloqueou iframe |
| `portal_fallback` | info | Portal aberto em nova aba |

### Projetores
| Ação | Severidade | Quando |
|------|-----------|--------|
| `manutencao_registrada` | success | Manutenção registrada |
| `manutencao_excluida` | warning | Manutenção excluída |

### Relatórios
| Ação | Severidade | Quando |
|------|-----------|--------|
| `relatorio_visualizado` | info | Relatório carregado |
| `relatorio_exportado` | success | Exportação concluída |

### Dashboard
| Ação | Severidade | Quando |
|------|-----------|--------|
| `dashboard_carregado` | info | Dashboard carregado |

### Sistema
| Ação | Severidade | Quando |
|------|-----------|--------|
| `erro` | error | Erro não capturado / promise rejeitada |

## Estrutura de um Registro

```json
{
  "id": "evt_1234567890_abc1234",
  "timestamp": "2026-08-06T10:30:00.000Z",
  "usuario": "admin",
  "categoria": "auth",
  "modulo": "auth",
  "acao": "login",
  "acaoLabel": "Login",
  "result": "ok",
  "equipamento": null,
  "fornecedor": null,
  "descricao": "Login realizado: admin",
  "extras": null,
  "ip": null,
  "browser": {
    "userAgent": "...",
    "language": "pt-BR",
    "platform": "Win32",
    "screenResolution": "1920x1080",
    "viewport": "1366x768"
  },
  "severity": "info",
  "severityColor": "#4f7ef7",
  "categoryIcon": "&#128274;",
  "categoryColor": "#4f7ef7"
}
```

## Dashboard Widgets (4 novos)

1. **Últimos Eventos de Auditoria** — 5 eventos mais recentes
2. **Erros Recentes** — 5 erros mais recentes
3. **Últimas Integrações** — 5 integrações mais recentes
4. **Atividades Diárias** — contadores hoje/ontem/semana

## Relatórios (4 novos)

1. **Auditoria Geral** — todos os eventos com todos os campos
2. **Eventos por Usuário** — agrupado por usuário
3. **Eventos por Equipamento** — agrupado por equipamento
4. **Eventos com Erro** — apenas severidade error

## Performance

- **Cache em memória** com TTL de 30s para registros e queries
- **Paginação** com 50 registros por página (configurável)
- **Limpeza automática** de registros expirados (90 dias)
- **Capacidade máxima** de 1000 registros (configurável)
- **Debounce** de 200ms na busca
- **Busca instantânea** sem reload da página

## Limites Configuráveis (audit.config.js)

```javascript
storage: {
  key: 'glpi:audit',
  maxRecords: 1000,
  expiryDays: 90,
  cacheTTL: 30000,
},
ui: {
  timelinePageSize: 50,
  searchDebounceMs: 200,
  maxDescriptionLength: 120,
}
```

## Preparação para Backend

O módulo está preparado para migração futura:
- `AuditStorage.prepareSyncPayload()` gera payload para sincronização
- Campo `ip` preparado (retorna null, aguarda endpoint)
- Campo `browser` já coleta informações do cliente
- Repository pattern facilita troca de camada de persistência
