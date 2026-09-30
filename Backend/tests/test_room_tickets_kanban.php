<?php

declare(strict_types=1);
/**
 * Kanban, responsavel, transicoes e registro de atendimento.
 * Sem rede e sem credenciais: apenas as funcoes reais com dados isolados.
 */

require_once __DIR__ . '/../api/services/RoomTicketsService.php';
require_once __DIR__ . '/../api/services/RoomTicketsGlpi.php';
require_once __DIR__ . '/../api/services/RoomTicketAcknowledgementStore.php';
require_once __DIR__ . '/../api/services/RoomTicketWorkStore.php';

$ackFile = sys_get_temp_dir() . '/gcc-kanban-acks-' . bin2hex(random_bytes(6)) . '.json';
$workFile = sys_get_temp_dir() . '/gcc-kanban-work-' . bin2hex(random_bytes(6)) . '.json';
putenv('GCC_ROOM_TICKET_ACKS_FILE=' . $ackFile);
putenv('GCC_ROOM_TICKET_WORK_FILE=' . $workFile);
$checks = 0;

function checkKanban(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}

/** Linha crua do GLPI com dropdowns expandidos, como a API devolve. */
function kanbanRow(int $id, int $status, array $extra = []): array
{
    $room = 'Sala ' . (10 + ($id % 5));
    return array_merge([
        'id' => $id,
        'name' => '[L-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT) . '] Projetor sem imagem',
        'content' => 'Equipamento: Projetor',
        'date' => sprintf('2026-09-%02d 08:%02d:00', 1 + ($id % 20), $id % 60),
        'status' => $status, 'urgency' => 3, 'entities_id' => 'Escola',
        // Dropdown expandido traz o nome; o endpoint o replica em _location_name.
        'locations_id' => $room, '_location_name' => $room, 'itilcategories_id' => 'Projetor',
    ], $extra);
}

/** Normaliza e agrega como o endpoint faz, com janela de tempo fixa. */
function aggregateRows(array $rows, array $query = [], array $actorIndex = []): array
{
    $normalized = RoomTicketsService::normalize($rows, [], [], [], [], $actorIndex);
    $now = new DateTimeImmutable('2026-09-24 14:00:00', new DateTimeZone('America/Sao_Paulo'));
    $filters = RoomTicketsService::filters($query, $now);
    return RoomTicketsService::aggregate($normalized['items'], $filters);
}

