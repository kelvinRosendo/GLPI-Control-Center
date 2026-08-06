# Sprint 8 — Módulo de Gestão de Projetores

## Resumo da Sprint

A Sprint 8 implementou o primeiro **módulo especializado** do GLPI Control Center: **Gestão de Projetores**. Este módulo controla informações específicas dos projetores, incluindo vida útil da lâmpada, histórico de manutenções, alertas automáticos e indicadores dedicados.

---

## Arquivos Criados (5 novos)

| Arquivo | Linhas | Responsabilidade |
|---------|--------|------------------|
| `Frontend/javascript/projectors.config.js` | 202 | Limites, status, tipos de manutenção, campos, storage |
| `Frontend/javascript/projectors.js` | 559 | Lógica de dados, cálculos de vida útil, alertas, status |
| `Frontend/javascript/projectors_maintenance.js` | 369 | Registro de manutenções, histórico, validação |
| `Frontend/javascript/projectors_ui.js` | 771 | Interface: grid, cards, detalhes, formulário, timeline |
| `Frontend/css/projectors.css` | 929 | Estilos completos do módulo |

**Total: 2.830 linhas de código novo**

## Arquivos Modificados (5)

| Arquivo | Alteração |
|---------|-----------|
| `Frontend/index.html` | Adicionado CSS + 4 scripts do módulo |
| `Frontend/javascript/app.js` | Case 'projetores' usa ProjectorsUI |
| `Frontend/javascript/dashboard.config.js` | 3 novos cards de indicadores de projetores |
| `Frontend/javascript/dashboard.js` | Cálculo de indicadores de projetores + _ensureData |
| `Frontend/javascript/reports.config.js` | 4 novos relatórios de projetores + categoria |
| `Frontend/javascript/reports.js` | Novas fontes de dados: projetores e manutenções |

---

## Arquitetura Implementada

```
┌─────────────────────────────────────────────────────────────┐
│                  projectors.config.js                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Limites de   │  │   Status     │  │   Tipos de       │  │
│  │  vida útil    │  │   automático │  │   manutenção     │  │
│  │  (3000h)      │  │   (4 states) │  │   (5 tipos)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Intervalos   │  │   Campos     │  │   Storage        │  │
│  │  manutenção   │  │   formulário │  │   localStorage   │  │
│  │  (90d/30d)    │  │   (12 campos)│  │   (prefix+key)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ consome
┌──────────────────────────▼──────────────────────────────────┐
│                      projectors.js                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ _ensureData  │  │ _calculate   │  │ _calculateAlerts │  │
│  │ (GLPI + LS)  │  │ Status auto  │  │ (4 tipos)        │  │
│  │              │  │              │  │ lampada/manut/    │  │
│  │ _enrich      │  │ _calculate   │  │ limpeza/parado    │  │
│  │ Projectors   │  │ Indicators   │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ getLamp      │  │ _saveDetails │                         │
│  │ Percentage/  │  │ localStorage │                         │
│  │ Color/Remain │  │ CRUD         │                         │
│  └──────────────┘  └──────────────┘                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼───────┐  ┌──────▼──────┐  ┌───────▼───────┐
│ projectors_   │  │ projectors_ │  │ Dashboard +   │
│ maintenance.js│  │ ui.js       │  │ Reports       │
│               │  │             │  │ (integração)  │
│ register()    │  │ renderGrid()│  │               │
│ getHistory()  │  │ renderDetail│  │ 3 cards       │
│ getStats()    │  │ renderForm()│  │ 4 relatórios  │
│ localStorage  │  │ Timeline    │  │               │
└───────────────┘  └─────────────┘  └───────────────┘
```

---

## Status Implementados

| Status | Cor | Cálculo Automático |
|--------|-----|-------------------|
| Operando | `#00c896` | Sem alertas ativos |
| Atenção | `#ffc107` | Lâmpada >80%, manutenção atrasada, limpeza pendente |
| Manutenção | `#f59e0b` | Status GLPI = 'manutencao' |
| Fora de Uso | `#ff5555` | Preparado para futuro |

---

## Alertas Implementados

| Alerta | Severidade | Condição |
|--------|-----------|----------|
| Lâmpada crítica | `critical` | Horas > 95% da vida útil |
| Lâmpada aviso | `warning` | Horas > 80% da vida útil |
| Manutenção atrasada | `critical/warning` | Dias > intervalo configurado |
| Manutenção próxima | `info` | Dias > intervalo - 14 dias |
| Limpeza necessária | `warning/critical` | Dias > intervalo de limpeza |
| Sem dados | `info` | Sem horas, manutenção ou aquisição |

