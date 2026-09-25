# Sprint 06 — Agente de IA Central do GCC

**Objetivo:** Implementar um agente central capaz de entender pedidos em português, consultar ativos, explicar capacidades, preparar alterações com prévia.

**Status:** Concluído (testes simulados, sem GLPI real)

---

## 1. Verificação do Provedor (OpenCode Go)

### Fonte e Data
- **URL:** https://opencode.ai/docs/go/
- **Data da verificação:** 2026-09-21
- **Status:** API disponível e funcional

### Configuração
| Campo | Valor |
|-------|-------|
| Base URL | `https://opencode.ai/zen/go/v1` |
| Endpoint Chat | `/chat/completions` |
| Autenticação | `Authorization: Bearer <api_key>` |
| Modelo padrão | `deepseek-flash` (DeepSeek V4 Flash) |
| Preço | $10/mês (Go plan) |

### Modelos Disponíveis (Go)
- DeepSeek V4 Flash (`deepseek-flash`) — suporta chat completions
- DeepSeek V4 Pro (`deepseek-v4-pro`)
- MiMo-V2.5 (`mimo-v2.5`)
- GLM-5.3-Flash (`glm-5.3-flash`)
- Kimi K3 (`kimi-k3`)
- Qwen3.7 Plus (`qwen3.7-plus`)

### Tool Calling
- OpenAI-compatible `/chat/completions` suporta tools nativamente
- Formato: `tools` array no request, `tool_calls` no response
- `tool_choice: "auto"` permite ao modelo decidir quando usar tools

### Limites
- DeepSeek V4 Flash: ~13.000 requests/5h
- MiMo-V2.5: ~30.100 requests/5h
- Timeout configurável (padrão: 30s)

---

## 2. Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (JS/CSS)                     │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │   agent_panel.js  │  │     agent-panel.css          │ │
│  │   (Painel IA)     │  │     (Estilos)                │ │
│  └────────┬─────────┘  └──────────────────────────────┘ │
└───────────┼─────────────────────────────────────────────┘
            │ POST /api/agent/chat
            ▼
┌─────────────────────────────────────────────────────────┐
│                    Backend (PHP)                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              endpoints.php                        │   │
│  │  /api/agent/chat                                  │   │
│  │  /api/agent/status                                │   │
│  │  /api/agent/history                               │   │
│  │  /api/agent/clear                                 │   │
│  │  /api/agent/proposal                              │   │
│  │  /api/agent/proposal/cancel                       │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                    │
│  ┌──────────────────▼───────────────────────────────┐   │
│  │           AgentService.php                        │   │
│  │  - Recebe mensagem                                │   │
│  │  - Valida acesso                                  │   │
│  │  - Carrega contexto                               │   │
│  │  - Chama modelo                                   │   │
│  │  - Processa tool calls                            │   │
│  │  - Retorna resposta                               │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                    │
│  ┌──────────────────▼───────────────────────────────┐   │
│  │           AIProvider.php                          │   │
│  │  - Adaptador OpenCode Go                          │   │
│  │  - Chat Completions API                           │   │
│  │  - Autenticação via Bearer                        │   │
│  │  - Modelo configurável                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │           AgentTools.php                          │   │
│  │  - buscar_ativos                                  │   │
│  │  - consultar_ativo                                │   │
│  │  - consultar_capacidades                          │   │
│  │  - consultar_opcoes                               │   │
│  │  - consultar_horas_projetor                       │   │
│  │  - consultar_status_sincronizacao                 │   │
│  │  - consultar_reconciliacao                        │   │
│  │  - consultar_operacao                             │   │
│  │  - preparar_alteracao                             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │           AgentProposal.php                       │   │
│  │  - Cria propostas SEM executar                    │   │
│  │  - Valida permissões                              │   │
│  │  - Persiste em data/proposals/                    │   │
│  │  - Expira em 1 hora                               │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Ferramentas e Schemas

### buscar_ativos
```json
{
  "query": "string (obrigatório, máx 100 chars)",
  "category": "string (opcional: computer_cs, chromebook_student, etc)",
  "limit": "integer (opcional, máx 50)"
}
```
**Retorna:** Lista de ativos com itemtype, id, name, serial, otherserial, category, location.

### consultar_ativo
```json
{
  "itemtype": "Computer | Printer (obrigatório)",
  "id": "integer (obrigatório)"
}
```
**Retorna:** Detalhes completos do ativo incluindo dados brutos do GLPI.

