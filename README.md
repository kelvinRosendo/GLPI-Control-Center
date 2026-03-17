<div align="center">

# 🖥️ GLPI Control Center

### Painel moderno de gestão de ativos de TI integrado à API REST do GLPI

*Rápido · Visual · Seguro*

<br/>

![Status](https://img.shields.io/badge/status-v0.2%20concluído-22c55e?style=for-the-badge)
![PHP](https://img.shields.io/badge/PHP-8.x-777BB4?style=for-the-badge&logo=php&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?style=for-the-badge&logo=openai&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)

</div>

---

## O Problema

A interface padrão do GLPI foi projetada para administradores — não para quem precisa de uma visão rápida do estado dos dispositivos no dia a dia. Em ambientes com 200+ ativos, localizar um Chromebook emprestado, identificar equipamentos em manutenção ou abrir um chamado exige dezenas de cliques e nenhuma visão consolidada.

## A Solução

O **GLPI Control Center** é um painel frontend dedicado que consome a API REST do GLPI via proxy PHP seguro e entrega uma interface limpa com busca instantânea, filtros por status, organização por carrinhos, acesso direto a cada ativo, um assistente de IA para consulta de horários e um sistema nativo de chamados integrado diretamente ao GLPI.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5 + CSS3 + JavaScript Vanilla |
| Backend | PHP 8.x (API Proxy) |
| Comunicação GLPI | API REST + cURL |
| Autenticação | App Token + User Token (via `.env`) |
| Assistente IA | OpenAI API — `gpt-4o-mini` |

---

## Arquitetura

Os tokens do GLPI e a chave da OpenAI **nunca chegam ao navegador** — ficam exclusivamente no servidor PHP.

![Arquitetura do GLPI Control Center](docs/architecture.svg)

---

## Funcionalidades

<div align="center">

![Ativos](https://img.shields.io/badge/🏠_Home-cards_por_categoria-1e3a5f?style=for-the-badge)
![Abas](https://img.shields.io/badge/📂_Abas-5_tipos_de_ativo-1e3a5f?style=for-the-badge)
![Busca](https://img.shields.io/badge/🔍_Busca-nome_·_serial_·_patrimônio-1e3a5f?style=for-the-badge)
![Chat](https://img.shields.io/badge/🤖_Assistente_IA-GPT--4o--mini-412991?style=for-the-badge)
![Chamados](https://img.shields.io/badge/🎫_Chamados-nativo_no_GLPI-14532d?style=for-the-badge)

</div>

<br/>

### 🏠 Painel Home
- Cards com totais por categoria (Computadores, Chromebooks, Projetores, Impressoras)
- Indicadores visuais de status: **Ativo**, **Manutenção**, **Emprestado**

### 📂 Abas por Categoria
- Computadores (`CS-`, `CO-`)
- Chromebooks Geekiees (`Chrome G-`)
- Chromebooks Apoio — organizados por **carrinho** (`Carrinho 1` a `Carrinho 4`)
- Projetores
- Impressoras

### 🔍 Por Ativo
- Busca por nome, serial ou patrimônio
- Filtro por status
- Botão **Abrir no GLPI** — redireciona diretamente para o ativo

### 🤖 Assistente IA (OpenAI)
- Chat integrado no painel — sem redirecionar para nenhuma plataforma externa
- Consulta de horários de utilização dos carrinhos de Chromebooks por sala e turno
- Contexto fixo: documento de horários inserido como `system` prompt no backend
- Chave da API protegida no servidor — nunca exposta ao browser
- Modelo `gpt-4o-mini` — rápido, preciso e econômico

### 🎫 Sistema de Chamados
- Botão **Abrir chamado** em cada card de ativo — modal com o ativo já pré-vinculado
- Formulário nativo: título, descrição, prioridade e categoria
- O backend cria o ticket via `POST /Ticket` e o vincula via `POST /Item_Ticket`
- O chamado aparece instantaneamente no GLPI, associado ao equipamento correto
- Aba **Chamados** com lista geral de todos os tickets filtráveis por status

---

## Estrutura do Projeto

```
GLPI-Control-Center/
├── Backend/
│   ├── .env                  ← tokens (nunca sobe pro Git)
│   ├── config/
│   │   └── config.php
│   └── api/
│       ├── endpoints.php     ← roteador da API
│       ├── client.php        ← cliente cURL → GLPI
│       ├── mappers.php       ← transforma dados brutos do GLPI
│       ├── chat.php          ← proxy OpenAI API
│       ├── tickets.php       ← criação e consulta de chamados
│       └── utils/
│           ├── env.php
│           └── responde.php
│
└── Frontend/
    ├── index.html
    ├── css/styles.css
    └── javascript/
        ├── data.js           ← CONFIG e window.DATA
        ├── state.js          ← estado global
        ├── auth.js           ← login/logout
        ├── glpi.client.js    ← fetch para o backend GLPI
        ├── chat.js           ← módulo do chat assistente
        ├── tickets.js        ← modal + lista de chamados
        ├── ui.render.js      ← renderização das telas
        └── app.js            ← orquestrador e init
```

---

## Endpoints da API Backend

<div align="center">

![GLPI](https://img.shields.io/badge/GLPI-ativos-1d4ed8?style=flat-square)
![Chat](https://img.shields.io/badge/OpenAI-chat-412991?style=flat-square)
![Tickets](https://img.shields.io/badge/GLPI-chamados-166534?style=flat-square)

</div>

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/health` | Verifica se o backend está no ar |
| `GET` | `/api/assets/computers` | Computadores mapeados do GLPI |
| `GET` | `/api/assets/chromebooks-geekiees` | Chromebooks Geekiees |
| `GET` | `/api/assets/chromebooks-apoio` | Chromebooks Apoio agrupados por carrinho |
| `GET` | `/api/assets/projetores` | Projetores |
| `GET` | `/api/assets/impressoras` | Impressoras |
| `POST` | `/api/chat` | Proxy para a OpenAI API (assistente IA) |
| `GET` | `/api/tickets` | Lista todos os chamados do GLPI |
| `GET` | `/api/tickets/asset/{id}` | Chamados de um ativo específico |
| `POST` | `/api/tickets` | Cria chamado e vincula ao ativo automaticamente |

### Formato de resposta padrão

```json
{ "ok": true,  "data": [...], "count": 201 }
{ "ok": false, "error": "mensagem", "meta": {} }
```

### Exemplo — Abrir chamado

```json
// POST /api/tickets
{
  "titulo":    "Monitor sem sinal",
  "descricao": "Monitor do CS-021 não liga após reinicialização.",
  "prioridade": 3,
  "categoria":  1,
  "glpiId":    21,
  "itemtype":  "Computer"
}

// Resposta
{ "ok": true, "data": { "ticketId": 42 } }
```

> **Importante:** a criação de um chamado vinculado exige duas chamadas internas em sequência — `POST /Ticket` para criar e obter o `ticketId`, e `POST /Item_Ticket` para vincular ao ativo. Sem a segunda, o chamado existe no GLPI mas sem vínculo com nenhum equipamento.

---

## Como Rodar Localmente (Windows)

### 1. Pré-requisitos

![PHP](https://img.shields.io/badge/PHP-8.x_+_ext_curl-777BB4?style=flat-square&logo=php&logoColor=white)
![VC++](https://img.shields.io/badge/Visual_C++-Redistributable_2022-0078d4?style=flat-square&logo=visualstudio&logoColor=white)

### 2. Configurar o `.env`

Crie o arquivo `Backend/.env`:

```env
GLPI_URL=https://seu-glpi.interno/apirest.php
GLPI_APP_TOKEN=seu_app_token
GLPI_USER_TOKEN=seu_user_token
OPENAI_API_KEY=sk-...sua_chave_aqui
CORS_ORIGIN=*
APP_ENV=dev
GLPI_SSL_INSECURE=1
```

> ⚠️ **Nunca versione o `.env`.** Ele está no `.gitignore`.

### 3. Subir os servidores

```bash
# Terminal 1 — Backend (API Proxy)
cd Backend/api
php -S localhost:8080 endpoints.php

# Terminal 2 — Frontend
cd Frontend
php -S localhost:3000
```

Acesse o painel em: **http://localhost:3000**

---

## Configuração da API no GLPI

1. `Configuração > Geral > API` → habilitar **API REST**
2. Criar um cliente da API → copiar o **App Token** para o `.env`
3. Preferências do usuário administrador → seção API → gerar o **User Token** → copiar para o `.env`

---

## Estado Atual — v0.2 ✅

Resultado dos testes com dados reais (Colégio Satélite):

| Grupo | Quantidade |
|-------|-----------|
| Computadores (`CS-`, `CO-`) | ~70 |
| Chromebooks Geekiees | ~100 |
| Chromebooks Apoio | ~30 |
| **Total** | **201 ativos** |

Todos os endpoints estão operacionais. O painel exibe dados reais do GLPI com fallback automático para dados mock quando o backend está offline.

---

## Roadmap

![v0.1](https://img.shields.io/badge/v0.1-MVP_Visual_%E2%9C%85-22c55e?style=for-the-badge)
![v0.2](https://img.shields.io/badge/v0.2-Integração_Real_%E2%9C%85-22c55e?style=for-the-badge)
![v1.0](https://img.shields.io/badge/v1.0-Consolidação_⏳-6b7280?style=for-the-badge)

### v0.1 — MVP Visual ✅
- [x] Estrutura base do projeto
- [x] Sistema de abas e layout de carrinhos
- [x] Filtros, busca e dados mockados

### v0.2 — Integração Real ✅
- [x] Backend PHP proxy funcional
- [x] Endpoints para todos os tipos de ativo
- [x] Chromebooks Apoio agrupados por carrinho
- [x] Links diretos para cada ativo no GLPI
- [x] Filtros de busca e status com dados reais
- [x] Chat assistente com OpenAI API (gpt-4o-mini)
- [x] Sistema nativo de chamados

### v1.0 — Consolidação
- [ ] Controle de permissões integrado ao backend
- [ ] Dashboard com métricas e gráficos
- [ ] Logs de acesso e auditoria
- [ ] Deploy com Nginx
- [ ] Documentação técnica completa

---

<div align="center">

MIT © [Kelvin_iDev](https://github.com/kelvin-idev)

</div>
