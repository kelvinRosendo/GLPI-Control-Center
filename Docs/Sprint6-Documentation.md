# Sprint 6 — Analytics e Gráficos Operacionais — Documentação Técnica

## Visão Geral

A Sprint 6 adicionou gráficos e análises operacionais ao Dashboard Operacional, mantendo a arquitetura desacoplada existente. Os gráficos são renderizados usando Chart.js e consomem dados já processados pelo dashboard.js.

---

## Arquivos Criados

### 1. dashboard_analytics.js

**Responsabilidade:** Calcular indicadores derivados (analytics) a partir dos dados brutos.

**Funcionalidades:**
- `calculate(indicators)` - Calcula todos os analytics
- `getAnalytics()` - Retorna todos os analytics
- `getAnalytic(id)` - Retorna um analytic específico
- `isCalculated()` - Verifica se foram calculados
- `reset()` - Reseta o estado

**Analytics calculados:**
1. `percentual_manutencao` - % de equipamentos em manutenção
2. `percentual_disponivel` - % de equipamentos disponíveis
3. `percentual_chamados_abertos` - % de chamados abertos
4. `percentual_chamados_fechados` - % de chamados fechados
5. `total_ativos` - Total de equipamentos
6. `distribuicao_categorias` - Distribuição por categoria
7. `distribuicao_status` - Distribuição por status
8. `distribuicao_chamados` - Distribuição de chamados
9. `categoria_maior` - Categoria com mais equipamentos
10. `categoria_menor` - Categoria com menos equipamentos
11. `ranking_categorias` - Ranking de categorias
12. `fornecedor_mais_utilizado` - Fornecedor mais utilizado
13. `ranking_fornecedores` - Ranking de fornecedores
14. `tipo_chamado_predominante` - Status de chamado mais comum
15. `ranking_status_chamados` - Ranking de status de chamados
16. `tempo_desde_atualizacao` - Tempo desde a última atualização
17. `chart_chamados_status` - Dados para gráfico de chamados
18. `chart_equipamentos_categoria` - Dados para gráfico de categorias
19. `chart_status_ativos` - Dados para gráfico de status
20. `chart_fornecedores` - Dados para gráfico de fornecedores
21. `chart_evolucao_chamados` - Dados para gráfico de evolução

### 2. dashboard_charts.js

**Responsabilidade:** Criar, atualizar e destruir gráficos Chart.js.

**Funcionalidades:**
- `render(containerId)` - Renderiza todos os gráficos
- `update()` - Atualiza todos os gráficos
- `destroy()` - Destrói todos os gráficos

**Tipos de gráficos suportados:**
- `pie` - Gráfico de pizza
- `bar` - Gráfico de barras
- `horizontalBar` - Gráfico de barras horizontais
- `donut` - Gráfico de rosca
- `doughnut` - Gráfico de rosca (alias)
- `line` - Gráfico de linhas

---

## Arquivos Modificados

### 1. dashboard.config.js

**Adicionado:**
- Seção `charts` com configuração de 5 gráficos
- Seção `analytics` com configurações
- Método `getCharts()` - Retorna gráficos ordenados
- Método `getChart(id)` - Retorna gráfico específico

### 2. dashboard.js

**Adicionado:**
- `analytics` no `_state`
- Cálculo de analytics no `load()`
- Cálculo de analytics no `recalculate()`
- Reset de analytics no `reset()`
- Método `getAnalytic(id)` - Retorna analytic específico
- Método `getAnalytics()` - Retorna todos os analytics

### 3. dashboard_ui.js

**Substituído:**
- `_renderChartsPlaceholder()` por `_renderChartsSection()`

**Adicionado:**
- `_renderChartsSection()` - Renderiza seção de gráficos
- `_renderChartCard(chartConfig)` - Renderiza card de gráfico
- `_renderAnalyticsSection(analytics)` - Renderiza seção de analytics
- `_renderAnalyticsCard(data)` - Renderiza card de analytics
- `_renderCharts()` - Renderiza gráficos após carregamento
- `_updateCharts()` - Atualiza gráficos quando dados mudam
- `_capitalizeFirst(text)` - Capitaliza primeira letra
- Eventos de gráficos clicáveis
- Evento `beforeunload` para destruir gráficos

### 4. index.html

