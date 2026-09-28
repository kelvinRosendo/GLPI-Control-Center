<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/services/RoomTicketAcknowledgementStore.php';

$path = sys_get_temp_dir() . '/gcc-room-ticket-acks-' . bin2hex(random_bytes(6)) . '.json';
putenv('GCC_ROOM_TICKET_ACKS_FILE=' . $path);
$checks = 0;

function checkAck(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}

try {
    checkAck(RoomTicketAcknowledgementStore::forTicket(78) === null, 'empty store');
    $entry = RoomTicketAcknowledgementStore::accept(78, [
        'reference' => 'L-0009', 'openedAt' => '2026-09-25 15:27:00',
    ], [
        'name' => 'Kelvin', 'email' => 'kelvin@colegiosatelite.com.br',
    ]);
    checkAck($entry['ticketId'] === 78, 'ticket id persisted');
    checkAck($entry['reference'] === 'L-0009', 'reference persisted');
    checkAck($entry['acceptedBy']['name'] === 'Kelvin', 'actor persisted');
    checkAck(RoomTicketAcknowledgementStore::forTicket(78)['acceptedAt'] === $entry['acceptedAt'], 'entry can be read');

    $attached = RoomTicketAcknowledgementStore::attach([
        'latest' => ['id' => 78],
        'items' => [['id' => 78], ['id' => 79]],
    ]);
    checkAck($attached['latest']['acknowledgement']['ticketId'] === 78, 'latest annotated');
    checkAck($attached['items'][0]['acknowledgement']['ticketId'] === 78, 'page item annotated');
    checkAck($attached['items'][1]['acknowledgement'] === null, 'unknown item remains unacknowledged');

    $second = RoomTicketAcknowledgementStore::accept(78, [
        'reference' => 'L-9999', 'openedAt' => '2026-01-01 00:00:00',
    ], [
        'name' => 'Outro usuário', 'email' => 'outro@colegiosatelite.com.br',
    ]);
    checkAck($second['acceptedAt'] === $entry['acceptedAt'], 'first acknowledgement wins');
    checkAck($second['acceptedBy']['name'] === 'Kelvin', 'first actor preserved');
    checkAck($second['reference'] === 'L-0009', 'original reference preserved');
    checkAck(RoomTicketAcknowledgementStore::forTicket(78)['acceptedBy']['name'] === 'Kelvin', 'store not overwritten');

    $map = RoomTicketAcknowledgementStore::forIds([78, 79, 0, -3, 'abc']);
    checkAck(count($map) === 1 && isset($map['78']), 'forIds returns only existing entries');

    $annotated = RoomTicketAcknowledgementStore::attachList([['id' => 78], ['id' => 79], 'raw']);
    checkAck($annotated[0]['acknowledgement']['ticketId'] === 78, 'attachList annotates existing');
    checkAck($annotated[1]['acknowledgement'] === null, 'attachList marks missing as null');
    checkAck($annotated[2] === 'raw', 'attachList preserves non-array rows');
} finally {
    if (is_file($path)) unlink($path);
    putenv('GCC_ROOM_TICKET_ACKS_FILE');
}

echo "OK: {$checks} verificações de aceite compartilhado.\n";
