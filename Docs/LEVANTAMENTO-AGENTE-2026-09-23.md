# Levantamento do agente GCC — 23/09/2026

Referência examinada: HEAD `80ed41e`. Diagnóstico por leitura do código, histórico recente e verificações locais sem chamadas ao modelo ou ao GLPI. Nenhuma funcionalidade foi alterada. Não foram lidos valores de credenciais, apagados dados ou executadas alterações em ativos.

**Conclusão:** há implementação substancial de consulta, proposta, escrita, atualização de cache e verificação. Porém, as conexões entre essas partes ainda não entregam de forma confiável o fluxo “consultar → propor → confirmar → executar → conferir”. Os relatórios anteriores superestimam algumas garantias do código atual.

## 1. O mapa que importa

```text
Você escreve no painel
  Frontend/javascript/agent_panel.js → _sendMessage()
    POST /api/agent/chat
      Backend/api/endpoints.php → autenticação e acesso ao assistente
        AgentService::processMessage()
          carrega histórico e instruções
          AIProvider::chatWithTools() → provedor de IA
          modelo solicita uma ferramenta
          AgentTools::execute()
            buscar_ativos → AssetService::fromCache() → arquivo local
            consultar_ativo → AssetService::get() → GlpiClient → GLPI
            preparar_alteracao → AgentProposal::create() → proposta em JSON
            executar_proposta → AgentExecution → AssetWriteService → GLPI
          resultado da ferramenta volta ao modelo
          texto final volta ao painel
```

A escolha de ferramentas depende do modelo. O código não obriga uma busca por nome a ser seguida por consulta atualizada no GLPI. Atualmente, a resposta HTTP do chat entrega texto e contadores; não entrega uma coleção estruturada de propostas ou evidências para a interface renderizar.

O chat antigo em `Backend/api/chat.php` é outra implementação: responde sobre horários de carrinhos com contexto fixo. Ele não é o caminho do novo painel `/api/agent/chat`. A configuração do novo agente usa `OPENCODE_GO_*`; a chave `OPENAI_API_KEY` do chat antigo não configura automaticamente esse agente.

## 2. O que cada peça resolve

| Peça | Quem a chama | Comportamento implementado | Como verificar na experiência final |
|---|---|---|---|
| `Frontend/javascript/agent_panel.js` | Inicialização em `app.js` | Cria painel, envia mensagens, contém cartões e botões de proposta, execução e comprovantes | Mensagem aparece; proposta deveria aparecer como cartão com antes/depois |
| `Backend/api/endpoints.php` | Requisições da interface | Autentica, autoriza rotas e encaminha chat, propostas, execução e verificações | Requisição tem resposta coerente e acesso indevido é recusado |
| `AIProvider.php` | `AgentService` | Envia histórico e definições de ferramentas por HTTP ao provedor | Modelo retorna texto ou chamadas válidas; status “configurado” sozinho não comprova conexão |
| `AgentService.php` | Rota de chat | Executa até três rodadas com o modelo, repassa resultados de ferramentas e salva histórico textual por usuário | Resposta tem fundamento no resultado consultado |
| `AgentTools.php` | `AgentService` | Expõe 12 ferramentas de consulta, proposta, execução, cancelamento e políticas | Cada ferramenta retorna dados reais ou erro explícito |
| `AssetService.php` | Ferramentas, propostas e rotas de ativos | Consulta GLPI e classifica ativos; também permite ler cache local | Fonte e identidade do ativo correspondem ao cadastro |
| `AgentProposal.php` | `preparar_alteracao` | Salva proposta pendente, autor, campos, alvo e validade de uma hora | Prévia correta sem alteração no GLPI |
| `AgentExecution.php` | Rota de execução **e ferramenta do modelo** | Verifica dono, estado, prazo e política; chama escrita e verificação | Apenas uma proposta efetivamente aprovada deveria executar |
| `AssetWriteService.php` | Agente e CRUD manual | Filtra campos, valida opções, grava no GLPI, relê e tenta atualizar cache | Campo alterado deve coincidir com o solicitado |
| `OperationTracker` / `IdempotencyGuard` | Serviço de escrita | Registra estados, auditoria e procura operações equivalentes | Repetição não deve gerar outra escrita; garantia ainda incompleta |
| `CacheUpdater.php` | Serviço de escrita e recuperação | Atualiza ativo por tipo + ID, reclassifica e usa lock compartilhado com sincronização | GCC acompanha mudança sem perder outros ativos |
| `VerificationService.php` | Execução e rotas de comprovante | Compara campos com releitura e produz estados de GLPI/cache/API/tela | Cada estado deve ter evidência; API e tela ainda têm verificações insuficientes |

