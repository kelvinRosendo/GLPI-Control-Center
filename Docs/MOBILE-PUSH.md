# Atendimento mobile e notificações push — 02/10/2026

Até 860 px, a entrada passa a ser a fila **Para atender**. Cada chamado mostra sala,
problema, data, responsável quando houver e **Vou atender**. O aceite usa o formulário
existente e confirma a atribuição no GLPI. As outras filas são **Em atendimento** e
**Concluídos**, com os agrupamentos do backend. Concluir, reabrir e histórico ficam
em **Detalhes**; busca, filtros e som do monitor em **Buscar e configurar**.
Desktop e TV mantêm suas apresentações; TV continua sem ações de atendimento.

## Instalação e permissão

O convite aparece na tela mobile, mas só solicita permissão ao tocar em **Ativar
notificações**. No iPhone/iPad 16.4+, primeiro adicionar à Tela de Início e abrir pelo
ícone. No Android, usar **Instalar GCC** ou o menu do navegador. A notificação abre
a aplicação, exigindo login se a sessão expirou; tocar nela nunca assume um chamado.
O som depende do modo silencioso, Foco/Não Perturbe e das políticas do aparelho.

## Configuração obrigatória na VPS

**Esta implementação não ativou push na VPS.** Sem configuração, a interface informa
que o envio ainda não está habilitado. O ambiente local usa PHP 8.0; a biblioteca
de envio exige PHP >= 8.2 (VPS: 8.3.6).

1. Na nova release, executar `composer install --working-dir=Backend --no-dev --prefer-dist --no-interaction`
   usando PHP 8.3 e o `Backend/composer.lock` versionado. Não ignorar requisitos na VPS.
2. Gerar uma única vez as chaves com `Minishlink\WebPush\VAPID::createVapidKeys()` usando
   o autoload do Composer. Guardar a chave privada somente no `.env` protegido.
   Preservar as chaves nas próximas releases; trocar a chave exige reinscrição dos celulares.
3. Configurar no `Backend/.env`:

   ```dotenv
   GCC_PUSH_ENABLED=1
   GCC_PUSH_PUBLIC_KEY=<publicKey gerada>
   GCC_PUSH_PRIVATE_KEY=<privateKey gerada>
   GCC_PUSH_SUBJECT=mailto:<email de contato do TI>
   GCC_PUSH_DIR=/var/lib/gcc/data/push
   ```

   Todas as contas autenticadas do GCC podem inscrever seus aparelhos. Não existe
   lista adicional de técnicos: `GCC_PUSH_EMAILS` é legado e não é mais usado.
   A rota mantém autenticação e CSRF para escrita; os domínios permitidos no login
   continuam sendo verificados. Cada aparelho precisa conceder permissão e ativar
   notificações; apenas ter feito login no passado não cria uma inscrição push.
4. Criar o diretório persistente com proprietário `www-data` e modo 0700. Incluí-lo
   no backup protegido. O estado usa trava e gravação atômica; contém endpoints privados.
5. Instalar `Backend/deploy/gcc-push.service` e `gcc-push.timer` em `/etc/systemd/system/`,
   recarregar o systemd e habilitar o timer. Verificar `systemctl status gcc-push.timer`
   e `journalctl -u gcc-push.service`. O worker consulta a cada minuto, sem navegador.
   A primeira leitura estabelece uma linha de base sem disparar chamados antigos.
6. Servir `/sw.js`, `/manifest.webmanifest` e `/assets/pwa/` por HTTPS. Configurar
   `/sw.js` com `Cache-Control: no-cache` no Nginx. O worker não cacheia páginas,
   API nem sessões. Recarregar o PHP após mudar o `.env`, conforme procedimento de deploy.

## Comportamento de entrega

- Inscrição dura 30 dias e é renovada ao abrir o GCC com a mesma conta. Conta diferente
  exige nova ativação. Sair revoga a inscrição daquela sessão; expirar a sessão permite
  continuar recebendo durante a validade da inscrição, mas exige login ao abrir detalhes.
  Notificações já enviadas ao provedor podem continuar na bandeja após sair.
- A consulta ocorre a cada 60 segundos. Um chamado novo elegível é enviado aos
  aparelhos inscritos na execução que o detectar, sem depender de uma tela aberta.
  Não há garantia de entrega instantânea; som local não comprova push configurado.
- Remover um domínio dos domínios permitidos no login impede envio para ele na
  próxima execução. Sair do GCC ou desativar avisos revoga a inscrição do aparelho.
- Na tela bloqueada aparecem só sala e número, sem descrição ou solicitante.
- Após falha, só recupera chamados novos com até 15 minutos. Leitura inicial não envia
  histórico. O recorte de 30 itens do monitor do navegador não limita o worker.
- Fila persistente, validade de 15 minutos, até quatro tentativas com espera crescente;
  inscrições rejeitadas com 404/410 são removidas. Fechados e alertas já aceitos saem da fila.
- Uma interrupção entre entrega ao provedor e gravação local pode repetir uma entrega.
  O mesmo `tag` substitui o aviso sem pedir novo som. Confirmação do provedor não comprova
  exibição nem áudio no aparelho.
- Limites: 10 aparelhos por técnico, 200 inscrições totais, 100 envios por execução.
  Consulta demorada ao GLPI, falta de rede e políticas de bateria podem atrasar o aviso.

## Verificação e pendências

Testes isolados: `php Backend/tests/test_room_push.php`,
`node --test Frontend/test-gcc-push.cjs` e `node Frontend/test-room-tickets-mobile.cjs`.
O runner mobile mede a largura real do iframe; agora valida a fila simples, formulários,
cache, erros 403/409/502 e regressão desktop/TV. Não compara a quantidade de checks com
a versão anterior, pois a interface e as expectativas mudaram.

Depois de configurar a VPS, homologar em Android e iPhone: instalar, permitir, fechar
o aplicativo, bloquear a tela, criar chamado de teste, receber o aviso e assumir no GCC.
Conferir responsável no GLPI. Repetir com permissão negada, perda de conexão, logout e
desativação dos avisos. **Esta homologação real ainda está pendente.**

Fontes: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
e https://github.com/web-push-libs/web-push-php.
