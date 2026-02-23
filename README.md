# GLPI Control Center

Painel moderno de visualização e controle de ativos integrado ao GLPI.

---

## 📌 Sobre o Projeto

O **GLPI Control Center** é um painel frontend desenvolvido para melhorar a visualização, organização e controle operacional de ativos cadastrados no GLPI.

O projeto nasceu da necessidade real de organizar dispositivos em um ambiente educacional, tornando o acompanhamento diário mais rápido, intuitivo e visual.

Além do desenvolvimento do painel, o ambiente GLPI foi **instalado e configurado manualmente em Windows**, incluindo servidor web, banco de dados MySQL/MariaDB e ativação da API REST.

---

## 🖥 Ambiente Utilizado

### 🔹 Infraestrutura GLPI
- GLPI instalado manualmente em ambiente Windows
- Servidor web configurado (Apache)
- Banco de dados MySQL/MariaDB
- API REST habilitada
- Tokens de autenticação configurados
- Ambiente local para testes e integração

### 🔹 Desenvolvimento do Painel
- HTML5
- CSS3 (Dark UI Design)
- JavaScript (Vanilla)
- Node.js (apenas para ambiente de desenvolvimento)
- PHP (planejado para proxy da API)
- Nginx (planejado para deploy futuro)

---

## 🎯 Objetivo

Melhorar a experiência de gestão de ativos através de:

- Visualização segmentada por categoria
- Organização de Chromebooks por carrinho
- Filtros por status
- Busca rápida por nome, serial ou patrimônio
- Acesso direto ao ativo no GLPI
- Interface moderna e responsiva

---

## 🧩 Funcionalidades do MVP

### 🏠 Tela Home
- Cards com totais por categoria
- Indicadores de status (Ativo, Manutenção, Emprestado)
- Navegação rápida entre seções

### 📂 Abas por Categoria
- Computadores
- Chromebooks (Geekiees)
- Chromebooks (Apoio / Empréstimo)
- Projetores
- Impressoras

### 🔵 Chromebooks (Apoio / Empréstimo)
- Layout em colunas (Carrinho 1–4)
- Listas independentes com rolagem vertical
- Filtro por status
- Busca dinâmica
- Botão direto para abrir o ativo no GLPI

---

## 🏗 Estrutura do Projeto

- GLPI-Control-Center/
- │
- ├── frontend/ → Interface do painel
- ├── backend/ → Proxy para API do GLPI (proteção de tokens)
- ├── deploy/ → Configuração de servidor
- ├── docs/ → Documentação e screenshots
- ├── README.md
- └── .gitignore


---

## 🔌 Integração com GLPI (Planejamento Técnico)

A integração será realizada via API REST do GLPI utilizando um backend proxy para evitar exposição de tokens.

### Arquitetura Planejada

### Fluxo previsto:

1. Iniciar sessão via `user_token`
2. Obter `session_token`
3. Buscar ativos (Computer, etc.)
4. Mapear estados e campos personalizados
5. Renderizar dados reais no painel

---

## 🚀 Roadmap

### v0.1 — MVP Visual
- [x] Estrutura base do projeto
- [x] Sistema de abas
- [x] Layout de carrinhos com rolagem
- [x] Filtros e busca
- [x] Dados mockados

### v0.2 — Integração Real
- [ ] Conexão com API GLPI
- [ ] Backend proxy funcional
- [ ] Mapeamento de estados reais
- [ ] Remoção dos dados mockados

### v1.0 — Consolidação
- [ ] Controle de permissões
- [ ] Dashboard com métricas
- [ ] Logs de acesso
- [ ] Deploy estruturado
- [ ] Documentação técnica detalhada

---

## 💡 Motivação

O GLPI Control Center foi criado para modernizar a visualização operacional do GLPI, especialmente em ambientes educacionais que utilizam grande quantidade de dispositivos como Chromebooks, computadores administrativos e equipamentos multimídia.

O projeto combina:

- Infraestrutura (instalação e configuração do GLPI em Windows)
- Desenvolvimento frontend moderno
- Planejamento de integração com API
- Organização arquitetural para crescimento futuro

---


---

## 📄 Licença

Este projeto está licenciado sob a **MIT License**.