Os arquivos de serviços desta tabela ficam em `Backend/api/services/`.

## 3. Exemplo acompanhado: “consulte o Chrome-014”

1. `_sendMessage()` envia mensagem e eventual contexto de ativo para `/api/agent/chat`.
2. O backend identifica o usuário e verifica acesso ao assistente.
3. `AgentService` carrega histórico e envia as definições de ferramentas ao modelo.
4. Se o modelo escolher `buscar_ativos`, o backend procura nome, serial ou patrimônio em `Backend/data/cache/classified_assets.json`. Não consulta o GLPI nessa busca. Retorna até 20 resultados por padrão, limitado a 50, com indicação `source: cache` e data de geração.
5. Se o modelo escolher `consultar_ativo` com tipo e ID, `AssetService` abre sessão GLPI e faz GET do registro, depois classifica a resposta.
6. O resultado volta ao modelo, que escreve uma resposta em português. O painel mostra esse texto.

**O que isso significa:** a consulta está conectada no código, mas depende de cache disponível, provedor aceitando ferramentas, GLPI acessível e escolha adequada de ferramentas. Não foi demonstrada ao vivo nesta análise. “Não achei no cache” não comprova “não existe no GLPI”. Além disso, `AssetService::get()` transforma diferentes falhas de consulta em `null`; a ferramenta pode apresentar isso como ativo não encontrado.

## 4. Exemplo acompanhado: “altere o patrimônio para 00123”

O patrimônio corresponde a `otherserial`. O valor deve viajar como texto para preservar os zeros.

**Preparação existente:** o modelo localiza o ativo e solicita `preparar_alteracao` com `action: update`, tipo, ID e `fields: {otherserial: "00123"}`. `AgentProposal` consulta o ativo e grava uma proposta local. Essa preparação não grava no GLPI.

**Conexão faltante na tela:** o cartão está implementado em `_addProposalCard()`, chamado por `_addMessage()` somente quando recebe o terceiro argumento `proposal`. O caminho `_sendMessage()` passa apenas o texto. `AgentService` não devolve a proposta separadamente. Assim, no fluxo normal examinado, a proposta pode ser descrita pelo modelo, mas não chega ao cartão com o botão Confirmar.

**Execução existente:** `_confirmProposal()` enviaria o ID para `/api/agent/execute`. A rota chama `AgentExecution::executeProposal()`, que verifica dono, estado pendente, prazo, políticas e algumas condições do ativo. Depois chama `AssetWriteService::update()`, que envia PUT ao GLPI, relê o registro e atualiza o cache.

**Problema de autorização da execução:** o modelo também recebe a ferramenta `executar_proposta`, que chama exatamente esse serviço. Não existe estado de confirmação, token de aprovação ou hash de conteúdo aprovado exigido pelo serviço. Uma proposta `pending` pode avançar. A instrução textual ao modelo para pedir confirmação não substitui uma barreira no backend.

**Conferência existente:** há uma primeira releitura no serviço de escrita e uma comparação adicional em `VerificationService`. Porém, o primeiro serviço define `verified` pela existência da resposta de releitura, sem exigir igualdade do valor pedido. A verificação adicional pode apontar divergência, mas não recalcula o `success` devolvido pela execução. A interface e a ferramenta ainda podem dizer “sucesso” junto de uma divergência.

## 5. Lacunas confirmadas e impacto

### Prioridade antes de liberar escrita pelo agente