**Adicionado:**
- CDN do Chart.js: `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`
- Script `dashboard_analytics.js`
- Script `dashboard_charts.js`

### 5. dashboard.css

**Adicionado:**
- `.dash-charts-grid` - Grid de gráficos
- `.dash-chart-card` - Card de gráfico
- `.dash-chart-clickable` - Estado clicável
- `.dash-chart-header` - Cabeçalho do gráfico
- `.dash-chart-title` - Título do gráfico
- `.dash-chart-container` - Container do canvas
- `.dash-chart-loading` - Estado de loading
- `.dash-chart-empty` - Estado vazio
- `.dash-chart-error` - Estado de erro
- `.dash-analytics-grid` - Grid de analytics
- `.dash-analytics-card` - Card de analytics
- `.dash-analytics-icon` - Ícone do analytics
- `.dash-analytics-value` - Valor do analytics
- `.dash-analytics-label` - Label do analytics
- Estilos responsivos para 768px e 480px
- Acessibilidade para gráficos clicáveis

---

## Fluxo de Dados Atualizado

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUXO DE DADOS                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Backend (PHP)                                              │
│       │                                                     │
│       ▼                                                     │
│  GlpiClient                                                 │
│       │                                                     │
│       ▼                                                     │
│  window.DATA / window.STATE                                 │
│       │                                                     │
│       ▼                                                     │
│  Dashboard.load()                                           │
│       │                                                     │
│       ├──► _calculateIndicators()                           │
│       │         │                                           │
│       │         ▼                                           │
│       │    window.Dashboard.getIndicators()                 │
│       │                                                     │
│       ├──► _calculateWidgets()                              │
│       │         │                                           │
│       │         ▼                                           │
│       │    window.Dashboard.getWidgets()                    │
│       │                                                     │
│       └──► DashboardAnalytics.calculate(indicators)         │
│                 │                                           │
│                 ▼                                           │
│            window.Dashboard.getAnalytics()                  │
│                 │                                           │
│                 ├──► dashboard_ui.js                        │
│                 │         │                                 │
│                 │         ▼                                 │
│                 │    Renderiza analytics cards               │
│                 │                                           │
│                 └──► DashboardCharts.render()               │
│                           │                                 │
│                           ▼                                 │
│                      Gráficos Chart.js                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Gráficos Implementados

### 1. Chamados por Status (Donut)

