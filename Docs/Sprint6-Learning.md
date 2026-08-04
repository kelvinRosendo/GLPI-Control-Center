# Sprint 6 — Bloco de Aprendizado

## Técnicas Utilizadas

### 1. Configuration Driven Design (CDD)

**Conceito:** Toda a configuração de gráficos vive em `dashboard.config.js`, não no código.

**Benefício:** Adicionar um novo gráfico requer apenas adicionar um objeto no array `charts`.

**Exemplo:**
```javascript
// dashboard.config.js
charts: [
  {
    id: 'novo_grafico',
    titulo: 'Título',
    tipo: 'bar',
    source: 'chart_novo_grafico',
    cores: ['#4f7ef7'],
    visible: true,
    order: 6,
    clickable: true,
    tab: 'aba_destino',
  }
]
```

**Aprendizado:** CDD facilita manutenção e permite que não-programadores configurem o dashboard.

---

### 2. Separation of Concerns (SoC)

**Conceito:** Cada módulo tem uma responsabilidade única.

**Módulos e responsabilidades:**
- `dashboard.config.js` — Configuração
- `dashboard.js` — Lógica de negócio
- `dashboard_analytics.js` — Cálculos derivados
- `dashboard_charts.js` — Renderização de gráficos
- `dashboard_ui.js` — Renderização de interface

**Benefício:** Mudanças em um módulo não afetam outros.

**Exemplo:** Para mudar o cálculo de percentual, altera-se apenas `dashboard_analytics.js`.

---

### 3. Observer Pattern (Eventos)

**Conceito:** Módulos se comunicam via eventos customizados.

**Eventos implementados:**
- `dashboard:loaded` — Dados carregados
- `dashboard:recalculated` — Dados recalculados
- `dashboard:stale` — Dados desatualizados

**Fluxo:**
```
dashboard.js dispara evento
    │
    ▼
dashboard_ui.js escuta evento
    │
    ▼
Executa ação (renderizar gráficos)
```

**Benefício:** Módulos não precisam conhecer uns aos outros.

---

### 4. State Management Centralizado

**Conceito:** Todo o estado vive em `Dashboard._state`.

**Estado adicionado na Sprint 6:**
```javascript
_state: {
  // ... Sprint 5
  analytics: {}, // Sprint 6
}
```

**Benefício:** Estado previsível e fácil de debugar.

---

### 5. Factory Pattern (Criação de Gráficos)

**Conceito:** `DashboardCharts._renderChart()` cria gráficos baseado em configuração.

**Fluxo:**
```
chartConfig.tipo → _getChartType()
chartConfig.source → _getChartData()
chartConfig → _getChartOptions()
    │
    ▼
new Chart(ctx, { type, data, options })
```

**Benefício:** Adicionar novo tipo de gráfico requer apenas nova lógica em `_getChartType()`.

---

### 6. Template Method (Fluxo Render)

**Conceito:** `DashboardCharts.render()` define fluxo geral, delegando etapas para métodos auxiliares.

**Fluxo:**
```javascript
render() {
  this._getChartConfigs()     // 1. Obter configurações
  this._validate()             // 2. Validar
  this._renderChart()          // 3. Renderizar cada gráfico
}
```

**Benefício:** Fluxo consistente e fácil de testar.

---

### 7. Memory Leak Prevention

**Conceito:** Destruir instâncias Chart.js antes de recriar.

**Técnicas:**
1. Destruir antes de recriar
2. Destruir ao sair da página (`beforeunload`)
3. Limpar referências (`delete this._charts[id]`)

**Exemplo:**
```javascript
_renderChart(chartConfig) {
  this._destroyChart(chartConfig.id); // Destruir existente
  this._charts[chartConfig.id] = new Chart(...); // Criar novo
}

window.addEventListener('beforeunload', () => {
  window.DashboardCharts.destroy(); // Destruir todos
});
```

**Importância:** Chart.js mantém referências em memória. Sem destruir, o browser consome mais RAM.