1. **Confirmação humana não exigida pelo backend.** `AgentExecution.php:39` e `:234`; `AgentTools.php:689`. A política possui `require_confirmation`, mas não há evidência de confirmação checada no modo `prepare_confirm`. É possível chegar ao serviço pela ferramenta de IA, sem clique.
2. **Permissão de capacidade confundida com permissão do usuário.** `AgentProposal.php:292` consulta capacidades estáticas do tipo; `AgentExecution` reutiliza esse booleano. `endpoints.php:384` exige acesso ao assistente e delega a checagem fina, mas o caminho de serviços examinado não exige a permissão de edição do usuário para o alvo. A credencial GLPI compartilhada ainda limita o que o GLPI aceita, mas isso não substitui as permissões individuais GCC.
3. **Cartão de aprovação desconectado da resposta do chat.** `agent_panel.js:220`, `:271`, `:323`; `AgentService.php:41`. Falta transportar e renderizar a proposta estruturada.
4. **Proteção contra alteração desde a proposta perde a versão.** `AgentProposal` procura `date_mod` na raiz. A classificação preserva esse campo em `raw.date_mod`; assim, `glpi_version` tende a ficar nulo. A comparação só bloqueia se ambas as versões existirem. A checagem posterior do serviço de escrita não recupera a referência original vista pelo usuário.
5. **Garantia contra duplicação ainda incompleta.** `IdempotencyGuard::check()` recebe `clientKey`, mas não o utiliza; a procura é por alvo/ação/campos e não inclui autor. `registerPending()` não recebe a chave. Procurar e registrar não estão protegidos por uma única trava. O lock de cache não torna a escrita no GLPI atômica. Não houve simulação concorrente nesta análise.

### Consulta, proposta e resultado

6. **Uma definição de ferramenta tem estrutura incorreta.** `AgentTools.php:242`: `consultar_operacao.parameters` é uma lista contendo o objeto de schema, enquanto as demais definições têm o objeto diretamente. Isso é enviado em todas as chamadas com ferramentas; pode provocar rejeição pelo provedor. A rejeição remota não foi testada.
7. **Provedor com indicação contraditória.** `AIProvider` escolhe `deepseek-flash` como padrão, mas `supportsToolCalling()` marca esse mesmo nome como sem suporte. `AgentService` envia ferramentas mesmo assim. Isso é uma inconsistência interna; não é conclusão sobre a capacidade real do provedor hoje. `isConfigured()` verifica somente presença de chave.
8. **Prévia perde campos atuais.** `extractCurrentValues()` lê campos GLPI na raiz do ativo classificado. Localização, estado e outros ficam em `raw`; podem aparecer vazios na proposta mesmo estando preenchidos.
9. **Campos de impressora descartados.** `extractProposedValues()` decide o tipo por `fields.itemtype`, com padrão Computer, ignorando o argumento `itemtype` da proposta. No formato normal da ferramenta, `printermodels_id` e `manufacturers_id` são descartados.
10. **Consulta de horas de projetor incompatível com o módulo existente.** A ferramenta lê `Backend/data/projectors.json`, espera registros diretos com `name/lamp_hours/last_maintenance`. `projetors.php` usa `Backend/api/data/projectors.json`, estrutura `projectors` indexada por chave e campos como `horas_lampada/ultima_manutencao`. Há diferença tanto de caminho quanto de estrutura. Não existe ferramenta de escrita local das horas integrada ao agente.
11. **API “confirmada” sem consulta da API.** `VerificationService.php:465` relê o arquivo de cache; para update/create, encontrar o ID já permite `confirmed`. Não comprova que a representação servida pela rota corresponde aos valores esperados.
12. **Tela “confirmada” sem comprovar aplicação dos dados.** `_renderReceipt()` grava uma versão no navegador e dispara evento; `_frontendConfirm()` envia essa versão. Não localizei consumidor de `gcc:assetUpdated` no JavaScript pesquisado. `frontendConfirm()` verifica o dono, mas não compara a versão recebida com a esperada. O resultado global `verified` também não exige confirmação da tela.
13. **Leitura/cancelamento de proposta sem checagem de dono no caminho examinado.** A execução checa `created_by`, mas GET da proposta e cancelamento não fazem o mesmo. Isso deve ser alinhado antes de uso por múltiplos usuários.

Outras limitações: o histórico persistido contém textos, não a sequência estruturada de ferramentas; ao esgotar três rodadas, o serviço pode retornar o JSON da última ferramenta como resposta final; o prompt ainda diz “não execute escritas nesta sprint”, apesar de expor a ferramenta de execução. Limites de tempo/quantidade declarados nem sempre são aplicados onde seus nomes sugerem.

## 6. O que as sprints acrescentaram de fato

