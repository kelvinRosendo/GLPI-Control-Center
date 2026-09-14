# RELATÓRIO DE RECONCILIAÇÃO — GLPI Control Center

**Data da coleta:** 2026-09-10 23:15:41  
**Relatório gerado:** 2026-09-11  
**Fonte:** `Backend/data/inventario_2026-09-10_23-15-51.json`  
**Cache classificado:** Não existe (sync não executada via pipeline)

---

## 1. Totais

| Camada | Contagem | Status |
|--------|----------|--------|
| GLPI (raw inventário) | 575 (572 Computer + 3 Printer) | ✅ Verificado |
| Backend cache (`classified_assets.json`) | 0 (arquivo não existe) | ⚠️ Sync não executada |
| `/api/assets/all` | 0 (retorna vazio) | ⚠️ Cache vazio |
| Frontend `DATA.classifiedAssets` | 0 (sem dados do backend) | ⚠️ Sem sync |
| Frontend `DATA.computadores` (legado) | Depende do fallback | ⚠️ Sem dados |
| Cards do dashboard | 0 | ⚠️ Sem dados |

**Conclusão:** O pipeline de classificação nunca foi executado. O cache `classified_assets.json` não existe. O frontend recebe array vazio de `/api/assets/all` e entra em estado `noSync`.

---

## 2. Inventário bruto do GLPI (575 ativos)

### 2.1 Por itemtype

| itemtype | Qtd |
|----------|-----|
| Computer | 572 |
| Printer | 3 |
| **Total** | **575** |

### 2.2 Por tipo técnico (`computertypes_id`)

| Tipo | Qtd | % |
|------|-----|---|
| Chromebook | 447 | 78,4% |
| Computador | 40 | 7,0% |
| Desktop | 39 | 6,8% |
| PROJETOR | 32 | 5,6% |
| Impressora | 9 | 1,6% |
| (vazio) | 4 | 0,7% |
| Notebook | 1 | 0,2% |

### 2.3 Por estado (`states_id`)

| Estado | Qtd | % |
|--------|-----|---|
| Em uso | 225 | 39,3% |
| Em uso – Comodato Geekie (Aluno Ativo) | 145 | 25,3% |
| Finalizado – Comodato Geekie (Aluno Formado) | 96 | 16,8% |
| Em uso – Permanente (Colégio) | 55 | 9,6% |
| Em uso – Emprestado (Colégio) | 36 | 6,3% |
| (vazio) | 10 | 1,7% |
| Devolvido ao Estoque | 3 | 0,5% |
| Substituído via suporte Acer Geekie | 1 | 0,2% |
| Baixa – Perdido | 1 | 0,2% |

### 2.4 Por grupo (`groups_id.completename`)

| Grupo | Qtd |
|-------|-----|
| (sem grupo) | 164 |
| Geekie > Finalizado | 105 |
| Geekie > Carrinho > Carrinho 5 | 33 |
| Geekie > Carrinho > Carrinho 4 | 33 |
| 2° Médio A | 31 |
| Geekie > Carrinho > Carrinho 3 | 30 |
| 3° Médio B | 26 |
| 1° Médio A | 26 |
| 2° Médio B | 24 |
| 1° Médio B | 23 |
| 3° Médio A | 20 |
| Geekie > Em Uso | 14 |
| Geekie > Carrinho > Carrinho 2 | 14 |
| Geekie > Carrinho > Carrinho 1 | 11 |
| Geekie | 10 |
| Apoio | 6 |
| Apoio > Eduinfo | 2 |

### 2.5 Por padrão de nome

| Padrão | Qtd | Categoria esperada |
|--------|-----|-------------------|
| Chrome G-* | 99 | chromebook_student |
| Chrome-* (sem G/EDU) | 345 | chromebook_support |
| Chrome EDU* | 3 | chromebook_display |
| CS-* | 83 | computer_cs |
| CO-* | 1 | computer_cs |
| Projetor* | 32 | projector |
| EPSON* | 5 | printer_computer |
| Pantum* | 1 | printer_computer |
| RICOH* | 1 | printer_computer |
| SAMSUNG* | 1 | printer_computer |
| Impressora* | 1 | printer_computer |

---

## 3. Classificação pelo catálogo (simulação)

### 3.1 Resultado por regra

| Categoria | Regra (prioridade) | Computers | Printers | Total |
|-----------|-------------------|-----------|----------|-------|
| `printer` | itemtype=Printer (p100) | - | 3 | 3 |
| `projector` | name=Projetor* (p90) | 32 | - | 32 |
| `printer_computer` | name=EPSON/Pantum/RICOH/SAMSUNG/Impressora (p80) | 9 | - | 9 |
| `chromebook_student` | name=Chrome G-* (p70) | 99 | - | 99 |
| `chromebook_display` | name=Chrome EDU* (p65) | 3 | - | 3 |
| `chromebook_support` | name=Chrome-* (p60) | 345 | - | 345 |
| `computer_cs` | name=CS-*/CO-* (p50) | 84 | - | 84 |
| **Total classificados** | | **572** | **3** | **575** |
| **Não classificados** | | **0** | **0** | **0** |

### 3.2 Carrinhos extraídos dos grupos

| Carrinho | Qtd Chromebooks |
|----------|----------------|
| Carrinho 1 | 11 |
| Carrinho 2 | 14 |
| Carrinho 3 | 30 |
| Carrinho 4 | 33 |
| Carrinho 5 | 33 |
| **Total em carrinhos** | **121** |

