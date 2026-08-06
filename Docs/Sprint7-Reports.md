# Sprint 7 — Central de Relatórios

## Resumo da Sprint

A Sprint 7 implementou uma **Central de Relatórios** totalmente desacoplada, capaz de gerar informações gerenciais a partir dos dados já existentes no GLPI Control Center. A arquitetura segue o padrão Configuration Driven Design, permitindo adicionar novos relatórios apenas editando `reports.config.js`.

---

## Arquivos Criados

| Arquivo | Linhas | Responsabilidade |
|---------|--------|------------------|
| `Frontend/javascript/reports.config.js` | 396 | Configuração centralizada de relatórios, filtros, exportadores |
| `Frontend/javascript/reports.js` | 564 | Lógica de dados, filtros, agrupamento, cache |
| `Frontend/javascript/report_export.js` | 397 | Exportação CSV (implementado), estrutura PDF/Excel/JSON |
| `Frontend/javascript/reports_ui.js` | 833 | Renderização da interface, preview, eventos |
| `Frontend/css/reports.css` | 901 | Estilos completos do módulo |

**Total: 3.091 linhas de código novo**

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `Frontend/index.html` | Adicionado CSS + 4 scripts do módulo |
| `Frontend/javascript/ui_render.js` | Adicionada aba "Relatórios" na navegação |
| `Frontend/javascript/app.js` | Adicionado case 'relatorios' no routing |

---

## Arquitetura Implementada

```
┌─────────────────────────────────────────────────────────────┐
│                    reports.config.js                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Catálogo    │  │   Filtros    │  │   Exportadores   │   │
│  │  de 8        │  │   6 tipos    │  │   CSV (ativo)    │   │
│  │  relatórios  │  │              │  │   PDF/Excel/JSON │   │
│  └─────────────┘  └──────────────┘  │   (preparados)   │   │
│                                      └──────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ consome
┌──────────────────────────▼──────────────────────────────────┐
│                      reports.js                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ _ensureData  │  │ _applyFilters│  │ _groupData       │  │
│  │ _getRawData  │  │ _applyDate   │  │ _prepareRows     │  │
│  │ loadReport() │  │ _collectFilt │  │ Cache interno    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ dados processados
┌──────────────────────────▼──────────────────────────────────┐
│                   report_export.js                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ _exportCSV   │  │ _exportExcel │  │ _exportPDF       │  │
│  │ (implementado│  │ (preparado)  │  │ (preparado)      │  │
│  │  RFC 4180)   │  │ SheetJS      │  │ jsPDF            │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ download
┌──────────────────────────▼──────────────────────────────────┐
│                     reports_ui.js                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ renderList() │  │ renderReport │  │ renderPreview()  │  │
│  │ Cards        │  │ Filtros      │  │ Tabela           │  │
│  │ Busca        │  │ Summary      │  │ Export bar       │  │
│  │ Categorias   │  │ Export bar   │  │ Progress bar     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Tipos de Relatórios Implementados

| # | ID | Título | Categoria | Tipo | Status |
|---|-----|--------|-----------|------|--------|
| 1 | `inventario_geral` | Inventário Geral | Inventário | assets | Implementado |
| 2 | `equipamentos_por_categoria` | Equipamentos por Categoria | Inventário | assets_grouped | Implementado |
| 3 | `equipamentos_por_fornecedor` | Equipamentos por Fornecedor | Inventário | assets_grouped | Implementado |
| 4 | `equipamentos_manutencao` | Equipamentos em Manutenção | Inventário | assets (filtro fixo) | Implementado |
| 5 | `chamados_geral` | Chamados | Chamados | tickets | Implementado |
| 6 | `chamados_por_status` | Chamados por Status | Chamados | tickets_grouped | Implementado |
| 7 | `chamados_por_periodo` | Chamados por Período | Chamados | tickets | Implementado |
| 8 | `integracoes_utilizadas` | Integrações Utilizadas | Integrações | audit | Implementado |

---

## Filtros Reutilizáveis

| Filtro | Tipo | Uso |
|--------|------|-----|
| `categoria` | select | Filtrar por tipo de equipamento |
| `fornecedor` | select | Filtrar por fornecedor (Torino, HBB, etc) |
| `status` | select | Filtrar por status (ativo/manutenção/emprestado ou aberto/fechado) |
| `periodo` | date_range | Filtrar por período de abertura |
| `responsavel` | text | Filtrar por responsável |
| `texto_livre` | text | Busca livre em todos os campos de texto |

---

## Fluxo de Uso

```
1. Usuário clica na aba "Relatórios"
       ↓
2. Lista de relatórios com busca e categorias
       ↓
