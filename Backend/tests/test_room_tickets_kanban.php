<?php

declare(strict_types=1);
/**
 * Kanban, responsavel, transicoes e registro de atendimento.
 * Sem rede e sem credenciais: apenas as funcoes reais com dados isolados.
 */

require_once __DIR__ . '/../api/services/RoomTicketsService.php';
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
function aggregateRows(array $rows, array $query = []): array
{
    $normalized = RoomTicketsService::normalize($rows, [], [], [], []);
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
    $full = aggregateRows([kanbanRow(300, 2, [
        'users_id_recipient' => 42, 'users_id_recipient_name' => 'Kelvin Souza',
    ])], ['kanban_limit' => '5']);
    $fullCard = $full['kanban']['columns']['andamento']['items'][0];
    checkKanban($fullCard['id'] === 300, 'cartão traz o número do chamado');
    checkKanban($fullCard['room'] === 'Sala 10', 'cartão traz a sala');
    checkKanban(str_contains($fullCard['title'], 'Projetor'), 'cartão traz o resumo do problema');
    checkKanban($fullCard['types'] === ['projector'], 'cartão traz o equipamento');
    checkKanban($fullCard['openedAt'] !== '', 'cartão traz a abertura');
    checkKanban($fullCard['status'] === 'em_andamento' && $fullCard['statusId'] === 2, 'cartão traz o status');
    checkKanban($fullCard['assignee'] === ['userId' => 42, 'name' => 'Kelvin Souza'],
        'cartão traz o responsável atribuído no GLPI');

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

    // ── 6. Leitura do responsável: campo por versão do GLPI ────────────────
    checkKanban(RoomTicketsService::assignee(['users_id_recipient' => 7, 'users_id_recipient_name' => 'Ana'])
        === ['userId' => 7, 'name' => 'Ana'], 'GLPI 10: users_id_recipient');
    checkKanban(RoomTicketsService::assignee(['users_id_assign' => 8, 'users_id_assign_name' => 'Bia'])
        === ['userId' => 8, 'name' => 'Bia'], 'versão antiga: users_id_assign');
    checkKanban(RoomTicketsService::assignee(['users_id_recipient' => 0]) === ['userId' => 0, 'name' => ''],
        'sem responsável não há nome inventado');
    checkKanban(RoomTicketsService::assignee([]) === ['userId' => 0, 'name' => ''], 'chamado sem campos de responsável');
    checkKanban(RoomTicketsService::assigneeField(['users_id_recipient' => 0]) === 'users_id_recipient',
        'campo detectado pela leitura do próprio chamado');
    checkKanban(RoomTicketsService::assigneeField(['users_id_assign' => 0]) === 'users_id_assign',
        'campo legado detectado');
    checkKanban(RoomTicketsService::assigneeField([]) === 'users_id_recipient', 'padrão GLPI 10 quando o campo não vem');
    putenv('GCC_ROOM_TICKET_ASSIGN_FIELD=users_id_assign');
    checkKanban(RoomTicketsService::assigneeField(['users_id_recipient' => 1]) === 'users_id_assign',
        'sobrescrita por GCC_ROOM_TICKET_ASSIGN_FIELD');
    putenv('GCC_ROOM_TICKET_ASSIGN_FIELD');

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

    // ── 9. Idempotência de submissão ───────────────────────────────────────
    RoomTicketWorkStore::rememberRequest('req-abc-123', 78, 'assumir', ['ticketId' => 78, 'handlerName' => 'Kelvin Souza']);
    $replay = RoomTicketWorkStore::findRequest('req-abc-123');
    checkKanban($replay !== null && $replay['ticketId'] === 78, 'requestId recupera o resultado anterior');
    checkKanban(RoomTicketWorkStore::findRequest('req-inexistente') === null, 'requestId desconhecido não inventa resultado');
    checkKanban(RoomTicketWorkStore::findRequest('') === null, 'requestId vazio é ignorado');
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