### consultar_capacidades
```json
{}
```
**Retorna:** Contrato completo de capacidades (versão, tipos, campos, operações, coleções).

### consultar_opcoes
```json
{
  "collection": "Group | State | Location | ... (obrigatório)"
}
```
**Retorna:** Itens da coleção auxiliar do GLPI.

### consultar_horas_projetor
```json
{
  "name": "string (obrigatório)"
}
```
**Retorna:** Horas de uso e manutenção do projectors.json. **Nota:** Dados do GCC, não do GLPI.

### consultar_status_sincronizacao
```json
{}
```
**Retorna:** Idade do cache, contagem de itens, última atualização.

### consultar_reconciliacao
```json
{
  "category": "string (opcional)"
}
```
**Retorna:** Divergências entre GLPI e cache local.

### consultar_operacao
```json
{
  "operation_id": "UUID (obrigatório)"
}
```
**Retorna:** Status de uma operação de escrita.

### preparar_alteracao
```json
{
  "action": "create | update | delete | restore (obrigatório)",
  "itemtype": "Computer | Printer (obrigatório)",
  "id": "integer (obrigatório para update/delete/restore)",
  "fields": "object (obrigatório para create/update)"
}
```
**Retorna:** Proposta completa com campos atuais vs propostos, permissões, pendências.

---

## 4. Autorização

- Cada ferramenta valida acesso independente
- `buscar_ativos`, `consultar_ativo`, `consultar_capacidades`: leitura
- `consultar_opcoes`: valida allow-list de coleções
- `preparar_alteracao`: valida permissões de escrita por itemtype
- Usuário identificado via sessão (GLPI user ID)
- Isolamento por usuário no histórico

---

## 5. Limites

| Parâmetro | Valor |
|-----------|-------|
| Histórico máximo | 20 turnos |
| Tool calls por turno | 5 |
| Tool calls total | 15 |
| Tamanho mensagem | 2000 caracteres |
| Timeout modelo | 30 segundos |
| Proposta validade | 1 hora |
| Max resultados busca | 50 |

---

## 6. Propostas de Alteração

### Fluxo
1. IA chama `preparar_alteracao` com dados da proposta
2. Backend valida permissões e monta proposta
3. Proposta persistida em `data/proposals/`
4. Usuário visualiza e pode cancelar
5. **NENHUMA gravação é executada nesta sprint**

### Estrutura da Proposta
```json
{
  "proposal_id": "prop_abc123...",
  "status": "pending",
  "created_at": "2026-09-21T10:00:00+00:00",
  "expires_at": "2026-09-21T11:00:00+00:00",
  "created_by": "user@email.com",
  "action": "update",
  "itemtype": "Computer",
  "id": 1,
  "asset_name": "CS-001",
  "current_values": { "name": "CS-001", "serial": "SN123" },
  "proposed_values": { "name": "CS-002" },
  "field_sources": { "name": "agent_proposed", "serial": "same_as_current" },
  "permissions": { "can_write": true, "supported_operation": true },
  "pending_validations": [],
  "disclaimer": "PRÉVIA — nenhuma alteração executada. Esta proposta expira em 1 hora."
}
```

---

## 7. Origem e Tratamento dos Dados

| Dado | Fonte | Indicação |
|------|-------|-----------|
| Ativos ( Computer, Printer) | GLPI via cache | `source: cache` |
| Horas de projetor | projectors.json | `source: projectors.json` + warning |
| Coleções auxiliares | GLPI API | `source: glpi` |
| Capacidades | Contrato estático | `source: static` |
| Reconciliação | GLPI + cache | `source: glpi+cache` + warning |
| Propostas | GCC local | `source: proposal` |

---

## 8. Segurança

- Chave da API nunca exposta ao navegador
- Chave armazenada em variável de ambiente `OPENCODE_GO_API_KEY`
- Mensagens enviadas ao modelo: apenas texto + tools definitions
- Dados GLPI (tokens, cookies) nunca enviados ao modelo
- Comentários/nomes do GLPI tratados como dados externos
- Tool name e argumentos validados contra lista permitida
- Autorização aplicada em cada ferramenta independentemente

---

## 9. Interface do Assistente

### Desktop
- Painel lateral (420px) à direita
- Toggle button (robot emoji) canto inferior direito
- Contexto do ativo selecionado na barra superior
- Mensagens com bubbles (usuário = azul, assistente = cinza)
- Campo de entrada com Enter para enviar
- Escape fecha o painel

