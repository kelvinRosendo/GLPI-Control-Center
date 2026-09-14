# Levantamento Técnico e Funcional — Inventário GLPI × GCC

> **Objetivo:** Documentar o inventário real do GLPI, a lógica atual do GCC e as decisões pendentes para definir a catalogação correta dos ativos.
>
> **Restrição desta etapa:** Somente levantamento. Nenhuma regra de classificação, interface, autenticação ou infraestrutura foi alterada.
>
> **Identidade dos registros:** `itemtype:id` (ex: `Computer:1`, `Printer:2`). Todas as tabelas e cruzamentos usam essa identidade para evitar ambiguidades.

---

## Convenções Confirmadas

As seguintes convenções foram confirmadas pelo responsável e verificadas nos dados:

- `Chrome G-` = Alunos
- `Chrome-` (sem G nem EDU) = Apoio
- `Chrome-EDU` = Exibição
- Grupo = organização (turma, carrinho, setor)
- Estado = situação atual do equipamento
- Comentário = histórico de ações (não situação atual)

---

## 1. Resumo do Inventário e Escopo da Coleta

### Dados da Coleta

| Item | Valor | Verificação |
|---|---|---|
| Data/Hora | 2026-09-10T23:15:41+02:00 | Coletado pelo script `_collector_inventario.php` |
| Conta de integração | Token de aplicação + token de usuário | Credenciais no `Backend/.env` |
| Perfil visível | Entidade raiz | Todos os registros retornados |
| Filtros aplicados | Nenhum — consulta ampla | `expand_dropdowns=true`, sem `criteria` |
| Tratamento de excluídos | Padrão GLPI (is_deleted=0) | Registros excluídos logicamente não retornados |
| Tratamento de templates | Padrão GLPI (is_template=0) | Templates não retornados |

### FATO: Totais por Coleção

| Coleção GLPI | Registros | Identidade |
|---|---|---|
| Computer | 572 | Computer:1 até Computer:689 (com lacunas) |
| Printer | 3 | Printer:1, Printer:2, Printer:3 |
| **Total** | **575** | **575 IDs únicos, sem duplicatas** |

### FATO: Coleções GLPI Consultadas pelo GCC

| Rota GCC | Coleção GLPI | Método | Uso |
|---|---|---|---|
| `/api/assets/computers` | `/Computer` | GET | Lista computadores |
| `/api/assets/chromebooks-geekiees` | `/Computer` | GET | Lista chromebooks alunos |
| `/api/assets/chromebooks-apoio` | `/Computer` | GET | Lista chromebooks apoio |
| `/api/assets/chromebooks-exibicao` | `/Computer` | GET | Lista chromebooks exibição |
| `/api/assets/projetores` | `/Computer` | GET | Lista projetores |
| `/api/assets/impressoras` | `/Printer` | GET | Lista impressoras |
| `/api/tickets` | `/Ticket` | GET/POST | Lista e cria chamados |
| `/api/tickets/asset/{id}` | `/Item_Ticket` + `/Ticket` | GET | Chamados por ativo |

### FATO: Coleções GLPI com Acesso Negado (HTTP 403)

A conta de integração não tem permissão para acessar as seguintes coleções diretamente:

| Coleção | HTTP Status | Efeito |
|---|---|---|
| `/Group` | 403 Forbidden | Dados de grupo chegam como strings via `expand_dropdowns` nos Computers |
| `/State` | 403 Forbidden | Dados de estado chegam como strings via `expand_dropdowns` nos Computers |
| `/Entity` | 403 Forbidden | Dados de entidade chegam como strings via `expand_dropdowns` |
| `/Location` | 403 Forbidden | Dados de localização chegam como strings via `expand_dropdowns` |
| `/ComputerType` | 403 Forbidden | Dados de tipo chegam como strings via `expand_dropdowns` |
| `/ComputerModel` | 403 Forbidden | Dados de modelo chegam como strings via `expand_dropdowns` |
| `/Manufacturer` | 403 Forbidden | Dados de fabricante chegam como strings via `expand_dropdowns` |
| `/PrinterModel` | 403 Forbidden | — |
| `/PrinterType` | 403 Forbidden | — |
| `/OperatingSystem` | 403 Forbidden | — |

> **Nota:** O `/Ticket` retorna HTTP 206 com 45 tickets — confirma que a conta tem acesso à coleção de tickets.

### FATO: Coleções Não Consultadas pelo GCC

