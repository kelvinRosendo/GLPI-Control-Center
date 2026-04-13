# GLPI Control Center

Painel web para consulta rápida dos ativos do GLPI, com backend PHP atuando como proxy seguro para a API REST.

## Novidades desta versão

- Cards de computadores agora podem ser expandidos dentro da própria interface.
- O painel interno mostra os dados em blocos como identificação, alocação, dados técnicos e rastreio.
- Campos textuais importantes podem ser editados e salvos direto no GLPI.
- O frontend mantém cache dos detalhes já carregados para evitar recargas desnecessárias.
- O modo local foi simplificado com detecção automática de `localhost` e override manual por `?mode=local` ou `?mode=server`.

## Estrutura

```text
GLPI-Control-Center/
|-- Backend/
|   |-- .env
|   |-- .env.local.example
|   |-- api/
|   |   |-- endpoints.php
|   |   |-- client.php
|   |   |-- mappers.php
|   |   |-- tickets.php
|   |   |-- chat.php
|   |   `-- utils/
|   `-- config/
|-- Frontend/
|   |-- index.html
|   |-- css/
|   `-- javascript/
|-- satrt-server.bat
`-- start-local.bat
```

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/assets/computers` | Lista resumida de computadores |
| GET | `/api/assets/computers/{id}` | Detalhes completos e estruturados de um computador |
| POST | `/api/assets/computers/{id}` | Atualiza campos editáveis de um computador |
| GET | `/api/assets/chromebooks-geekiees` | Lista de Chromebooks Geekiees |
| GET | `/api/assets/chromebooks-apoio` | Lista agrupada por carrinhos |
| GET | `/api/assets/projetores` | Lista de projetores |
| GET | `/api/assets/impressoras` | Lista de impressoras |
| GET | `/api/tickets` | Lista de chamados |
| POST | `/api/tickets` | Cria chamado no GLPI |
| POST | `/api/chat` | Assistente de horários |

## Modo servidor

Backend:

```powershell
cd Backend/api
php -S 0.0.0.0:9090 endpoints.php
```

Frontend:

```powershell
cd Frontend
php -S 0.0.0.0:4000
```

## Modo local

1. Copie `Backend/.env.local.example` para `Backend/.env.local`.
2. Ajuste `GLPI_URL`, `GLPI_APP_TOKEN` e `GLPI_USER_TOKEN`.
3. Execute `start-local.bat`.
4. Abra `http://localhost:3000/?mode=local`.

O backend passa a carregar `Backend/.env` e, se existir, sobrescreve com `Backend/.env.local`.

O frontend escolhe o ambiente assim:

- `localhost` ou `127.0.0.1`: usa modo local automaticamente.
- qualquer outro host: usa modo servidor.
- `?mode=local`: força backend `http://localhost:8080` e GLPI `http://localhost/glpi`.
- `?mode=server`: força backend `http://192.168.1.20:9090` e GLPI `http://192.168.1.20/glpi`.

## Configuração base

Exemplo mínimo de `Backend/.env`:

```env
GLPI_URL=https://seu-glpi/apirest.php
GLPI_APP_TOKEN=seu_app_token
GLPI_USER_TOKEN=seu_user_token
GLPI_SSL_INSECURE=1
OPENAI_API_KEY=sua_chave
```

## Observações de teste

- Faça a validação sintática do PHP e do JavaScript após as alterações.
- O comportamento real dos campos editáveis ainda precisa de teste manual no GLPI do seu ambiente.
- Campos dependentes de dropdowns, entidades, plugins ou relações internas foram mantidos como somente leitura nesta primeira versão.
