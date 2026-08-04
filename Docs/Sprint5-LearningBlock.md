# Sprint 5 — Bloco de Aprendizado

## 1. Por que separar dashboard.js e dashboard_ui.js?

A separação entre `dashboard.js` (lógica de dados) e `dashboard_ui.js` (renderização) é uma aplicação do princípio **Separation of Concerns** (Separação de Responsabilidades).

### Benefícios:

1. **Manutenção Independente:** Alterar a lógica de cálculo não quebra a renderização e vice-versa.

2. **Testabilidade:** `dashboard.js` pode ser testado isoladamente com dados mockados, sem precisar renderizar HTML.

3. **Reutilização:** A mesma lógica de dados pode alimentar diferentes interfaces (web, mobile, API).

4. **Performance:** Atualizações parciais da UI não recalculam dados desnecessariamente.

5. **Colaboração:** Um desenvolvedor pode trabalhar na lógica enquanto outro trabalha na UI.

### Exemplo Prático:

```javascript
// dashboard.js - Lógica (SEM HTML)
_calculateIndicators() {
  const indicators = {};
  indicators.computadores = this._countArray(D.computadores);
  return indicators;
}

// dashboard_ui.js - Renderização (SEM lógica de negócio)
_renderCard(card, value) {
  return `<div class="dash-card">${value}</div>`;
}
```

### Analogia:

- **dashboard.js** = Cozinha (prepara os ingredientes)
- **dashboard_ui.js** = Garçom (apresenta o prato ao cliente)
- **dashboard.config.js** = Cardápio (define o que será servido)

---

## 2. O que caracteriza um Dashboard desacoplado?

Um Dashboard desacoplado possui as seguintes características:

### 2.1 Separação Clara de Responsabilidades

| Camada | Responsabilidade | NÃO faz |
|--------|------------------|---------|
| Config | Define comportamento visual | Não calcula dados |
| Data | Calcula indicadores | Não renderiza HTML |
| UI | Renderiza interface | Não aplica regras de negócio |

### 2.2 Comunicação Via Eventos

```javascript
// Em vez de chamadas diretas:
Dashboard.load() → DashboardUI.render() // ERRADO

// Usa eventos:
Dashboard._emit('dashboard:loaded', data) // CERTO
document.addEventListener('dashboard:loaded', () => { ... })
```

### 2.3 Configuração Centralizada

```javascript
// dashboard.config.js
cards: [
  { id: 'computadores', label: 'Computadores', ... }
]

// Para adicionar um card: APENAS alterar o config
// NÃO modificar dashboard.js ou dashboard_ui.js
```

### 2.4 Interface Limpa

```javascript
// dashboard.js expõe apenas:
Dashboard.load()
Dashboard.getIndicators()
Dashboard.getWidgets()

// Internamente pode mudar completamente
// sem afetar quem consome a API
```

### 2.5 Testabilidade

```javascript
// Teste unitário de dashboard.js
const indicators = Dashboard._calculateIndicators();
expect(indicators.computadores).toBe(42);

// Teste unitário de dashboard_ui.js
const html = DashboardUI._renderCard(card, 42);
expect(html).toContain('42');
```

---

## 3. Como sistemas como GLPI, Grafana, Jira e Zabbix organizam dashboards?

### GLPI

- **Arquitetura:** Plugins de dashboard
- **Configuração:** Via interface administrativa
- **Dados:** Queries SQL diretas
- **Gráficos:** Chart.js via plugin
- **Personalização:** Arrastar e soltar widgets

### Grafana

- **Arquitetura:** Data sources + Panels + Dashboards
- **Configuração:** JSON models
- **Dados:** Queries via data sources (Prometheus, InfluxDB, etc.)
- **Gráficos:** Bibliotecas built-in (Graph, Stat, Table)
- **Personalização:** Variáveis, templating, links

### Jira

- **Arquitetura:** Gadgets + Dashboards
- **Configuração:** Via interface (drag-and-drop)
- **Dados:** JQL queries
- **Gráficos:** Gadgets pré-definidos
- **Personalização:** Filtros, colunas, periodos

### Zabbix

- **Arquitetura:** Screens + Widgets
- **Configuração:** Via interface web
- **Dados:** Items, triggers, macros
- **Gráficos:** Built-in (Graph, Pie, Bar)
- **Personalização:** Layout, widgets, filters

### Padrões Comuns

1. **Configuration Driven:** Todos usam configuração centralizada
2. **Widget-based:** Dashboard = coleção de widgets
3. **Data Sources:** Dados vêm de fontes configuráveis
4. **Real-time:** Atualização automática dos dados
5. **Personalização:** Usuário pode configurar layout