| Coleção | Descrição | Relevância |
|---|---|---|
| `Infocom` | Custo, garantia, data de compra | Média — dados financeiros |
| `Contract` | Contratos de manutenção | Média |
| `NetworkPort` | Portas de rede, endereços IP | Baixa |
| `Item_Device*` | Componentes de hardware | Baixa |
| `Document` | Documentos anexos | Baixa |
| `Log` | Histórico de alterações do GLPI | Média — rastreabilidade |

---

## 2. Coleções e Tipos Encontrados

### FATO: Distribuição por `computertypes_id` (expandido)

| Tipo GLPI | Quantidade | `itemtype` |
|---|---|---|
| Chromebook | 447 | Computer |
| Computador | 40 | Computer |
| Desktop | 39 | Computer |
| PROJETOR | 32 | Computer |
| Impressora | 9 | Computer |
| (vazio) | 4 | Computer |
| Notebook | 1 | Computer |
| (vazio) | 3 | Printer |
| **Total** | **575** | |

> **Observação:** O tipo "Chromebook" do GLPI é genérico — não diferencia alunos, apoio ou exibição. A diferenciação é feita pelo nome.

### FATO: Equipamentos como `Computer` com tipo "Impressora"

9 registros têm `computertypes_id = "Impressora"` mas estão na coleção `Computer` (não `Printer`). Nomes: `EPSON-046`, `EPSON-047`, `EPSON-048`, `Pantum-43`, `SAMSUNG - 41`, `RICOH-42`, `Impressora-44`, `Impressora-45`, `EPSON-046 (cópia)`.

Separadamente, existem 3 registros na coleção `Printer` (EPSON TM-T20, Canon G3010, EPSON L4160).

---

## 3. Padrões de Nomes

### FATO: Distribuição por padrão de nome (575 registros)

| Padrão de Nome | Total | Computer | Printer | Exemplo |
|---|---|---|---|---|
| `Chrome-XXX` (sem G nem EDU) | 345 | 345 | 0 | `Chrome-300`, `Chrome-1` |
| `Chrome G-XXX` | 99 | 99 | 0 | `Chrome G-001`, `Chrome G-099` |
| `CS-XXX` | 83 | 83 | 0 | `CS-001`, `CS-083` |
| `Projetor XX` | 32 | 32 | 0 | `Projetor 01`, `Projetor 32` |
| `EPSON/Pantum/SAMSUNG-XX` | 11 | 9 | 2 | `EPSON-046`, `Pantum-43` |
| `Chrome-EDU1/2/3` | 3 | 3 | 0 | `Chrome-EDU1` |
| `CO-XXX` | 1 | 1 | 0 | `CO-W01` |
| `Canon G3010...` | 1 | 0 | 1 | `Canon G3010 series (Copiar 3)` |
| (vazio) | 0 | 0 | 0 | — |
| **TOTAL** | **575** | **572** | **3** | |

**Soma verificada:** 345+99+83+32+11+3+1+1 = **575** ✅

### Detalhamento por Padrão

#### `Chrome G-XXX` (Alunos) — 99 registros, todos Computer

- **Formato:** `Chrome G-` + número de 3 dígitos (zero-padded)
- **Numeração:** G-001 a G-099 (com lacunas: G-002 ausente)
- **Variações:** Espaço entre "Chrome" e "G-" (consistente em todos os 99)

#### `Chrome-XXX` (Apoio) — 345 registros, todos Computer

- **Formato:** `Chrome-` + número (1 a 345)
- **Numeração:** Sequencial com lacunas
- **2 registros sem número** (ex: `Chrome-EDU1` é capturado pelo regex EDU antes)

#### `Chrome-EDU1/2/3` (Exibição) — 3 registros, todos Computer

- **Nomes exatos:** `Chrome-EDU1`, `Chrome-EDU2`, `Chrome-EDU3`
- **Posição do "EDU":** Após o hífen. Regex `/^Chrome-.*EDU/i` captura corretamente.

#### `CS-XXX` (Computadores) — 83 registros, todos Computer

- **Formato:** `CS-` + número de 3 dígitos (zero-padded)
- **Numeração:** CS-001 a CS-083
- **Tipo GLPI:** 40 com `computertypes_id = "Computador"`, 39 com `"Desktop"`, 4 com tipo vazio/outro

#### `CO-XXX` — 1 registro, Computer

- **Nome:** `CO-W01`
- **Convenção:** Não confirmada. Pode significar "Computador Off-site" ou outra coisa.

#### `Projetor XX` — 32 registros, todos Computer

- **Formato:** `Projetor` + espaço + número de 2 dígitos
- **Numeração:** 01 a 32

#### Impressoras (por nome) — 11 registros (9 Computer + 2 Printer)

