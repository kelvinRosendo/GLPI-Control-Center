# Sprint 01 — Capacidades CRUD e Agente de IA do GCC

**Data:** 21/09/2026
**Commit analisado:** `079ed69`
**Versão do GLPI:** 10.0.19
**PHP:** 8.3 | **MariaDB:** 10.11

---

## 1. Arquitetura

```
Navegador → Traefik (HTTPS) → Nginx (porta 8081) → Frontend (HTML/CSS/JS)
                                                       ↓
                                                   Backend PHP-FPM (pool gcc)
                                                       ↓
                                                   API GLPI (porta 8080) → MariaDB
```

- **Backend:** PHP 8.3 puro (sem framework), endpoint único `endpoints.php` com roteamento manual via `match` e regex.
- **Frontend:** JavaScript vanilla (HTML/CSS/JS), módulos em `window.*` sem bundler.
- **Autenticação:** Google Identity Services (OAuth) → JWT validado no backend → sessão HMAC (`gcc_session` cookie + Bearer token).
- **Autorização:** RBAC com dois perfis: `ADMIN` e `SUPORTE`. Permissões por módulo e ação em `PermissionMiddleware`.
- **Cliente GLPI:** `GlpiClient` — cURL direto para `apirest.php`, sessão init/kill por operação.
- **Token GLPI:** `GLPI_USER_TOKEN` (conta de integração), `GLPI_APP_TOKEN`. A conta de integração tem perfil e entidade próprios — não herda acesso amplo do admin.

### Restrição pelo backend

O backend restringe operações independentemente do token GLPI:
1. `authorizeRequest()` valida perfil GCC (ADMIN/SUPORTE) antes de qualquer chamada ao GLPI.
2. `PermissionMiddleware::requireAction()` verifica módulo + ação.
3. `Mappers::filterEditableComputerInput()` permite somente campos textuais para edição.
4. Rotas de escrita (PUT, POST) exigem CSRF token.

---

## 2. Tipos e Categorias Integrados

### Coleções GLPI consultadas

| Coleção GLPI | Método de busca | Endpoint GCC |
|---|---|---|
| `/Computer` | `getAllWithParams` com paginação | `/api/assets/*`, `/api/assets/all` |
| `/Printer` | `getAllWithParams` com paginação | `/api/assets/impressoras` |

**Nota:** Apenas `Computer` e `Printer` são consultados diretamente. Todos os Chromebooks, projetores e impressoras cadastradas como Computer são filtrados a partir da coleção `/Computer` via `Classifier`.

### Categorias GCC (asset-catalog.php v1.0.0)

| Categoria GCC | Itemtype GLPI | Regra de classificação | Prioridade |
|---|---|---|---|
| `printer` | `Printer` | Qualquer impressora nativa | 100 |
| `projector` | `Computer` | `computertypes_id` = projetor(es) | 95 |
| `projector` | `Computer` | `name` começa com "Projetor" | 90 |
| `printer_computer` | `Computer` | `computertypes_id` = impressora(es) | 85 |
| `printer_computer` | `Computer` | `name` = EPSON/Pantum/RICOH/SAMSUNG/Impressora | 80 |
| `chromebook_student` | `Computer` | `name` = "Chrome G-*" | 70 |
| `chromebook_display` | `Computer` | `name` = "Chrome*EDU" ou "EDU1/2/3" | 65 |
| `chromebook_support` | `Computer` | `name` = "Chrome-*" | 60 |
| `computer_cs` | `Computer` | `name` = "CS-*" ou "CO-*" | 50 |
| `computer_cs` | `Computer` | `computertypes_id` = Computador/Desktop | 40 |
| `unclassified` | (qualquer) | Nenhuma regra casou | — |

### Rotas GCC por categoria

