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

Os tokens do GLPI e a chave da OpenAI **nunca chegam ao navegador** — ficam exclusivamente no servidor PHP.

![Arquitetura do GLPI Control Center](docs/architecture.svg)

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
│   ├── .env                  ← variáveis sensíveis (tokens, nunca sobe pro Git)
│   ├── config/
│   │   └── config.php        ← configuração central do backend (lê o .env)
│   └── api/
│       ├── endpoints.php     ← roteador principal da API
│       ├── client.php        ← cliente cURL responsável pela comunicação com o GLPI
│       ├── mappers.php       ← transforma dados brutos do GLPI em formato do frontend
│       ├── chat.php          ← proxy da API OpenAI (assistente IA)
│       ├── tickets.php       ← criação e listagem de chamados no GLPI
│       └── utils/
│           ├── env.php       ← loader do arquivo .env
│           └── responde.php  ← helper para respostas JSON padronizadas
│
└── Frontend/
    ├── index.html            ← entrada principal da aplicação
    ├── css/
    │   ├── styles.css        ← estilos globais
    │   └── search.css        ← estilos específicos da busca
    └── javascript/
        ├── data.js           ← CONFIG (URLs, usuários) e window.DATA
        ├── state.js          ← gerenciamento de estado global
        ├── auth.js           ← login/logout (mock local)
        ├── glpi_client.js    ← cliente que consome o backend PHP
        ├── chat.js           ← módulo do assistente IA
        ├── tickets.js        ← modal e listagem de chamados
        ├── ui_render.js      ← renderização das telas (UI)
        └── app.js            ← orquestrador principal da aplicação
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