---

## Padrões de Código

### 1. Validação de Dados

```javascript
// Sempre validar antes de usar
if (!data || !Array.isArray(data) || data.length === 0) {
  return this._getEmptyData();
}
```

### 2. Fallbacks

```javascript
// Fallback para dados ausentes
const value = data?.propriedade ?? 'valor_padrao';
```

### 3. Funções Pequenas

```javascript
// Funções com uma responsabilidade
_getChartType(chartConfig) { ... }
_getChartData(chartConfig) { ... }
_getChartOptions(chartConfig) { ... }
```

### 4. Nomenclatura Consistente

```javascript
// Prefixos para indicar tipo
_render*()     // Funções de renderização
_get*()        // Funções de obtenção de dados
_calculate*()  // Funções de cálculo
_is*()         // Funções de verificação (boolean)
```

---

## Erros Comuns Evitados

### 1. Lógica de Negócio na UI

**Errado:**
```javascript
// dashboard_ui.js
const percentual = (manutencao / total) * 100; // ❌ Lógica na UI
```

**Correto:**
```javascript
// dashboard_analytics.js
_calculatePercentual(total, manutencao) {
  return (manutencao / total) * 100;
}

// dashboard_ui.js
const percentual = analytics.percentual_manutencao; // ✅ UI apenas exibe
```

### 2. HTML em Módulos de Dados

**Errado:**
```javascript
// dashboard_analytics.js
return `<div>${value}</div>`; // ❌ HTML em módulo de dados
```

**Correto:**
```javascript
// dashboard_analytics.js
return { valor: value, label: 'Total' }; // ✅ Dados puros

// dashboard_ui.js
return `<div>${data.valor}</div>`; // ✅ HTML na UI
```

### 3. Configuração Hardcoded

**Errado:**
```javascript
// dashboard_charts.js
const colors = ['#4f7ef7', '#22c55e']; // ❌ Cores hardcoded
```

**Correto:**
```javascript
// dashboard_charts.js
const colors = chartConfig.cores; // ✅ Cores da configuração
```

---

## Ferramentas Utilizadas

### 1. Chart.js v4.4.0

**Por que:** Biblioteca madura, boa documentação, suporte a múltiplos tipos.

**Uso:** Apenas em `dashboard_charts.js`, desacoplado do resto.

### 2. Eventos Customizados

**Por que:** Comunicação desacoplada entre módulos.

**Uso:** `dashboard:loaded`, `dashboard:recalculated`.

### 3. CSS Grid

**Por que:** Layout responsivo sem media queries complexas.

**Uso:** `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`.

---

## Métricas de Qualidade

### 1. Separação de Responsabilidades

- `dashboard.config.js` — 100% configuração
- `dashboard.js` — 0% HTML
- `dashboard_analytics.js` — 0% HTML
- `dashboard_charts.js` — 0% regras de negócio
- `dashboard_ui.js` — 0% lógica de negócio

### 2. Facilidade de Manutenção

Para adicionar um novo gráfico:
1. Adicionar config em `dashboard.config.js` (1 linha)
2. Adicionar dados em `dashboard_analytics.js` (1 função)
3. Pronto! Gráfico aparece automaticamente

### 3. Performance

- Gráficos destruídos antes de recriar
- Atualização seletiva (apenas dados)
- `prefers-reduced-motion` respeitado

---

## Referências

- [Chart.js Documentation](https://www.chartjs.org/docs/latest/)
- [Configuration Driven Design](https://martinfowler.com/articles/replace-control-with-strategy.html)
- [Observer Pattern](https://refactoring.guru/design-patterns/observer)
- [State Management](https://redux.js.org/understanding/thinking-in-redux/glossary)

---

## Próximos Aprendizados

### Sprint 7 — Relatórios
- Geração de PDF no browser
- Exportação Excel
- Relatórios personalizados

### Sprint 8 — Analytics Avançado
- Tendências temporais
- Comparativos
- Previsões simples