# Backend — GLPI Control Center (PHP Proxy API)

## Backend/
- Reservado para o proxy/API que conversa com o GLPI de verdade.
- Objetivo: esconder tokens, iniciar sessão e devolver dados “limpos” pro Frontend.


Este backend é uma **API Proxy em PHP** para o projeto **GLPI Control Center**.  
Ele existe para **conectar o Frontend ao GLPI com segurança**, evitando expor tokens no navegador e resolvendo possíveis problemas de CORS.

## ✅ O que este backend faz

- Intermedia requisições entre o Frontend e a API REST do GLPI
- Inicia e encerra sessão no GLPI (`initSession` / `killSession`)
- Faz requisições autenticadas (App-Token + User-Token + Session-Token)
- Converte o JSON bruto do GLPI para um formato mais simples e consistente para o painel
- Centraliza tratamento de erros e respostas JSON
- Mantém credenciais sensíveis fora do Git (via `.env`)

---

## 📁 Estrutura de pastas

```txt
Backend/
├── api/
│   ├── index.php
│   ├── glpi/
│   │   ├── client.php
│   │   ├── endpoints.php
│   │   └── mappers.php
│   └── utils/
│       ├── env.php
│       └── response.php
├── config/
│   └── config.php
├── .env.example
└── README_BACKEND.md (opcional)