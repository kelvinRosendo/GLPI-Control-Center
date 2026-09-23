# Planejamento da feature — Chamados das salas no GCC

**Status:** planejamento, sem implementação  
**Data:** 23/09/2026  
**Produto:** GLPI Control Center (GCC)  
**Fonte funcional:** `padrao-chamado-glpi.html` — padrão Mano Isa → GLPI

## 1. Objetivo

Preparar o GCC para buscar, organizar e exibir em uma página própria os chamados originados pelo fluxo do Mano Isa relacionados a salas e outros espaços da escola. A primeira entrega será de consulta e acompanhamento; a abertura e a mudança de status continuam nos fluxos já existentes.

## 2. Escopo da primeira versão

Incluído:

- nova página de navegação **Chamados das salas**;
- consulta autenticada ao GLPI pelo backend existente;
- lista de chamados com ordenação por urgência e idade;
- filtros por local, categoria, status, urgência e período;
- busca por texto, solicitante, número GLPI e referência `L-000X`;
- indicadores de chamados abertos, urgentes e solucionados;
- painel de detalhes do chamado;
- link para abrir o registro correspondente no GLPI;
- atualização manual e automática configurável;
- tratamento explícito de local ou referência ausente.

Fora da primeira versão:

- criação, edição ou fechamento de chamados nessa página;
- consulta direta ao SQLite do Mano Isa;
- exibição de chamados que falharam antes de serem criados no GLPI (`glpi_pendente`);
- automação de notificações;
- alteração do padrão de criação definido pelo documento de referência.

## 3. Regra de identificação

O documento de referência define oito categorias GLPI (Projetor, Computador, Impressora, Rede/Internet, Software, Chromebook, Sala Maker e Outros). Portanto, “chamado de sala” não deve ser inferido por uma categoria única.

Critério inicial recomendado, em ordem de confiança:

1. chamado criado pelo usuário técnico `whatsapp.escola`;
2. título ou descrição contendo a referência `[L-000X]`;
3. descrição contendo os campos `Local:` e `Ref. espelho:`;
4. local reconhecido na descrição ou no título.

O backend deve retornar também um campo `origemClassificacao` (`tecnica`, `referencia`, `conteudo` ou `nao_identificado`) para auditoria. Registros ambíguos podem ser exibidos com o selo “Revisar classificação”, sem serem descartados.

## 4. Contrato de dados proposto

O endpoint existente `/api/tickets` deve ganhar uma projeção específica, sem quebrar consumidores atuais.

Rota planejada: `GET /api/tickets/salas`

Parâmetros opcionais:

```text
status=aberto,em_andamento,pendente,resolvido,fechado
urgencia=2,3,4,5
categoria=1,2,3,4,5,6,7,8
local=sala%2010
periodo_de=2026-09-01
periodo_ate=2026-09-30
q=projetor
page=1
per_page=50
```

Resposta conceitual:

```json
{
  "ok": true,
  "data": {
    "items": [{
      "id": 123,
      "titulo": "[L-0005] Matheus — Wi-Fi Alunos sem internet (sala 10)",
      "descricao": "...",
      "status": "aberto",
      "statusId": 1,
      "urgencia": "alta",
      "urgenciaId": 4,
      "categoria": "Rede/Internet",
      "categoriaId": 4,
      "solicitante": "Matheus",
      "contaTecnica": "whatsapp.escola",
      "local": "sala 10",
      "referenciaEspelho": "L-0005",
      "abertura": "2026-09-23 10:15:00",
      "atualizacao": "2026-09-23 10:15:00",
      "origemClassificacao": "referencia",
      "glpiUrl": "https://glpi.colegiosatelite.cloud/front/ticket.form.php?id=123"
    }],
    "pagination": {"page": 1, "perPage": 50, "total": 1, "totalPages": 1},
    "summary": {"abertos": 1, "urgentes": 0, "solucionados": 0}
  }
}
```

O backend deve manter paginação, escapar conteúdo para o frontend e excluir registros na lixeira. O link do GLPI deve ser montado a partir de configuração, nunca de entrada do usuário.

## 5. Desenho da página

### Cabeçalho

Título “Chamados das salas”, data/hora da última atualização e ação “Atualizar agora”.

### Indicadores

- Em aberto: status 1, 2, 3 ou 4;
- Urgentes: urgência 4 ou 5 e status não solucionado/fechado;
- Solucionados no período: status 5;
- Sem local: chamados que exigem revisão de preenchimento.

### Filtros

Filtros combináveis, com botão para limpar: período, local, categoria, status, urgência e busca textual. O estado dos filtros deve ficar na URL para permitir compartilhamento e retorno à página.

### Tabela/lista

Colunas: prioridade, chamado, local, categoria, solicitante, abertura e status. Em telas estreitas, a linha vira um cartão e mantém o número GLPI visível.

