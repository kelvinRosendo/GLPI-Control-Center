# GLPI Control Center

> Painel moderno de gestão de ativos de TI integrado à API REST do GLPI — rápido, visual e seguro.

![Status](https://img.shields.io/badge/status-v0.2%20em%20andamento-blue?style=flat-square)
![PHP](https://img.shields.io/badge/PHP-8.x-777BB4?style=flat-square&logo=php&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## O Problema

A interface padrão do GLPI foi projetada para administradores — não para quem precisa de uma visão rápida do estado dos dispositivos no dia a dia. Em ambientes com 200+ ativos, localizar um Chromebook emprestado ou identificar equipamentos em manutenção exige dezenas de cliques e nenhuma visão consolidada.

## A Solução

O **GLPI Control Center** é um painel frontend dedicado que consome a API REST do GLPI via proxy PHP seguro e entrega uma interface limpa, com busca instantânea, filtros por status, organização por carrinhos e acesso direto a cada ativo no sistema.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5 + CSS3 + JavaScript Vanilla |
| Backend | PHP 8.x (API Proxy) |
| Comunicação | REST API do GLPI + cURL |
| Autenticação | App Token + User Token (via `.env`) |

---

## Arquitetura

O projeto é deliberadamente dividido em duas camadas. Os tokens de autenticação do GLPI **nunca chegam ao navegador** — ficam exclusivamente no servidor PHP.

```
Navegador
    │
    ▼
Frontend (JS)  ──fetch──▶  Backend PHP (porta 8080)
                                    │
                              lê .env (tokens)
                                    │
                              initSession()
                                    │
                              GET /Computer (GLPI API)
                                    │
                              mapeia os dados
                                    │
                              killSession()
                                    │
                           ◀── JSON limpo ──
```

---

## Funcionalidades

### Painel Home
- Cards com totais por categoria (Computadores, Chromebooks, Projetores, Impressoras)
- Indicadores visuais de status: **Ativo**, **Manutenção**, **Emprestado**

### Abas por Categoria
- Computadores (`CS-`, `CO-`)
- Chromebooks Geekiees (`Chrome G-`)
- Chromebooks Apoio — organizados por **carrinho** (`Carrinho 1` a `Carrinho 4`)
- Projetores
- Impressoras

### Por Ativo
- Busca por nome, serial ou patrimônio
- Filtro por status
- Botão **Abrir no GLPI** — redireciona diretamente para o ativo (`/front/computer.form.php?id=`)

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
        ├── glpi.client.js    ← fetch para o backend
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

### Formato de resposta

```json
// Sucesso
{ "ok": true, "data": [...], "count": 201 }

// Erro
{ "ok": false, "error": "mensagem", "meta": {} }
```

---

## Como Rodar Localmente (Windows)

### 1. Pré-requisitos
- PHP 8.x com extensão `curl` ativada
- Visual C++ Redistributable 2022 (x64)

### 2. Configurar o `.env`

Crie o arquivo `Backend/.env` com base no exemplo:

```env
GLPI_URL=https://seu-glpi.interno/apirest.php
GLPI_APP_TOKEN=seu_app_token
GLPI_USER_TOKEN=seu_user_token
CORS_ORIGIN=*
APP_ENV=dev
GLPI_SSL_INSECURE=1
```

> **Atenção:** nunca versione o `.env`. Ele está no `.gitignore`.

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

Resultado dos testes com dados reais do ambiente de produção:

| Grupo | Quantidade |
|-------|-----------|
| Computadores (`CS-`, `CO-`) | ~70 |
| Chromebooks Geekiees | ~100 |
| Chromebooks Apoio | ~30 |
| **Total** | **201 ativos** |

Todos os endpoints estão operacionais. O painel exibe dados reais do GLPI com fallback automático para dados mock quando o backend está offline.

---

## Roadmap

### v0.2 — Em andamento
- [x] Backend PHP proxy funcional
- [x] Endpoints para Computadores e Chromebooks Geekiees
- [x] Endpoint para Chromebooks Apoio com agrupamento por carrinho
- [x] Endpoints para Projetores e Impressoras
- [x] Links diretos para cada ativo no GLPI
- [ ] Filtros de busca e status com dados reais em todas as abas

### v1.0 — Consolidação
- [ ] Controle de permissões integrado ao backend
- [ ] Dashboard com métricas e gráficos
- [ ] Logs de acesso e auditoria
- [ ] Deploy com Nginx
- [ ] Documentação técnica completa

---

## Licença

MIT © [Kelvin_iDev](https://github.com/kelvin-idev)
