# Sprint 9 — Central de Auditoria e Timeline Global

## Visão Geral

Sistema completo de auditoria que registra, armazena e exibe todos os eventos importantes do GLPI Control Center. Inclui linha do tempo estilo GitHub, busca instantânea, filtros avançados e integração com Dashboard e Relatórios.

---

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
| `projectors.js` | Hook: projetor_atualizado |
| `projectors_maintenance.js` | Hooks: manutencao_registrada, manutencao_excluida |
| `reports.js` | Hooks: relatorio_visualizado, relatorio_filtro + fonte de dados audit |
| `report_export.js` | Hook: relatorio_exportado |
| `dashboard.js` | Hooks: dashboard_carregado, dashboard_atualizado + widgets de auditoria |
| `dashboard_ui.js` | Renderização dos widgets de auditoria |
| `reports.config.js` | 4 novos relatórios de auditoria + filtros audit_* |
| `ui_render.js` | Tab "Auditoria" adicionada |
| `app.js` | Rota 'auditoria' + init do Audit |
| `index.html` | CSS audit.css + 4 scripts JS |

---

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
│  │  register() · log() · query() · getStats()      │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                   │
│                     ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │           audit_storage.js (Repository)          │   │
│  │  localStorage + cache + paginação + limpeza      │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                   │
│                     ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │             audit_ui.js (UI)                     │   │
│  │  Timeline · Busca · Filtros · Modal · Paginação  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐                    │
│  │  Dashboard   │  │  Relatórios  │                    │
│  │  4 widgets   │  │  4 reports   │                    │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

```
Módulo qualquer → Audit.log('acao') → AuditStorage.addRecord() → localStorage
                                                      ↓
                                              audit:event-recorded
                                                      ↓
                                              AuditUI._refreshView()
                                                      ↓
                                              Timeline atualizada
```

---

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
| `workflow_iniciado` | info | Workflow iniciado |

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
| `projetor_atualizado` | info | Dados do projetor atualizados |

### Relatórios
| Ação | Severidade | Quando |
|------|-----------|--------|
| `relatorio_visualizado` | info | Relatório carregado |
| `relatorio_exportado` | success | Exportação concluída |
| `relatorio_filtro` | info | Filtros aplicados |

### Dashboard
| Ação | Severidade | Quando |
|------|-----------|--------|
| `dashboard_carregado` | info | Dashboard carregado |
| `dashboard_atualizado` | info | Dashboard atualizado manualmente |
| `dashboard_erro` | error | Erro ao carregar dashboard |

### Sistema
| Ação | Severidade | Quando |
|------|-----------|--------|
| `erro` | error | Erro não capturado / promise rejeitada |
| `sessao_iniciada` | info | Sessão do usuário iniciada |
| `navegacao` | info | Navegação entre abas |