### Detalhes

Ao selecionar uma linha, abrir painel lateral ou modal com título, status, urgência, solicitante real, conta técnica, local, mensagem original, descrição completa, referência do espelho e botão “Abrir no GLPI”.

Estados obrigatórios: carregando, vazio, erro, sessão expirada e classificação incompleta.

## 6. Arquitetura e arquivos prováveis

Backend:

- `Backend/api/tickets.php`: consulta, normalização e extração dos campos estruturados;
- `Backend/api/endpoints.php`: roteamento da nova rota;
- cliente GLPI já existente: filtros, paginação e controle da sessão;
- testes de contrato para resposta, filtros, status e exclusão da lixeira.

Frontend:

- `Frontend/index.html`: entrada da nova página e carregamento do módulo;
- `Frontend/javascript/app.js`: navegação, carregamento e estado da página;
- `Frontend/javascript/glpi.client.js`: método para `/api/tickets/salas`;
- novo módulo, por exemplo `Frontend/javascript/room-tickets.js`;
- `Frontend/javascript/ui_render.js`: cards, filtros, lista e detalhe;
- CSS existente ou novo arquivo específico para a página.

Não alterar o contrato de criação de chamados existente em `tickets.js` nesta etapa.

## 7. Segurança e desempenho

- reutilizar autenticação, sessão e autorização já aplicadas às rotas protegidas;
- nunca enviar `App-Token`, `User-Token` ou `Session-Token` ao navegador;
- limitar `per_page` no backend;
- aplicar filtros no GLPI quando possível e paginar antes de mapear;
- definir timeout e mensagem de erro consistente;
- evitar chamadas individuais por chamado para não gerar N+1;
- escapar HTML de título, descrição, local e solicitante;
- não registrar tokens nem conteúdo sensível nos logs.

## 8. Plano de implementação

1. Validar com amostras reais quais campos do GLPI identificam `whatsapp.escola` e como aparecem `itilcategories_id`, usuário, local e descrição.
2. Fechar o contrato JSON e a regra de classificação.
3. Implementar a projeção e rota de leitura no backend.
4. Adicionar testes de mapeamento, filtros, paginação e classificação.
5. Adicionar navegação e tela no frontend.
6. Implementar estados de carregamento, erro, vazio e sessão expirada.
7. Validar responsividade e acessibilidade.
8. Executar validação sintática e testes locais.
9. Fazer homologação com chamados reais anonimizados.
10. Publicar em release e acompanhar logs/tempo de resposta.

## 9. Critérios de aceite

- usuário autenticado acessa a nova página sem perder as páginas existentes;
- lista mostra apenas dados retornados pelo backend autorizado;
- filtros podem ser combinados e refletem na URL;
- ordenação padrão prioriza urgência e chamados mais antigos;
- título e descrição seguem legíveis mesmo com HTML ou caracteres especiais;
- cada item exibe status, urgência, categoria, local, solicitante e número GLPI;
- detalhes permitem abrir o chamado correto no GLPI;
- chamados sem local aparecem com sinalização clara;
- chamados na lixeira não aparecem;
- falhas do GLPI mostram erro recuperável e não deixam a tela travada;
- atualização automática não dispara requisições concorrentes;
- criação e consulta de chamados já existentes continuam funcionando.

## 10. Riscos e decisões pendentes

| Risco/decisão | Impacto | Tratamento |
|---|---|---|
| Conta técnica não está disponível no retorno da API | Alto | Confirmar campo de usuário e permissões no GLPI; usar referência como fallback. |
| Local só existe no texto livre | Médio | Parser tolerante, campo “não informado” e selo de revisão. |
| Muitos chamados históricos | Médio | Paginação, filtros no backend e cache curto opcional. |
| Chamados do Mano Isa fora das salas | Médio | Manter página ampla de atendimentos com filtro por local. |
| `glpi_pendente` fora do GLPI | Alto | Planejar integração futura com o espelho local do Mano Isa. |
| Alteração de status pelo GCC | Médio | Manter fora do MVP para não duplicar regras operacionais. |

## 11. Perguntas para homologação

1. A página deve incluir laboratório, Sala Maker e outros espaços, ou apenas salas de aula?
2. O filtro inicial deve mostrar todos os status ou somente chamados não encerrados?
3. Qual perfil do GCC poderá visualizar o conteúdo completo da descrição?
4. Existe uma lista oficial de nomes de salas para normalizar variações como `sala 10`, `Sala 10` e `10`?

## 12. Resultado esperado

Ao final do projeto, o GCC terá uma visão operacional dos chamados de espaços físicos, rastreável ao GLPI e ao espelho `L-000X`, com filtros suficientes para a equipe localizar rapidamente o problema, o local e o responsável pelo atendimento.
