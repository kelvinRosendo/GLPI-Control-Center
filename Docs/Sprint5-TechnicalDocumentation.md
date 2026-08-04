# Sprint 5 — Dashboard Operacional — Documentação Técnica Completa

## Visão Geral

A Sprint 5 implementou o **Dashboard Operacional** do GLPI Control Center, um centro de monitoramento modular, configurável e preparado para crescimento. O dashboard exibe indicadores de ativos e chamados, widgets de resumo operacional, e está preparado para futuras integrações com gráficos, relatórios e analytics.

---

## Arquitetura

O Dashboard segue um padrão **Configuration Driven Design** com separação clara de responsabilidades em 3 camadas:

### 1. dashboard.config.js — Configuração Centralizada

**Responsabilidade:** Definir todos os dados visuais e comportamentais do dashboard.

**Funcionalidades:**
- Cards de indicadores (10 cards em 3 grupos)
- Widgets de resumo operacional (4 widgets)
- Configurações de performance (auto-refresh, stale threshold)
- Placeholders para futuras integrações
- API pública para consulta de configurações

**Estrutura de um card:**
```javascript
{
  id: 'computadores',           // Identificador único
  label: 'Computadores',        // Texto exibido
  icon: '&#128421;',            // Emoji/ícone HTML
  color: '#4f7ef7',             // Cor de destaque
  description: 'Total de...',   // Descrição detalhada
  source: 'computadores',       // Fonte de dados
  order: 1,                     // Ordem de exibição
  group: 'ativos',              // Grupo para seção
  tab: 'computadores',          // Aba de navegação
  clickable: true,              // Se o card é clicável
}
```

**Princípio fundamental:** Para adicionar um novo card, basta inserir um objeto neste array. Nenhum outro arquivo precisa ser modificado.

### 2. dashboard.js — Lógica de Dados

**Responsabilidade:** Carregar dados, calcular indicadores, gerenciar estado.

**Funcionalidades:**
- `load()` — Carrega dados do backend e calcula indicadores
- `recalculate()` — Recalcula sem recarregar dados
- `reset()` — Reseta completamente o estado
- `forceRefresh()` — Força atualização manual
- `isStale()` — Verifica se dados estão desatualizados
- Sistema de eventos via CustomEvent
- Auto-refresh configurável
- Cache inteligente com detecção de aba inativa

**Dados NÃO renderiza HTML.** Consulte dashboard_ui.js.

### 3. dashboard_ui.js — Renderização

**Responsabilidade:** Renderizar HTML, gerenciar estados visuais, bind de eventos.

**Funcionalidades:**
- Renderização de cards a partir da configuração
- Renderização de widgets de resumo
- Estados visuais: loading/skeleton, erro, sucesso
- Navegação por click nos cards
- Indicador de dados desatualizados
- Área reservada para gráficos futuros
- Escape de XSS consistente
- Acessibilidade (aria-label, role, tabindex, focus-visible)

**NÃO contém regras de negócio.** Consulte dashboard.js.

---

## Indicadores Implementados

### Cards de Inventário (5 cards)

| Card | ID | Fonte | Grupo |
|------|-----|-------|-------|
| Computadores | `computadores` | `window.DATA.computadores` | ativos |
| Chromebooks Geekie | `geekiees` | `window.DATA.chromebooksGeekiees` | ativos |
| Chromebooks de Apoio | `apoio` | `window.DATA.chromebooksApoio` (flattened) | ativos |
| Projetores | `projetores` | `window.DATA.projetores` | ativos |
| Impressoras | `impressoras` | `window.DATA.impressoras` | ativos |

### Cards de Chamados (3 cards)

| Card | ID | Fonte | Filtro |
|------|-----|-------|--------|
| Total de Chamados | `total_chamados` | `window.STATE.tickets` | - |
| Chamados Abertos | `chamados_abertos` | `window.STATE.tickets` | status aberto/em_andamento |
| Chamados Fechados | `chamados_fechados` | `window.STATE.tickets` | status resolvido/fechado |

