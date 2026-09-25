# Dashboard de chamados das salas — integração e publicação

Data: 24/09/2026
Branch: codex/dashboard-chamados-salas
Base: fix/integracao-corretiva, commit b3d28be8f47c02bce42d165569a16375b1656923

## Estado desta entrega

Primeira versão implementada na branch, com rota de consulta, normalização,
rankings, filtros e página integrada à navegação e às permissões do GCC.
Inclui preservação dos domínios de produção e adaptação do executor de sincronização.

O PR permanece em rascunho até homologação com o GLPI real e revisão das mudanças
herdadas da integração corretiva. Não houve deploy ou alteração de dados reais.

O ambiente local falhou na inicialização; as edições foram feitas pelo conector
GitHub. A validação executável ocorre no workflow Room tickets checks.

## Tela e regras implementadas

Página própria "Chamados das salas", integrada à navegação e permissões do GCC.
Filtros combináveis: período, sala, tipo de equipamento e status.
Oferecer últimos 30 dias, mês anterior completo e intervalo personalizado.
Período inicial adotado: últimos 30 dias de calendário, incluindo hoje. A tela também permite mês anterior completo.
Usar fuso America/Sao_Paulo e datas inicial/final explícitas na interface.

Indicadores:
- Chamados abertos no período, independentemente do estado atual.
- Desses chamados, quantos continuam abertos (estados GLPI 1, 2, 3 e 4).
- Sala com mais chamados e tipo com mais chamados; apresentar empates.
- Quantidade sem sala e sem equipamento identificado.

Gráficos e lista:
- Ranking de salas por chamados distintos.
- Ranking por tipo: Projetor, PC, Mouse, Teclado, Chromebook e Carrinho.
- Outros e Não identificado para evitar classificação forçada.
- Ranking de ativos específicos, com nome/patrimônio e identidade estável.
- Lista paginada com número, sala, equipamento, problema, abertura e status.
- Clique no ranking filtra a lista; detalhe mostra origem e link ao GLPI.

Regras:
- Período aplicado à abertura do chamado; não confundir com data de resolução.
- Total conta IDs de chamados distintos.
- Um chamado com vários ativos conta uma vez por ativo e uma vez por tipo distinto.
  Por isso a soma entre grupos de equipamento pode superar o total de chamados.
- Rankings usam todo o conjunto filtrado, não apenas a página exibida.
- Identidade do ativo usa itemtype + ID; não agrupar apenas por ID numérico.
- Usar a sala registrada no chamado; a localização atual de um ativo não comprova
  a sala histórica onde ocorreu o atendimento.
- Priorizar vínculos explícitos e campos estruturados. Extração de texto precisa
  expor a origem e sinalizar ambiguidade.
- Mouse, teclado e carrinho podem ter tipo conhecido sem patrimônio individual.
  Nesse caso entram no ranking por tipo, mas não ganham um ativo inventado.
- "Chrome" está interpretado provisoriamente como Chromebook.
- Dados incompletos ou falha na consulta não devem ser apresentados como zero.
- Excluir lixeira e respeitar acesso do usuário.
- Não usar somente a conta técnica do Mano Isa como prova de que o local é uma sala.

## Integração técnica e homologação

1. Validar amostras reais anonimizadas do GLPI: local, categoria, referência L-000X,
   autoria e vínculos Item_Ticket. O mapper atual não entrega todos esses campos.
2. Criar leitura autenticada GET /api/tickets/salas sem alterar o contrato atual.
3. Retornar lista paginada, resumo e rankings com os mesmos filtros.
   Indicar horário da coleta e se o conjunto está completo.
4. Reutilizar cliente GLPI, autenticação e autorização existentes; evitar uma
   consulta individual por chamado.
5. Implementar normalização e agregação independentes da interface.
6. Criar módulo visual de salas reutilizando estilos, navegação e cliente HTTP.
7. Validar datas, duplicidades, empates, paginação, múltiplos ativos, nomes
   equivalentes de sala, itens sem vínculo, erros de consulta e permissões.
8. Homologar em navegador e com GLPI real antes da integração final/publicação.

A leitura e acompanhamento são a primeira entrega. Criação e alteração de
chamados continuam nos fluxos existentes.

## Estado observado da VPS

Evidência: saída do terminal e capturas fornecidas pelo responsável.
- Release ativa: /var/www/gcc/releases/release-002
- Branch instalada: main
- Commit base: 079ed69 (14/09/2026), com alterações locais
- Backend/data -> /var/lib/gcc/data
- Backend/logs -> /var/log/gcc
- Backend/data-from-repository existe, mas seu conteúdo não foi inspecionado
- Frontend/javascript/config.env.js corrigido para domínios .cloud
- Backend/scripts/sync-cron.php modificado no servidor