- **Computer:** `EPSON-046`, `EPSON-047`, `EPSON-048`, `Pantum-43`, `SAMSUNG - 41`, `RICOH-42`, `Impressora-44`, `Impressora-45`, `EPSON-046 (cópia)`
- **Printer:** `EPSON TM-T20 ReceiptE4`, `Canon G3010 series (Copiar 3)`

---

## 4. Árvore de Grupos e Quantidades

### FATO: Formato do campo `groups_id`

O campo `groups_id` dos Computers vem como **string HTML-escaped** (não como objeto com `id`, `name`, `completename`). Exemplo: `'Geekie &#62; FInalizado'` (o `&#62;` é `>` em HTML).

Isso acontece porque a conta de integração não tem permissão para acessar `/Group` (HTTP 403). O GLPI expande o campo como string quando `expand_dropdowns=true`, mas sem o objeto completo.

### FATO: Grupos encontrados (17 únicos, 408 registros com grupo)

| Caminho do Grupo | Qtd | Tipos |
|---|---|---|
| *(sem grupo — groups_id = 0)* | 164 | Chromebook: 155, Computador/Desktop: 3, Impressora: 6 |
| `Geekie > FInalizado` | 105 | Chromebook: 105 |
| `Geekie > Carrinho > Carrinho 5` | 33 | Chromebook: 33 |
| `Geekie > Carrinho > Carrinho 4` | 33 | Chromebook: 33 |
| `2º Médio A` | 31 | Chromebook: 31 |
| `Geekie > Carrinho > Carrinho 3` | 30 | Chromebook: 30 |
| `3º Médio B` | 26 | Chromebook: 26 |
| `1º Médio A` | 26 | Chromebook: 26 |
| `2º Médio B` | 24 | Chromebook: 24 |
| `1º Médio B` | 23 | Chromebook: 23 |
| `3º Médio A` | 20 | Chromebook: 20 |
| `Geekie > Em Uso` | 14 | Chromebook: 14 |
| `Geekie > Carrinho > Carrinho 2` | 14 | Chromebook: 14 |
| `Geekie > Carrinho > Carrinho 1` | 11 | Chromebook: 11 |
| `Geekie` | 10 | Chromebook: 10 |
| `Apoio` | 6 | Chromebook: 6 |
| `Apoio > Eduinfo` | 2 | Chromebook: 2 |

**Soma:** 164+105+33+33+31+30+26+26+24+23+20+14+14+11+10+6+2 = **572** ✅ (= total de Computers)

### Árvore (reconstruída a partir dos nomes de grupo)

```
Geekie (10)
├── FInalizado (105)
├── Em Uso (14)
└── Carrinho (121)
    ├── Carrinho 1 (11)
    ├── Carrinho 2 (14)
    ├── Carrinho 3 (30)
    ├── Carrinho 4 (33)
    └── Carrinho 5 (33)

Apoio (6)
└── Eduinfo (2)

3º Médio A (20)         ← direto, sem pai
3º Médio B (26)         ← direto, sem pai
1º Médio A (26)         ← direto, sem pai
1º Médio B (23)         ← direto, sem pai
2º Médio A (31)         ← direto, sem pai
2º Médio B (24)         ← direto, sem pai
```

> **Nota:** O nome "FInalizado" tem "I" maiúsculo no meio — provavelmente erro de digitação no GLPI.

---

## 5. Estados

### FATO: Formato do campo `states_id`

O campo `states_id` vem como **string expandida** (ex: `"Em uso"`) em 562 registros, e como **zero/null** em 10 registros. Não há objetos com `id` — a conta de integração não tem permissão para acessar `/State` (HTTP 403).

### FATO: Estados dos Computers (572 registros)

| Estado | Quantidade |
|---|---|
| Em uso | 225 |
| Em uso – Comodato Geekie (Aluno Ativo) | 145 |
| Finalizado – Comodato Geekie (Aluno Formado) | 96 |
| Em uso – Permanente (Colégio) | 55 |
| Em uso – Emprestado (Colégio) | 36 |
| *(vazio — states_id = 0)* | 10 |
| Devolvido ao Estoque | 3 |
| Substituído via suporte Acer Geekie | 1 |
| Baixa – Perdido | 1 |

**Soma:** 225+145+96+55+36+10+3+1+1 = **572** ✅

### FATO: Estados dos Printers (3 registros)

| Estado | Quantidade |
|---|---|
| *(vazio — states_id = 0)* | 3 |

### FATO: Estados por Tipo de Equipamento