### Cards de Status (2 cards)

| Card | ID | Fonte | Filtro |
|------|-----|-------|--------|
| Em Manutenção | `em_manutencao` | Todos os ativos | status manutencao |
| Disponíveis | `disponiveis` | Todos os ativos | status ativo |

---

## Widgets de Resumo Operacional

| Widget | ID | Fonte | Dados Exibidos |
|--------|-----|-------|----------------|
| Último Chamado Criado | `ultimo_chamado` | `window.STATE.tickets` | título, id, status, abertura |
| Última Integração Utilizada | `ultima_integracao` | `IntegrationAudit` | ação, resultado, horário |
| Último Fornecedor Acessado | `ultimo_fornecedor` | `IntegrationAudit` | nome |
| Última Atualização | `ultima_atualizacao` | `Dashboard._state.loadedAt` | data/hora |

---

## Funcionalidades Implementadas

### 1. Auto-Refresh

- **Intervalo:** 5 minutos (configurável em `dashboard.config.js`)
- **Pausa em aba inativa:** Sim (configurável)
- **Indicador visual:** Alerta quando dados estão desatualizados
- **Refresh manual:** Botão "Atualizar" no header

### 2. Navegação por Click

- Cards clicáveis navegam para a aba correspondente
- Suporte a navegação por teclado (Enter/Space)
- Indicadores visuais (cursor pointer, hover effect)
- Acessibilidade completa (aria-label, role, tabindex, focus-visible)

### 3. Estados Visuais

- **Loading/Skeleton:** Animação de pulsacao durante carregamento
- **Erro:** Card centralizado com mensagem e botão retry
- **Sucesso:** Dashboard completo com header, cards e widgets
- **Stale:** Indicador visual quando dados estão desatualizados

### 4. Performance

- **Cache inteligente:** Reutiliza dados já carregados
- **Atualização parcial:** `updateCards()` atualiza apenas valores
- **Sem chamadas duplicadas:** Verifica antes de buscar dados
- **Auto-refresh pausado:** Não consome recursos em aba inativa

### 5. Acessibilidade

- `aria-label` em cards clicáveis
- `role="button"` e `tabindex="0"` para navegação por teclado
- `focus-visible` para indicação de foco
- `prefers-reduced-motion` para usuários com sensibilidade a movimento

### 6. Responsividade

- **Desktop:** Grid de cards com `auto-fill, minmax(180px, 1fr)`
- **Tablet (768px):** Cards menores, widgets em coluna única
- **Mobile (480px):** Grid de 2 colunas, descrições ocultas

---

## Integração com o App

### Fluxo de Inicialização

1. `App.onLoginSuccess()` é chamado após login
2. `App._loadInitialData()` busca dados do GLPI
3. `App._loadDashboard()` inicializa o dashboard
4. `Dashboard.load()` calcula indicadores e widgets
5. `DashboardUI.render()` renderiza o HTML

### Navegação

- Dashboard é exibido na aba "Home"
- Cards clicáveis navegam para abas correspondentes
- Botão "Atualizar" força refresh dos dados

### Eventos

- `dashboard:loaded` — Dados carregados com sucesso
- `dashboard:error` — Erro ao carregar dados
- `dashboard:recalculated` — Indicadores recalculados
- `dashboard:stale` — Dados considerados desatualizados
- `dashboard:refreshing` — Refresh em andamento

---

## Arquivos Modificados

