# Sprint 6 — Analytics e Gráficos Operacionais — Plano de Implementação

## Visão Geral

O objetivo desta Sprint é adicionar gráficos e análises operacionais ao Dashboard Operacional, mantendo a arquitetura desacoplada existente. Os gráficos consumirão dados já processados pelo `dashboard.js`, enquanto a UI apenas renderiza.

---

## Arquitetura Atual

```
┌─────────────────────────────────────────────────────────────┐
│                    ARQUITETURA ATUAL                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           dashboard.config.js                       │   │
│  │         (CONFIGURAÇÃO CENTRALIZADA)                 │   │
│  │  • Cards de indicadores                              │   │
│  │  • Widgets de resumo                                 │   │
│  │  • Performance                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           dashboard.js                              │   │
│  │         (LÓGICA DE DADOS)                           │   │
│  │  • Carrega dados do backend                          │   │
│  │  • Calcula indicadores                               │   │
│  │  • Calcula widgets                                   │   │
│  │  • Gerencia estado                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           dashboard_ui.js                           │   │
│  │         (RENDERIZAÇÃO)                              │   │
│  │  • Renderiza cards                                   │   │
│  │  • Renderiza widgets                                 │   │
│  │  • Estados visuais                                   │   │
│  │  • [PLACEHOLDER para gráficos]                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquitetura Proposta (Sprint 6)

```
┌─────────────────────────────────────────────────────────────┐
│                    ARQUITETURA PROPOSTA                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           dashboard.config.js                       │   │
│  │         (CONFIGURAÇÃO CENTRALIZADA)                 │   │
│  │  • Cards de indicadores                              │   │
│  │  • Widgets de resumo                                 │   │
│  │  • Configuração de gráficos (NOVO)                   │   │
│  │  • Performance                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           dashboard.js                              │   │
│  │         (LÓGICA DE DADOS)                           │   │
│  │  • Carrega dados do backend                          │   │
│  │  • Calcula indicadores                               │   │
│  │  • Calcula widgets                                   │   │
│  │  • Calcula analytics (NOVO - via dashboard_analytics)│   │
│  │  • Gerencia estado                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           dashboard_analytics.js (NOVO)             │   │
│  │         (CÁLCULO DE ANALYTICS)                      │   │
│  │  • Calcula tendências                                │   │
│  │  • Calcula percentuais                               │   │
│  │  • Calcula distribuições                             │   │
│  │  • SEM renderizar HTML                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           dashboard_charts.js (NOVO)                │   │
│  │         (RENDERIZAÇÃO DE GRÁFICOS)                  │   │
│  │  • Cria gráficos Chart.js                            │   │
│  │  • Atualiza gráficos                                 │   │
│  │  • Destrói gráficos                                  │   │
│  │  • Controla ciclo de vida                            │   │
│  │  • SEM buscar dados                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           dashboard_ui.js                           │   │
│  │         (RENDERIZAÇÃO)                              │   │
│  │  • Renderiza cards                                   │   │
│  │  • Renderiza widgets                                 │   │
│  │  • Renderiza seção de gráficos (NOVO)                │   │
│  │  • Estados visuais                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUXO DE DADOS                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Backend (PHP)                                              │
│       │                                                     │
│       ▼                                                     │
│  GlpiClient.fetchComputadores()                             │
│  GlpiClient.fetchTickets()                                  │
│  IntegrationAudit.getAll()                                  │
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
│       └──► DashboardAnalytics.calculate() (NOVO)            │
│                 │                                           │
│                 ▼                                           │
│            DashboardAnalytics.getAnalytics()                │
│                 │                                           │
│                 ▼                                           │
│            DashboardCharts.render() (NOVO)                  │
│                 │                                           │
│                 ▼                                           │
│            Gráficos Chart.js renderizados                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Criar

### 1. `dashboard_analytics.js`

**Responsabilidade:** Calcular indicadores derivados (analytics) a partir dos dados brutos.

**Estrutura:**
```javascript
window.DashboardAnalytics = {
  _state: {
    analytics: {},
    calculated: false,
  },

  // ── Ciclo de Vida ──────────────────────────────────────
  calculate(indicators) { ... },
  getAnalytics() { ... },
  getAnalytic(id) { ... },
  reset() { ... },

  // ── Cálculos ───────────────────────────────────────────
  _calculatePercentages(indicators) { ... },
  _calculateDistributions(indicators) { ... },
  _calculateTimeSinceUpdate() { ... },

  // ── Helpers ────────────────────────────────────────────
  _getTopCategory(indicators) { ... },
  _getTopFornecedor() { ... },
  _getPredominantTicketType() { ... },
};
```