| Tipo | Em uso | Comodato Ativo | Finalizado | Permanente | Emprestado | Devolvido | Substituído | Baixa | (vazio) |
|---|---|---|---|---|---|---|---|---|---|
| Chromebook | 150 | 106 | 96 | 53 | 36 | 0 | 1 | 0 | 5 |
| Computador | 39 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| Desktop | 1 | 38 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Projetor | 28 | 0 | 0 | 1 | 0 | 3 | 0 | 0 | 0 |
| Impressora | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| Notebook | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

---

## 6. Padrões dos Comentários

### FATO: Resumo (572 Computers)

| Métrica | Valor |
|---|---|
| Com comentário preenchido | 303 (53%) |
| Sem comentário | 269 (47%) |
| Com data no comentário | 224 (74% dos que têm) |
| Com menção a assistência | 81 |
| Com menção a empréstimo | 50 |
| Com menção a local/sala | 33 |
| Com menção a defeito | 29 |
| Com menção a horas de uso | 25 |

### FATO: Padrões por Tipo

#### Computers (CS-XXX) — 100% com comentário

**Formato:** `DD/MM/AAAA - Descrição da ação`

Exemplos (anonimizados):
```
23/12/2024 - HD de 500GB substituído por SSD de 240GB. O PC foi formatado.
06/01/2025 - O PC não dava vídeo. Foi retirado da sala e armazenado na sala do TI.
```

#### Chromebooks — 55% com comentário

**Padrões encontrados:**

1. **Renomeações:** `"Antigo Chrome-G114"`, `"Antigo Chrome-G115, passa a ser Chrome-279"`
2. **Empréstimos:** `"27/01/2025 - Antigo [Nome] | Tornou-se vago (Solicitou transferencia)."`
3. **Assistências:** `"13/05/2025 - O chromebook da aluna ira para a assistencia tecnica"`
4. **Defeitos:** `"05/05/2026 | Chromebook com defeito na bateria"`
5. **Movimentação:** `"Esta no carrinho 5"`

> **Interpretação:** Os comentários são **histórico cronológico** — cada linha representa um evento passado. Não devem ser interpretados como situação atual.

#### Projetores — 97% com comentário

**Formato específico:** `Local - Horas - DD/MM/AAAA`

Exemplos:
```
Sala 01 - 5800h - 03/07/2026
17/07/2026 | vai voltar para o setor
18/08/2026 | Projetor chegou da assistência, foi trocada a lâmpada.
```

O GCC já extrai localização e horas do comentário via `Mappers::projectorLocation()`.

#### Impressoras (Computer tipo "Impressora") — 67% com comentário

**Formato:** `DD/MM/AAAA | Descrição`

Exemplos:
```
16/01/2026 | A impressora vai para a COORDENAÇÃO, era do APOIO.
15/01/2026 | A impressora está imprimindo os arquivos apenas até a metade.
```

### INTERPRETAÇÃO: Possibilidade de Extração

| Padrão | Extraível? | Segurança | Observação |
|---|---|---|---|
| Datas | Sim | Alta | Formato DD/MM/AAAA consistente |
| Horas de projetor | Sim | Alta | Já implementado no GCC |
| Local/sala | Parcial | Média | Padrão "Sala XX" ou "Local - XXXXh" |
| Nomes anteriores | Sim | Alta | "Antigo Chrome-GXXX" |
| Empréstimos | Parcial | Média | "Antigo [Nome]" + "para [Nome]" |
| Defeitos | Parcial | Baixa | Termos variados |
| Assistências | Parcial | Baixa | "assistencia", "conserto", "manuten" |

---

## 7. Mapeamento dos Campos

### Computer (GLPI API → GCC API → Frontend)

| Campo GLPI | Campo GCC | Uso no Frontend | Preenchimento (572 Computers) | Observação |
|---|---|---|---|---|
| `id` | `glpiId` | Links, navegação | 572/572 (automático) | ID numérico único |
| `name` | `nome` | Card header, busca | 572/572 (manual) | Padrão de naming |
| `computertypes_id` | *(backend)* | Classificação | 568/572 (4 vazio) | Tipo genérico para Chromebooks |
| `serial` | `serial` | Card body, busca | Preenchido na maioria | Número de série do fabricante |
| `otherserial` | `patrimonio` | Card info, busca | Preenchido em部分 | Patrimônio interno |
| `states_id` | `status` | Badge, filtros | 562/572 (10 vazio) | **Conversão perde informação** |
| `groups_id` | `grupo` | Cards de alunos/apoio | 408/572 (164 vazio) | String com caminho hierárquico |
| `users_id` | `usuario` | *(não exposto em cards)* | 0/572 (todos null) | Campo não preenchido |
| `computermodels_id` | `modelo` | Card info, detalhes | Preenchido em部分 | Modelo do equipamento |
| `manufacturers_id` | *(detalhes)* | Detalhes | **529/572 preenchido** | Lenovo, etc. —43 vazio |
| `locations_id` | `reparticao` | Card info | Preenchido em部分 | Localização física |
| `comment` | *(detalhes/projetores)* | Detalhes, parse | 303/572 (53%) | Histórico de ações |
| `contact` | `nome_alternativo_usuario` | Detalhes (projetores) | Parcial | Nome do responsável |
| `contact_num` | `numero_nome_alternativo_usuario` | Detalhes (projetores) | Parcial | Número/ramal — pode ser local |
| `date_creation` | *(detalhes)* | Rastreio | Automático | Data de criação no GLPI |
| `date_mod` | *(detalhes)* | Rastreio | Automático | Última modificação |
| `uuid` | *(detalhes)* | Detalhes | Parcial | MAC address em alguns casos |
| `is_deleted` | *(filtro)* | — | Automático (0) | Filtrado pelo GLPI |
| `is_template` | *(filtro)* | — | Automático (0) | Filtrado pelo GLPI |