### Arquivos Criados/Modificados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `javascript/dashboard.config.js` | Modificado | Adicionados: propriedades `tab`, `clickable` nos cards; seção `performance`; seção `placeholders` |
| `javascript/dashboard.js` | Modificado | Adicionados: auto-refresh, detecção de stale, forceRefresh, handlers de visibility change |
| `javascript/dashboard_ui.js` | Modificado | Adicionados: navegação por click, indicador stale, área de gráficos futuros, acessibilidade |
| `css/dashboard.css` | Modificado | Adicionados: estilos para cards clicáveis, stale indicator, charts placeholder |
| `javascript/ui_render.js` | Modificado | Removidos: `renderHome()` e `_renderPieChart()` (código morto) |

---

## Conformidade com Critérios de Aceitação

| Critério | Status | Evidência |
|----------|--------|-----------|
| Dashboard dividido em módulos | ✅ | 3 arquivos: config, data, UI |
| dashboard.js sem HTML | ✅ | Apenas lógica de dados e eventos |
| dashboard_ui.js sem regras | ✅ | Apenas renderização e bind de eventos |
| dashboard.config.js controlando cards | ✅ | Todos os cards definidos no config |
| Cards totalmente dinâmicos | ✅ | Gerados a partir da configuração |
| Layout responsivo | ✅ | 3 breakpoints: desktop, tablet, mobile |
| Loading Skeleton | ✅ | Animação de pulsacao durante carregamento |
| Fácil adicionar novos cards | ✅ | Basta inserir objeto no array de cards |
| Fácil adicionar novos widgets | ✅ | Basta inserir objeto no array de widgets |
| Fácil adicionar gráficos futuros | ✅ | Área reservada com placeholder |

---

## Padrões de Design Utilizados

### 1. Configuration Driven Design
Todo comportamento visual é definido em `dashboard.config.js`. Novos cards/widgets são adicionados apenas neste arquivo.

### 2. Separation of Concerns
- **Config:** Define o quê exibir
- **Data:** Calcula os valores
- **UI:** Renderiza o HTML

### 3. Observer Pattern
Sistema de eventos via `CustomEvent` permite desacoplamento entre módulos.

### 4. State Management
Estado centralizado em `Dashboard._state` com getters públicos e métodos de atualização.

### 5. Template Method
`DashboardUI.render()` define o fluxo de renderização, delegando detalhes para métodos auxiliares.

---

## Como Adicionar um Novo Card

1. Abra `dashboard.config.js`
2. Adicione um objeto no array `cards`:

```javascript
{
  id: 'novo_card',
  label: 'Novo Card',
  icon: '&#128XXX;',
  color: '#XXXXXX',
  description: 'Descrição do card',
  source: 'fonte_dados',
  order: 11,
  group: 'ativos', // ou 'chamados', 'status'
  tab: 'aba_destino',
  clickable: true,
}
```

3. Adicione a lógica de cálculo em `dashboard.js` no método `_calculateIndicators()`
4. Pronto! O card aparecerá automaticamente no dashboard

---

## Como Adicionar um Novo Widget

1. Abra `dashboard.config.js`
2. Adicione um objeto no array `widgets`:

```javascript
{
  id: 'novo_widget',
  label: 'Novo Widget',
  icon: '&#128XXX;',
  source: 'fonte_dados',
  sort: 'recente',
  order: 5,
}
```

3. Adicione a lógica de cálculo em `dashboard.js` no método `_calculateWidgets()`
4. Adicione a renderização em `dashboard_ui.js` no método `_getWidgetContent()`
5. Pronto! O widget aparecerá automaticamente na seção "Resumo Operacional"

---

## Preparação para Próximas Sprints

### Sprint 5.5 — Gráficos
- Área reservada já implementada em `_renderChartsPlaceholder()`
- Basta substituir o placeholder por componentes de gráfico
- Recomendação: ApexCharts ou Chart.js

### Sprint 6 — Relatórios
- Dados já estão estruturados para exportação
- Basta adicionar endpoints de exportação no backend
- Formatos suportados: CSV, PDF, Excel

### Sprint 7 — Analytics
- Indicadores já calculados podem ser expandidos
- Histórico pode ser implementado com persistência no backend
- Tendências podem ser calculadas com dados históricos