Dados e logs persistentes já estão separados das releases. A documentação
anterior que lista essa separação como melhoria futura está desatualizada.

Não foi encontrada evidência de deploy automático nos locais consultados.
Isso não exclui automações externas ou locais não inspecionados.
O script sync-cron.php sincroniza inventário, não atualiza o código, e sua
existência não comprova agendamento ativo.

## Publicação futura

- Revisar todos os commits herdados da branch corretiva, não apenas o dashboard.
- Registrar o commit aprovado e fazer backup da configuração e dados persistentes.
- Preparar nova release fora de current.
- Preservar .env de produção e não copiar .env.local de desenvolvimento.
- Conectar Backend/data e Backend/logs aos diretórios persistentes confirmados.
  Não substituir dados da VPS por cache, propostas ou histórico vindos do repositório.
- Validar permissões, sintaxe, testes, login, rotas e sincronização.
- Ativar a release apenas após validação e manter a anterior disponível.
- Conferir saúde, autenticação, inventário, chamados e rankings após ativação.
- Rollback do código não desfaz escritas no GLPI ou nos dados persistentes.

## Implementação entregue

- Backend/api/room_tickets.php: GET /api/tickets/salas, autenticado pela regra
  existente chamados:view; outros métodos retornam 405.
- RoomTicketsService: datas em America/Sao_Paulo, normalização, filtros,
  contagens, empates, deduplicação e rankings sobre todos os resultados.
- RoomTicketsReader e GlpiClient::getReportPage: leitura paginada estrita;
  falha de rede, total ausente, página repetida e coleção incompleta não viram zero.
- Frontend/javascript/room-tickets.js e CSS próprio: cards, rankings clicáveis,
  lista, detalhes, filtros, estados de erro e atualização opcional de 5 minutos.
- Navegação: Chamados das salas, disponível aos perfis com acesso configurado.
- Logout limpa os dados do módulo e descarta respostas atrasadas.
- Filtros são preservados na URL com prefixo rt_ enquanto a sessão está ativa.

## Regras de classificação detalhadas

- Sala: local do chamado no GLPI; campo Local da descrição; título como inferência.
- Referência L- sem sala não determina uma sala: o registro entra como não
  identificado para revisão. A conta técnica sozinha não é usada como prova.
- Local estruturado com hierarquia conserva o caminho. Entidades GLPI distintas
  não têm seus rankings de sala misturados.
- Equipamento: campo Equipamento/Tipo de equipamento, categoria GLPI, tipo do
  ativo vinculado e, por último, título como inferência.
- Exemplo: chamado de Mouse vinculado a um PC entra como Mouse no ranking por
  tipo e mantém o vínculo do PC no ranking de ativos associados.
- Descrição livre sem campo estruturado não é usada para adivinhar tipo.
- O ranking de ativos representa vínculos dos chamados, não comprova defeito
  físico do ativo. Um problema de mouse pode estar vinculado ao computador.
- Nomes e patrimônios vêm do cache GCC; vínculos vêm do GLPI. Ausência de nome
  preserva a identidade itemtype:ID e não inventa patrimônio.
- Sem sala/ativo e classificações inferidas aparecem explicitamente.

## Limites da primeira versão

- Lê as coleções Ticket, Location, ITILCategory e Item_Ticket em lotes.
  Ainda não aplica o período no servidor GLPI: agrega e filtra no backend GCC.
- Limite explícito de 10 mil registros por coleção; excesso falha com mensagem,
  sem exibir ranking parcial como se fosse completo.
- Prazo global verificado entre páginas; cada chamada usa o timeout do cliente.
- A compatibilidade da conta GLPI com as quatro coleções e os cabeçalhos de
  paginação precisa de homologação no ambiente real.
- Não há cache compartilhado dos chamados. Atualização automática é opcional;
  consultas do mesmo painel não se sobrepõem.
- Sala histórica depende dos dados registrados no chamado. Nomes não numéricos
  usam regras conservadoras para sala, laboratório, biblioteca e auditório.
- Não há cadastro de apelidos de salas nesta versão; amostras reais devem orientar
  ajustes para nomes específicos da escola.
- Os testes não demonstram integração com IA nem validam os outros módulos
  herdados da branch corretiva.

## Validação

Workflow: .github/workflows/room-tickets.yml
- Sintaxe PHP dos serviços, cliente, rota e executor de sincronização.
- Testes PHP com dados sintéticos para períodos, filtros, contagem, identidades,
  duplicidades, empates, classificação e leitura de páginas incompletas.
