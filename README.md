# GLPI Control Center

> Painel moderno de gestão de ativos de TI integrado à API REST do GLPI — rápido, visual e seguro.

![Status](https://img.shields.io/badge/status-v0.2%20em%20andamento-blue?style=flat-square)
![PHP](https://img.shields.io/badge/PHP-8.x-777BB4?style=flat-square&logo=php&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Gemini](https://img.shields.io/badge/Gemini%20API-gratuita-4285F4?style=flat-square&logo=google&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

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
| Assistente IA | Gemini API — `gemini-1.5-flash` (tier gratuito) |

---

## Arquitetura

O projeto é deliberadamente dividido em duas camadas. Os tokens do GLPI e a chave da Gemini API **nunca chegam ao navegador** — ficam exclusivamente no servidor PHP.

```
Navegador
    │
    ▼
Frontend (JS)  ──fetch──▶  Backend PHP (porta 8080)
                                    │
                              lê .env (tokens)
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
             initSession()    GEMINI_API_KEY   (futuro: outros)
                    │               │
              GET /Computer    POST /Gemini
              POST /Ticket          │
              POST /Item_Ticket     │
                    │               │
              killSession()         │
                    │               │
                    └───────────────┘
                            │
                     ◀── JSON limpo ──
```

---

## Funcionalidades

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

### 🤖 Assistente IA (Gemini API)
- Chat integrado diretamente no painel — sem redirecionar para nenhuma plataforma externa
- Consulta de horários de utilização dos carrinhos de Chromebooks por sala e turno
- Contexto fixo: documento de horários inserido como `systemInstruction` no backend
- Chave da API protegida no servidor — nunca exposta ao browser
- Tier gratuito: 15 req/min, 1M tokens/dia — suficiente para uso escolar

### 🎫 Sistema de Chamados (em implementação)
- Botão **Abrir chamado** em cada card de ativo — abre modal com o ativo já pré-vinculado
- Formulário nativo: título, descrição, prioridade e categoria
- Ao salvar, o backend cria o ticket via `POST /Ticket` e o vincula via `POST /Item_Ticket`
- O chamado aparece instantaneamente no GLPI, associado ao equipamento correto
- Aba **Chamados** com lista geral de todos os tickets, filtráveis por status

---

## Estrutura do Projeto

```
GLPI-Control-Center/
├── Backend/
│   ├── .env                  ← tokens (nunca sobe pro Git)
│   ├── config/
│   │   └── config.php        ← lê o .env, expõe as configs
│   └── api/
│       ├── endpoints.php     ← roteador da API
│       ├── client.php        ← cliente cURL → GLPI
│       ├── mappers.php       ← transforma dados brutos do GLPI
│       ├── chat.php          ← proxy Gemini API
│       ├── tickets.php       ← criação e consulta de chamados
│       └── utils/
│           ├── env.php       ← loader do .env
│           └── responde.php  ← respostas JSON padronizadas
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

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/health` | Verifica se o backend está no ar |
| `GET` | `/api/assets/computers` | Computadores mapeados do GLPI |
| `GET` | `/api/assets/chromebooks-geekiees` | Chromebooks Geekiees |
| `GET` | `/api/assets/chromebooks-apoio` | Chromebooks Apoio agrupados por carrinho |
| `GET` | `/api/assets/projetores` | Projetores |
| `GET` | `/api/assets/impressoras` | Impressoras |
| `POST` | `/api/chat` | Proxy para a Gemini API (assistente IA) |
| `GET` | `/api/tickets` | Lista todos os chamados do GLPI |
| `GET` | `/api/tickets/asset/{id}` | Chamados de um ativo específico |
| `POST` | `/api/tickets` | Cria chamado e vincula ao ativo automaticamente |

### Formato de resposta

```json
// Sucesso
{ "ok": true, "data": [...], "count": 201 }

// Erro
{ "ok": false, "error": "mensagem", "meta": {} }
```

### Exemplo — Abrir chamado

```json
// POST /api/tickets
{
  "titulo": "Monitor sem sinal",
  "descricao": "Monitor do CS-021 não liga após reinicialização.",
  "prioridade": 3,
  "categoria": 1,
  "glpiId": 21,
  "itemtype": "Computer"
}

// Resposta
{ "ok": true, "data": { "ticketId": 42 } }
```

> O backend executa duas chamadas internas em sequência: `POST /Ticket` para criar o ticket e `POST /Item_Ticket` para vincular ao ativo. Sem a segunda chamada, o chamado existe no GLPI mas sem vínculo com nenhum equipamento.

---

## Como Rodar Localmente (Windows)

### 1. Pré-requisitos
- PHP 8.x com extensão `curl` ativada
- Visual C++ Redistributable 2022 (x64)

### 2. Configurar o `.env`

Crie o arquivo `Backend/.env`:

```env
GLPI_URL=https://seu-glpi.interno/apirest.php
GLPI_APP_TOKEN=seu_app_token
GLPI_USER_TOKEN=seu_user_token
GEMINI_API_KEY=AIzaSy...sua_chave_aqui
CORS_ORIGIN=*
APP_ENV=dev
GLPI_SSL_INSECURE=1
```

> **Atenção:** nunca versione o `.env`. Ele está no `.gitignore`.
>
> A `GEMINI_API_KEY` é gratuita e pode ser obtida em [aistudio.google.com](https://aistudio.google.com).

### 3. Subir os servidores

Abra dois terminais separados:

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
3. Acessar preferências do usuário administrador → gerar e copiar o **User Token** para o `.env`

---

## Estado Atual — v0.2

Resultado dos testes com dados reais (Colégio Satélite):

| Grupo | Quantidade |
|-------|-----------|
| Computadores (`CS-`, `CO-`) | ~70 |
| Chromebooks Geekiees | ~100 |
| Chromebooks Apoio | ~30 |
| **Total** | **201 ativos** |

Todos os endpoints de ativos estão operacionais. O painel exibe dados reais do GLPI com fallback automático para dados mock quando o backend está offline.

---

## Roadmap

### v0.1 — MVP Visual ✅
- [x] Estrutura base do projeto
- [x] Sistema de abas
- [x] Layout de carrinhos com rolagem
- [x] Filtros e busca
- [x] Dados mockados

### v0.2 — Integração Real ✅ + Features em andamento
- [x] Backend PHP proxy funcional
- [x] Endpoints para todos os tipos de ativo
- [x] Chromebooks Apoio agrupados por carrinho
- [x] Links diretos para cada ativo no GLPI
- [x] Filtros de busca e status com dados reais
- [ ] Chat assistente com Gemini API (horários dos carrinhos)
- [ ] Sistema nativo de chamados (abrir + consultar tickets)

### v1.0 — Consolidação
- [ ] Controle de permissões integrado ao backend
- [ ] Dashboard com métricas e gráficos
- [ ] Logs de acesso e auditoria
- [ ] Deploy com Nginx
- [ ] Documentação técnica completa

---

## Licença

MIT © [Kelvin_iDev](https://github.com/kelvin-idev)