3. Usuário seleciona um relatório
       ↓
4. Painel de filtros reutilizáveis
       ↓
5. Usuário aplica filtros e clica "Buscar"
       ↓
6. Preview: estatísticas + colunas + tabela
       ↓
7. Usuário clica "Exportar CSV"
       ↓
8. Download do arquivo .csv com BOM UTF-8
```

---

## Design Patterns Utilizados

### 1. Configuration Driven Design
Todo o comportamento do módulo é definido em `reports.config.js`. Novos relatórios são adicionados apenas editando este arquivo, sem modificar nenhum outro módulo.

### 2. Separation of Concerns (SRP)
- **reports.config.js** = configuração (O QUE existe)
- **reports.js** = lógica de dados (COMO processar)
- **report_export.js** = exportação (COMO exportar)
- **reports_ui.js** = interface (COMO mostrar)
- **reports.css** = aparência (COMO parecer)

### 3. Observer Pattern (CustomEvents)
Módulos se comunicam via `document.dispatchEvent(new CustomEvent(...))`:
- `reports:loaded` — dados processados
- `reports:error` — erro no processamento
- `export:start` — exportação iniciada
- `export:progress` — progresso da exportação
- `export:complete` — exportação concluída
- `export:error` — erro na exportação

### 4. Cache Pattern
Cache interno com TTL configurável (5 min default):
- `_cache.filterResults[hash]` — resultados por combinação de filtros
- Limpeza automática quando excede `maxCacheSize`
- Chave de cache = `reportId:JSON.stringify(filters)`

### 5. Strategy Pattern
Cada tipo de relatório (`assets`, `assets_grouped`, `tickets`, `tickets_grouped`, `audit`) tem sua própria estratégia de processamento em `reports.js`.

### 6. Template Method
O fluxo `loadReport()` define o passo a passo: ensureData → getRawData → applyFilters → groupData/prepareRows → cache → emit.

---

## Reutilização das Sprints Anteriores

### Sprint 5 (Dashboard)
- **GlpiClient.loadAll()** — reutilizado para carregar ativos
- **IntegrationAudit.getAll()** — reutilizado para dados de integrações
- **Design tokens CSS** — mesmas variáveis `--bg`, `--surface`, `--accent`, etc
- **Padrão Configuration Driven** — mesmo padrão do `dashboard.config.js`

### Sprint 6 (Analytics + Charts)
- **Event-driven architecture** — mesmos CustomEvents
- **Cache com TTL** — padrão similar ao dashboard
- **Estados Loading/Empty/Error** — mesmos padrões visuais
- **Auto-refresh pattern** — preparado para reutilizar

---

## Como Adicionar um Novo Relatório

1. Abra `reports.config.js`
2. Adicione um objeto no array `reports`:

```javascript
{
  id: 'meu_novo_relatorio',
  titulo: 'Meu Novo Relatório',
  descricao: 'Descrição do relatório.',
  icone: '&#128200;',
  categoria: 'inventario',  // ou 'chamados', 'integracoes'
  endpoint: 'inventario',   // 'inventario', 'chamados', 'integracoes'
  tipo: 'assets',           // 'assets', 'assets_grouped', 'tickets', 'tickets_grouped', 'audit'
  campos: [
    { key: 'nome', label: 'Nome', tipo: 'texto' },
    { key: 'status', label: 'Status', tipo: 'status' },
  ],
  filtros: ['categoria', 'status', 'texto_livre'],
  exportadores: ['csv'],
  visible: true,
  order: 9,
}
```

3. Salve — o relatório aparece automaticamente na interface.

---

## Preparação para Funcionalidades Futuras

### PDF (Sprint futura)
- Estrutura preparada em `report_export.js._exportPDF()`
- Comentários com código de referência usando jsPDF + jsPDF-AutoTable
- Basta descomentar e ajustar a implementação

### Excel (Sprint futura)
- Estrutura preparada em `report_export.js._exportExcel()`
- Comentários com código de referência usando SheetJS (xlsx)
- Suporte a múltiplas worksheets e formatação

### JSON (Sprint futura)
- Estrutura preparada em `report_export.js._exportJSON()`
- Payload com `meta` (metadados) + `data` (dados)

### Agendamento Automático
- A arquitetura permite adicionar um `scheduler` que chama `Reports.loadReport()` em intervalos
- Os eventos CustomEvents podem ser monitorados por um módulo de notificações

### Compartilhamento por Link
- Os filtros já são serializáveis via `JSON.stringify()`
- Podem ser codificados em URL params: `?report=chamados&status=aberto`

### Templates de Relatórios
- A configuração já suporta `filtros` por relatório
- Um módulo futuro pode salvar combinações de filtros como "templates"

---

## Checklist de Testes

### Visuais
- [x] ABA "Relatórios" aparece na navegação
- [x] Lista mostra todos os 8 relatórios
- [x] Cards com ícone, título, descrição, campos, exportadores
- [x] Busca filtra relatórios por título/descrição
- [x] Categorias filtram corretamente
- [x] Layout responsivo em mobile (480px, 768px)

### Funcionais
- [x] Clicar em relatório abre view de filtros
- [x] Todos os filtros renderizam corretamente
- [x] Filtro de período mostra dois campos de data
- [x] Botão "Buscar" aplica filtros
- [x] Botão "Limpar" reseta filtros
- [x] Preview mostra tabela com dados
- [x] Preview mostra estatísticas (total, filtrados, colunas)
- [x] Botão "Exportar CSV" gera download
- [x] CSV abre corretamente no Excel (com BOM UTF-8)
- [x] Botão "Voltar" retorna à lista
- [x] Empty state aparece quando não há dados
- [x] Loading spinner aparece durante processamento

### Acessibilidade
- [x] `tabindex="0"` nos cards
- [x] `role="button"` nos cards clicáveis
- [x] `aria-label` em botões e campos
- [x] `aria-pressed` nos botões de categoria
- [x] Navegação por teclado (Enter/Space)
- [x] `prefers-reduced-motion` suportado
- [x] Focus visible nos botões e cards

### Performance
- [x] Cache interno funciona (5 min TTL)
- [x] Dados não são rebuscados repetidamente
- [x] Preview limitado a 100 registros
- [x] Debounce preparado para filtros de texto

---

## Mensagem de Commit

```
feat(reports): Sprint 7 - Central de Relatórios

