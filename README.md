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

---

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

O frontend consome exclusivamente o backend PHP.  
O backend atua como proxy seguro para o GLPI e para a OpenAI, mantendo tokens protegidos no `.env`.

```text
┌───────────────────────────────┐
│      Usuário / Navegador      │
└──────────────┬────────────────┘
               │
               v
┌───────────────────────────────┐
│ Frontend                      │
│ HTML + CSS + JavaScript       │
└──────────────┬────────────────┘
               │
               v
┌───────────────────────────────┐
│ Backend PHP                   │
│ API Proxy                     │
└───────┬───────────────┬───────┘
        │               │
        v               v
┌───────────────┐   ┌───────────────┐
│ GLPI REST API │   │  OpenAI API   │
└───────────────┘   └───────────────┘

┌───────────────────────────────┐
│ .env no servidor              │
│ Tokens GLPI + chave OpenAI    │
└───────────────────────────────┘
```

---

## Funcionalidades

### 🏠 Painel Home
- Cards com totais por categoria
- Status: Ativo, Manutenção, Emprestado

### 📂 Abas por Categoria
- Computadores
- Chromebooks Geekiees
- Chromebooks Apoio (por carrinho)
- Projetores
- Impressoras

### 🔍 Busca
- Nome, serial ou patrimônio
- Filtro por status

### 🤖 Assistente IA
- Chat integrado
- Consulta de horários
- Modelo `gpt-4o-mini`

### 🎫 Chamados
- Criação direta no GLPI
- Vínculo automático com ativo
- Listagem geral

### 🚀 Deploy
- Script `.bat` para subir backend e frontend
- Rodando em rede interna

---

## Estrutura do Projeto

```
GLPI-Control-Center/
├── Backend/
│   ├── .env                  ← variáveis sensíveis (GLPI + OpenAI)
│   ├── config/
│   │   └── config.php        ← leitura e centralização das configs (.env)
│   └── api/
│       ├── endpoints.php     ← roteador principal da API (todas as rotas)
│       ├── client.php        ← cliente cURL para comunicação com o GLPI
│       ├── mappers.php       ← transformação dos dados do GLPI → frontend
│       ├── chat.php          ← endpoint do assistente (OpenAI)
│       ├── tickets.php       ← criação e listagem de chamados
│       └── utils/
│           ├── env.php       ← loader do arquivo .env
│           └── responde.php  ← padrão de resposta JSON (ok/erro)
│
├── Frontend/
│   ├── index.html            ← entrada principal da aplicação
│   ├── css/
│   │   ├── styles.css        ← estilos globais
│   │   └── search.css        ← estilos da busca
│   └── javascript/
│       ├── data.js           ← CONFIG (backendUrl, usuários) + window.DATA
│       ├── state.js          ← estado global da aplicação
│       ├── auth.js           ← login mock/local
│       ├── glpi_client.js    ← cliente que consome a API backend
│       ├── chat.js           ← integração do chat no frontend
│       ├── tickets.js        ← UI + lógica de chamados
│       ├── ui_render.js      ← renderização de telas/componentes
│       └── app.js            ← orquestrador principal (init + fluxo)
│
├── start-server.bat          ← script para subir backend + frontend (Windows)
│
└── docs/
    └── architecture.svg      ← diagrama da arquitetura do sistema
```


---

## Endpoints

| Método | Rota |
|--------|------|
| GET | `/api/health` |
| GET | `/api/assets/computers` |
| GET | `/api/assets/chromebooks-geekiees` |
| GET | `/api/assets/chromebooks-apoio` |
| GET | `/api/assets/projetores` |
| GET | `/api/assets/impressoras` |
| POST | `/api/chat` |
| GET | `/api/tickets` |
| POST | `/api/tickets` |

---

## Como Rodar

### Backend

cd Backend/api
php -S 0.0.0.0:9090 endpoints.php

### Frontend

cd Frontend
php -S 0.0.0.0:4000

Acesse: http://localhost:4000

---

## Configuração

### .env

GLPI_URL=https://seu-glpi/apirest.php

GLPI_APP_TOKEN=seu_token
GLPI_USER_TOKEN=seu_token
OPENAI_API_KEY=sua_chave
GLPI_SSL_INSECURE=1


---

## Problemas Conhecidos

### Parcialmente conectado
- Ocorre quando algum endpoint falha
- Backend usa múltiplas chamadas paralelas

Possíveis causas:
- GLPI lento
- Timeout
- SSL interno
- Endpoint específico falhando

---

## Compatibilidade

- Compatível com PHP 8.5
- Correção de warnings que quebravam JSON
- Backend retorna JSON limpo

---

## Estado Atual

- Integração com GLPI funcionando
- Assistente IA funcionando
- Chamados funcionando
- Deploy local funcional

---

## Roadmap

- Dashboard com métricas
- Logs
- Autenticação real
- Deploy com Nginx

---

## Segurança

- Tokens ficam no backend
- `.env` não deve ser versionado

---

<div align="center">

MIT © Kelvin_iDev

</div>