---

## Indicadores no Dashboard

| Card | Valor | Grupo |
|------|-------|-------|
| Projetores Operando | `pj_operando` | projetores |
| Projetores em Atenção | `pj_atencao` | projetores |
| Lâmpadas no Limite | `pj_lampada` | projetores |

---

## Relatórios Adicionados

| # | ID | Título | Tipo |
|---|-----|--------|------|
| 9 | `projectors_geral` | Projetores | projectors |
| 10 | `projectors_manutencoes` | Manutenções de Projetores | maintenance |
| 11 | `projectors_trocas_lampada` | Trocas de Lâmpada | maintenance (filtro) |
| 12 | `projectors_vida_util` | Vida Útil das Lâmpadas | projectors |

---

## Fluxo de Uso

```
1. Usuário clica na aba "Projetores"
       ↓
2. Grid de cards com indicadores e alertas
       ↓
3. Busca e filtros por status
       ↓
4. Usuário clica em um projetor
       ↓
5. Detalhes: informações, barra de vida útil, timeline
       ↓
6. Usuário clica "Registrar Manutenção"
       ↓
7. Formulário: tipo, data, responsável, horas, descrição
       ↓
8. Registro salvo + metadados atualizados + timeline atualizada
```

---

## Design Patterns Utilizados

### 1. Configuration Driven Design
Limites de manutenção, intervalos, percentuais de alerta — tudo em `projectors.config.js`. Alterar de 3000h para 2500h = mudar uma linha.

### 2. Separation of Concerns
- **config.js** = O QUE existe (limites, status, tipos)
- **projectors.js** = COMO calcular (vida útil, alertas, status)
- **maintenance.js** = COMO registrar (validação, histórico, localStorage)
- **ui.js** = COMO mostrar (cards, detalhes, formulário, timeline)
- **css** = COMO parecer

### 3. Strategy Pattern
Cada tipo de manutenção (`lampada`, `limpeza`, `manutencao`, `reparo`, `observacao`) tem sua própria lógica de atualização de metadados.

### 4. Observer Pattern (CustomEvents)
- `projectors:loaded` — dados carregados
- `projectors:recalculated` — indicadores recalculados
- `projectors:updated` — projetor atualizado
- `projectors:maintenance:registered` — manutenção registrada
- `projectors:maintenance:deleted` — manutenção removida

### 5. Cache Pattern
- Detalhes em localStorage com TTL de 5 min
- Chave: `glpi:projectors:details`
- Limpeza automática via `maxCacheSize`

### 6. Template Method
`load()` define: ensureData → loadSavedDetails → enrichProjectors → calculateStatus → calculateIndicators → calculateAlerts → emit.

---

## Como Calcular Vida Útil e Alertas

```javascript
// Percentual de vida útil
percentage = (horas_lampada / vida_util_estimada) * 100

// Status automático
if (percentage >= 95%) → 'atencao' (crítico)
if (percentage >= 80%) → 'atencao' (aviso)
if (GLPI status === 'manutencao') → 'manutencao'
else → 'operando'

// Cor da barra
if (percentage >= 95%) → '#ff5555' (vermelho)
if (percentage >= 80%) → '#ffc107' (amarelo)
else → '#00c896' (verde)
```

---

## Reutilização de Sprints Anteriores

### Sprint 5 (Dashboard)
- **Indicadores**: 3 novos cards no mesmo padrão dos existentes
- **_ensureData()**: Adicionado load de projetores
- **Design tokens CSS**: Mesmas variáveis visuais

### Sprint 6 (Analytics)
- **Event-driven**: Mesmos CustomEvents
- **Cache**: Mesmo padrão de TTL

### Sprint 7 (Relatórios)
- **reports.config.js**: 4 novos relatórios adicionados
- **reports.js**: 2 novas fontes de dados (`projetores`, `projector_maintenance`)
- **reports_ui.js**: Renderiza automaticamente os novos relatórios

---

## Checklist de Testes

