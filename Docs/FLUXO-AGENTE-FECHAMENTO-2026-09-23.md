# Fechamento do fluxo do agente GCC

Implementação local em 23/09/2026, após o levantamento do mesmo dia. Este documento descreve as mudanças feitas; o levantamento anterior permanece como registro do estado encontrado.

## Fluxo simplificado

```text
Você pede uma consulta ou alteração
  → IA interpreta e solicita ferramentas
  → GCC localiza o ativo no cache e permite consultar o registro no GLPI
  → para alteração, GCC monta uma prévia: ativo + valor atual + valor pedido
  → painel mostra a prévia com Confirmar e Cancelar
  → você confirma aquela prévia
  → GCC revalida usuário, permissão, prazo, conteúdo e versão do ativo
  → GCC grava no GLPI e consulta novamente
  → GCC compara o valor pedido com o observado e atualiza o cache
  → painel recebe a representação atualizada, aplica os dados e renderiza
  → comprovante distingue conferido, divergente, pendente ou desconhecido
```

A IA não recebe mais uma ferramenta de execução. Dizer “sim” no chat não grava: a confirmação acontece no cartão. A aprovação fica vinculada ao conteúdo da proposta, ao alvo e ao usuário.

## O que foi conectado e corrigido

- Chat devolve propostas estruturadas, além de texto e fontes das ferramentas. O painel renderiza o cartão com antes/depois; criação mostra os campos propostos.
- Execução exige hash da prévia enviada pelo botão. Propostas antigas sem esse vínculo precisam ser refeitas. Conteúdo alterado, prazo vencido, usuário diferente e perda de permissão impedem a execução.
- Permissão de edição é revalidada pelo middleware atual, conforme Computer ou Printer. Leitura e cancelamento de proposta também verificam dono.
- Uma trava é mantida por proposta durante a execução. Repetir uma confirmação concluída devolve o resultado salvo, sem repetir a escrita. O cliente HTTP deixou de repetir POST automaticamente por padrão.
- Consulta por ID preserva o tipo e distingue erro de comunicação de registro ausente. A prévia usa os campos originais e `date_mod`, preservados dentro de `raw`.
- Patrimônios mantêm zeros à esquerda. Campos específicos de Printer deixam de ser descartados. Campos não editáveis e valores inválidos são recusados durante a preparação.
- Releitura de escrita compara valores solicitados. Divergência e leitura desconhecida deixam de produzir sucesso do agente. Falha de releitura preserva o cache anterior.
- Cache mantém o envelope com `items`, para que a busca continue funcionando depois de salvar. Atualização recusa substituir versão mais nova do cache; gravação de arquivo retorna falha se não publicar a substituição.
- A representação consumida pelo painel vem de uma rota vinculada à operação e ao dono. A versão é calculada pelo conteúdo. A tela só confirma depois de aplicar os dados e renderizar; versão arbitrária ou desatualizada é recusada.
- Comprovante usa “Representação GCC” para a camada baseada no cache. Ela não é anunciada como teste HTTP independente de todas as rotas do sistema. Resultado completo exige também confirmação da tela.
- Corrigido o schema da ferramenta de operação. Suporte do modelo a ferramentas é informado como desconhecido até validação real, sem lista fixa contraditória.
- Consulta de horas de projetores usa o arquivo e os campos do módulo existente, associando o ID local ao nome do cache. Isso não adiciona edição de horas pelo agente.
- Lotes exigem aprovação por proposta e mantêm o total planejado ao registrar resultados. A interface de confirmação em lote não foi criada.

## O que foi demonstrado automaticamente

### Backend: 56 verificações aprovadas

`php Backend/tests/test_agent_flow.php`

Os serviços reais são carregados em uma cópia temporária. GLPI e modelo são simulados; não se carregam credenciais, não se usa rede e não se alteram os diretórios operacionais.

Inclui consulta e fonte, erros de rede, identidade Printer, proposta sem escrita, conservação de campos, recusa de execução sem confirmação, hash errado, usuário errado, permissão removida, proposta travada, repetição sem nova escrita, patrimônio com zeros, cache após edição, versão de tela inválida, alteração concorrente desde a prévia, cancelamento, divergência, releitura indisponível, chat com proposta estruturada, criação, inativação, restauração, isolamento de chaves, consulta local de horas, expiração e alteração do conteúdo aprovado.

O caso da trava testa uma segunda tentativa enquanto a proposta está bloqueada. Não representa ensaio de carga nem garantia de exclusão mútua entre propostas distintas ou outras aplicações escrevendo no GLPI.

### Painel: 3 cenários aprovados

`node Frontend/test-agent-flow.cjs`

Executa as funções reais do painel com DOM e respostas de API simulados:

1. Mensagem → cartão → clique com hash → execução → aplicação de dados → renderização → confirmação → comprovante.
2. Falha na atualização da tela não confirma a versão nem repete a gravação.
3. Erro HTTP em POST não provoca repetição automática.

Também passaram verificações de sintaxe dos arquivos alterados, `git diff --check` e os 15 testes textuais da correção anterior. Estes últimos continuam sendo verificações fracas; a evidência principal são os novos cenários comportamentais. As demais suítes antigas não foram executadas neste fechamento, pois algumas usam diretórios operacionais e pressupõem o contrato anterior sem aprovação.

## Limites que permanecem

- Não houve teste com o provedor de IA ou GLPI reais, nem homologação visual em navegador. Compatibilidade remota, permissões GLPI, latência e particularidades de dropdowns ainda precisam ser demonstradas.
- A busca por nome depende do cache. O prompt orienta consultar o GLPI antes de apresentar dados como atuais; a escolha da ferramenta ainda é feita pelo modelo.
- O fluxo cobre Computer e Printer e os campos permitidos. Inativação é mudança de estado para Inativo; restauração é mudança para Em uso. Não há exclusão definitiva.
- A edição de horas/manutenção locais de projetores não foi implementada. Essa será uma operação GCC separada da gravação GLPI.
- Propostas diferentes para o mesmo ativo e outras interfaces ainda podem disputar uma escrita após a checagem da versão. Não foi implementada transação distribuída ou escrita condicional no servidor GLPI.
- Uma falha de processo depois de iniciar a execução exige consultar a operação e investigar seu estado; não há retomada automática que repita gravação incerta.
- O painel atualiza o estado central e as coleções derivadas. Componentes com armazenamento próprio, como detalhes específicos de projetores, precisam de homologação visual por tela antes de afirmar cobertura integral da interface.

## Próximos passos em sprints pequenas

1. **Homologar uma consulta real.** Pedir “consulte o Chrome-014”; conferir nome, tipo, ID, patrimônio, fonte e data com o cadastro. Validar que o provedor aceita ferramentas. Não gravar nessa etapa.
2. **Homologar uma edição em ativo de teste.** Pedir uma alteração de patrimônio, conferir a prévia, cancelar uma vez, refazer e confirmar. Comparar valor solicitado, releitura GLPI, cache e tela. Verificar que repetir a confirmação não repete a escrita.
3. **Validar os demais campos e tipos.** Uma operação por vez: impressora, localização/grupo, criação, inativação e restauração. Dar atenção ao formato dos dropdowns e à atualização de cada tela.
4. **Implementar horas de projetor como fluxo local GCC.** Prévia, confirmação, gravação local e releitura local, indicando que GLPI não participa dessa operação.
5. **Só então ampliar autonomia e lotes.** Antes disso, demonstrar concorrência entre propostas distintas, recuperação após queda e apresentação de resultados individuais.

Não foi feito deploy nem alteração de ativo real neste fechamento.