| Categoria | Rota de listagem | Rota de detalhe | Rota de edição |
|---|---|---|---|
| `computer_cs` | `GET /api/assets/computers` | `GET /api/assets/computers/{id}` | `POST /api/assets/computers/{id}` |
| `chromebook_student` | `GET /api/assets/chromebooks-geekiees` | (usa rota de computer) | `POST /api/assets/computers/{id}` |
| `chromebook_support` | `GET /api/assets/chromebooks-apoio` | (usa rota de computer) | `POST /api/assets/computers/{id}` |
| `chromebook_display` | `GET /api/assets/chromebooks-exibicao` | (usa rota de computer) | `POST /api/assets/computers/{id}` |
| `projector` | `GET /api/assets/projetores` + `GET /api/projetors` | `GET /api/projetors/{id}` | Sem edição GLPI (dados em `projectors.json`) |
| `printer` | `GET /api/assets/impressoras` | `GET /api/assets/printers/{id}` | Sem edição |
| `printer_computer` | (via `/api/assets/computers`) | `GET /api/assets/computers/{id}` | `POST /api/assets/computers/{id}` |
| `unclassified` | `GET /api/assets/all` | (via `/api/assets/computers/{id}`) | `POST /api/assets/computers/{id}` |

### Última sincronização conhecida

- **Total:** 577 ativos (574 Computer + 3 Printer)
- **Data:** 11/09/2026 21:02:17
- **Duração:** 5.6s
- **Status:** success (sem erros)

---

## 3. Matriz de Campos

Ver `MATRIZ-CAMPOS-ATIVOS.csv` para mapeamento completo.

### Resumo por tipo

**Computer (todos os subtipos):**

| Campo GLPI | Campo GCC | Tipo | Edição | Evidência |
|---|---|---|---|---|
| `id` | `glpiId` | int | Não | `mappers.php:23` |
| `name` | `nome` | string | **Sim** | `mappers.php:10-17` |
| `serial` | `serial` | string | **Sim** | `mappers.php:10-17` |
| `otherserial` | `patrimonio` | string | **Sim** | `mappers.php:10-17` |
| `contact` | `nome_alternativo_usuario` | string | **Sim** | `mappers.php:10-17` |
| `contact_num` | `numero_nome_alternativo_usuario` | string | **Sim** | `mappers.php:10-17` |
| `comment` | `comentario` | textarea | **Sim** | `mappers.php:10-17` |
| `locations_id` | `reparticao` | dropdown (label) | Não | `mappers.php:28` |
| `users_id` | `usuario` | dropdown (label) | Não | `mappers.php:29` |
| `computermodels_id` | `modelo` | dropdown (label) | Não | `mappers.php:30` |
| `groups_id` | `grupo` | dropdown (label) | Não | `mappers.php:31` |
| `states_id` | `status` | dropdown (label) | Não | `mappers.php:27` |
| `entities_id` | `entity_name` | dropdown (label) | Não | `mappers.php:224` |
| `computertypes_id` | `type_name` | dropdown (label) | Não | `mappers.php:229` |
| `manufacturers_id` | `manufacturer_name` | dropdown (label) | Não | `mappers.php:228` |
| `operatingsystems_id` | `os_name` | dropdown (label) | Não | `mappers.php:231` |
| `uuid` | `uuid` | string | Não | `mappers.php:230` |
| `date_creation` | `date_creation` | datetime | Não | `mappers.php:236` |
| `date_mod` | `date_mod` | datetime | Não | `mappers.php:237` |

**Printer:**