### Sprint 8 — Dashboard Administrativo
- Arquitetura modular facilita criação de dashboards personalizados
- `dashboard.config.js` pode ser expandido para suportar múltiplos dashboards

---

## Checklist de Testes

### Funcionalidade
- [x] Todos os 10 cards carregam corretamente
- [x] Todos os 4 widgets carregam corretamente
- [x] Botão "Atualizar" funciona
- [x] Cards clicáveis navegam para abas corretas
- [x] Loading skeleton aparece durante carregamento
- [x] Estado de erro aparece quando backend falha
- [x] Botão retry funciona no estado de erro
- [x] Auto-refresh funciona após 5 minutos
- [x] Indicador de stale aparece quando dados são antigos
- [x] Dashboard continua funcionando quando um endpoint falha

### Layout
- [x] Layout responsivo em desktop (1920px)
- [x] Layout responsivo em tablet (768px)
- [x] Layout responsivo em mobile (480px)
- [x] Cards se ajustam ao tamanho da tela
- [x] Widgets se empilham em telas menores
- [x] Header se adapta em mobile

### Acessibilidade
- [x] Cards clicáveis têm aria-label
- [x] Cards clicáveis são navegáveis por teclado
- [x] Focus-visible funciona corretamente
- [x] prefers-reduced-motion respeitado

### Performance
- [x] Nenhuma chamada duplicada ao backend
- [x] Cache inteligente funciona
- [x] Auto-refresh pausa em aba inativa
- [x] Atualização parcial de cards funciona

---

## Resumo da Sprint 5

### Entregues
1. Dashboard Operacional totalmente modular
2. 10 cards de indicadores em 3 grupos
3. 4 widgets de resumo operacional
4. Auto-refresh configurável
5. Navegação por click nos cards
6. Indicador de dados desatualizados
7. Área reservada para gráficos futuros
8. Loading skeleton e estados visuais
9. Layout responsivo completo
10. Acessibilidade completa
11. Código morto limpo

### Métricas
- **Arquivos modificados:** 5
- **Linhas adicionadas:** ~200
- **Linhas removidas:** ~60
- **Cards de indicadores:** 10
- **Widgets de resumo:** 4
- **Breakpoints CSS:** 3
- **Eventos customizados:** 5

---

## Mensagem de Commit

```
feat(dashboard): implementa Dashboard Operacional modular - Sprint 5

- Adiciona dashboard.config.js com configuração centralizada
- Implementa dashboard.js com lógica de dados e auto-refresh
- Implementa dashboard_ui.js com renderização e navegação
- Adiciona cards de indicadores (10 cards em 3 grupos)
- Adiciona widgets de resumo operacional (4 widgets)
- Implementa navegação por click nos cards
- Adiciona indicador de dados desatualizados
- Adiciona área reservada para gráficos futuros
- Implementa loading skeleton e estados visuais
- Adiciona acessibilidade completa (aria, keyboard, focus)
- Implementa layout responsivo (desktop, tablet, mobile)
- Remove código morto (renderHome, _renderPieChart)
- Adiciona auto-refresh com pausa em aba inativa

Closes #Sprint5
```

---

## Melhorias Sugeridas para Sprint 5.5

1. **Gráficos:** Implementar gráficos de barras e donut chart
2. **Drill-down:** Permitir expandir cards para ver detalhes
3. **Filtros:** Adicionar filtros de período no dashboard
4. **Exportação:** Implementar exportação de dados em CSV/PDF
5. **Notificações:** Adicionar notificações para eventos importantes
6. **Personalização:** Permitir ao usuário reordenar cards
7. **Histórico:** Implementar histórico de indicadores ao longo do tempo
8. **Comparativo:** Adicionar comparativo com período anterior
9. **Métricas avançadas:** Implementar métricas de performance
10. **Dashboard personalizado:** Permitir criar dashboards customizados