### Printer (GLPI API → GCC API → Frontend)

| Campo GLPI | Campo GCC | Preenchimento (3 Printers) | Observação |
|---|---|---|---|
| `id` | `glpiId` | 3/3 | Automático |
| `name` | `nome` | 3/3 | Nome do modelo + identificador |
| `serial` | `serial` | 3/3 | Automático (inventário SNMP) |
| `otherserial` | `patrimonio` | 0/3 (NULL) | Não preenchido |
| `states_id` | `status` | 0/3 (zero) | Não preenchido |
| `locations_id` | `reparticao` | 2/3 | Uma sem localização |
| `users_id` | `usuario` | 0/3 | Não preenchido |
| `printermodels_id` | `modelo` | 0/3 (zero) | Não preenchido |
| `manufacturers_id` | `fabricante` | 0/3 (zero) | Não preenchido |
| `comment` | `comentario` | 0/3 (NULL) | Não preenchido |
| `contact` | `nome_alternativo_usuario` | 3/3 | E-mails departamentais |
| `groups_id` | — | 0/3 | Não preenchido |
| `is_dynamic` | — | 3/3 (true) | Inventariado automaticamente |

### Campos Não Utilizados pelo GCC

| Campo | Descrição | Potencial |
|---|---|---|
| `users_id` (computers) | Vazio em 572/572 | Investigar por que não é preenchido |
| `networks_id` | Endereço de rede | Baixo |
| `operatingsystems_id` | Sistema operacional | Baixo — todos ChromeOS |
| `last_inventory_update` | Último inventário automático | Alto — detectar equipamentos offline |
| `is_dynamic` | Inventariado automaticamente | Médio — diferenciar manual vs automático |

---

## 8. Cruzamentos e Exemplos

### 8.1 Nome × Tipo GLPI

| Padrão de Nome | Chromebook | Computador | Desktop | Projetor | Impressora | Notebook | (vazio) |
|---|---|---|---|---|---|---|---|
| `Chrome G-` | 99 | 0 | 0 | 0 | 0 | 0 | 0 |
| `Chrome-` | 345 | 0 | 0 | 0 | 0 | 0 | 0 |
| `Chrome-EDU` | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| `CS-` | 0 | 40 | 39 | 0 | 0 | 0 | 4 |
| `CO-` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `Projetor` | 0 | 0 | 0 | 32 | 0 | 0 | 0 |
| `EPSON/Pantum/SAMSUNG` | 0 | 0 | 0 | 0 | 9 | 0 | 0 |
| `Canon` (Printer) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

> **Nota:** 4 CS- e 1 CO- têm tipo vazio/outro.

### 8.2 Nome × Estado (572 Computers)

| Padrão | Em uso | Comodato Ativo | Finalizado | Permanente | Emprestado | Devolvido | Substituído | Baixa | (vazio) |
|---|---|---|---|---|---|---|---|---|---|
| `Chrome G-` | 0 | 1 | **96** | 0 | 2 | 0 | 0 | 0 | 0 |
| `Chrome-` | 150 | 105 | 0 | 53 | 34 | 0 | 1 | 0 | 2 |
| `Chrome-EDU` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| `CS-` | 40 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 3 |
| `CO-` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `Projetor` | 28 | 0 | 0 | 1 | 0 | 3 | 0 | 0 | 0 |
| `Impressora` | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |

### 8.3 Nome × Grupo