| Conjunto | Implementação encontrada | Limite da conclusão |
|---|---|---|
| Capacidades e consultas | Catálogo, classificação, contrato de campos/operações, opções e reconciliação GLPI/cache | Contrato estático não atesta permissão real por usuário |
| CRUD e confiabilidade | Criar/editar Computer e Printer, inativar/restaurar por estado, validações, rastreamento e atualização de cache | Releitura, duplicação e concorrência ainda têm lacunas |
| Interface responsiva e agente | Painel carregado na aplicação, adaptação visual por CSS, cliente HTTP, histórico e ferramentas | Aparência não foi validada em navegador; cartão de proposta desconectado |
| Execução e lotes | Serviço de execução, políticas, rotas e persistência de lotes | Não há barreira de aprovação suficiente; lotes não foram demonstrados |
| Verificação | Comparação de campos, comprovante, nova verificação e recuperação de cache | “API/tela confirmadas” não constituem prova completa |
| Correções recentes | Router local, cliente GLPI com exceções, identidade composta no estado, lock do cache e reclassificação | Nem todas as correções declaradas no relatório estão no código |

Excluir, aqui, significa mudar `states_id` para Inativo. Restaurar significa mudar para Em uso. Não equivale a exclusão definitiva nem necessariamente ao mecanismo de lixeira do GLPI.

O alcance atual é **Computer e Printer e seus campos permitidos**. Algumas categorias, incluindo projetores, são representadas como Computer no catálogo. Isso não significa suporte automático a todos os tipos GLPI nem às horas locais dos projetores.

## 7. Por que “15 testes passaram” não encerra a análise

Executei `Backend/tests/test_corretiva_regressoes.php`: **15 passaram, 0 falharam**. O arquivo verifica majoritariamente a presença de textos em outros arquivos. Exemplos:

- “prepare_confirm sem confirmação recusada” passa se encontrar `validateForExecution` **ou** `rejected`; não tenta executar sem confirmação.
- “2 concorrentes 1 escrita” procura `flock` e `LOCK_EX` no atualizador de cache; não dispara duas escritas.
- “versão frontend arbitrária recusada” procura `frontendConfirm` **ou** `api_version`; não envia versão inválida.
- O teste do vínculo de chamado apenas verifica se `tickets.php` existe.

Portanto, esses resultados não comprovam os comportamentos anunciados pelos nomes dos testes.

Também executei verificações PHP isoladas, com dados sintéticos e sem rede:

- Confirmada a estrutura anômala de `consultar_operacao.parameters` entre as 12 definições.
- Um ativo sintético com `date_mod` retorna esse valor em `raw`, não na raiz.
- A prévia desse ativo retorna localização nula apesar de haver localização em `raw`; preserva patrimônio `"00123"`.
- A preparação com campos específicos de Printer elimina modelo/fabricante quando o tipo não é repetido dentro de `fields`.

A primeira tentativa de chamar os auxiliares privados pela reflexão exigiu ajuste de acessibilidade no PHP local; a segunda executou os dois últimos casos. A sintaxe de `agent_panel.js` passou na checagem do Node. Não executei as suítes que criam propostas/históricos nos diretórios operacionais.

O relatório `RELATORIO-CORRECAO-INTEGRADA-GCC.md` declara confirmação por hash, validação da versão de tela e proteção atômica contra duplicação. As implementações examinadas não sustentam essas declarações. O relatório deve ser tratado como histórico de intenção até que cada garantia tenha demonstração comportamental.

## 8. Próxima sprint pequena: consulta rastreável

**Um único objetivo:** ao pedir “consulte o Chrome-014”, receber identidade correta, patrimônio, fonte e horário da consulta, com tratamento distinto de ativo ausente e falha de conexão.

Antes do código: explicar busca no cache versus consulta no GLPI e escolher os poucos campos exibidos. Na implementação: corrigir apenas o que bloqueia esse percurso, começando pelo contrato das ferramentas e pela representação do ativo. Na demonstração: acompanhar uma mensagem real, a ferramenta escolhida, o registro retornado e o texto exibido, comparando com o cadastro GLPI.

Critérios de aceite:

1. Resultado identifica nome, tipo e ID sem ambiguidade.
2. O patrimônio mantém zeros à esquerda.
3. Cache e GLPI são identificados corretamente como fontes.
4. Falha de rede não aparece como “ativo inexistente”.
5. Consulta não grava alterações no GLPI.
6. Evidência acompanha o fluxo real, sem depender de testes de presença de palavras.

Depois disso, uma sprint exclusiva para proposta visível e outra para confirmação/execução com permissão real. As lacunas de autorização precisam ser resolvidas antes de liberar a escrita pelo agente. Não é necessário recomeçar o projeto nem criar uma sprint por arquivo.