| Campo GLPI | Campo GCC | Tipo | Edição | Evidência |
|---|---|---|---|---|
| `id` | `glpiId` | int | Não | `mappers.php:125-143` |
| `name` | `nome` | string | Não | `mappers.php:125-143` |
| `serial` | `serial` | string | Não | `mappers.php:125-143` |
| `otherserial` | `patrimonio` | string | Não | `mappers.php:125-143` |
| `contact` | `nome_alternativo_usuario` | string | Não | `mappers.php:125-143` |
| `contact_num` | `numero_nome_alternativo_usuario` | string | Não | `mappers.php:125-143` |
| `comment` | `comentario` | string | Não | `mappers.php:125-143` |
| `locations_id` | `reparticao` | dropdown (label) | Não | `mappers.php:125-143` |
| `users_id` | `usuario` | dropdown (label) | Não | `mappers.php:125-143` |
| `printermodels_id` / `computermodels_id` | `modelo` | dropdown (label) | Não | `mappers.php:137` |
| `manufacturers_id` | `fabricante` | dropdown (label) | Não | `mappers.php:138` |
| `states_id` | `status` | dropdown (label) | Não | `mappers.php:133` |

**Projetores (dados enriquecidos — fonte mista):**

| Campo | Origem | Edição |
|---|---|---|
| `glpiId`, `nome`, `serial`, `patrimonio`, `modelo`, `reparticao`, `usuario`, `glpi_status`, `comentario` | GLPI (via `Mappers::projetor`) | Somente leitura |
| `horas_lampada`, `vida_util_estimada`, `data_troca_lampada`, `ultima_manutencao`, `ultima_limpeza`, `horas_totais`, `notas`, `responsavel_atual`, `fabricante`, `data_aquisicao` | `projectors.json` (GCC) | **Sim** (via `/api/projetors/{id}/lamp`) |
| `manutencoes[]` | `projectors.json` (GCC) | **Sim** (via `/api/projetors/{id}/maintenance`) |
| `percentual_uso`, `alertas`, `status_calculado` | Derivados pelo GCC | Não |

---

## 4. CRUD e Restauração

Ver `MATRIZ-OPERACOES-CRUD.csv` para mapeamento completo.

### Resumo por operação

| Operação | Computer | Printer | Projetor | Chamado |
|---|---|---|---|---|
| **Listar** | GET `/api/assets/computers` | GET `/api/assets/impressoras` | GET `/api/projetors` | GET `/api/tickets` |
| **Detalhe** | GET `/api/assets/computers/{id}` | GET `/api/assets/printers/{id}` | GET `/api/projetors/{id}` | GET `/api/tickets/asset/{id}` |
| **Criar** | — | — | — | POST `/api/tickets` |
| **Atualizar** | POST `/api/assets/computers/{id}` | — | PUT `/api/projetors/{id}/lamp` (apenas horas) | — |
| **Excluir** | — | — | — | — |
| **Restaurar** | — | — | — | — |

### Nível de comprovação

| Nível | Significado |
|---|---|
| **C** | Comprovado por teste existente ou evidência verificável |
| **B** | Implementado no código do GCC |
| **A** | Suportado pela documentação GLPI |
| **D** | Ainda não verificado |

**Todos os endpoints de leitura estão em nível C** (implementados e com dados reais no cache).
**Endpoints de escrita:** Computer edit está em nível B/C (código implementado, PUT para GLPI comprovado). Projetor horas em nível C. Chamados em nível C.

### campos ausentes no CRUD

- **Criação de Computer:** Não implementada no GCC.
- **Exclusão de ativos:** Não implementada.
- **Restauração:** Não implementada.
- **Edição de Printer:** Não implementada (`printerDetails` retorna `editableValues: []`).
- **Edição de dropdowns (localização, grupo, estado, etc.):** Não implementada — requer resolve de ID por nome.

---

## 5. Permissões e Coleções Auxiliares

### Perfil da conta de integração GLPI

- A conta de integração (`GLPI_USER_TOKEN`) tem perfil próprio configurado no GLPI.
- O backendGCC restringe por `PermissionMiddleware` mesmo que o token GLPI tenha acesso mais amplo.
- Não há evidência de qual perfil GLPI a conta de integração possui (requer inspeção manual no GLPI admin).

### Coleções necessárias para edição de dropdowns