**Analytics a calcular:**
1. `percentual_manutencao` - % de equipamentos em manutenção
2. `percentual_disponivel` - % de equipamentos disponíveis
3. `categoria_maior` - Categoria com mais equipamentos
4. `fornecedor_mais_utilizado` - Fornecedor com mais registros de auditoria
5. `tipo_chamado_predominante` - Status de chamado mais comum
6. `tempo_desde_atualizacao` - Tempo desde a última atualização

### 2. `dashboard_charts.js`

**Responsabilidade:** Criar, atualizar e destruir gráficos Chart.js.

**Estrutura:**
```javascript
window.DashboardCharts = {
  _charts: {},
  _containerEl: null,

  // ── Ciclo de Vida ──────────────────────────────────────
  render(containerId) { ... },
  update() { ... },
  destroy() { ... },

  // ── Criação de Gráficos ────────────────────────────────
  _createChart(chartConfig, data) { ... },
  _createPieChart(config, data) { ... },
  _createBarChart(config, data) { ... },
  _createHorizontalBarChart(config, data) { ... },
  _createDonutChart(config, data) { ... },
  _createLineChart(config, data) { ... },

  // ── Atualização ────────────────────────────────────────
  _updateChart(chartId, newData) { ... },

  // ── Destruição ─────────────────────────────────────────
  _destroyChart(chartId) { ... },
  _destroyAll() { ... },

  // ── Helpers ────────────────────────────────────────────
  _getChartConfig(chartId) { ... },
  _getChartData(chartId) { ... },
  _getChartOptions(chartId) { ... },
  _renderChartSkeleton() { ... },
  _renderChartEmpty() { ... },
  _renderChartError(error) { ... },
};
```

**Gráficos a criar:**
1. **chamados_por_status** (Pie/Donut) - Distribuição de chamados por status
2. **equipamentos_por_categoria** (Bar) - Equipamentos por categoria
3. **equipamentos_por_fornecedor** (Horizontal Bar) - Equipamentos por fornecedor (via auditoria)
4. **equipamentos_manutencao** (Donut) - Equipamentos em manutenção vs disponíveis
5. **evolucao_chamados** (Line) - Evolução de chamados (preparado para histórico futuro)

---

## Arquivos a Modificar

### 1. `dashboard.config.js`

**Adicionar seção de configuração de gráficos:**

```javascript
// ══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO DE GRÁFICOS
// ══════════════════════════════════════════════════════════════════════════

charts: [
  {
    id: 'chamados_por_status',
    titulo: 'Chamados por Status',
    tipo: 'donut', // pie, bar, horizontalBar, donut, line
    source: 'tickets_status', // fonte dos dados
    cores: ['#4f7ef7', '#f59e0b', '#22c55e', '#ff5555', '#6c5ce7'],
    visible: true,
    order: 1,
    clickable: true,
    tab: 'chamados',
  },
  // ... outros gráficos
],

// ══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO DE ANALYTICS
// ══════════════════════════════════════════════════════════════════════════

analytics: {
  enabled: true,
  showPercentages: true,
  showComparisons: true,
  showTrends: false, // Futuro
},

// ══════════════════════════════════════════════════════════════════════════
// API PÚBLICA (adicionar métodos)
// ══════════════════════════════════════════════════════════════════════════

getCharts() { ... },
getChart(id) { ... },
getAnalytics() { ... },
```

### 2. `dashboard.js`

**Adicionar chamada para cálculo de analytics:**

```javascript
// No método load(), após calcular widgets:
this._state.analytics = window.DashboardAnalytics.calculate(this._state.indicators);

// Adicionar getter público:
getAnalytics() {
  return { ...this._state.analytics };
},
```

### 3. `dashboard_ui.js`

**Substituir placeholder de gráficos:**

```javascript
// No método _renderDashboard(), substituir:
html += this._renderChartsPlaceholder();

// Por:
html += this._renderChartsSection();

// Adicionar método:
_renderChartsSection() {
  const config = window.DASHBOARD_CONFIG;
  const analytics = window.Dashboard.getAnalytics();
  const chartConfigs = config.getCharts();

  let html = `
    <div class="dash-section">
      <h2 class="dash-section-title">Visualizações</h2>
      <div class="dash-charts-grid">
  `;

  for (const cc of chartConfigs) {
    html += this._renderChartContainer(cc);
  }

  html += '</div>';

  // Adicionar seção de analytics
  if (config.analytics?.enabled) {
    html += this._renderAnalyticsSection(analytics);
  }

  html += '</div>';
  return html;
},
```

