# Interface mobile dos chamados das salas

> Revisão de 02/10/2026: a apresentação e os testes abaixo descrevem a primeira
> versão mobile. A fila simples e o novo escopo de notificações push estão em
> [MOBILE-PUSH.md](MOBILE-PUSH.md). Push deixou de ser exclusão de escopo por solicitação do usuário.

Data: 30/09/2026
Branch: `codex/mobile-chamados-salas`
Base: `a6bdc73` (main)
Escopo: adaptação responsiva da experiência de **Chamados das salas** para
telas estreitas, com menu recolhível, lista vertical compacta, filtros rápidos
por agrupamento do backend, estados separados de carga/cache/erro/expiração e
alertas adaptados à largura do celular. Sem outro aplicativo, sem outro
backend, sem cópia da lógica de chamados e sem o agente. Sem merge, sem push e
sem deploy.

> Documentos relacionados, que continuam válidos:
> `Docs/KANBAN-CHAMADOS-SALAS.md` (atendimento, responsável, contrato de
> escrita) e `Docs/MONITOR-CHAMADOS-SALAS.md` (monitor, alertas, áudio).

---

## 1. O que mudou

### 1.1 Entrada no celular

Depois do login, em tela estreita, o GCC abre **Chamados das salas** — quando
o perfil tem acesso ao módulo e não há navegação explícita na URL. O desktop
continua abrindo no Dashboard, e o modo TV não muda.

`App._landingTab()` (`Frontend/javascript/app.js`) decide por **largura de
layout** (`matchMedia('(max-width: 900px)')`), nunca por user-agent:

| Condição | Resultado |
| --- | --- |
| Largura > 900 px | Dashboard (fluxo desktop preservado) |
| ≤ 900 px, sem permissão | Dashboard |
| ≤ 900 px, com `#hash`, `?tab=`, `?gcc_tab=` ou `?view=` | Dashboard (navegação explícita preservada) |
| ≤ 900 px, com sessão já em outra aba | A aba atual |
| ≤ 900 px, com `rt_*` na URL | Chamados das salas **com filtros e visão preservados** |
| ≤ 900 px, sem nada acima | **Chamados das salas** |

A permissão é lida por `UserContext.canAccessModule('chamados-salas')`, e não
por `AuthGuard.checkModule()`, que mostraria a tela de acesso negado como
efeito colateral.

### 1.2 Menu recolhível (componente compartilhado)

A navegação lateral era quebrada no celular por **dois defeitos**, ambos
corrigidos aqui porque o menu recolhível é indispensável à experiência mobile:

1. **Duplo listener.** `App._bindSidebarEvents()` e `Sidebar._bindEvents()`
   ligavam o mesmo clique em `#sidebar-mobile-toggle`, elemento permanente do
   `index.html`. Cada `render()` acumulava mais um listener e o botão abria e
   fechava no mesmo toque. Agora só o módulo `Sidebar` liga os elementos
   permanentes, uma única vez (`_bindShellEvents`).
2. **Gaveta estreita demais.** Até 480 px a barra virava gaveta; entre 481 e
   768 px virava uma régua de 64 px **sem rótulos**, e o botão do topo não
   fazia nada. O ponto de virada agora é **900 px**: abaixo dele a navegação
   é uma gaveta de 260 px com nomes e ícones, aberta pelo botão do topo, com
   `aria-expanded`, `Escape`, fechamento ao navegar e fechamento ao voltar para
   a largura do desktop.

### 1.3 Lista vertical compacta

Novo módulo **`Frontend/javascript/room-tickets-list.js`**. Apenas renderiza,
como o Kanban e o modo TV: os dados vêm do relatório, que consulta o monitor
compartilhado, e os botões de atendimento usam `data-rt-move`, o mesmo
atributo do Kanban — quem abre o formulário é `RoomTicketsKanban.onClick`.
**A lógica de assumir, mover e concluir não foi duplicada.**