| Coleção GLPI | Endpoint | Necessário para |
|---|---|---|
| `/Group` | `GET /Group` | Seleção de grupo |
| `/State` | `GET /State` | Seleção de estado |
| `/Location` | `GET /Location` | Seleção de localização |
| `/Manufacturer` | `GET /Manufacturer` | Seleção de fabricante |
| `/ComputerModel` | `GET /ComputerModel` | Seleção de modelo |
| `/ComputerType` | `GET /ComputerType` | Seleção de tipo |
| `/User` | `GET /User` | Seleção de responsável |
| `/Entity` | `GET /Entity` | Seleção de entidade |
| `/PrinterModel` | `GET /PrinterModel` | Seleção de modelo de impressora |
| `/PrinterType` | `GET /PrinterType` | Seleção de tipo de impressora |
| `/ItilCategory` | `GET /ItilCategory` | Seleção de categoria de chamado |

**Status:** Não verificados nesta sprint (requer chamada autenticada ao GLPI). Não foram encontrados endpoints no GCC que consultem essas coleções. A conta de integração pode não ter acesso a todas — `GET /State`, `GET /Group` etc. podem retornar 403.

### Restrição do backend

O backend GCC sempre:
1. Autentica o usuário GCC via sessão HMAC.
2. Verifica perfil (ADMIN/SUPORTE) e módulo/ação.
3. Utiliza o token da conta de integração para falar com o GLPI.
4. Não herda permissões do usuário logado — a conta de integração tem permissões próprias.

---

## 6. Fonte Oficial e Persistência

### Classificação de origem

| Dado | Fonte | Classificação |
|---|---|---|
| Dados de inventário (nome, serial, patrimônio, etc.) | GLPI | Oficial no GLPI |
| Classificação GCC (categoria, propósito, confiança) | Regras do catálogo | Exclusiva do GCC |
| Horas de lâmpada, manutenções | `projectors.json` | Exclusiva do GCC |
| Estado normalizado (em_uso, comodato, etc.) | `state_mapping` | Derivada por regra |
| Chamados | GLPI | Oficial no GLPI |
| Respostas do chat | OpenAI API | Cópia em cache |

### Persistência

| Armazenamento | Caminho | Conteúdo |
|---|---|---|
| Cache classificado | `Backend/data/cache/classified_assets.json` | Ativos classificados (~577) |
| Status sync | `Backend/data/cache/sync_status.json` | Última sincronização |
| Projetores | `Backend/data/projectors.json` | Dados extras dos projetores |
| Inventário completo | `Backend/data/inventario_*.json` | Snapshots de cada sync |
| Relatório sync | `Backend/data/sync_report.json` | Estatísticas da sync |
| Logs | `Backend/logs/` | Erros, sync, access denied |
| Auditoria | `Backend/logs/` | Ações de integração |

### Consistência

O GCC **não grava duplicata** no GLPI. Todas as escritas para o GLPI passam por `GlpiClient::put/post` diretamente. O `projectors.json` é uma camada adicional exclusiva do GCC — não sincroniza de volta para o GLPI.

---

## 7. Caso Esspecífico: Horas dos Projetores

### Situação atual

1. **Dados do GLPI:** Nome, serial, patrimônio, modelo, localização, comentário, estado.
2. **Dados extras do GCC:** `horas_lampada`, `vida_util_estimada`, `data_troca_lampada`, `ultima_manutencao`, `ultima_limpeza`, `horas_totais`, `notas`, `responsavel_atual`, `fabricante`, `data_aquisicao`, `manutencoes[]`.
3. **Parser de comentários:** `projectors.parser.js` extrai horas de textos como "Sala 02 - 3038h" ou "3038 horas".
4. **Problema:** Horas ficam em `projectors.json` (exclusiva do GCC) e não no GLPI.

### Como distinguir horas de outros números

- O parser procura por padrões: `\d+\.?\d*\s*(?:h|hrs?|horas?)`.
- Datas são extraídas separadamente com `\d{1,2}/\d{1,2}/\d{4}`.
- O campo `horas_lampada` é sempre numérico, separado do texto.