### Lições para o GCC

- Manter configuração centralizada (dashboard.config.js)
- Usar padrão Widget-based (cards + widgets)
- Suportar múltiplas fontes de dados
- Implementar auto-refresh
- Permitir personalização futura

---

## 4. Como adicionar novos cards sem alterar código existente?

### Processo Passo a Passo

1. **Abra `dashboard.config.js`**

2. **Adicione um novo objeto no array `cards`:**

```javascript
{
  id: 'novo_ativo',
  label: 'Novo Ativo',
  icon: '&#128XXX;',
  color: '#XXXXXX',
  description: 'Descrição do novo ativo',
  source: 'novo_ativo',
  order: 11,
  group: 'ativos',
  tab: 'aba_destino',
  clickable: true,
}
```

3. **Adicione a lógica de cálculo em `dashboard.js`:**

```javascript
// No método _calculateIndicators()
indicators.novo_ativo = this._countArray(D.novo_ativo);
```

4. **Adicione a fonte de dados em `data.js` (se necessário):**

```javascript
window.DATA.novo_ativo = [];
```

5. **Adicione o endpoint no backend (se necessário)**

6. **Pronto!** O card aparece automaticamente no dashboard

### Por que funciona?

- `dashboard.config.js` define OS CARDS
- `dashboard.js` calcula OS VALORES
- `dashboard_ui.js` renderiza OS ELEMENTOS

Nenhum dos três precisa saber do conteúdo dos outros.

### Exemplo Real:

```javascript
// Para adicionar card "Tablets"
// 1. dashboard.config.js
{ id: 'tablets', label: 'Tablets', icon: '&#128241;', ... }

// 2. dashboard.js
indicators.tablets = this._countArray(D.tablets);

// 3. data.js
window.DATA.tablets = [];

// 4. glpi.client.js
async fetchTablets() {
  const json = await this._fetch('/api/assets/tablets');
  return json.data ?? [];
}
```

---

## 5. Como evitar que o Dashboard vire um arquivo gigante?

### 5.1 Separação em Módulos

```
dashboard/
├── config.js      (configuração)
├── data.js        (lógica de dados)
├── ui.js          (renderização)
├── events.js      (eventos - futuro)
├── charts.js      (gráficos - futuro)
└── exports.js     (exportação - futuro)
```

### 5.2 Princípio de Responsabilidade Única

Cada arquivo deve ter UMA responsabilidade:

- `config.js` → Definir comportamento
- `data.js` → Calcular valores
- `ui.js` → Renderizar HTML

### 5.3 Composição em Vez de Herança

```javascript
// RUIM: Tudo em um arquivo
window.Dashboard = {
  config: {...},
  calculate() {...},
  render() {...},
  bindEvents() {...},
  // 500+ linhas
};

// BOM: Separação em módulos
window.DashboardConfig = {...};
window.Dashboard = { calculate() {...} };
window.DashboardUI = { render() {...} };
```

### 5.4 Extrair Funções Genéricas

```javascript
// utils.js
window.Utils = {
  escapeHtml(text) {...},
  formatNumber(num) {...},
  formatDate(iso) {...},
};

// Usar em qualquer lugar
Utils.escapeHtml('texto');
```

### 5.5 Limitar Tamanho dos Arquivos

- **Regra:** Nenhum arquivo deve ter mais de 300 linhas
- **Se passar:** Extrair para novo módulo
- **Exemplo:** `_renderPieChart()` poderia ser `charts.js`

### 5.6 Code Review Regular

- Revisar tamanho dos arquivos periodicamente
- Identificar código duplicado
- Extrair para módulos quando necessário

---

## 6. Quais Design Patterns estão sendo utilizados?

### 1. Configuration Driven Design

**Onde:** `dashboard.config.js`

**Como:** Todo comportamento visual é definido em configuração.

```javascript
// Config define o quê exibir
cards: [
  { id: 'computadores', label: 'Computadores', ... }
]

// UI apenas renderiza
_renderCard(card, value) {
  return `<div>${card.label}: ${value}</div>`;
}
```

### 2. Observer Pattern

**Onde:** Sistema de eventos via `CustomEvent`

**Como:** Módulos se comunicam via eventos, não chamadas diretas.

```javascript
// Emissor
_emit('dashboard:loaded', { indicators });

// Observador
document.addEventListener('dashboard:loaded', (e) => {
  this.render(e.detail);
});
```

### 3. State Management