### Funcionalidades
- [x] Grid de projetores carrega corretamente
- [x] Cards mostram nome, patrimônio, modelo, localização
- [x] Barra de vida útil mostra percentual correto
- [x] Cor da barra muda conforme percentual
- [x] Indicadores mostram totais corretos
- [x] Alertas aparecem quando há pendências
- [x] Busca filtra por nome, patrimônio, serial
- [x] Filtros por status funcionam
- [x] Detalhes mostram todas as informações
- [x] Timeline mostra histórico de manutenções
- [x] Formulário registra manutenção corretamente
- [x] Troca de lâmpada reseta horas
- [x] Limpeza atualiza data
- [x] Manutenção geral atualiza data
- [x] Dados persistem em localStorage
- [x] Dashboard mostra indicadores de projetores
- [x] Relatórios incluem dados de projetores

### Interface
- [x] Layout responsivo (480px, 768px)
- [x] Loading spinner aparece
- [x] Empty state funciona
- [x] Error state funciona
- [x] Botão voltar funciona em todas as views
- [x] Formulário valida campos obrigatórios
- [x] Feedback de sucesso/erro no formulário

### Acessibilidade
- [x] tabindex="0" nos cards
- [x] role="button" nos cards clicáveis
- [x] aria-label em botões
- [x] Navegação por teclado (Enter/Space)
- [x] prefers-reduced-motion suportado
- [x] Focus visible nos elementos

---

## Mensagem de Commit

```
feat(projectors): Sprint 8 - Módulo de Gestão de Projetores

Implementa módulo completo de gestão de projetores com:
- projectors.config.js: limites de vida útil, status, tipos de manutenção
- projectors.js: cálculo de vida útil, alertas automáticos, status
- projectors_maintenance.js: registro de manutenções, histórico, validação
- projectors_ui.js: grid de cards, detalhes, formulário, timeline
- projectors.css: estilos responsivos com acessabilidade

Funcionalidades:
- Status automático (Operando/Atenção/Manutenção/Fora de Uso)
- Alertas: lâmpada, manutenção, limpeza, equipamento parado
- Barra de vida útil com cores dinâmicas
- Timeline de manutenções
- Formulário de registro com validação
- Persistência em localStorage

Integrações:
- Dashboard: 3 novos cards de indicadores de projetores
- Relatórios: 4 novos relatórios (projetores, manutenções, trocas, vida útil)
- Dados enriquecidos do GLPI + localStorage
```

---

## Melhorias Sugeridas para Sprint 8.5

1. **Notificações automáticas** — Enviar alertas quando lâmpada atingir 80%
2. **Exportação de relatórios de projetores** — CSV já preparado
3. **Gráficos de projetores** — Evolução de horas ao longo do tempo
4. **Comparativo entre projetores** — Ranking de vida útil
5. **Cálculo de custo total de propriedade** — Custo de lâmpadas + manutenção
6. **QR Code** — Identificação rápida por câmera
7. **Integração com calendário** — Agendar manutenções preventivas
8. **Dashboard dedicado de projetors** — Aba separada com KPIs
9. **Alertas por email** — Notificar responsável quando manutenção vencer
10. **Importação em massa** — Atualizar horas de lâmpada via planilha
11. **Modelos de projetor** — Cadastro de fabricantes e modelos com specs
12. **Garantia** — Controle de garantia por projetor
13. **Multi-lâmpada** — Suporte a projetores com múltiplas lâmpadas
14. ** Fotos** — Upload de fotos do projetor
15. **Audit log** — Histórico de todas as alterações (não apenas manutenções)

---

## Fluxograma Atualizado

```
                        ┌──────────────┐
                        │   index.html │
                        │   (rotas)    │
                        └──────┬───────┘
                               │
                    ┌──────────▼──────────┐
                    │      app.js         │
                    │  go('projetores')   │
                    └──────────┬──────────┘
                               │
              ┌────────────────▼────────────────┐
              │      projectors_ui.js           │
              │  render() → _renderGridView()   │
              │  _renderDetailView()            │
              │  _renderMaintenanceFormView()   │
              └────────────────┬────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
   ┌───────▼───────┐   ┌──────▼──────┐   ┌───────▼───────┐
   │ projectors.js │   │ projectors_ │   │ projectors.   │
   │ load()        │   │ maintenance │   │ config.js     │
   │ _calculate    │   │ .js         │   │ getStatus()   │
   │ Status/Alerts │   │ register()  │   │ getFields()   │
   │ getLampColor  │   │ getHistory()│   │ getTypes()    │
   └───────┬───────┘   └──────┬──────┘   └───────────────┘
           │                   │
   ┌───────▼───────┐   ┌──────▼──────┐
   │ GlpiClient    │   │ localStorage│
   │ .loadAll()    │   │ (glpi:      │
   │ DATA.projetores│  │  projectors)│
   └───────────────┘   └─────────────┘
```