---

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
  "dados": null,
  "extras": null,
  "severidade": "info",
  "origem": "frontend",
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
  "categoryColor": "#4f7ef7",
  "versaoSistema": "1.0.0",
  "sessionId": "sess_1234567890_abc1234"
}
```

---

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

---

## Performance

- **Cache em memória** com TTL de 30s para registros e queries
- **Paginação** com 50 registros por página (configurável)
- **Limpeza automática** de registros expirados (90 dias)
- **Capacidade máxima** de 1000 registros (configurável)
- **Debounce** de 200ms na busca
- **Busca instantânea** sem reload da página
- **Invalidação de cache** automática ao adicionar novo registro

## Limites Configuráveis (audit.config.js)

```javascript
storage: {
  key: 'glpi:audit',
  maxRecords: 1000,      // Máximo de registros
  expiryDays: 90,         // Dias antes de expirar
  cacheTTL: 30000,        // TTL do cache (30s)
},
ui: {
  timelinePageSize: 50,   // Itens por página
  searchDebounceMs: 200,  // Debounce da busca
  maxDescriptionLength: 120, // Truncar descrição
  showTimestamp: true,
  groupByDate: true,
}
```

---

## Preparação para Backend

O módulo está preparado para migração futura sem reescrita:

- `AuditStorage.prepareSyncPayload()` gera payload para sincronização
- Campo `ip` preparado (retorna null, aguarda endpoint)
- Campo `browser` já coleta informações do cliente
- Campo `sessionId` preparado para rastreamento de sessão
- Campo `versaoSistema` preparado para versionamento
- Campo `origem` diferencia frontend vs backend
- Repository pattern facilita troca de camada de persistência
- CustomEvents permitem integração com WebSocket futuro

---

## Critérios de Aceitação

| Critério | Status |
|----------|--------|
| Timeline funcionando | ✅ |
| Pesquisa instantânea | ✅ |
| Filtros (categoria, severidade, módulo, usuário, data) | ✅ |
| Dashboard integrado (4 widgets) | ✅ |
| Relatórios integrados (4 relatórios) | ✅ |
| Registro automático em todos os módulos | ✅ |
| Arquitetura modular (3 camadas desacopladas) | ✅ |
| Configuration Driven (nenhum valor fixo na lógica) | ✅ |
| Performance (cache, paginação, debounce) | ✅ |
| Sem erros no console | ✅ |
| Modal de detalhes | ✅ |
| Paginação | ✅ |
| Estados visuais (loading, empty, error) | ✅ |
| Responsivo | ✅ |
| Sem memory leaks | ✅ |

---

## Bloco de Aprendizado

### 1. Diferença entre Log, Auditoria e Telemetria

**Log** é o registro bruto de eventos para diagnóstico técnico. Exemplos: logs de erro do navegador, logs de servidor. Não têm estrutura padronizada e são voltados para desenvolvedores.

**Auditoria** é o registro estruturado de ações realizadas por usuários ou sistema, com contexto completo (quem, quando, o quê, onde). Voltada para rastreabilidade, compliance e governança. Cada evento tem ID único, timestamp, usuário e severidade.

**Telemetria** é a coleta de dados de uso e performance para análise de tendências. Exemplos: quantas vezes um botão foi clicado, tempo de carregamento. Foco em métricas agregadas, não em eventos individuais.

No GCC, implementamos **auditoria** (rastreabilidade de ações) com elementos de **log** (erros não capturados) e preparamos a infraestrutura para **telemetria** futura.

### 2. Como GitHub, Jira e ServiceNow implementam Activity Feed

**GitHub** usa um modelo de Activity Feed onde cada ação (commit, PR, issue, review) gera um evento com actor, action, target e timestamp. O feed é agrupado por dia e permite filtros por tipo. Usa polling + WebSocket para atualização em tempo real.

**Jira** implementa um "Activity Stream" que registra mudanças em issues (comentários, transições, anexos). Cada entrada tem um verb (created, updated, commented) e links para o ator e o objeto. Suporta exportação e API REST.

**ServiceNow** usa um "Audit Log" mais robusto com campos de compliance (IP, sessão, tabelas afetadas). Registra CRUD completo e suporta retenção configurável. Integra com SIEM para monitoramento.

No GCC, seguimos o padrão do GitHub com timeline agrupada por data, cards com ícones e badges de severidade, e filtros avançados.

### 3. Como evitar acoplamento entre módulos e auditoria

OGCC usa o padrão **Mediator** via `window.Audit.log()`. Os módulos conhecem apenas a API pública do Audit, não sua implementação:

```javascript
// Acoplamento MÍNIMO — módulo só chama Audit.log()
if (window.Audit) {
  window.Audit.log('chamado_aberto', {
    module: 'workflow',
    descricao: `Chamado #${id} aberto`,
  });
}
```

**Princípios aplicados:**
- **Dependency Inversion**: módulos dependem de abstração (API), não de implementação
- **Guard clause**: `if (window.Audit)` permite que o sistema funcione sem auditoria
- **Interface mínima**: apenas `log()`, `register()`, `query()` são expostas
- **Sem retorno**: módulos não processam resultado da auditoria
- **CustomEvents**: comunicação via eventos desacoplados

### 4. Como construir uma Timeline escalável

A timeline do GCC usa **agrupamento por data** + **paginação** + **virtualização potencial**:

1. **Agrupamento por data**: Registros são agrupados em "Hoje", "Ontem", dias da semana, ou data completa
2. **Paginação**: 50 itens por página (configurável), sem carregar tudo de uma vez
3. **Cache**: Query results são cacheados por 30s com invalidação automática
4. **Lazy rendering**: Apenas a página visível é renderizada
5. **Sticky headers**: Cabeçalho do grupo fica fixo ao rolar

Para escalabilidade futura com milhares de registros, a arquitetura prepara:
- **Virtualização**: renderizar apenas itens visíveis na viewport
- **Backend pagination**: offset/limit no servidor
- **WebSocket**: atualização incremental sem polling

### 5. Como implementar paginação e Lazy Loading

**Paginação** no GCC calcula páginas baseado no total de registros filtrados:

```javascript
const page = filters.page || 1;
const pageSize = filters.pageSize || 50;
const start = (page - 1) * pageSize;
const paged = records.slice(start, start + pageSize);
```

**Lazy Loading** é implementado via:
- **Debounce** na busca (200ms) para evitar consultas excessivas
- **Cache de queries** com TTL de 30s
- **Invalidação automática** quando novos registros são adicionados
- **Paginação visual** com navegação por páginas e info "Mostrando X–Y de Z"

### 6. Como preparar a persistência futura em banco de dados

O **Repository Pattern** no `audit_storage.js` abstrai a fonte de dados:

```javascript
// Atualmente: localStorage
getAll() {
  const raw = localStorage.getItem(key);
  return JSON.parse(raw);
}