---

## 4. Divergências e conflitos

### 4.1 CONFLITO: 150 Chrome-* em grupos de turma classificados como Apoio

**Problema:** 150 dispositivos Chrome-* estão em grupos de turma (1° Médio A/B, 2° Médio A/B, 3° Médio A/B) mas são classificados como `chromebook_support` porque o nome não começa com `Chrome G-`.

**Impacto:** Estes dispositivos provavelmente são Chromebooks de alunos com nomenclatura incorreta (sem o prefixo `G-`).

**Ação recomendada:** Verificar no GLPI se estes dispositivos deveriam ter o nome `Chrome G-*` e corrigir a nomenclatura, OU adicionar uma regra alternativa que considere o grupo para classificar como student.

**Itens afetados:** Chrome-177 a Chrome-345 (aproximadamente)

### 4.2 MODERADO: 145 itens com estado "Comodato Geekie (Aluno Ativo)" mas não classificados como student

- 26 CS/XX desktops em comodato → classificados como `computer_cs` (correto pelo nome)
- 119 Chrome-* em comodato → classificados como `chromebook_support` (correto pelo nome, mas o estado sugere uso de aluno)

**Ação:** Estado é uma dimensão separada da classificação. Não alterar a regra de classificação baseada apenas no estado.

### 4.3 INFO: 4 itens com `computertypes_id = 0` (vazio)

- CS-010, CS-014, CS-031, CS-035
- Classificados corretamente pelo padrão de nome `CS-*`

### 4.4 INFO: 96 itens "Finalizado" no grupo `Geekie > Finalizado`

- Todos são Chrome G-* → classificados como `chromebook_student`
- Classificação correta pelo nome; "finalizado" é ciclo de vida, não erro de classificação

---

## 5. Tabela de reconciliação

| Categoria | Backend cache | API `/api/assets/all` | Estado frontend | Lista sem filtros | Card dashboard | Diferença |
|-----------|--------------|----------------------|-----------------|-------------------|----------------|-----------|
| chromebook_student | 0 (sem cache) | 0 | 0 | 0 | 0 | Cache inexistente |
| chromebook_support | 0 | 0 | 0 | 0 | 0 | Cache inexistente |
| chromebook_display | 0 | 0 | 0 | 0 | 0 | Cache inexistente |
| computer_cs | 0 | 0 | 0 | 0 | 0 | Cache inexistente |
| projector | 0 | 0 | 0 | 0 | 0 | Cache inexistente |
| printer_computer | 0 | 0 | 0 | 0 | 0 | Cache inexistente |
| printer | 0 | 0 | 0 | 0 | 0 | Cache inexistente |
| unclassified | 0 | 0 | 0 | 0 | 0 | Cache inexistente |
| **Total** | **0** | **0** | **0** | **0** | **0** | **Sem sync** |

**Todos os valores são 0 porque o cache nunca foi criado.** O pipeline de classificação precisa ser executado via `POST /api/sync/run` para gerar o cache.

---

## 6. Números esperados após sync

Se o pipeline for executado com sucesso, os cards do dashboard deveriam mostrar:

| Card | Valor esperado |
|------|---------------|
| Total de ativos | 575 |
| Computadores (CS/CO) | 84 |
| Chromebooks de aluno | 99 |
| Chromebooks de apoio | 345 |
| Chromebooks de exibição | 3 |
| Chromebooks em carrinhos | 121 |
| Projetores | 32 |
| Impressoras (Computer) | 9 |
| Impressoras (Printer) | 3 |
| Não classificados | 0 |
| Total Chromebooks | 447 |

---

## 7. Pendências

1. **Executar sync** — O cache `classified_assets.json` não existe. Executar `POST /api/sync/run` para gerar o cache.
2. **Verificar Chrome-* em turmas** — 150 dispositivos podem estar com nomenclatura incorreta.
3. **Configurar Google Cloud Console** — Adicionar origens autorizadas para o Client ID OAuth.
4. **CORS_ORIGIN** — Atualizado para incluir `http://localhost:8080`.
5. **Ícone `sync`** — Adicionado ao mapa de ícones (usa `refresh.svg` como fallback).
6. **Script load order** — `admin_sync.js` e `asset_classifier.js` adicionados ao `index.html`.
7. **Módulos no module-registry** — `inventario` e `admin-sync` registrados.
8. **Permissões** — `inventario`, `exibicao`, `admin-sync` adicionados ao permissions.js.

---

## 8. Configuração necessária no Google Cloud Console

O Client ID `985292439142-lveqa6pff29h4c3pb5951a1gn69lpomv.apps.googleusercontent.com` precisa ter as seguintes **Authorized JavaScript origins** configuradas:

| Origem | Ambiente |
|--------|----------|
| `http://localhost:3000` | Desenvolvimento (frontend) |
| `http://localhost:8080` | Desenvolvimento (backend) |
| `https://gcc.colegiosatelite.com.br` | Produção |

**Passos:**
1. Acessar https://console.cloud.google.com
2. Selecionar o projeto
3. APIs & Services → Credentials
4. Editar o OAuth 2.0 Client ID
5. Adicionar as origens acima em "Authorized JavaScript origins"
6. Salvar

---

## 9. Arquivos gerados

| Arquivo | Descrição |
|---------|-----------|
| `RELATORIO-RECONCILIACAO-GCC.md` | Este relatório |
| `reconciliacao-contagens.csv` | Contagens por categoria |
| `reconciliacao-divergencias.json` | Divergências detalhadas |