**Onde:** `Dashboard._state`

**Como:** Estado centralizado com getters/setters.

```javascript
_state: {
  loaded: false,
  indicators: {},
  widgets: {},
}

getState() {
  return { ...this._state };
}
```

### 4. Factory Pattern

**Onde:** `_renderCard()`, `_renderWidget()`

**Como:** Métodos que criam elementos HTML baseados em configuração.

```javascript
_renderCard(card, value) {
  // Factory que cria HTML baseado em config
  return `<div class="dash-card">...</div>`;
}
```

### 5. Template Method

**Onde:** `DashboardUI.render()`

**Como:** Define fluxo geral, delega detalhes para métodos auxiliares.

```javascript
render() {
  // Template Method
  if (loading) return this._renderLoading();
  if (error) return this._renderError();
  return this._renderDashboard(); // delega
}
```

### 6. Single Source of Truth

**Onde:** `Dashboard._state`

**Como:** Um único lugar para todo o estado do dashboard.

```javascript
// Estado está APENAS em _state
// NÃO em variáveis globais
// NÃO em closure
// NÃO no DOM
```

### 7. Separation of Concerns

**Onde:** 3 arquivos principais

**Como:** Cada arquivo tem responsabilidade única.

| Arquivo | Responsabilidade |
|---------|------------------|
| config.js | O QUÊ exibir |
| data.js | QUAIS valores |
| ui.js | COMO renderizar |

### 8. Graceful Degradation

**Onde:** Tratamento de erros

**Como:** Dashboard funciona mesmo quando endpoints falham.

```javascript
// Se tickets falharem, outros cards continuam
try {
  const tickets = await GlpiClient.fetchTickets();
} catch {
  // Tickets podem falhar — não é crítico
}
```

---

## 7. Como essa arquitetura facilitará as próximas Sprints?

### Sprint 5.5 — Gráficos

**Facilidade:** Basta adicionar `charts.js` e importar biblioteca.

```javascript
// dashboard_ui.js
_renderChartsPlaceholder() {
  // Substituir por:
  return Charts.renderBarChart(indicators);
}
```

**Não precisa modificar:**
- dashboard.config.js ✓
- dashboard.js ✓
- dashboard_ui.js (apenas substituir placeholder) ✓

### Sprint 6 — Relatórios

**Facilidade:** Dados já estão estruturados para exportação.

```javascript
// Novo arquivo: reports.js
window.Reports = {
  exportCSV(indicators) {
    // Usar dados de Dashboard.getIndicators()
  },
  exportPDF(widgets) {
    // Usar dados de Dashboard.getWidgets()
  }
};
```

**Não precisa modificar:**
- dashboard.config.js ✓
- dashboard.js ✓
- dashboard_ui.js ✓

### Sprint 7 — Analytics

**Facilidade:** Indicadores podem ser expandidos facilmente.

```javascript
// dashboard.config.js
cards: [
  ...cards,
  { id: 'media_resolucao', label: 'Média de Resolução', ... }
]

// dashboard.js
indicators.media_resolucao = this._calculateAvgResolution(tickets);
```

**Não precisa modificar:**
- dashboard_ui.js ✓ (renderiza qualquer card automaticamente)

### Sprint 8 — Dashboard Administrativo

**Facilidade:** Arquitetura pode ser replicada.

```javascript
// admin-dashboard.config.js
window.ADMIN_DASHBOARD_CONFIG = {
  cards: [
    { id: 'usuarios', label: 'Usuários', ... },
    { id: 'permissões', label: 'Permissões', ... },
  ]
};

// admin-dashboard.js (pode reutilizar lógica)
window.AdminDashboard = { ...window.Dashboard };
```

### Resumo de Benefícios

| Sprint | O que muda | O que NÃO muda |
|--------|------------|----------------|
| 5.5 Gráficos | Adiciona charts.js | config, data, ui |
| 6 Relatórios | Adiciona reports.js | config, data, ui |
| 7 Analytics | Expande config e data | ui |
| 8 Admin | Replica arquitetura | Nada |

---

## Conclusão

A arquitetura do Dashboard Operacional do GLPI Control Center segue padrões industriais de software engineering:

1. **Configuration Driven Design** — Facilita manutenção
2. **Separation of Concerns** — Reduz complexidade
3. **Observer Pattern** — Permite extensão
4. **State Management** — Garante consistência

Essa arquitetura garante que o dashboard possa crescer sem precisar ser reescrito, seguindo o princípio **Open/Closed Principle** (aberto para extensão, fechado para modificação).