// Futuro: Backend API
getAll() {
  const response = await fetch('/api/audit/events');
  return response.json();
}
```

**Preparações existentes:**
- `prepareSyncPayload()` gera payload para envio ao backend
- Estrutura do registro inclui campos para backend (`ip`, `sessionId`, `versaoSistema`, `origem`)
- Cache em memória funciona independentemente da fonte de dados
- Query filtra em memória (futuro: filtros no servidor)

### 7. Como essa arquitetura poderá alimentar dashboards, analytics e notificações

A arquitetura atual já alimenta:
- **Dashboard**: 4 widgets leem diretamente do `Audit.query()`
- **Relatórios**: 4 relatórios usam `Audit.getAll()` como fonte de dados

**Futuro:**
- **Analytics**: `Audit.getStats()` fornece dados agregados para gráficos
- **Notificações**: `Audit.onEvent()` permite escutar eventos em tempo real
- **SIEM**: `prepareSyncPayload()` prepara dados para envio a sistemas externos
- **Monitoramento**: Filtros por severidade 'error' permitem alertas automáticos

### 8. Quais Design Patterns foram utilizados e por quê

| Pattern | Onde | Por quê |
|---------|------|---------|
| **Singleton** | `window.Audit` (IIFE) | Global access point, state encapsulation |
| **Repository** | `AuditStorage` | Abstrai persistência (localStorage → backend) |
| **Observer** | CustomEvents + `onEvent()` | Comunicação desacoplada entre módulos |
| **Mediator** | `Audit.log()` como ponto central | Módulos não se conhecem, só o Audit |
| **Configuration Driven** | `audit.config.js` | Novos eventos sem modificar lógica |
| **Facade** | `Audit.log()` esconde Complexidade | API simples para consumidores |
| **Strategy** | Filtros e queries | Diferentes estratégias de busca |
| **Cache** | `_cache` em AuditStorage | Performance, redução de I/O |

### 9. Fluxo completo desde Audit.log() até a Timeline

```
1. Módulo chama:
   Audit.log('chamado_aberto', { module: 'workflow', descricao: '...' })

2. audit.js register():
   - Valida parâmetros
   - Busca config da action em AUDIT_CONFIG
   - Enriquece com contexto (usuário, browser, IP, sessão)
   - Cria record com ID único e timestamp
   - Chama AuditStorage.addRecord(record)

3. audit_storage.js addRecord():
   - Carrega registros existentes (ou do cache)
   - Adiciona novo registro
   - Salva no localStorage
   - Limpa expirados (se necessário)
   - Atualiza cache em memória

4. audit.js (continuação):
   - Dispara CustomEvent 'audit:event-recorded'
   - Notifica listeners registrados em onEvent()
   - Retorna record criado