- Sintaxe JavaScript e seis cenários com DOM/API simulados.
- Teste em Chromium real, página isolada e API simulada, em largura ampla e
  estreita: cards, rankings, escape, filtros, datas, detalhes e paginação.

Comandos de validação:
- php Backend/tests/test_room_tickets.php
- node --test Frontend/test-room-tickets.cjs
- node Frontend/test-room-tickets-browser.cjs (requer google-chrome)

Pendências antes da publicação:
- Homologar dados e permissões reais do GLPI.
- Conferir visualmente a página dentro do GCC completo.
- Revisar o conteúdo herdado do PR, incluindo dados operacionais versionados.
- Validar preparação da release e rollback.

## Correção do inventário incompleto

As capturas do ambiente local mostravam CS-002, CS-003 e EPSON. Esses três registros
coincidiam com o cache versionado; o relatório versionado separadamente descrevia
577 ativos, demonstrando que os arquivos não representavam o mesmo inventário.
Isso não comprova o total atual do GLPI.

Correções:
- O cache de exemplo foi movido para Backend/tests/fixtures. Cache, status e
  relatório operacionais deixaram de ser distribuídos pela branch.
- Os testes legados que manipulavam o cache usam uma cópia temporária isolada.
- A paginação avança pela quantidade recebida, aceita HTTP 206, exige total,
  detecta páginas repetidas, mudança de total, erros HTTP e término prematuro.
- Sincronizações só substituem o inventário após leitura integral de todas as
  coleções configuradas. Falha preserva o cache anterior; erro de gravação não
  é tratado como sucesso.
- Coleções padrão: Computer, Printer, Monitor, Peripheral, NetworkEquipment e
  Phone. A lista fica em Backend/config/asset-catalog.php, sync.collections.
  Tipos customizados ou de plugins precisam ser configurados e homologados.
  A consulta respeita o perfil e entidades acessíveis ao token GLPI; não amplia
  permissões. Coleção sem permissão falha explicitamente.
- Sem cache confirmado, GET /api/assets/all faz consulta direta de leitura ao
  GLPI, disponível aos perfis já autorizados a consultar inventário. Não executa
  sincronização administrativa nem grava o resultado no cache.
- Novos tipos têm detalhes de consulta; não são encaminhados para edição de
  Computer por compartilharem o mesmo ID.
- O painel lê o formato real do relatório, não registra horário de login como
  última sincronização e identifica cache sem cobertura confirmada.
- A ação incremental usa o mesmo snapshot completo validado: a API consultada
  não oferece delta nesse fluxo. Isso evita conservar ativos removidos.

Validação adicional:
- php Backend/tests/test_inventory_sync.php
- node --test Frontend/test-inventory-sync.cjs
- Os cenários cobrem paginação limitada pelo servidor, falhas HTTP, repetição,
  preservação do cache, inventário vazio legítimo, tipos com IDs iguais,
  concorrência, gravação, leitura direta sem cache e ausência de alteração em
  Computer ao consultar periféricos.

Aplicação no ambiente:
1. Atualizar o código a partir do PR revisado, preservando .env e dados reais.
   Na VPS, usar nova release e os vínculos persistentes já documentados.
2. Abrir Inventário Geral. Sem cache confirmado, o backend consulta o GLPI.
3. Para manter cache persistente, executar a sincronização pelo administrador
   ou php Backend/scripts/sync-cron.php no ambiente configurado.
4. Conferir total e contagens por coleção contra o GLPI usando o mesmo perfil
   e escopo de entidades.

O terminal local da sessão permanece indisponível. Estas alterações e os testes
foram realizados via GitHub; a carga do GLPI real ainda depende da aplicação do
código no ambiente do usuário. Nenhuma credencial foi alterada.

### Validação local em 25/09/2026

O acesso ao terminal foi restabelecido e a branch foi aplicada ao checkout local,
após backup dos três arquivos de cache/relatório em .cache/before-inventory-fix-20260925.
O PHP local é 8.0.30: as verificações de listas foram adaptadas para não depender
de array_is_list, disponível apenas a partir de PHP 8.1. Passaram localmente 33
verificações de inventário, 38 de chamados, 11 testes JavaScript e 13 verificações
por largura no Chrome (desktop e estreita).

O teste de navegador agora aguarda as microtarefas das respostas simuladas, sem
temporizadores que podiam competir com o encerramento do dump do Chrome.
A sincronização real foi tentada, mas o endereço configurado não retornou a API
JSON esperada. É necessário confirmar o endereço atual do GLPI antes de concluir
a validação com dados reais. As credenciais e a VPS não foram alteradas.