Implementa módulo completo de relatórios com:
- reports.config.js: configuração centralizada (8 relatórios)
- reports.js: lógica de dados, filtros, agrupamento, cache
- report_export.js: exportação CSV (RFC 4180) + estrutura PDF/Excel/JSON
- reports_ui.js: interface com lista, filtros, preview, exportação
- reports.css: estilos responsivos com acessibilidade

Relatórios implementados:
- Inventário Geral, por Categoria, por Fornecedor, em Manutenção
- Chamados, por Status, por Período
- Integrações Utilizadas

Filtros reutilizáveis: categoria, fornecedor, status, período, responsável, texto livre
Interface: cards, busca, categorias, preview com tabela, barra de progresso
Acessibilidade: keyboard nav, aria labels, reduced motion
```

---

## Melhorias Sugeridas para Sprint 7.5

1. **Exportação Excel** — Implementar com SheetJS (lib já preparada)
2. **Exportação PDF** — Implementar com jsPDF + AutoTable
3. **Exportação JSON** — Implementar com estrutura meta+data
4. **Filtros salvos** — Permitir salvar combinações de filtros como "favoritos"
5. **Coluna ordering** — Ordenar tabela por coluna clicando no header
6. **Paginação** — Adicionar paginação na tabela de preview
7. **Busca na tabela** — Filtro de texto dentro da tabela de preview
8. **Agendamento** — Configurar relatórios para rodar automaticamente
9. **Notificações** — Enviar relatório por e-mail quando pronto
10. **Templates** — Salvar configurações de relatório como template
11. **Gráficos no preview** — Adicionar mini-gráficos antes da tabela
12. **Comparativo** — Comparar dois períodos lado a lado
13. ** drill-down** — Clicar em um item do agrupamento para ver detalhes
14. **Exportação parcial** — Exportar apenas colunas selecionadas
15. **Histórico** — Manter log de relatórios exportados

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
                    │   go('relatorios')  │
                    └──────────┬──────────┘
                               │
              ┌────────────────▼────────────────┐
              │        reports_ui.js             │
              │  render() → _renderReportList()  │
              │  _renderReportView()             │
              │  _renderPreviewView()            │
              └────────────────┬────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
   ┌───────▼───────┐   ┌──────▼──────┐   ┌───────▼───────┐
   │ reports.js    │   │ report_     │   │ reports.      │
   │ loadReport()  │   │ export.js   │   │ config.js     │
   │ _applyFilters │   │ export()    │   │ getReports()  │
   │ _groupData    │   │ _exportCSV  │   │ getReport()   │
   └───────┬───────┘   └──────┬──────┘   └───────────────┘
           │                   │
   ┌───────▼───────┐   ┌──────▼──────┐
   │ GlpiClient    │   │ _download   │
   │ .loadAll()    │   │ Blob()      │
   │ DATA / STATE  │   │ CSV file    │
   └───────────────┘   └─────────────┘
```