### 4. `index.html`

**Adicionar CDN do Chart.js:**

```html
<!-- Adicionar antes dos scripts -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

<!-- Adicionar novos scripts (após dashboard_ui.js) -->
<script src="javascript/dashboard_analytics.js"></script>
<script src="javascript/dashboard_charts.js"></script>
```

### 5. `dashboard.css`

**Adicionar estilos para gráficos e analytics:**

```css
/* ── Charts Grid ─────────────────────────────────────────── */
.dash-charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

/* ── Chart Card ──────────────────────────────────────────── */
.dash-chart-card {
  background: var(--surface, #1a1d27);
  border: 1px solid var(--border, #2e3347);
  border-radius: 14px;
  padding: 20px;
  transition: all 0.2s ease;
}

.dash-chart-card:hover {
  border-color: var(--accent, #4f7ef7);
}

.dash-chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.dash-chart-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #e8eaf6);
}

.dash-chart-container {
  position: relative;
  height: 250px;
}

/* ── Analytics Grid ──────────────────────────────────────── */
.dash-analytics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}

/* ── Analytics Card ──────────────────────────────────────── */
.dash-analytics-card {
  background: var(--surface, #1a1d27);
  border: 1px solid var(--border, #2e3347);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}

.dash-analytics-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent, #4f7ef7);
}

.dash-analytics-label {
  font-size: 12px;
  color: var(--text2, #9299b8);
  margin-top: 4px;
}

/* ── Chart States ────────────────────────────────────────── */
.dash-chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 250px;
  color: var(--text3, #5a6080);
}

.dash-chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 250px;
  color: var(--text3, #5a6080);
  font-style: italic;
}

.dash-chart-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 250px;
  color: var(--red, #ff5555);
}
```

---

## Configuração dos Gráficos

### 1. Chamados por Status (Donut)

```javascript
{
  id: 'chamados_por_status',
  titulo: 'Chamados por Status',
  tipo: 'donut',
  source: 'tickets_status',
  cores: ['#4f7ef7', '#f59e0b', '#22c55e', '#ff5555', '#6c5ce7'],
  labels: ['Aberto', 'Em Andamento', 'Resolvido', 'Fechado', 'Pendente'],
  visible: true,
  order: 1,
  clickable: true,
  tab: 'chamados',
}
```

### 2. Equipamentos por Categoria (Bar)

```javascript
{
  id: 'equipamentos_por_categoria',
  titulo: 'Equipamentos por Categoria',
  tipo: 'bar',
  source: 'ativos_por_categoria',
  cores: ['#4f7ef7', '#00c896', '#6c5ce7', '#ffc107', '#ff5555'],
  labels: ['Computadores', 'Geekie', 'Apoio', 'Projetores', 'Impressoras'],
  visible: true,
  order: 2,
  clickable: true,
  tab: 'computadores',
}
```

### 3. Equipamentos por Fornecedor (Horizontal Bar)

```javascript
{
  id: 'equipamentos_por_fornecedor',
  titulo: 'Ações por Fornecedor',
  tipo: 'horizontalBar',
  source: 'auditoria_por_fornecedor',
  cores: ['#4f7ef7', '#00c896', '#6c5ce7', '#ffc107', '#ff5555'],
  visible: true,
  order: 3,
  clickable: false,
}
```

### 4. Equipamentos em Manutenção (Donut)

```javascript
{
  id: 'equipamentos_manutencao',
  titulo: 'Status dos Equipamentos',
  tipo: 'donut',
  source: 'status_ativos',
  cores: ['#22c55e', '#f59e0b', '#ff5555'],
  labels: ['Disponível', 'Manutenção', 'Emprestado'],
  visible: true,
  order: 4,
  clickable: false,
}
```

### 5. Evolução de Chamados (Line)

```javascript
{
  id: 'evolucao_chamados',
  titulo: 'Evolução de Chamados',
  tipo: 'line',
  source: 'chamados_historico',
  cores: ['#4f7ef7', '#22c55e'],
  labels: ['Abertos', 'Fechados'],
  visible: true,
  order: 5,
  clickable: false,
  // Dados futuros quando houver histórico
}
```

---

## Analytics a Calcular

### 1. Percentual em Manutenção

```javascript
percentual_manutencao: (indicators.em_manutencao / totalAtivos) * 100
```

### 2. Percentual Disponível

