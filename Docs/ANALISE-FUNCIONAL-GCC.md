# Análise Funcional GCC — Achados F01–F30

> **Rastreabilidade:** IDs e títulos originais preservados. Matriz recalculada automaticamente a partir da tabela abaixo.

| ID | Título | Etapa |
|----|--------|-------|
| F01 | Identidade itemtype:id não propagada no fluxo de detalhes | 2.1, 5.8 |
| F02 | Modal de detalhes duplicado e desacoplado da navegação | 1.6 |
| F03 | Estado compartilhado não atualizado após escrita verificada | 3.3 |
| F04 | Idempotência ignora clientKey e não é atômica entre processos | 5.1–5.4 |
| F05 | Confirmação não vinculada ao conteúdo (hash/versão) da proposta | 4.1–4.4 |
| F06 | Concorrência sem transporte de versão e dirty-read entre processos | 5.7–5.9 |
| F07 | GlpiClient usa exit/Responde::erro dentro de serviços | 6.1 |
| F08 | Paginação sem completude/erros explícitos e sem detecção de repetição robusta | 6.3–6.5 |
| F09 | CacheUpdater verifica isRunning mas não mantém lock read-modify-write | 7.1 |
| F10 | Inventário substituído por subconjunto em coleta parcial | 7.8, 9.5–9.6 |
| F11 | sync-cron.php com comentário que quebra PHP e Env::load incorreto | 7.9 |
| F12 | Relatórios não incluem Salas/Turmas e Exibição | 9.5, revisitar |
| F13 | Lote conclui antecipadamente antes de todos os itens terminarem | 9.1–9.2 |
| F14 | Ticket/Item_Ticket duplica chamado ao recuperar vínculo falho | 9.9 |
| F15 | Cache não reclassifica após mudar nome/grupo/estado | 7.3 |
| F16 | Criação insere resposta bruta sem classificar | 7.5 |
| F17 | Ferramentas de projetores usam schema incorreto | 2.3, 9.8 |
| F18 | API marcada como confirmada apenas por ID em cache | 8.2 |
| F19 | Frontend confirma versão antes de aplicar estado | 8.3 |
| F20 | Comprovante omite valores anteriores reais | 8.7 |
| F21 | Defaults de produção reintroduzem domínios antigos .cloud | 7.10 |
| F22 | Suporte a tools do provedor depende de booleano contraditório | revisitar |
| F23 | AgentPanel.init não idempotente e logout não limpa estado | 4.ciclo |
| F24 | Ordem ApiClient/interceptors não garantida | 4.ciclo |
| F25 | Retry automático repete escritas sem idempotência | 4.ciclo |
| F26 | Erro operacional com HTTP 200 tratado como sucesso | 3.2, 4.ciclo |
| F27 | Normalização de grupos com entidades/acentos incompleta | 2.6 |
| F28 | Categoria vs alocação (carrinho vs turma) embaralhadas | 2.7 |
| F29 | Configuração de produção não preserva e-mails de auth | 7.10 |
| F30 | Roteamento /api/* não funciona com php -S puro | 7.correção |

*Detalhamento de cada achado está na matriz do Relatório de Correção. Este arquivo é a fonte canônica de IDs/títulos.*