### Proposta de contrato para registro

```json
{
  "horas_lampada": 1250,
  "data_leitura": "2026-09-21",
  "origem": "manual|api| parser",
  "responsavel": "nome_do_tecnico",
  "reiniciado": false,
  "data_troca_lampada": null
}
```

**Alternativas se o GLPI não tiver campo apropriado:**
1. Usar `comment` para registrar (já parcialmente feito) — perda de estrutura.
2. Criar campo customizado no plugin GLPI (requires admin access).
3. Manter exclusivamente no `projectors.json` — funciona, mas é fonte duplicada.

---

## 8. Provedor de IA: OpenCode Go

### Verificação realizada

| Aspecto | Resultado |
|---|---|
| API acessível por aplicações externas | **Sim** — `https://opencode.ai/zen/go/v1/chat/completions` (OpenAI-compatible) |
| Autenticação | API key via header `Authorization: Bearer` |
| Modelos disponíveis | 28+ modelos (Grok, GPT, DeepSeek, Kimi, MiMo, Qwen, MiniMax, Hy, etc.) |
| Suporte a tool calling | **Depende do modelo** — modelos OpenAI-compatible suportam `tools` no payload; Anthropic-compatible usam `tools` no formato Messages API |
| Limites | $12/5h, $30/semana, $60/mês |
| Preço | $5 primeiro mês, $10/mês depois |
| Retenção de dados | Maioria: 0 dias (ZDR). Grok/GPT: 30 dias |
| Chamada pelo backend PHP | **Viável** — endpoint é compatível com OpenAI, mesmo formato JSON. Pode usar cURL no PHP |

### Recomendação

- **Modelo recomendado para agentes com tool calling:** DeepSeek V4 Pro/Flash, Kimi K2.7 Code, ou Qwen3.7 Max.
- **Para chat simples (sem tools):** MiMo-V2.5 ou GLM-5.2 são suficientes.
- **O chat atual usa OpenAI (gpt-4o-mini)** — pode ser migrado para OpenCode Go com mudança mínima de URL e chave.

### Pendência

- Criar conta e assinar OpenCode Go (não feito nesta sprint).
- Testar chamada real com tool calling do PHP.
- Validar se o backend PHP pode enviar headers customizados (`x-opencode-session`).

---

## 9. Limitações e Lacunas

### Não implementado no GCC

1. **Criação de ativos** — não há endpoint para criar Computer/Printer no GLPI.
2. **Exclusão de ativos** — não há endpoint para excluir.
3. **Edição de Printer** — `editableValues` retorna vazio.
4. **Edição de dropdowns** — localização, grupo, estado, etc. requerem resolução ID por nome.
5. **Consulta de coleções auxiliares** — Group, State, Location, etc. não são consultados.
6. **Delete/restore de chamados** — não implementado.
7. **Outros itemtypes do GLPI** — Monitor, Peripheral, NetworkDevice, Software, etc. não integrados.

### Limitações do GLPI API

- REST API não suporta filtro `modified` para sync incremental — busca tudo sempre.
- Campos de dropdown retornam ID ou label dependendo de `expand_dropdowns`.
- Permissões da conta de integração podem ser restritas para coleções auxiliares.

### Decisões pendentes

1. Qual perfil GLPI da conta de integração?
2. Quais coleções auxiliares estão acessíveis?
3. O agente de IA deve ter permissão de escrita ou apenas leitura?
4. Deve-se migrar o chat de OpenAI para OpenCode Go?

---

## 10. Entregues nesta Sprint

| Arquivo | Descrição |
|---|---|
| `Docs/SPRINT-01-CAPACIDADES-CRUD.md` | Este documento |
| `Docs/MATRIZ-CAMPOS-ATIVOS.csv` | Mapeamento de campos por tipo |
| `Docs/MATRIZ-OPERACOES-CRUD.csv` | Métodos, rotas, permissões e comprovação |
| `Docs/CONTRATO-CAPACIDADES.md` | Proposta de contrato para frontend e agente |
| `Docs/PENDENCIAS-INTEGRACAO.md` | Pendências com prioridade |