try {
    // ── 1. Mapeamento de status para as colunas do Kanban ──────────────────
    checkKanban(RoomTicketsService::kanbanColumn(1) === 'abertos', 'novo cai em Abertos');
    checkKanban(RoomTicketsService::kanbanColumn(2) === 'andamento', 'em atendimento cai em Em andamento');
    checkKanban(RoomTicketsService::kanbanColumn(3) === 'andamento', 'planejado cai em Em andamento');
    checkKanban(RoomTicketsService::kanbanColumn(4) === 'andamento', 'pendente cai em Em andamento');
    checkKanban(RoomTicketsService::kanbanColumn(5) === 'concluidos', 'resolvido cai em Concluídos');
    checkKanban(RoomTicketsService::kanbanColumn(6) === 'concluidos', 'fechado cai em Concluídos');
    checkKanban(RoomTicketsService::kanbanColumn(0) === null, 'status ausente não entra em coluna');
    checkKanban(RoomTicketsService::kanbanColumn(7) === null, 'status fora da tabela é ignorado');
    checkKanban(count(RoomTicketsService::KANBAN_COLUMNS) === 3, 'três colunas');

    $card = RoomTicketsService::kanbanCard([
        'id' => 5, 'statusId' => 4, 'status' => 'pendente', 'openedAt' => '2026-09-10 10:00:00',
        'room' => 'Sala 12', 'types' => ['projector'], 'assignee' => ['userId' => 0, 'name' => ''],
    ]);
    checkKanban($card['waiting'] === true, 'pendente recebe a identificação Aguardando');
    checkKanban($card['column'] === 'andamento', 'pendente fica na coluna Em andamento');
    $newCard = RoomTicketsService::kanbanCard([
        'id' => 6, 'statusId' => 1, 'status' => 'aberto', 'openedAt' => '2026-09-10 10:00:00',
        'room' => 'Sala 12', 'types' => [], 'assignee' => ['userId' => 0, 'name' => ''],
    ]);
    checkKanban($newCard['waiting'] === false, 'novo não é marcado como Aguardando');

    // ── 2. Contagens cobrem o conjunto consultado, não a página atual ──────
    $plan = [1 => 12, 2 => 6, 3 => 1, 4 => 1, 5 => 4, 6 => 2];
    $rows = [];
    $id = 100;
    foreach ($plan as $status => $quantity) {
        for ($i = 0; $i < $quantity; $i++) $rows[] = kanbanRow($id++, $status);
    }
    checkKanban(count($rows) === 26, 'conjunto de teste com 26 chamados');

    $firstPage = aggregateRows($rows, ['page' => '1', 'per_page' => '5']);
    checkKanban(count($firstPage['items']) === 5, 'a tabela devolve só a página atual');
    checkKanban($firstPage['kanban']['total'] === 26, 'o Kanban cobre o conjunto inteiro');
    checkKanban($firstPage['kanban']['columns']['abertos']['count'] === 12, '12 novos em Abertos');
    checkKanban($firstPage['kanban']['columns']['andamento']['count'] === 8,
        '6 em atendimento + 1 planejado + 1 pendente em Em andamento');
    checkKanban($firstPage['kanban']['columns']['concluidos']['count'] === 6, '4 resolvidos + 2 fechados em Concluídos');
    $lastPage = aggregateRows($rows, ['page' => '6', 'per_page' => '5']);
    checkKanban($lastPage['kanban']['columns']['abertos']['count'] === 12,
        'a contagem não depende da página consultada');
    checkKanban($lastPage['kanban']['columns']['abertos']['count'] === $firstPage['kanban']['columns']['abertos']['count'],
        'páginas diferentes produzem as mesmas contagens');
    checkKanban($lastPage['pagination']['total'] === 26, 'total da tabela preservado');

    // A lista de 30 recentes do monitor não é a fonte do Kanban.
    $monitorSlice = RoomTicketsService::monitorEntries(
        RoomTicketsService::normalize($rows, [], [], [], [])['items'], 30);
    checkKanban(count($monitorSlice) === 26, 'o recorte do monitor é limitado a 30 e não é o Kanban');
    checkKanban($firstPage['kanban']['total'] === 26, 'Kanban independe do recorte do monitor');

    // ── 3. Limite explícito por coluna ─────────────────────────────────────
    $limited = aggregateRows($rows, ['kanban_limit' => '2']);
    $limitedColumn = $limited['kanban']['columns']['abertos'];
    checkKanban($limited['kanban']['limit'] === 2, 'limite por coluna explícito');
    checkKanban($limitedColumn['count'] === 12, 'a contagem ignora o limite de exibição');
    checkKanban(count($limitedColumn['items']) === 2, 'apenas 2 cartões são enviados');
    checkKanban($limitedColumn['shown'] === 2 && $limitedColumn['hasMore'] === true,
        'sinaliza que há mais chamados na coluna');
    $fits = aggregateRows($rows, ['kanban_limit' => '50']);
    checkKanban($fits['kanban']['columns']['concluidos']['hasMore'] === false,
        'coluna que cabe inteira não sinaliza truncamento');
    $clamped = RoomTicketsService::kanban([], 5000);
    checkKanban($clamped['limit'] === RoomTicketsService::MAX_KANBAN_LIMIT, 'limite máximo respeitado');

    // Mais antigo primeiro dentro da coluna.
    $ordered = array_map(static fn(array $card): string => $card['openedAt'], $limitedColumn['items']);
    $sorted = $ordered;
    sort($sorted);
    checkKanban($ordered === $sorted, 'cartões ordenados do mais antigo para o mais recente');

    // ── 4. Cartão traz número, sala, resumo, equipamento, status e responsável
    $actorIndex = [300 => ['userId' => 42, 'name' => 'Kelvin Souza', 'source' => 'glpi_actors', 'ambiguous' => false]];
    $full = aggregateRows([kanbanRow(300, 2, [
        // users_id_recipient é o AUTOR do chamado no GLPI 10 e NÃO pode virar responsável.
        'users_id_recipient' => 'Maria Autora',
    ])], ['kanban_limit' => '5'], $actorIndex);
    $fullCard = $full['kanban']['columns']['andamento']['items'][0];
    checkKanban($fullCard['id'] === 300, 'cartão traz o número do chamado');
    checkKanban($fullCard['room'] === 'Sala 10', 'cartão traz a sala');
    checkKanban(str_contains($fullCard['title'], 'Projetor'), 'cartão traz o resumo do problema');
    checkKanban($fullCard['types'] === ['projector'], 'cartão traz o equipamento');
    checkKanban($fullCard['openedAt'] !== '', 'cartão traz a abertura');
    checkKanban($fullCard['status'] === 'em_andamento' && $fullCard['statusId'] === 2, 'cartão traz o status');
    checkKanban($fullCard['assignee'] === $actorIndex[300],
        'cartão traz o responsável lido dos ATORES do GLPI');
    checkKanban($fullCard['assignee']['name'] !== 'Maria Autora',
        'users_id_recipient (autor do chamado) nunca vira responsável');
    checkKanban(count($fullCard['actions']) > 0, 'cartão traz as ações válidas para o status atual');
    checkKanban(!in_array('reabrir', array_column($fullCard['actions'], 'action'), true),
        'em atendimento não oferece reabrir');
    checkKanban(!in_array('assumir', array_column($fullCard['actions'], 'action'), true),
        'em atendimento não oferece assumir de novo');
    $pendingActions = array_column(RoomTicketsService::kanbanCard([
        'id' => 9, 'statusId' => 4, 'status' => 'pendente', 'openedAt' => '2026-09-10 10:00:00',
    ])['actions'], 'action');
    checkKanban($pendingActions === ['assumir', 'concluir', 'retomar'],
        'pendente oferece retomar e não oferece marcar aguardando de novo');
    $newActions = array_column(RoomTicketsService::kanbanCard([
        'id' => 10, 'statusId' => 1, 'status' => 'aberto', 'openedAt' => '2026-09-10 10:00:00',
    ])['actions'], 'action');
    checkKanban($newActions === ['assumir', 'concluir'],
        'novo oferece assumir e concluir, e nada de reabrir/retomar/aguardando');

    // ── 5. Transições aceitas a partir do status atual ─────────────────────
    checkKanban(RoomTicketsService::transition('assumir', 1) === 2, 'assumir novo → em andamento');
    checkKanban(RoomTicketsService::transition('assumir', 3) === 2, 'assumir planejado → em andamento');
    checkKanban(RoomTicketsService::transition('assumir', 4) === 2, 'assumir pendente → em andamento');
    checkKanban(RoomTicketsService::transition('assumir', 5) === null, 'não assume chamado resolvido');
    checkKanban(RoomTicketsService::transition('assumir', 6) === null, 'não assume chamado fechado');
    checkKanban(RoomTicketsService::transition('concluir', 1) === 5, 'concluir novo → resolvido');
    checkKanban(RoomTicketsService::transition('concluir', 2) === 5, 'concluir em andamento → resolvido');
    checkKanban(RoomTicketsService::transition('concluir', 4) === 5, 'concluir pendente → resolvido');
    checkKanban(RoomTicketsService::transition('concluir', 5) === null, 'não conclui duas vezes');
    checkKanban(RoomTicketsService::transition('concluir', 6) === null, 'não altera chamado já fechado');
    checkKanban(RoomTicketsService::transition('reabrir', 5) === 1, 'reabrir resolvido → novo');
    checkKanban(RoomTicketsService::transition('reabrir', 6) === 1, 'reabrir fechado → novo');
    checkKanban(RoomTicketsService::transition('reabrir', 2) === null, 'não reabrir chamado em andamento');
    checkKanban(RoomTicketsService::transition('pendente', 2) === 4, 'pendente: em andamento → pendente');
    checkKanban(RoomTicketsService::transition('pendente', 1) === null, 'não marca novo como pendente');
    checkKanban(RoomTicketsService::transition('retomar', 4) === 2, 'retomar pendente → em andamento');
    checkKanban(RoomTicketsService::transition('excluir', 1) === null, 'ação desconhecida é recusada');
    // Concluir é Resolvido: nunca fechamento definitivo.
    checkKanban(RoomTicketsService::transition('concluir', 2) === 5, 'concluir não fecha o chamado');

    // ── 6. Leitura do responsável: mecanismo de ATORES do GLPI 10 ───────────
    // Contrato verificado em 10.0.19: users_id_recipient é o Writer (autor) e a
    // atribuição é um ator CommonITILActor com type = ASSIGN (2).
    $names = [42 => 'Ana Ribeiro', 7 => 'Bia Alves'];
    $single = RoomTicketsGlpi::assignee([['type' => 2, 'users_id' => 42]], $names);
    checkKanban($single['userId'] === 42 && $single['name'] === 'Ana Ribeiro', 'ator ASSIGN vira responsável');
    checkKanban($single['ambiguous'] === false, 'um único técnico não é ambíguo');
    $request = RoomTicketsGlpi::assignee([['type' => 1, 'users_id' => 42]], $names);
    checkKanban($request['userId'] === 0 && $request['name'] === '', 'ator REQUESTER não é responsável');
    $observer = RoomTicketsGlpi::assignee([['type' => 3, 'users_id' => 7]], $names);
    checkKanban($observer['userId'] === 0, 'ator OBSERVER não é responsável');
    $two = RoomTicketsGlpi::assignee([['type' => 2, 'users_id' => 42], ['type' => 2, 'users_id' => 7]], $names);
    checkKanban($two['userId'] === 0 && $two['ambiguous'] === true, 'dois técnicos atribuídos são ambíguos');
    checkKanban(str_contains($two['name'], 'Ana Ribeiro') && str_contains($two['name'], 'Bia Alves'),
        'ambiguidade informa os nomes em vez de escolher um');
    checkKanban(RoomTicketsGlpi::assignee([], $names)['userId'] === 0, 'sem ator ASSIGN não há responsável');
    checkKanban(RoomTicketsGlpi::assignee([['type' => 2, 'users_id' => 0]], $names)['userId'] === 0,
        'ator sem usuário não inventa responsável');

    // A escrita de ator NÃO toca users_id_recipient (autor) nem em outros atores.
    $assignInput = RoomTicketsGlpi::assignInput([['type' => 2, 'users_id' => 7], ['type' => 1, 'users_id' => 9]], 42);
    checkKanban(!isset($assignInput['users_id_recipient']), 'atribuição não escreve users_id_recipient');
    checkKanban(!isset($assignInput['_actors']['requester']), 'atribuição não mexe no solicitante');
    checkKanban(!isset($assignInput['_actors']['observer']), 'atribuição não mexe no observador');
    checkKanban($assignInput === ['_actors' => ['assign' => [
        ['itemtype' => 'User', 'items_id' => 42, 'use_notification' => 1]]]],
        'assumir substitui o conjunto de técnicos pelo novo responsável');

    // status textual é erro explícito, nunca 0 silencioso.
    checkKanban(RoomTicketsService::statusId(['status' => 5]) === 5, 'status inteiro é lido');
    checkKanban(RoomTicketsService::statusId(['status' => '5']) === 5, 'status numérico em string é lido');
    $thrown = false;
    try { RoomTicketsService::statusId(['status' => 'Resolvido']); } catch (RuntimeException $error) { $thrown = true; }
    checkKanban($thrown, 'status em texto é recusado explicitamente');
    $thrown = false;
    try { RoomTicketsGlpi::assertScalarContract(['status' => 'Novo', 'urgency' => 'Média']); }
    catch (RuntimeException $error) { $thrown = true; }
    checkKanban($thrown, 'contrato inesperado do GLPI é recusado explicitamente');
    checkKanban(RoomTicketsGlpi::assertScalarContract(['status' => 1, 'urgency' => 3]) === null,
        'contrato normal é aceito');

    // Input de solução: ITILSolution do GLPI 10, sem `resolution` nem `type_followup`.
    $solutionInput = RoomTicketsGlpi::solutionInput(78, '<p>Texto</p>', 3);
    checkKanban($solutionInput === ['itemtype' => 'Ticket', 'items_id' => 78, 'content' => '<p>Texto</p>', 'solutiontypes_id' => 3],
        'solução registrada como ITILSolution');
    $noType = RoomTicketsGlpi::solutionInput(78, '<p>Texto</p>', 0);
    checkKanban(!isset($noType['solutiontypes_id']), 'tipo de solução é opcional quando não configurado');

    // ── 7. Registro de atendimento: responsável, autor e histórico ──────────
    $actor = ['name' => 'Coordenação', 'email' => 'coord@colegiosatelite.com.br'];
    $first = RoomTicketWorkStore::recordAssignment(78, ['reference' => 'L-0078'],
        ['handlerName' => 'Kelvin Souza', 'source' => 'glpi_user', 'glpiUserId' => 42, 'glpiUserName' => 'Kelvin Souza'], $actor);
    checkKanban($first['created'] === true, 'primeiro registro de responsável é criado');
    checkKanban($first['result']['assignment']['recordedBy'] === 'Coordenação',
        'quem registrou é separado de quem vai atender');
    checkKanban($first['result']['assignment']['handlerName'] === 'Kelvin Souza', 'quem vai atender é registrado');
    checkKanban($first['result']['assignment']['glpiUserId'] === 42, 'técnico do GLPI fica com o ID');

    $second = RoomTicketWorkStore::recordAssignment(78, ['reference' => 'L-0078'],
        ['handlerName' => 'Outra pessoa', 'source' => 'informado'], $actor);
    checkKanban($second['created'] === false, 'segundo responsável não sobrescreve o primeiro');
    checkKanban(RoomTicketWorkStore::summary($second['result'])['handlerName'] === 'Kelvin Souza',
        'o responsável atual continua sendo o primeiro');

    $informed = RoomTicketWorkStore::recordAssignment(79, ['reference' => 'L-0079'],
        ['handlerName' => 'Estagiário sem cadastro', 'source' => 'informado'], $actor);
    $informedSummary = RoomTicketWorkStore::summary($informed['result']);
    checkKanban($informedSummary['handlerSource'] === 'informado', 'nome sem correspondência fica como informado');
    checkKanban($informedSummary['glpiUserId'] === 0 && $informedSummary['glpiUserName'] === '',
        'nome informado não vira usuário do GLPI');

    $move = RoomTicketWorkStore::recordMove(78, ['action' => 'assumir', 'from' => 1, 'to' => 2,
        'confirmed' => true, 'ticket' => ['reference' => 'L-0078']], $actor, 'req-abc-123');
    checkKanban(count($move['result']['moves']) === 1, 'movimentação registrada no histórico');
    $again = RoomTicketWorkStore::recordMove(78, ['action' => 'assumir', 'from' => 1, 'to' => 2,
        'confirmed' => true], $actor, 'req-abc-123');
    checkKanban(count($again['result']['moves']) === 1, 'reenvio com o mesmo requestId não duplica histórico');
    checkKanban($again['created'] === false, 'reenvio é reconhecido como repetição');
    $other = RoomTicketWorkStore::recordMove(78, ['action' => 'concluir', 'from' => 2, 'to' => 5,
        'confirmed' => false, 'partial' => true, 'note' => 'solução registrada só no GCC'], $actor, 'req-def-456');
    checkKanban(count($other['result']['moves']) === 2, 'nova movimentação entra no histórico');
    checkKanban($other['result']['moves'][1]['partial'] === true, 'falha parcial fica registrada como tal');
    checkKanban($other['result']['moves'][1]['toLabel'] === 'resolvido', 'histórico guarda o destino');

    $solution = RoomTicketWorkStore::recordSolution(78, ['text' => 'Troca do cabo HDMI.',
        'glpiFollowup' => true, 'ticket' => ['reference' => 'L-0078']], $actor);
    checkKanban($solution['result']['solution']['text'] === 'Troca do cabo HDMI.', 'solução registrada');
    checkKanban($solution['result']['solution']['recordedBy'] === 'Coordenação', 'autor da solução registrado');
    $duplicateSolution = RoomTicketWorkStore::recordSolution(78, ['text' => 'Outro texto'], $actor);
    checkKanban($duplicateSolution['created'] === false, 'solução não é sobrescrita');

    // ── 8. Aceite antigo não vira atendimento retroativo ───────────────────
    RoomTicketAcknowledgementStore::accept(500, ['reference' => 'L-0500', 'openedAt' => '2026-09-20 09:00:00'],
        ['name' => 'Leitor da TV', 'email' => 'tv@colegiosatelite.com.br']);
    $annotated = RoomTicketWorkStore::attachList([['id' => 500], ['id' => 78]]);
    checkKanban($annotated[0]['work'] === null, 'ticket apenas aceito não ganha responsável');
    checkKanban($annotated[1]['work']['handlerName'] === 'Kelvin Souza', 'ticket assumido mostra o responsável');
    $history = RoomTicketWorkStore::history(500);
    checkKanban($history['assignment'] === null && $history['moves'] === [], 'histórico vazio sem atendimento');
    checkKanban(is_array($history['acknowledgement']), 'o aceite continua visível no histórico');
    checkKanban(RoomTicketWorkStore::attachList(['linha']) === ['linha'], 'linhas inválidas são preservadas');

    // ── 9. Idempotência de submissão vinculada a autor e conteúdo ──────────
    $outcomeOk = ['ok' => true, 'data' => ['ticketId' => 78, 'handlerName' => 'Kelvin Souza']];
    $fingerprint = hash('sha256', 'assumir-78-kelvin');
    RoomTicketWorkStore::rememberRequest('req-abc-123', 78, 'assumir', $fingerprint, $actor, $outcomeOk);
    $replay = RoomTicketWorkStore::findRequest('req-abc-123');
    checkKanban($replay !== null && $replay['ticketId'] === 78, 'requestId recupera o resultado anterior');
    checkKanban(($replay['outcome']['ok'] ?? false) === true, 'o desfecho é replayado, não só o identificador');
    checkKanban(($replay['fingerprint'] ?? '') === $fingerprint, 'requestId fica vinculado ao conteúdo da operação');
    checkKanban(($replay['actor'] ?? '') !== '', 'requestId fica vinculado ao autor');
    checkKanban(RoomTicketWorkStore::findRequest('req-inexistente') === null, 'requestId desconhecido não inventa resultado');
    checkKanban(RoomTicketWorkStore::findRequest('') === null, 'requestId vazio é ignorado');
    // Falha parcial também fica registrada: repetir não pode duplicar efeito.
    RoomTicketWorkStore::rememberRequest('req-parcial', 79, 'concluir', 'fp-2', $actor,
        ['ok' => false, 'status' => 502, 'error' => 'parcial', 'data' => ['partial' => true]]);
    checkKanban((RoomTicketWorkStore::findRequest('req-parcial')['outcome']['status'] ?? 0) === 502,
        'falha parcial é lembrada para não repetir a escrita');
    // Solução: o campo reflete o passo da solução, não "algum passo deu certo".
    $partial = RoomTicketWorkStore::recordSolution(81, ['text' => 'Sem confirmação no GLPI.',
        'glpi' => false, 'ticket' => ['reference' => 'L-0081']], $actor);
    checkKanban($partial['result']['solution']['glpi'] === false,
        'solução sem confirmação no GLPI não é marcada como registrada');
    checkKanban(RoomTicketWorkStore::summary($partial['result'])['solutionInGlpi'] === false,
        'o resumo expõe se a solução entrou no GLPI');
    // Movimento com requestId não duplica histórico em reenvio.
    $first = RoomTicketWorkStore::recordMove(82, ['action' => 'pendente', 'from' => 2, 'to' => 4,
        'confirmed' => true], $actor, 'req-move-82');
    $again = RoomTicketWorkStore::recordMove(82, ['action' => 'pendente', 'from' => 2, 'to' => 4,
        'confirmed' => true], $actor, 'req-move-82');
    checkKanban($again['created'] === false, 'reenvio com o mesmo requestId não duplica o movimento');
    checkKanban(count(RoomTicketWorkStore::forTicket(82)['moves']) === 1, 'histórico tem um único movimento');

    // ── 10. Lock por chamado serializa requisições do GCC ──────────────────
    $order = [];
    RoomTicketWorkStore::withTicketLock(90, static function () use (&$order): string {
        $order[] = 'entrou';
        return 'primeiro';
    });
    RoomTicketWorkStore::withTicketLock(90, static function () use (&$order): string {
        $order[] = 'entrou';
        return 'segundo';
    });
    checkKanban($order === ['entrou', 'entrou'] && count($order) === 2, 'lock por chamado libera em ordem');
    $thrown = false;
    try { RoomTicketWorkStore::withTicketLock(0, static fn() => null); }
    catch (InvalidArgumentException $error) { $thrown = true; }
    checkKanban($thrown, 'lock de chamado inválido é recusado');
} catch (RuntimeException $error) {
    echo 'FALHA: ' . $error->getMessage() . "\n";
    exit(1);
} finally {
    if (is_file($ackFile)) unlink($ackFile);
    if (is_file($workFile)) unlink($workFile);
    putenv('GCC_ROOM_TICKET_ACKS_FILE');
    putenv('GCC_ROOM_TICKET_WORK_FILE');
}

echo "OK: {$checks} verificações de Kanban, responsável e histórico.\n";
