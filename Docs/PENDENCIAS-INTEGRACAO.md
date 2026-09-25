# Pendências de Integração — Sprint 01

**Data:** 21/09/2026

---

## Resumo de Prioridades

| Prioridade | Qtd | Descrição |
|---|---|---|
| **P1 — Crítica** | 4 | Bloqueia implementação do agente |
| **P2 — Alta** | 5 | Necessário para funcionalidade completa |
| **P3 — Média** | 4 | Melhoria de qualidade |
| **P4 — Baixa** | 3 | Futuro |

---

## P1 — Crítica (bloqueia agente de IA)

### 1. Validar coleções auxiliares com a conta de integração

**Status:** Não verificado
**Impacto:** Sem saber quais coleções (Group, State, Location, etc.) são acessíveis, não é possível implementar edição de dropdowns.

**Ação necessária:**
```bash
# Testar com o token da conta de integração:
curl -H "App-Token: {APP_TOKEN}" -H "Authorization: user_token {USER_TOKEN}" \
  https://glpi.colegiosatelite.cloud/apirest.php/Group?range=0-4

curl -H "App-Token: {APP_TOKEN}" -H "Authorization: user_token {USER_TOKEN}" \
  https://glpi.colegiosatelite.cloud/apirest.php/State?range=0-4

curl -H "App-Token: {APP_TOKEN}" -H "Authorization: user_token {USER_TOKEN}" \
  https://glpi.colegiosatelite.cloud/apirest.php/Location?range=0-4
```

**Esperado:** HTTP 200 com lista de itens. Se 403, a conta não tem acesso.

---

### 2. Definir perfil GLPI da conta de integração

**Status:** Desconhecido
**Impacto:** Perfil determina quais operações a conta pode executar.

**Ação necessária:** Verificar no painel admin do GLPI (`/front/profile.php`) qual perfil está atribuído ao usuário de integração.

---

### 3. Definir contrato de capacidades

**Status:** Proposta feita (`Docs/CONTRATO-CAPACIDADES.md`)
**Impacto:** Frontend e agente precisam de um formato para descobrir operações disponíveis.

**Ação necessária:**
- Revisar proposta.
- Decidir se `GET /api/capabilities` será implementado.
- Definir se o agente terá acesso a todas as capacidades ou apenas leitura.

---

### 4. Definir provedor de IA

**Status:** OpenCode Go verificado como viável. Conta não criada.
**Impacto:** Define se o chat migra do OpenAI ou se mantém.

**Opções:**

| Provedor | Preço | Tool Calling | Custo estimado/mês |
|---|---|---|---|
| OpenAI (atual) | variável | Sim | ~$5-20 |
| OpenCode Go | $10/mês | Sim (modelos compatíveis) | $10 fixo |
| OpenAI via OpenCode Go | via assinatura | Sim | $10 fixo |

**Recomendação:** Criar conta no OpenCode Go e testar com DeepSeek V4 Flash (mais barato) ou Kimi K2.7 Code (focado em código).

---

## P2 — Alta (necessário para funcionalidade completa)

### 5. Implementar endpoint de opções para dropdowns

**Status:** Não implementado
**Dependência:** P1.1 (validar coleções)

**Endpoints necessários:**
```
GET /api/options/locations    → /Location
GET /api/options/groups       → /Group
GET /api/options/states       → /State
GET /api/options/users        → /User
GET /api/options/manufacturers → /Manufacturer
GET /api/options/models       → /ComputerModel
GET /api/options/types        → /ComputerType
GET /api/options/entities     → /Entity
```

Cada endpoint retorna `[{id, name, completename}]`.

---

### 6. Implementar edição de dropdowns no Computer

**Status:** Não implementado
**Dependência:** P2.5

**Ação:** Adicionar IDs de dropdown ao `EDITABLE_COMPUTER_FIELDS` e criar resolução de nome → ID.

---

### 7. Implementar edição de Printer

**Status:** `editableValues` retorna array vazio
**Arquivo:** `mappers.php:244-276`

**Ação:** Adicionar `EDITABLE_PRINTER_FIELDS` e endpoint de update.

---

### 8. Service layer para operações GLPI

**Status:** Lógica inline nos endpoints
**Problema:** Código duplicado entre endpoints.php, projetors.php, tickets.php.

**Ação:** Criar classes de serviço (`AssetService`, `TicketService`, `ProjectorService`) para isolar a comunicação com o GLPI.

---

### 9. Implementar tool definitions para o agente

**Status:** Não implementado

**Ferramentas necessárias:**
```
get_asset           - Busca ativo por ID
search_assets       - Busca ativos por critérios
get_asset_details   - Detalhes completos de um ativo
update_asset        - Atualiza campos editáveis
get_tickets         - Lista chamados
create_ticket       - Cria chamado
get_projector_status - Status do projetor
update_lamp_hours   - Atualiza horas da lâmpada
get_capabilities    - Retorna contrato de capacidades
```

---

## P3 — Média (melhoria de qualidade)

### 10. Implementar criação de ativos

**Status:** Não implementado
**Impacto:** Agente não pode cadastrar novos ativos.

**Ação:** Criar `POST /api/assets/computers` que envia para `POST /Computer` no GLPI.

---

### 11. Migrar endpoints legados para pipeline classificado

**Status:** Parcial — endpoints legados ainda buscam GLPI diretamente
**Arquivo:** `endpoints.php:137-169` (getAllComputers, getAllPrinters)

**Problema:** Cada chamada legada abre sessão GLPI separada. O pipeline classificado já tem os dados.

**Ação:** Fazer endpoints legados lerem de `classified_assets.json` em vez de consultar GLPI.

---

### 12. Cache de coleções auxiliares

**Status:** Não implementado

**Ação:** Criar cache para Group, State, Location, etc. com TTL de 1 hora. Evita chamadas repetidas ao GLPI para dropdowns.

---

### 13. Logging estruturado

**Status:** Logs em texto livre em arquivos diários

**Ação:** Migrar para JSON estruturado com campos padronizados (timestamp, level, module, action, user, ip).

---

## P4 — Baixa (futuro)

### 14. Integração com outros itemtypes do GLPI

**Tipos não integrados:**
- Monitor
- Peripheral
- NetworkDevice
- Software
- Contract
- Document
- Budget

**Ação:** Avaliar se são necessários para o GCC. Se sim, adicionar ao pipeline de classificação.

---

### 15. Exclusão e restauração de ativos

**Status:** Não implementado

**Impacto:** Agente não pode excluir/restaurar ativos.

**Ação:** Implementar `DELETE /api/assets/computers/{id}` (soft delete via `is_deleted`) e `POST /api/assets/computers/{id}/restore`.

---

### 16. Automação de portais de fornecedores

**Status:** Apenas redirecionamento manual

**Fornecedores:** Torino, HBB, Acer Geek, Acer

**Ação:** Avaliar iframe, API ou automação para cada fornecedor.

---

## Checklist de Validação para Sprint 2

- [ ] Coleções auxiliares testadas (Group, State, Location)
- [ ] Perfil da conta de integração identificado
- [ ] Contrato de capacidades aprovado
- [ ] Provedor de IA definido e testado
- [ ] Endpoint `/api/options/*` implementado
- [ ] Service layer iniciado
- [ ] Pelo menos uma tool definition criada