```javascript
percentual_disponivel: (indicators.disponiveis / totalAtivos) * 100
```

### 3. Categoria com Maior Quantidade

```javascript
categoria_maior: {
  nome: 'Computadores',
  quantidade: indicators.computadores,
  percentual: (indicators.computadores / totalAtivos) * 100
}
```

### 4. Fornecedor mais Utilizado

```javascript
fornecedor_mais_utilizado: {
  nome: 'Torino',
  quantidade: 15,
  percentual: (15 / totalAuditorias) * 100
}
```

### 5. Tipo de Chamado Predominante

```javascript
tipo_chamado_predominante: {
  status: 'aberto',
  quantidade: indicators.chamados_abertos,
  percentual: (indicators.chamados_abertos / indicators.total_chamados) * 100
}
```

### 6. Tempo desde Última Atualização

```javascript
tempo_desde_atualizacao: {
  minutos: 5,
  texto: 'Há 5 minutos',
  isStale: false
}
```

---

## Ciclo de Vida de um Gráfico

```
┌─────────────────────────────────────────────────────────────┐
│                    CICLO DE VIDA                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. INICIALIZAÇÃO                                           │
│     DashboardCharts.render()                                │
│         │                                                   │
│         ▼                                                   │
│     Ler configuração de dashboard.config.js                 │
│         │                                                   │
│         ▼                                                   │
│     Criar container HTML para cada gráfico                  │
│         │                                                   │
│         ▼                                                   │
│     Criar instância Chart.js                                │
│         │                                                   │
│         ▼                                                   │
│     Gráfico visível                                         │
│                                                             │
│  2. ATUALIZAÇÃO                                             │
│     Dashboard.recalculate()                                 │
│         │                                                   │
│         ▼                                                   │
│     DashboardAnalytics.calculate()                          │
│         │                                                   │
│         ▼                                                   │
│     DashboardCharts.update()                                │
│         │                                                   │
│         ▼                                                   │
│     Atualizar datasets dos gráficos                         │
│         │                                                   │
│         ▼                                                   │
│     chart.update()                                          │
│                                                             │
│  3. DESTRUIÇÃO                                              │
│     DashboardCharts.destroy()                               │
│         │                                                   │
│         ▼                                                   │
│     Para cada gráfico:                                      │
│         chart.destroy()                                     │
│         │                                                   │
│         ▼                                                   │
│     Remover referências                                     │
│         │                                                   │
│         ▼                                                   │
│     Limpar _charts = {}                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Prevenção de Memory Leak

### 1. Destruir antes de recriar

```javascript
_createChart(chartId, config, data) {
  // Destruir gráfico existente antes de criar novo
  if (this._charts[chartId]) {
    this._charts[chartId].destroy();
    delete this._charts[chartId];
  }

  // Criar novo gráfico
  const ctx = document.getElementById(`chart-${chartId}`);
  if (!ctx) return;

  this._charts[chartId] = new Chart(ctx, {
    type: config.tipo,
    data: data,
    options: this._getChartOptions(config),
  });
}
```

### 2. Destruir ao sair da página

```javascript
_destroyAll() {
  Object.keys(this._charts).forEach(chartId => {
    if (this._charts[chartId]) {
      this._charts[chartId].destroy();
    }
  });
  this._charts = {};
}