### Mobile (≤767px)
- Painel tela inteira
- Toggle button menor (48px)
- Conteúdo rolável sem cobrir botões
- Fechamento acessível

### Estados
- **Consultando:** Spinner animado
- **Aguardando:** Input habilitado
- **Resposta:** Mensagem renderizada
- **Proposta:** Card verde com campos e botão cancelar
- **Indisponível:** Mensagem amarela com instruções
- **Erro:** Mensagem vermelha com retry

---

## 10. Testes

### Resultado
- **Total:** 69 testes
- **Passaram:** 69
- **Falharam:** 0

### Cobertura
- AIProvider: 9 testes (instanciação, configuração, status)
- AgentTools: 14 testes (definições, formato, nomes únicos)
- Validação: 9 testes (argumentos inválidos, limites)
- Execução: 7 testes (ferramentas com cache)
- AgentProposal: 13 testes (criação, recuperação, cancelamento, validação)
- AgentService: 6 testes (instanciação, status, histórico)
- Segurança: 6 testes (limites, isolamento, sem escrita)
- Fonte dos dados: 5 testes (indicação de origem)

### Testes com GLPI
- Ferramentas que dependem de GLPI real pulam quando não configurado
- `consultar_opcoes`, `consultar_reconciliacao` retornam erro gracefully

---

## 11. Arquivos Criados/Modificados

### Criados
- `Backend/api/services/AIProvider.php` — Adaptador OpenCode Go
- `Backend/api/services/AgentService.php` — Serviço central do agente
- `Backend/api/services/AgentTools.php` — Definição e execução de ferramentas
- `Backend/api/services/AgentProposal.php` — Preparação de propostas
- `Frontend/javascript/agent_panel.js` — Painel do assistente
- `Frontend/css/agent-panel.css` — Estilos do painel
- `Backend/tests/test_sprint6_agent.php` — 69 testes
- `Docs/SPRINT-06-AGENTE-IA.md` — Esta documentação

### Modificados
- `Backend/api/endpoints.php` — 6 novas rotas `/api/agent/*`

---

## 12. Preparação para Sprint 7

### Pendente
- [ ] Confirmar execução de propostas (botão "Executar" no painel)
- [ ] Integração com AssetWriteService para gravar alterações
- [ ] Validação de concorrência antes da execução
- [ ] Atualização de cache pós-execução
- [ ] Audit trail completo da proposta executada
- [ ] Testes com GLPI real

### Configuração para Produção
1. Definir `OPENCODE_GO_API_KEY` no `.env`
2. Definir `OPENCODE_GO_MODEL` (opcional, padrão: `deepseek-flash`)
3. Testar com modelo real antes de liberar

---

## Resposta Final

### 1. Arquivos Funcionais
- `AIProvider.php`, `AgentService.php`, `AgentTools.php`, `AgentProposal.php`
- `agent_panel.js`, `agent-panel.css`
- 6 novas rotas em `endpoints.php`

### 2. Provedor e Modelo
- **Provedor:** OpenCode Go
- **Modelo testado:** deepseek-flash (DeepSeek V4 Flash)
- **Status:** Configurado, testes com respostas simuladas

### 3. Ferramentas Disponíveis
9 ferramentas: buscar_ativos, consultar_ativo, consultar_capacidades, consultar_opcoes, consultar_horas_projetor, consultar_status_sincronizacao, consultar_reconciliacao, consultar_operacao, preparar_alteracao

### 4. Exemplos de Consultas
- "Quais computadores estão na Sala TI?" → `buscar_ativos`
- "Mostre os dados do CS-001" → `consultar_ativo`
- "Quais campos posso editar?" → `consultar_capacidades`
- "Quais grupos existem?" → `consultar_opcoes`
- "Prepare uma alteração para renomear CS-001" → `preparar_alteracao`

### 5. Evidência de Sem Escrita
- `preparar_alteracao` retorna status `pending`
- Disclaimer: "PRÉVIA — nenhuma alteração executada"
- Nenhuma ferramenta de execução existe no sistema

### 6. Testes
- 69 testes passando (simulados)
- GLPI real: testes pulam graceful quando não configurado

### 7. Validações Pendentes
- Teste visual do painel no navegador
- Teste com chave real do OpenCode Go
- Teste com GLPI real
- Validação de tool calling com modelo real