5. audit_ui.js (ouvinte):
   - Recebe evento 'audit:event-recorded'
   - Chama _refreshView()
   - Atualiza stats, timeline e paginação
   - Timeline renderizada com novo evento

6. Timeline visual:
   - Evento aparece no grupo "Hoje"
   - Card com ícone, cor, badge de severidade
   - Dados do usuário e timestamp
   - Clique abre modal de detalhes
```

---

## Checklist de Testes

| Teste | Status |
|-------|--------|
| Login gera evento `login` | ✅ |
| Login com erro gera `login_falha` | ✅ |
| Logout gera evento `logout` | ✅ |
| Workflow gera `chamado_aberto` | ✅ |
| Workflow com erro gera `chamado_falha` | ✅ |
| Integração gera `integracao_iniciada` | ✅ |
| Integração sucesso gera `integracao_sucesso` | ✅ |
| Integração falha gera `integracao_falha` | ✅ |
| Integração cancelada gera `integracao_cancelada` | ✅ |
| Portal iframe gera `portal_aberto` | ✅ |
| Portal bloqueado gera `portal_bloqueado` | ✅ |
| Portal fallback gera `portal_fallback` | ✅ |
| Dashboard carregado gera `dashboard_carregado` | ✅ |
| Dashboard refresh gera `dashboard_atualizado` | ✅ |
| Projetor atualizado gera `projetor_atualizado` | ✅ |
| Manutenção registrada gera `manutencao_registrada` | ✅ |
| Manutenção excluída gera `manutencao_excluida` | ✅ |
| Relatório visualizado gera `relatorio_visualizado` | ✅ |
| Relatório exportado gera `relatorio_exportado` | ✅ |
| Filtros de relatório gera `relatorio_filtro` | ✅ |
| Busca instantânea funciona | ✅ |
| Paginação funciona | ✅ |
| Cache funciona (TTL 30s) | ✅ |
| Timeline renderiza corretamente | ✅ |
| Modal de detalhes abre ao clicar | ✅ |
| Filtros funcionam corretamente | ✅ |
| Stats atualizam em tempo real | ✅ |
| Estados visuais (loading, empty, error) | ✅ |
| Responsivo em mobile | ✅ |
| Sem memory leaks | ✅ |
| Sem erros no console | ✅ |

---

## Melhorias Sugeridas para Sprint 9.5

1. **Virtualização da Timeline**: Usar IntersectionObserver para renderizar apenas itens visíveis quando houver muitos registros
2. **WebSocket**: Atualização em tempo real sem polling
3. **Exportação de Auditoria**: CSV/JSON dos eventos de auditoria
4. **Filtros Salvos**: Permitir salvar combinações de filtros frequentes
5. **Comparação de Períodos**: Comparar atividade entre dois períodos
6. **Dashboard de Auditoria**: Página dedicada com gráficos de tendência
7. **Alertas**: Notificações quando houver muitos erros em curto período
8. **Retenção Configurável por Categoria**: Diferentes categorias com diferentes tempos de retenção
9. **Análise de Padrões**: Detectar padrões suspeitos de uso
10. **Integração com SIEM**: Exportar eventos em formato CEF/LEEF

---

## Resumo Executivo

A Sprint 9 implementou uma **Central de Auditoria completa** com:

- **4 módulos JavaScript** desacoplados (config, core, storage, UI)
- **1 arquivo CSS** com estilos responsivos
- **21 tipos de eventos** rastreados automaticamente
- **8 módulos integrados** com Audit.log()
- **4 widgets** no Dashboard
- **4 relatórios** de auditoria
- **Timeline estilo GitHub** com agrupamento por data
- **Busca instantânea** com debounce
- **Filtros avançados** (categoria, severidade, módulo, usuário, data)
- **Modal de detalhes** com JSON bruto
- **Paginação** com 50 itens por página
- **Cache** com TTL de 30s
- **Repository pattern** preparado para backend
- **Configuration Driven** (novos eventos sem modificar lógica)
- **Zero dependências externas**

A arquitetura é **modular**, **escalável** e **preparada para crescimento** sem necessidade de reescrita.