// No dashboard_ui.js
_bindEvents() {
  // ... eventos existentes ...

  // Destruir gráficos ao sair da página
  window.addEventListener('beforeunload', () => {
    window.DashboardCharts.destroy();
  });
}
```

### 3. Usar WeakMap (opcional)

```javascript
_charts: new WeakMap(),
```

### 4. Remover event listeners

```javascript
_destroyChart(chartId) {
  if (this._charts[chartId]) {
    this._charts[chartId].destroy();
    delete this._charts[chartId];
  }

  // Remover event listeners se houver
  const container = document.getElementById(`chart-container-${chartId}`);
  if (container) {
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);
  }
}
```

---

## Estados dos Gráficos

### 1. Loading

```javascript
_renderChartSkeleton() {
  return `
    <div class="dash-chart-loading">
      <div class="dash-skeleton-icon"></div>
      <span>Carregando gráfico...</span>
    </div>
  `;
}
```

### 2. Empty

```javascript
_renderChartEmpty() {
  return `
    <div class="dash-chart-empty">
      <span>Nenhum dado disponível</span>
    </div>
  `;
}
```

### 3. Error

```javascript
_renderChartError(error) {
  return `
    <div class="dash-chart-error">
      <span class="dash-error-icon">&#9888;</span>
      <span>Erro ao carregar gráfico</span>
      <span>${error}</span>
    </div>
  `;
}
```

### 4. Success

```javascript
// O gráfico é renderizado via Chart.js no canvas
```

---

## Interações com Gráficos

### Clique no Gráfico

```javascript
// Em dashboard_charts.js
_bindChartEvents() {
  Object.keys(this._charts).forEach(chartId => {
    const chart = this._charts[chartId];
    const config = window.DASHBOARD_CONFIG.getChart(chartId);

    if (config?.clickable && config?.tab) {
      chart.options.onClick = (event, elements) => {
        if (elements.length > 0 && window.App?.go) {
          window.App.go(config.tab);
        }
      };

      // Cursor pointer
      chart.options.onHover = (event, elements) => {
        const canvas = event.native?.target;
        if (canvas) {
          canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        }
      };
    }
  });
}
```

---

## Responsividade dos Gráficos

### Configurações por Breakpoint

```javascript
_getChartOptions(config) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: config.tipo !== 'bar',
        position: 'bottom',
        labels: {
          color: '#9299b8',
          font: { size: 12 },
        },
      },
      title: {
        display: false,
      },
    },
    scales: config.tipo === 'bar' || config.tipo === 'horizontalBar' ? {
      x: {
        ticks: { color: '#9299b8' },
        grid: { color: '#2e3347' },
      },
      y: {
        ticks: { color: '#9299b8' },
        grid: { color: '#2e3347' },
      },
    } : undefined,
  };
}
```

### CSS Responsivo

```css
@media (max-width: 768px) {
  .dash-charts-grid {
    grid-template-columns: 1fr;
  }

  .dash-chart-container {
    height: 200px;
  }

  .dash-analytics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .dash-analytics-grid {
    grid-template-columns: 1fr;
  }
}
```

---

## Ordem de Implementação

### Fase 1: Infraestrutura
1. Criar `dashboard_analytics.js` com cálculos básicos
2. Criar `dashboard_charts.js` com gerenciamento de ciclo de vida
3. Adicionar configuração de gráficos em `dashboard.config.js`
4. Atualizar `dashboard.js` para incluir analytics
5. Atualizar `index.html` para incluir Chart.js CDN e novos scripts

### Fase 2: Gráficos
6. Implementar gráfico "Chamados por Status" (Donut)
7. Implementar gráfico "Equipamentos por Categoria" (Bar)
8. Implementar gráfico "Equipamentos em Manutenção" (Donut)
9. Implementar gráfico "Ações por Fornecedor" (Horizontal Bar)
10. Implementar gráfico "Evolução de Chamados" (Line - placeholder)

### Fase 3: Analytics
11. Implementar cálculo de percentuais
12. Implementar cálculo de categorias
13. Implementar cálculo de fornecedores
14. Implementar cálculo de tempo

### Fase 4: UI
15. Atualizar `dashboard_ui.js` para renderizar gráficos
16. Adicionar seção de analytics na UI
17. Adicionar estados loading/empty/error
18. Adicionar interações de clique

### Fase 5: Estilo
19. Atualizar `dashboard.css` com estilos de gráficos
20. Adicionar responsividade
21. Adicionar acessibilidade

### Fase 6: Testes
22. Testar todos os gráficos
23. Testar atualização automática
24. Testar responsividade
25. Testar memory leak
26. Testar acessibilidade

---

## Dependências Externas

### Chart.js

- **Versão:** 4.4.0
- **CDN:** `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`
- **Tipo:** UMD (funciona com script tag)

---

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Chart.js não carregar | Alto | Fallback para placeholder |
| Dados não disponíveis | Médio | Estados empty/loading |
| Memory leak | Alto | Destruir gráficos corretamente |
| Performance | Médio | Usar debounced updates |
| Acessibilidade | Baixo | Fornecer alternativa textual |

---

## Critérios de Aceitação

- [x] Dashboard continua desacoplado
- [x] dashboard.js sem gráficos
- [x] dashboard_charts.js sem regras
- [x] dashboard_analytics.js sem HTML
- [x] Configuração centralizada
- [x] Gráficos responsivos
- [x] Atualização automática
- [x] Estados Loading/Empty/Error
- [x] Sem vazamento de memória
- [x] Fácil adicionar novos gráficos

---

## Próximos Passos

1. Criar arquivos na ordem definida
2. Implementar cada funcionalidade
3. Testar individualmente
4. Integrar com o sistema existente
5. Documentar tudo
6. Gerar commit