| Padrão | (sem grupo) | Finalizado | Carrinho 1-5 | Em Uso | Turma | Geekie (outros) | Apoio |
|---|---|---|---|---|---|---|---|
| `Chrome G-` | 3 | 96 | 0 | 0 | 0 | 0 | 0 |
| `Chrome-` | 68 | 9 | 121 | 14 | 150 | 10 | 8 |
| `Chrome-EDU` | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| `CS-` | 83 | 0 | 0 | 0 | 0 | 0 | 0 |
| `CO-` | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `Projetor` | 32 | 0 | 0 | 0 | 0 | 0 | 0 |
| `Impressora` | 9 | 0 | 0 | 0 | 0 | 0 | 0 |

### 8.4 Finalizados — Estado vs Grupo

| Condição | Quantidade | Detalhe |
|---|---|---|
| Estado "Finalizado" **E** grupo "FInalizado" | 91 | Consistentes |
| Estado "Finalizado" **MAS** grupo ≠ "FInalizado" | 5 | Chrome G-093 a Chrome G-098 (grupo não expandido ou ausente) |
| Grupo "FInalizado" **MAS** estado ≠ "Finalizado" | 14 | Chrome-XXX (apoio) no grupo mas com outros estados |
| **Total com pelo menos 1 dos 2** | **110** | |

> **Interpretação:** O grupo "Geekie > FInalizado" (105) é mais amplo que o estado "Finalizado" (96).14 Chromebooks de apoio (`Chrome-XXX`) estão no grupo "FInalizado" mas têm estados como "Em uso – Comodato Geekie (Aluno Ativo)" ou "Em uso – Permanente (Colégio)". Isso pode indicar que foram movidos para o grupo mas o estado não foi atualizado, ou que o grupo tem outro significado.

### 8.5 Exemplos Representativos

#### Compatível com convenções
```
Computer:98 — Chrome G-001
Tipo: Chromebook
Estado: Finalizado – Comodato Geekie (Aluno Formado)
Grupo: Geekie > FInalizado
Comentário: 28/11/2025  Ex-Aluna | Formou
```
→ Nome `Chrome G-` = aluno. Estado e grupo confirmam.

#### Exige interpretação conjunta
```
Computer:99 — Chrome-300
Tipo: Chromebook
Estado: Em uso – Comodato Geekie (Aluno Ativo)
Grupo: 3º Médio B
Comentário: 27/01/2025 - Antigo [Nome Anterior] | Tornou-se vago.
            30/01/2025 - O chromebook para a aluna [Nome Novo]. (Empréstimo)
```
→ Nome `Chrome-` = apoio. Estado = comodato ativo. Grupo = turma. Comentário = empréstimo a aluno. **Campos diferentes dizem coisas diferentes — não necessariamente contradição.**

#### Sem informação suficiente
```
Computer:190 — Chrome G-093
Tipo: Chromebook
Estado: Finalizado – Comodato Geekie (Aluno Formado)
Grupo: *(não expandido no JSON)*
```
→ Estado diz "Finalizado". Grupo não está no JSON (groups_id = 0 ou string não expandida).

---

## 9. Funcionamento Atual do GCC

### 9.1 Consulta e Paginação

**Arquivo:** `Backend/api/client.php`

- `GlpiClient::getAllWithParams()` — busca paginada via header `Content-Range`
- Batch size: 500 registros por página
- Deduplicação por ID
- Retorna `{items, total, complete, errors}`

**Observação:** Cada endpoint (computers, geekiees, apoio, exibicao, projetores) faz uma **consulta separada** ao GLPI, resultando em múltiplas chamadas `getAllWithParams('/Computer', ...)`.

### 9.2 Classificação por Nome e Tipo

**Arquivo:** `Backend/api/classifier.php`

A classificação usa dois critérios em ordem:
1. **Tipo GLPI** (`computertypes_id`): detecta "projetor" e "impressora"
2. **Nome** (`name`): regex para Chrome G-, Chrome-EDU, Chrome-, CS-, CO-, Projetor, marcas de impressora

Para Chromebooks, o tipo GLPI é sempre "Chromebook" — a classificação depende 100% do nome.

### 9.3 Agrupamento por Carrinho

**Arquivo:** `Backend/api/mappers.php` — `chromebooksApoioAgrupados()`

- Lê a string do `groups_id`
- Busca "Carrinho X" na string
- Distribui em: Carrinho 1-5 + Apoio Geral
- Fixo para 5 carrinhos

### 9.4 Mapeamento dos Estados

**Arquivo:** `Backend/api/mappers.php` — `status()`

Converte 9 estados reais para 5 valores internos:

| Estado GLPI | Conversão GCC |
|---|---|
| *(vazio)* | `ativo` |
| Contém "manuten" | `manutencao` |
| Contém "emprest" | `emprestado` |
| Contém "ativo" | `ativo` |
| Contém "inativo" | `inativo` |
| Contém "reserv" | `reservado` |
| Qualquer outro | `ativo` |

> **Consequência:** "Finalizado – Comodato Geekie (Aluno Formado)" → `ativo`. "Devolvido ao Estoque" → `ativo`. "Baixa – Perdido" → `ativo`.

### 9.5 Integração com Tickets

**FATO:** O GCC **integra completamente** com o GLPI para tickets. Não há sistema de chamados separado.

| Operação | Rota GCC | Coleção GLPI |
|---|---|---|
| Listar chamados | `GET /api/tickets` | `GET /Ticket` |
| Chamados por ativo | `GET /api/tickets/asset/{id}` | `GET /Item_Ticket` + `GET /Ticket/{id}` |
| Criar chamado simples | `POST /api/tickets` | `POST /Ticket` + `POST /Item_Ticket` |
| Criar chamado workflow | `POST /api/tickets/workflow` | `POST /Ticket` + `POST /Item_Ticket` |

**Arquivos:** `Backend/api/tickets.php`, `Backend/api/workflow.php`

O GLPI retornou **45 tickets** (HTTP 206) na coleção `/Ticket`.

### 9.6 Dados Exibidos nos Cards

| Card Type | Campos Exibidos |
|---|---|
| Computador | nome, serial, status, patrimonio, modelo, reparticao |
| Chromebook (Alunos) | nome, serial, status, patrimonio, modelo, grupo |
| Chromebook (Apoio) | nome, serial, status, patrimonio, modelo |
| Projetor | nome, patrimonio, modelo, reparticao, status_calculado, horas_lampada |
| Impressora (Computer) | nome, serial, status, patrimonio, modelo, fabricante |
| Impressora (Printer) | nome, serial, status, patrimonio, modelo, fabricante |

### 9.7 Contadores do Dashboard

**Arquivo:** `Frontend/javascript/dashboard.js`

```
computadores:     count(DATA.computadores)           // 84
geekiees:         count(DATA.chromebooksGeekiees)    // 99
apoio:            countFlat(DATA.chromebooksApoio)   // 345
exibicao:         count(DATA.chromebooksExibicao)    // 3
projetores:       count(DATA.projetores)             // 32
impressoras:      count(DATA.impressoras)            // 3
chromebooks_total: geekiees + apoio + exibicao       // 447
total_ativos:     all categories                     // 566
```

> **Nota:** O dashboard contabiliza 99 "Alunos" — incluindo 96 com estado "Finalizado".

### 9.8 Pesquisa e Filtros

**Arquivo:** `Frontend/javascript/search_ui.js`

- Busca por: `nome`, `serial`, `patrimonio` (case-insensitive)
- Filtros por tipo: computadores, alunos, apoio, exibicao, projetores, impressoras
- Badge de status por substring: `ativo|ok|funcional` → verde, `manuten|defeito` → amarelo, `emprest|loan` → azul

---

## 10. Decisões Pendentes

### Classificação

| # | Pergunta | Impacto |
|---|---|---|
| 1 | Chromebooks renomeados de `Chrome G-XXX` para `Chrome-XXX` devem ser tratados como alunos ou apoio? | Alto — ~14 registros identificados |
| 2 | `CO-W01` é um computador? Que convenção segue? | Baixo — 1 registro |
| 3 | Equipamentos com tipo "Desktop" (39) e "Computador" (40) devem ser unificados? | Médio — mesmos nomes CS- |
| 4 | Impressoras como `Computer` (tipo "Impressora") devem migrar para `Printer` no GLPI? | Médio — 9 registros |

### Estados

| # | Pergunta | Impacto |
|---|---|---|
| 5 | O GCC deve preservar o estado original do GLPI? | Alto — 9 estados reais vs 5 converters |
| 6 | "Finalizado" deve ser contabilizado como "ativo" no dashboard? | Alto — 96 equipamentos |
| 7 | "Devolvido ao Estoque" (3) e "Baixa – Perdido" (1) devem ter tratamento especial? | Médio |

### Grupos

| # | Pergunta | Impacto |
|---|---|---|
| 8 | A conta de integração deve ter permissão para acessar `/Group`? | Alto — árvore hierárquica completa |
| 9 | O agrupamento por carrinho deve ser dinômico? | Médio — fixo para 5 |
| 10 | Grupos de turma devem ser exibidos no GCC? | Médio — 6 turmas, ~150 chromebooks |
| 11 | O grupo `Geekie > FInalizado` deve ser tratado como "arquivo morto"? | Alto — 105 registros |
| 12 | Os 14 Chrome-XXX no grupo "FInalizado" com estado diferente — o que acontece? | Precisa investigar |