---

## 11. Resposta Final

### 1. O que já funciona

- Listagem de todos os tipos de ativos (Computer, Printer, todos os subtipos via classificação).
- Detalhe de Computer com campos estruturados e seções.
- Detalhe de Printer com campos estruturados.
- Detalhe de Projetor com dados enriquecidos (GLPI + projectors.json).
- Edição de campos textuais de Computer (name, serial, otherserial, contact, contact_num, comment).
- Atualização de horas de lâmpada de projetores.
- Registro de manutenção de projetores.
- Criação de chamados (Ticket + Item_Ticket).
- Listagem de chamados por ativo.
- Sincronização completa e incremental com cache classificado.
- Autenticação Google + RBAC (ADMIN/SUPORTE).
- Diagnóstico de divergência GLPI x GCC.

### 2. O que existe parcialmente

- Edição de projetores (apenas horas/manutenção — campos do GLPI não editáveis).
- Chat de IA (usa OpenAI, contexto fixo de horários — não integrado com ativos).
- Classificação pipeline v2 (implementada mas nem todos os endpoints usam).
- Cache classificado (existe mas endpoints legados ainda consultam GLPI diretamente).

### 3. O que precisa ser implementado

- Consulta de coleções auxiliares (Group, State, Location, etc.).
- Edição de dropdowns (requer resolução ID por nome).
- Edição de Printer.
- Criação de ativos.
- Exclusão/restauração de ativos.
- Integração do agente de IA com operações CRUD.
- Contrato de capacidades para o frontend.
- Migração do chat para OpenCode Go (ou manter OpenAI).

### 4. Quais permissões ou decisões faltam

- Perfil GLPI da conta de integração (quais coleções pode ler/escrever).
- Acesso a coleções auxiliares (Group, State, etc.).
- Decisão sobre provedor de IA (OpenAI vs OpenCode Go).
- Escopo de escrita do agente de IA (leitura apenas vs. CRUD completo).
- Aprovação para criar campos customizados no GLPI (se necessário para horas).

### 5. Situação da API do OpenCode Go

- **Acessível:** Sim, API OpenAI-compatible em `https://opencode.ai/zen/go/v1/chat/completions`.
- **Autenticação:** API key via Bearer token.
- **Tool calling:** Suportado pelos modelos OpenAI-compatible (DeepSeek, Kimi, MiMo, etc.).
- **Custo:** $5 primeiro mês, $10/mês. Limites generosos.
- **Viável para PHP:** Sim — mesmo formato do OpenAI, mudança mínima.
- **Pendência:** Conta não criada, chave não configurada.

### 6. Arquivos entregues

- `Docs/SPRINT-01-CAPACIDADES-CRUD.md`
- `Docs/MATRIZ-CAMPOS-ATIVOS.csv`
- `Docs/MATRIZ-OPERACOES-CRUD.csv`
- `Docs/CONTRATO-CAPACIDADES.md`
- `Docs/PENDENCIAS-INTEGRACAO.md`

### 7. Próximas ações para iniciar a Sprint 2

1. **Validação real das coleções auxiliares** — testar Group, State, Location, etc. com a conta de integração.
2. **Definir contrato de capacidades** — decidir formato final e implementar no backend.
3. **Serviço de resolução de dropdowns** — endpoint que resolve nome → ID para edição.
4. **Service layer para CRUD** — isolar operações GLPI em classes reutilizáveis.
5. **Definir provedor de IA** — criar conta no OpenCode Go e testar chamada.
6. **Tool definitions** — definir quais ferramentas o agente terá (buscar ativo, editar campo, criar chamado, etc.).
7. **Implementar criação de ativos** — se necessário para o agente.