Cada item mostra, nesta ordem: sala (ou "Sala não identificada"), status real,
resumo do problema, número e referência, equipamento (ou "Equipamento não
identificado"), responsável com a origem distinta e horário de abertura.

**Filtros rápidos = agrupamentos do backend.** Os quatro filtros — Abertos,
Em andamento, Concluídos e Todos — leem `data.kanban.columns`, que o servidor
calcula sobre o **conjunto filtrado inteiro**
(`RoomTicketsService::KANBAN_COLUMNS` + `KANBAN_COLUMNS`). Nenhum mapeamento
novo foi inventado, e as contagens nunca são a contagem de uma página.

| Filtro | Origem | Apresente |
| --- | --- | --- |
| Abertos | `kanban.columns.abertos` | cartões com as ações do status e "Mostrar mais" quando `hasMore` |
| Em andamento | `kanban.columns.andamento` | idem, preservando **Em atendimento**, **Planejado** e **Pendente** como rótulos distintos |
| Concluídos | `kanban.columns.concluidos` | idem |
| Todos | `data.items` + `data.pagination` | lista paginada com "Página X de Y · N chamados no filtro" |

O limite por coluna (`kanban_limit`, 25 por padrão, máximo 100) viaja na
consulta quando um filtro rápido está selecionado, e "Mostrar mais" amplia
25 por vez — o mesmo mecanismo já usado pelo Kanban.

Quando um item não traz `actions` do servidor (aba "Todos", que usa a
paginação da tabela), a lista **não inventa botões**: o item oferece "Detalhes",
que abre o diálogo existente com "Assumir chamado", "Aceitar alerta" e "Ver
histórico".

### 1.4 Ordem da tela no celular

No celular a ordem muda para que a pessoa do TI chegue aos chamados sem rolar
por cartões de resumo:

```
estado → Lista|Kanban → busca (+ Mais filtros) → lista → preferências → resumo do período
```

No desktop a ordem é **exatamente a de antes**: resumo operacional, alternador
de visão, "Análise detalhada", filtros, estado, preferências, resultados. Nada
é recolhível acima de 860 px — o botão de recolher simplesmente não existe
nesse layout.

"Resumo do período" e "Histórico, recorrências e lista completa" são seções
recolhíveis controladas pelo módulo (botão com `aria-expanded`, não `<details>`),
para que o redesenho de cada minuto não devolva a seção ao estado padrão.

### 1.5 Busca

- No celular o campo de busca fica **sempre visível**; período, datas, sala,
  equipamento e status ficam em "Mais filtros".
- Fonte de **16 px** nos campos: o celular não aumenta o zoom ao focar.
- A busca é aplicada por **Enter ou "Aplicar filtros"**, nunca a cada tecla. O
  redesenho por ciclo **não** recria o campo: texto, foco e posição do cursor
  atravessam a atualização (já verificado pelo caixa preta), e a **rolagem da
  página também é preservada** — `captureScroll`/`restoreScroll`.
- A busca sem resultado mostra o estado vazio e **não** mantém a lista anterior
  na tela; as contagens dos filtros vão a zero.
- **Ler não espera a consulta terminar.** Antes, `onClick` ignorava qualquer
  toque enquanto `loading` era verdadeiro, e como o ciclo de 60 s pode vencer a
  qualquer momento, um toque em "Detalhes" ou "Ver histórico" era descartado
  sem retorno visível. Abrir detalhes e consultar histórico são leituras do que
  já está em memória — não mudam a consulta nem gravam nada —, então passaram a
  funcionar durante a atualização. As ações que mexem na consulta ou no GLPI
  continuam esperando.

### 1.6 Estados mostrados separadamente

Nova faixa `.rt-state` com `data-rt-state`. "Em cache" nunca é confundido com
"atualizado", e **sessão expirada deixou de ser apresentada como cache** (antes
`usingCache()` incluía `expired`):

| Estado | Texto | Também mostra |
| --- | --- | --- |
| `loading` | Carregando chamados do GLPI… | — |
| `updating` | Atualizando; os dados anteriores continuam na tela | horário anterior |
| `ok` | Dados atualizados | `meta.collectedAt` |
| `stale` | Dados em cache; a consulta está atrasada | horário anterior |
| `error` | Falha de conexão; exibindo os últimos dados conhecidos | horário anterior, dados preservados |
| `expired` | Sessão expirada; entre novamente | — |
| `empty` | Consulta concluída; nenhum chamado encontrado | contagens zeradas |

O horário é sempre o da **última consulta bem-sucedida ao GLPI**, com a data
quando diferente do dia de hoje. No celular a mesma informação aparece em uma
linha (`rt-state-short`), para não empurrar a lista para fora da primeira dobra.

### 1.7 Alertas e áudio

- O alerta ocupa a largura disponível, tem rolagem própria e no máximo 34 dvh.
  No celular ele omite as linhas de tipo e responsável (abrem no detalhe) e
  mantém sala, número, contagem regressiva e as cinco ações.
- Dentro de um `<dialog>` ele continua **no fluxo** (`position: sticky`), então
  não empurra nem cobre campos e botões — comportamento já existente e mantido.
- O monitor do rodapé deixa de flutuar sobre o conteúdo: o painel reserva
  `padding-bottom` para ele.
- **Som**: nada mudou de regra. Segue dependendo de ativação explícita, mostra
  o estado real do `AudioContext` e nunca promete som garantido. **Não há push
  notification.**

### 1.8 Formulários

- Largura disponível, `100dvh` (altura dinâmica, acompanha o teclado virtual),
  campos de 48 px, rótulos visíveis e **Confirmar/Cancelar fixos no pé** do
  diálogo para continuarem ao alcance com o teclado aberto.
- O botão "Fechar" **não** foi reintroduzido. Cancelar funciona imediatamente
  antes, durante e depois de uma falha; uma resposta atrasada **não** ressuscita
  o formulário (verificado no cenário `cancelamento`).
- O diálogo de detalhes (`#rt-detail`) ganhou estilo próprio: ele vive no
  `<body>`, então as regras antigas `.rt-dashboard dialog` nunca o alcançavam.

---

## 2. Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `Frontend/javascript/room-tickets-list.js` | **novo** — renderizador da lista vertical compacta e dos filtros rápidos |
| `Frontend/javascript/room-tickets.js` | filtro rápido (`rt_group`), faixa de estados, seções recolhíveis, ordem da tela no celular, preservação de rolagem, lista compacta, botão "Mais filtros" |
| `Frontend/javascript/app.js` | entrada mobile pós-login; remoção do listener duplicado do menu |
| `Frontend/javascript/sidebar.js` | gaveta até 900 px, listener único, `aria-expanded`, `Escape`, foco e fechamento automático |
| `Frontend/css/room-tickets.css` | experiência mobile de chamados, faixa de estado, chips, item, diálogos, alertas |
| `Frontend/css/sidebar.css` | gaveta recolhível de 260 px até 900 px |
| `Frontend/css/styles.css` | botão do menu 44 × 44 e visível até 900 px |
| `Frontend/css/search.css` | pesquisa global do topo oculta até 900 px (acompanha a gaveta) |
| `Frontend/index.html` | registro do novo módulo |
| `Frontend/test-room-tickets-mobile.cjs` | **novo** — 28 cenários em Chromium real com o CSS de produção |
| `Frontend/test-room-tickets-mobile-boot.js` | **novo** — roteiro dos cenários mobile e da API simulada |
| `entregas/mobile-chamados-salas/*.png` | **novo** — 16 capturas |

**Nada foi alterado no backend.** Nenhum endpoint, contrato de escrita,
permissão ou dado operacional foi tocado.

---

## 3. Testes executados

Windows, `$env:CHROME_BIN = "C:\Program Files\Google\Chrome\Application\chrome.exe"`,
Node 24.18, PHP 8.0.30.

| Suíte | Comando | Resultado |
| --- | --- | --- |
| **Mobile (novo)** | `node Frontend/test-room-tickets-mobile.cjs` | **517 checks em 28 cenários** |
| Chamados (agregação) | `php Backend/tests/test_room_tickets.php` | 63 verificações |
| Kanban, responsável, histórico | `php Backend/tests/test_room_tickets_kanban.php` | 115 verificações |
| Endpoint + assumir + mover + aceite | `php Backend/tests/test_room_tickets_endpoint.php` | 260 checks |
| Aceite compartilhado | `php Backend/tests/test_room_ticket_acknowledgements.php` | 16 verificações |
| UI simulada (Node) | `node Frontend/test-room-tickets.cjs` | 29 testes, 0 falhas |
| Navegador — relatório | `node Frontend/test-room-tickets-browser.cjs` | 24 checks × 2 viewports |
| Navegador — Kanban e formulários | `node Frontend/test-room-tickets-kanban-browser.cjs` | 47 checks × 2 viewports |
| Navegador — modo TV | `node Frontend/test-room-tickets-tv-browser.cjs` | 27 checks × 2 viewports |
| Caixa preta (CSS de produção) | `node Frontend/test-room-tickets-blackbox.cjs` | 55 checks em 7 cenários |

### 3.1 Uma observação que vale para todos os testes de navegador

**O Chrome desta plataforma recusa janelas com menos de 500 px de largura.**
Medido: `--window-size=390,844` entrega `clientWidth = 500`, em `--headless=new`,
`--headless` antigo e com `--force-device-scale-factor`. Os testes de navegador
existentes que pediam 360, 390, 430 e 500 **mediram 500** — inclusive os
"500,900" deste repositório.

Por isso o teste mobile carrega a aplicação dentro de um `<iframe>` com a
largura pedida: dentro dele `innerWidth`, `clientWidth`, `matchMedia` e as media
queries CSS usam a viewport **real**. O runner compara a viewport medida com a
pedida e falha se divergirem:

```
OK lista-e-filtros 360x780: 43 checks; viewport medida 360
OK lista-e-filtros 390x844: 43 checks; viewport medida 390
OK lista-e-filtros 430x932: 43 checks; viewport medida 430
OK lista-e-filtros 768x1024: 43 checks; viewport medida 768
```

### 3.2 Cobertura dos itens de validação

| Item da validação | Cenário | O que é verificado |
| --- | --- | --- |
| 1. Login, entrada mobile e navegação preservada | `entrada-mobile` (360, 390, 430, 768, 1280, sem permissão, sem sessão, `?tab=`, `rt_view`, `rt_group`) | aba de entrada, menu recolhível abrindo/fechando, `aria-expanded`, nomes visíveis na gaveta, filtros e visão da URL preservados, sem sessão e sem permissão |
| 2. Lista, filtros, busca contínua e paginação | `lista-e-filtros` (360, 390, 430, 768), `busca-preservada` (390, 768) | campos de cada item, contagens dos agrupamentos, plano/pendente preservados, casos de borda, alvos de 44 px, sem rolagem horizontal, estado vazio, paginação real, texto/foco/cursor/rolagem preservados |
| 3. Assumir e concluir com API simulada | `atendimento` (360, 390, 768), `atendimento-restrito` (390) | formulário, seleção de técnico, gravação com `requestId`, **envio duplicado não grava duas vezes**, item muda de coluna com o status real, solução visível, diretório restrito com nome livre declarado como "informado no GCC" |
| 4. Cancelar antes, durante e depois de uma falha | `cancelamento` (390) | cancelamento imediato nos três momentos, resposta atrasada **não** reabre o formulário, reabertura gera novo `requestId` |
| 5. Erros 403, 409 e 502 com alteração parcial | `erros` (360, 390) | mensagens traduzidas, responsável atual e ações disponíveis no 409, "metade"/"status foi alterado"/etapa que falhou no 502, texto preservado, sem movimento otimista |
| 6. Atualização automática com formulário aberto | `atualizacao` (390) | nenhuma consulta extra antes do ciclo, **uma consulta por ciclo**, formulário e texto intactos, item novo na lista, detalhes abrem durante a atualização |
| 7. Cache, desconexão e sessão expirada | `cache-e-sessao` (390) | estados `ok` → `error` → `ok` → `expired`, horário real que não avança na falha, dados preservados, expiração não apresentada como cache |
| 8. Alertas e estado do áudio | `alerta-e-audio` (360, 390) | alerta cabe na largura, não toma a tela, some ao dispensar, entra no diálogo sem empurrar o formulário, estado real do áudio exibido em texto |
| 9. Sem regressões no desktop e no modo TV | `desktop-e-tv` (1280), além das suítes existentes | tabela, paginação, filtros abertos, sem seções recolhíveis, análise visível, TV abre/fecha e continua informativa |

---

## 4. Capturas

`entregas/mobile-chamados-salas/` (Chromium headless, CSS e módulos de
produção, viewport real por `iframe`):

| Arquivo | Tela |
| --- | --- |
| `01-mobile-360-lista-abertos.png` | lista compacta, filtro Abertos, 360 px |
| `02-mobile-390-lista-abertos.png` | idem, 390 px |
| `03-mobile-430-lista-abertos.png` | idem, 430 px |
| `04-mobile-390-lista-completa-paginacao.png` | filtro Todos com paginação real |
| `05-mobile-390-assumir-chamado.png` | formulário "Quem do TI foi resolver o problema?" |
| `06-mobile-390-concluir-chamado.png` | formulário "Como o problema foi resolvido?" |
| `07-mobile-390-alerta-novo-chamado.png` | alerta de novo chamado na largura do celular |
| `08-mobile-360-menu-recolhivel.png` | menu recolhível aberto, 360 px |
| `09-mobile-390-mais-filtros.png` | bloco "Mais filtros" aberto |
| `10-mobile-390-falha-conexao-com-cache.png` | estado de falha com os dados anteriores preservados |
| `11-mobile-390-detalhes-do-chamado.png` | diálogo de detalhes |
| `12-mobile-390-historico-e-recorrencias.png` | "Histórico, recorrências e lista completa" aberto |
| `13-comparacao-360-390-430-768.png` | as quatro larguras lado a lado |
| `14-tablet-768-lista.png` | lista em tablet, 768 px |
| `15-desktop-1440-lista.png` | **comparação desktop**: layout inalterado |
| `16-desktop-1440-kanban.png` | Kanban no desktop |

---

## 5. Limitações e verificações pendentes em dispositivo real

A emulação de viewport **não** prova os seguintes pontos. Todos precisam de
um aparelho de verdade:

1. **Teclado virtual.** Confirmar que, ao focar "Buscar chamado" e os campos do
   formulário, o teclado abre, o `100dvh` reduz a altura do diálogo, os campos
   e as ações ficam roláveis e o foco não salta. O teste automatizado confirma
   dimensões e rolagem em viewport estática, não a interação com o teclado do
   sistema.
2. **Áudio.** O estado real do `AudioContext` é conferido; que alguém **ouviu**
   o alerta é humano. Em iOS e Android o áudio pode ser recusado com a tela
   bloqueada, o navegador em segundo plano ou a página fechada. O rótulo muda
   para "Som bloqueado" nesses casos — é o comportamento correto, mas precisa
   ser visto no aparelho.
3. **Áreas seguras e altura dinâmica.** `env(safe-area-inset-*)` e `dvh` estão
   declarados, mas o entalhe e a barra de gestos do aparelho não existem no
   emulador.
4. **Toque real.** As áreas de 44 × 44 px são medidas em CSS; a sensação do
   toque, o `hover` undesired do Safari e o duplo-tap para zoom dependem do
   aparelho.
5. **Sombra e recorte.** Sem dispositivo, não há como conferir `text-overflow`
   com nomes realmente longos (o teste cobre nomes e salas longos sintéticos) e
   o comportamento do `overflow` quando o usuário aumenta o tamanho da fonte.
6. **Orientação.** Trocar o aparelho de retrato para paisagem refaz o layout via
   `matchMedia`; o teste cobre a mudança de largura por `iframe`, não a rotação
   real com o teclado aberto.
7. **Desempenho em rede móvel.** O ciclo de 60 s, a trava entre abas e o cache
   foram verificados com API simulada e relógios reais; a latência de uma rede
   4G real não foi medida.

### O que ficou de fora, por decisão

- **Push notifications** — não implementado nesta etapa, como combinado.
- **`?tab=` como roteador.** O GCC não roteia por parâmetro de aba. A
  entrada automática é **suspensa** quando ele está presente, e a pessoa escolhe
  pelo menu. Implementar o roteamento é outra etapa.
- **Botão "Ativar modo TV" oculto no celular.** O modo TV é para a parede; ele
  continua disponível no desktop. Se houver uso em tablet, é uma linha de CSS.
- **Arrastar e soltar no celular.** Não é removido, mas a lista compacta nunca o
  usa: todo chamado se move por botão. Arraste continua como complemento no
  Kanban de telas largas.
- **Reformulação visual das outras áreas.** O GCC inteiro ainda tem a identidade
  visual anterior; as mudanças de cor, tipografia e densidade ficaram
  concentradas na experiência de chamados, como combinado.

### Homologação manual pendente com o GLPI real

Continua valendo a lista de `Docs/KANBAN-CHAMADOS-SALAS.md`, seção 10: nome do
campo de atribuição, perfil da conta de integração, `type_followup` da solução,
`resolution` × `resolution_id`, regras de atendimento, permissões do formulário
e escrita única de `Backend/data`. Nada disso foi exercitado contra a instância
real — as gravações usam API simulada e nenhum chamado real foi alterado.