- **ID:** `chamados_por_status`
- **Tipo:** Donut
- **Dados:** Abertos vs Fechados
- **Cores:** Amarelo (#f59e0b), Verde (#22c55e)
- **Clique:** Navega para aba "chamados"

### 2. Equipamentos por Categoria (Bar)

- **ID:** `equipamentos_por_categoria`
- **Tipo:** Bar
- **Dados:** Quantidade por categoria
- **Cores:** Azul, Verde, Roxo, Amarelo, Vermelho
- **Clique:** Navega para aba "computadores"

### 3. Status dos Equipamentos (Donut)

- **ID:** `equipamentos_manutencao`
- **Tipo:** Donut
- **Dados:** Disponível vs Manutenção
- **Cores:** Verde (#22c55e), Amarelo (#f59e0b)
- **Clique:** Não clicável

### 4. Ações por Fornecedor (Horizontal Bar)

- **ID:** `equipamentos_por_fornecedor`
- **Tipo:** Horizontal Bar
- **Dados:** Top 5 fornecedores por ações
- **Cores:** Azul, Verde, Roxo, Amarelo, Vermelho
- **Clique:** Não clicável

### 5. Evolução de Chamados (Line)

- **ID:** `evolucao_chamados`
- **Tipo:** Line
- **Dados:** Abertos vs Fechados (preparado para histórico)
- **Cores:** Amarelo (#f59e0b), Verde (#22c55e)
- **Clique:** Não clicável

---

## Analytics Implementados

### 1. Percentual em Manutenção

```javascript
percentual_manutencao = (em_manutencao / totalAtivos) * 100
```

### 2. Percentual Disponível

```javascript
percentual_disponivel = (disponiveis / totalAtivos) * 100
```

### 3. Categoria com Maior Quantidade

```javascript
categoria_maior = { nome: 'Computadores', quantidade: 42 }
```

### 4. Fornecedor mais Utilizado

```javascript
fornecedor_mais_utilizado = { nome: 'Torino', quantidade: 15 }
```

### 5. Tipo de Chamado Predominante

```javascript
tipo_chamado_predominante = { nome: 'aberto', quantidade: 23 }
```

### 6. Tempo desde Última Atualização

```javascript
tempo_desde_atualizacao = { minutos: 5, texto: 'Há 5 minutos', isStale: false }
```

---

## Ciclo de Vida dos Gráficos

```
┌─────────────────────────────────────────────────────────────┐
│                    CICLO DE VIDA                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. INICIALIZAÇÃO                                           │
│     Dashboard.load()                                        │
│         │                                                   │
│         ▼                                                   │
│     DashboardAnalytics.calculate()                          │
│         │                                                   │
│         ▼                                                   │
│     dashboard:loaded event                                  │
│         │                                                   │
│         ▼                                                   │
│     DashboardCharts.render()                                │
│         │                                                   │
│         ▼                                                   │
│     Criar instâncias Chart.js                                │
│                                                             │
│  2. ATUALIZAÇÃO                                             │
│     Dashboard.recalculate()                                 │
│         │                                                   │
│         ▼                                                   │
│     DashboardAnalytics.calculate()                          │
│         │                                                   │
│         ▼                                                   │
│     dashboard:recalculated event                            │
│         │                                                   │
│         ▼                                                   │
│     DashboardCharts.update()                                │
│         │                                                   │
│         ▼                                                   │
│     Atualizar datasets dos gráficos                         │
│                                                             │
│  3. DESTRUIÇÃO                                              │
│     window.beforeunload                                     │
│         │                                                   │
│         ▼                                                   │
│     DashboardCharts.destroy()                               │
│         │                                                   │
│         ▼                                                   │
│     Destruir todas as instâncias Chart.js                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Prevenção de Memory Leak

### 1. Destruir antes de recriar

```javascript
_renderChart(chartConfig) {
  // Destruir gráfico existente antes de criar novo
  this._destroyChart(chartConfig.id);
  
  // Criar novo gráfico
  this._charts[chartConfig.id] = new Chart(ctx, {...});
}
```

### 2. Destruir ao sair da página

```javascript
window.addEventListener('beforeunload', () => {
  window.DashboardCharts.destroy();
});
```

### 3. Limpar referências

```javascript
_destroyChart(chartId) {
  if (this._charts[chartId]) {
    this._charts[chartId].destroy();
    delete this._charts[chartId];
  }
}

destroy() {
  Object.keys(this._charts).forEach(chartId => {
    this._destroyChart(chartId);
  });
  this._charts = {};
}
```

---

## Estados dos Gráficos

### 1. Loading

```html
<div class="dash-chart-loading">
  <div class="dash-skeleton-icon"></div>
  <span>Carregando gráfico...</span>
</div>
```

### 2. Empty

```html
<div class="dash-chart-empty">
  <span>Nenhum dado disponível</span>
</div>
```

### 3. Error

```html
<div class="dash-chart-error">
  <span class="dash-error-icon">&#9888;</span>
  <span>Erro ao carregar gráfico</span>
</div>
```

### 4. Success

```html
<canvas id="chart-chamados_por_status"></canvas>
```

---

## Interações com Gráficos

### Clique no Gráfico

```javascript
options.onClick = (event, elements) => {
  if (elements.length > 0 && window.App?.go) {
    window.App.go(chartConfig.tab);
  }
};
```

### Hover

```javascript
options.onHover = (event, elements) => {
  const canvas = event.native?.target;
  if (canvas) {
    canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
  }
};
```

---

## Responsividade

### Desktop (> 768px)

- Grid de gráficos: `repeat(auto-fill, minmax(300px, 1fr))`
- Altura do gráfico: 250px
- Grid de analytics: `repeat(auto-fill, minmax(180px, 1fr))`

### Tablet (≤ 768px)

- Grid de gráficos: 1 coluna
- Altura do gráfico: 200px
- Grid de analytics: 2 colunas

### Mobile (≤ 480px)

- Grid de analytics: 1 coluna
- Tamanho da fonte reduzido

---

## Configuração Centralizada

### Adicionar Novo Gráfico

1. Abra `dashboard.config.js`
2. Adicione objeto no array `charts`:

```javascript
{
  id: 'novo_grafico',
  titulo: 'Título do Gráfico',
  tipo: 'bar', // pie, bar, horizontalBar, donut, line
  source: 'chart_novo_grafico',
  cores: ['#4f7ef7', '#00c896'],
  visible: true,
  order: 6,
  clickable: true,
  tab: 'aba_destino',
}
```

3. Adicione dados em `dashboard_analytics.js` no método `_calculateChartData()`
4. Pronto! O gráfico aparecerá automaticamente

### Adicionar Novo Analytic

1. Abra `dashboard_analytics.js`
2. Adicione cálculo no método apropriado
3. Adicione card em `dashboard_ui.js` no método `_renderAnalyticsSection()`
4. Pronto! O analytic aparecerá automaticamente

---

## Conformidade com Critérios de Aceitação

| Critério | Status | Evidência |
|----------|--------|-----------|
| Dashboard continua desacoplado | ✅ | 5 camadas: config, data, analytics, charts, ui |
| dashboard.js sem gráficos | ✅ | Apenas chama DashboardAnalytics |
| dashboard_charts.js sem regras | ✅ | Apenas renderiza Chart.js |
| dashboard_analytics.js sem HTML | ✅ | Apenas calcula dados |
| Configuração centralizada | ✅ | Tudo em dashboard.config.js |
| Gráficos responsivos | ✅ | 3 breakpoints |
| Atualização automática | ✅ | Evento dashboard:recalculated |
| Estados Loading/Empty/Error | ✅ | Implementados para cada gráfico |
| Sem vazamento de memória | ✅ | Destruir antes de recriar, beforeunload |
| Fácil adicionar novos gráficos | ✅ | Basta adicionar no config |

---

## Padrões de Design Utilizados

### 1. Configuration Driven Design
Todos os gráficos são definidos em `dashboard.config.js`.

### 2. Separation of Concerns
- **Config:** Define gráficos
- **Analytics:** Calcula dados
- **Charts:** Renderiza gráficos
- **UI:** Renderiza interface

### 3. Observer Pattern
Eventos `dashboard:loaded` e `dashboard:recalculated` comunicam módulos.

### 4. State Management
Estado centralizado em `Dashboard._state`.

### 5. Factory Pattern
`DashboardCharts._renderChart()` cria gráficos baseado em configuração.

### 6. Template Method
`DashboardCharts.render()` define fluxo geral.

---

## Métricas da Sprint 6

| Métrica | Valor |
|---------|-------|
| Arquivos criados | 2 |
| Arquivos modificados | 5 |
| Linhas adicionadas | ~800 |
| Gráficos implementados | 5 |
| Analytics implementados | 8 |
| Tipos de gráfico | 5 |
| Estados visuais | 4 |

---

## Mensagem de Commit

```
feat(dashboard): adiciona gráficos e analytics operacionais - Sprint 6

- Cria dashboard_analytics.js com cálculos derivados
- Cria dashboard_charts.js com gerenciamento de gráficos Chart.js
- Adiciona configuração de 5 gráficos em dashboard.config.js
- Implementa gráfico de Chamados por Status (Donut)
- Implementa gráfico de Equipamentos por Categoria (Bar)
- Implementa gráfico de Status dos Equipamentos (Donut)
- Implementa gráfico de Ações por Fornecedor (Horizontal Bar)
- Implementa gráfico de Evolução de Chamados (Line)
- Adiciona seção de analytics com 8 indicadores
- Adiciona estados Loading/Empty/Error para gráficos
- Implementa prevenção de memory leak
- Adiciona interações de clique nos gráficos
- Adiciona responsividade para gráficos
- Atualiza dashboard.js para incluir analytics
- Atualiza dashboard_ui.js para renderizar gráficos
- Atualiza index.html com Chart.js CDN
- Atualiza dashboard.css com estilos de gráficos

Closes #Sprint6
```

---

## Próximos Passos

### Sprint 6.5 — Melhorias
- Adicionar tooltips customizados
- Adicionar animações
- Adicionar exportação de dados
- Adicionar filtros de período

### Sprint 7 — Relatórios
- Implementar exportação PDF
- Implementar exportação Excel
- Implementar relatórios personalizados

### Sprint 8 — Analytics Avançado
- Implementar tendências
- Implementar comparativos
- Implementar previsões