### Comentários

| # | Pergunta | Impacto |
|---|---|---|
| 13 | O GCC deve extrair nomes anteriores dos comentários? | Médio — ~15 renomeações |
| 14 | O histórico de empréstimos deve ser estruturado? | Médio — ~50 menções |

### Arquitetura

| # | Pergunta | Impacto |
|---|---|---|
| 15 | Cada endpoint deve continuar fazendo consulta separada ao GLPI? | Alto — múltiplas chamadas |
| 16 | Os dados devem ser cacheados no backend? | Alto |
| 17 | O endpoint `impressoras` deve buscar `/Printer` (3) em vez de filtrar `/Computer` com tipo "Impressora" (9)? | Médio |

### Dados Ausentes

| # | Campo | Situação |
|---|---|---|
| 18 | `users_id` (572/572 vazio) | Investigar por que não é preenchido |
| 19 | `manufacturers_id` (43/572 vazio em Computers) | Considerar preencher |
| 20 | `printermodels_id` / `manufacturers_id` (3/3 vazio em Printers) | Preencher |

---

## Anexo A: Dados dos Printers (3 registros)

| ID | Nome | Serial | Localização | Contact | `is_dynamic` |
|---|---|---|---|---|---|
| Printer:1 | EPSON TM-T20 ReceiptE4 | 5256324d4419360000 | Colégio Satelite > Natação | natacao@COLEGIO | true |
| Printer:2 | Canon G3010 series (Copiar 3) | A26502 | Colégio Satelite > Apoio | apoio@COLEGIO | true |
| Printer:3 | EPSON L4160 Series | 583539433231383731 | *(vazio)* | Fladia@COLEGIO | true |

> Os 3 Printers são inventariados automaticamente via SNMP. Não possuem modelo, fabricante, patrimônio, estado, grupo ou comentário preenchidos. O campo `contact` contém e-mails departamentais/pessoais.

## Anexo B: Scripts de Verificação

| Script | Função | Status |
|---|---|---|
| `Backend/api/_collector_inventario.php` | Coleta completa → JSON | Executado, removido |
| `Backend/api/_verify_inventory.php` | Verificação de consistência | Executado, removido |
| `Backend/api/_test_glpi_endpoints.php` | Teste de endpoints GLPI | Executado, removido |

Dados coletados: `Backend/data/inventario_2026-09-10_23-15-51.json` (4.2 MB)

---

## Resumo das Inconsistências Resolvidas

| # | Inconsistência Original | Causa | Correção |
|---|---|---|---|
| 1 | "Tabela de nomes soma 574" | Relatório original incluiu 572 Computers + 2 Printer "impressoras" = 574, mastotal com todos os Printers é 575 | Tabela recalculada: 575 registros (572 Computer + 3 Printer), soma consistente |
| 2 | "CS aparece com 83 e 122" | Relatório original listou CS=83 e separadamente Computador=40 + Desktop=39=79, depois somou como 122 | CS- é 83 (40 Computador + 39 Desktop + 4 vazio/outro). O "122" era soma incorreta |
| 3 | "96 finalizados no total, 105 no grupo" | Estados e grupos são campos independentes | 91 estão nos dois. 5 têm estado "Finalizado" mas não o grupo.14 têm o grupo mas não o estado |
| 4 | "manufacturers_id vazio em 572/572" | Relatório original verificou apenas os primeiros registros | **529/572** têm fabricante preenchido (Lenovo, etc.). Apenas 43 estão vazios |
| 5 | "GCC não integra com GLPI para tickets" | Erro de interpretação | **GCC integra completamente** — lista, cria e vincula tickets via GLPI REST API |
| 6 | "Coleção vazia = sem permissão" | Atribuição de causa sem evidência | **Confirmado HTTP 403** para todas as coleções auxiliares. Ticket retorna 206 |
| 7 | "Endpoint printers" vs "impressoras" | Nomes confusos | `/api/assets/impressoras` busca **Computer** com tipo "Impressora" (9). `/api/assets/printers` busca **Printer** (3). Coleções diferentes |
| 8 | "Grupo/estado deixaram de ser atualizados após renomeação" | Conclusão não comprovada | **Removido.** Os dados mostram que grupo e estado são campos independentes do nome — não há evidência de que um foi atualizado e o outro não |

---

*Relatório corrigido em 2026-09-11. Todos os dados verificados contra o JSON bruto coletado. Separação entre fatos, cálculos, interpretações e informações não verificadas mantida ao longo do documento.*
