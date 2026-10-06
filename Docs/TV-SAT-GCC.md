# TV do setor: SAT + GCC

O ciclo mantém as telas existentes: tarefas SAT (60 s), agendamentos SAT (60 s),
ativos GCC (30 s), chamados GCC (30 s), voltando às tarefas. Alertas no GCC
pausam temporariamente a troca. A seta manual de agendamentos para tarefas
continua com o destino atual.

O navegador visita o GCC na mesma aba, em `https://gcc.colegiosatelite.cloud/?tv=sat`.
Não há iframe, compartilhamento de credenciais, banco novo ou alteração de permissões.
Somente a troca automática da página de agendamentos é alterada no SAT.

## Publicação

1. Publicar primeiro os arquivos do GCC desta alteração, junto à release atual.
2. Publicar o SAT com a alteração em `app/dashboard/agendamentos-tv/page.tsx`.
3. No computador da TV, usar o mesmo perfil do Chrome/Edge para SAT e GCC.
   Abrir a URL do GCC acima, clicar em **Fazer login e configurar avisos** caso
   necessário e entrar com a conta institucional.
4. No modo TV, clicar em **Notificações do Windows**, depois **Ativar notificações**
   e permitir o aviso do navegador. Conferir a mensagem de ativação. Se o envio
   pelo servidor estiver atrasado, verificar o worker existente `gcc-push.timer`.
5. Permitir banners do Chrome/Edge nas configurações de notificações do Windows
   e desativar **Não incomodar**, incluindo a regra automática para tela cheia.
6. Fechar a configuração, abrir `https://aliceapp.ia.br/dashboard/view` e usar
   **F11** no navegador. F11 permanece entre domínios; o botão de tela cheia
   da página pode sair ao navegar.
7. Criar um chamado real de verificação e conferir o aviso com o SAT na frente
   e depois com outro aplicativo na frente. O worker consulta a cada minuto.

## Limites existentes

A sessão de exibição do GCC continua exigindo login institucional e vence em até
12 horas. Se estiver expirada, a página informa a necessidade de login e volta
ao SAT em 20 segundos. Clicar em **Fazer login e configurar avisos** cancela esse
retorno para permitir o login. Um carregamento inicial lento volta ao SAT em 30 s.
Uma falha de rede que impeça o navegador de carregar o domínio do GCC por completo
exige recarregar a URL do SAT, pois nenhum código da página será executado.

Os avisos usam o Web Push já existente, enviado pelo servidor mesmo enquanto a
aba exibe o SAT. A inscrição é deste perfil do navegador e não depende de manter
o GCC visível. Sair explicitamente da conta do GCC remove a inscrição local.
O sistema pede que a notificação permaneça até interação, mas Windows/navegador
controlam sua exibição, duração e som. Nenhuma página pode garantir sobreposição
a aplicativos com notificações do sistema bloqueadas. Não há aceite ou alteração
automática do chamado.

## Reverter

Reverter a alteração da troca automática na página de agendamentos do SAT.
As telas atuais voltam a alternar apenas entre tarefas e agendamentos.
