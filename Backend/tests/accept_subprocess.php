<?php
declare(strict_types=1);
// Harness de subprocesso com o Responde REAL (echo + exit) e o contrato do
// GLPI 10. Comprova que RoomTicketsEndpoint encerra a sessão do GLPI ANTES de a
// resposta sair do processo, inclusive nos caminhos de erro, e exercita o
// mecanismo real de atores (Ticket_User) e de solução (ITILSolution).
// Uso: php accept_subprocess.php <cenario>

ini_set('display_errors', '0');
ini_set('html_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING);

$scenario = $argv[1] ?? 'sucesso';

final class GlpiClient
{
    public static string $scenario = 'sucesso';
    public static array $users = [];
    public static array $solutionTypes = [];
    public static array $solutions = [];
    public static array $actors = [];
    public static array $writes = [];
    public static array $ticket = ['id' => 78, 'name' => '[L-0078] Projetor da sala 16', 'content' => '',
        'date' => '2026-09-28 12:00:00', 'status' => 1, 'urgency' => 3, 'entities_id' => 'Escola',
        'locations_id' => 'Sala 16', 'itilcategories_id' => 'Projetor'];
    public function __construct(array $config) {}
    public function initSession(): string { echo "SESSION_OPENED\n"; return 'sess-test'; }
    public function killSession(string $session): void
    {
        echo "KILL_SESSION\n";
        if (getenv('GCC_TEST_KILL_THROWS') === '1') throw new RuntimeException('killSession falhou');
    }
    public function put(string $path, string $session, array $payload): array
    {
        echo 'PUT ' . $path . "\n";
        self::$writes[] = $payload['input'] ?? [];
        if (self::$scenario === 'escrita_recusada') {
            $error = new RuntimeException('GLPI recusou');
            $error->http_code = 400;
            throw $error;
        }
        // 'escrita_sem_efeito' simula o GLPI aceitar a chamada e não mudar o estado.
        if (self::$scenario !== 'escrita_sem_efeito') {
            $input = is_array($payload['input'] ?? null) ? $payload['input'] : [];
            if (isset($input['status'])) self::$ticket['status'] = (int) $input['status'];
            // Atores do GLPI 10: `_actors.assign` traz itemtype/items_id e o
            // tipo ASSIGN é implícito pela chave; o resultado é um conjunto
            // completo, como o transformActorsInput do GLPI faz.
            if (isset($input['_actors']['assign']) && is_array($input['_actors']['assign'])) {
                self::$actors = [];
                foreach ($input['_actors']['assign'] as $actor) {
                    if (!is_array($actor) || (int) ($actor['items_id'] ?? 0) < 1) continue;
                    self::$actors[] = ['id' => count(self::$actors) + 1, 'tickets_id' => 78,
                        'users_id' => (int) $actor['items_id'], 'type' => 2,
                        'use_notification' => (int) ($actor['use_notification'] ?? 1)];
                }
            }
        }
        return ['id' => 78, 'status' => ($payload['input']['status'] ?? null)];
    }
    public function post(string $path, string $session, array $payload): array
    {
        echo 'POST ' . $path . "\n";
        if (str_starts_with($path, '/ITILSolution')) {
            if (self::$scenario === 'solucao_recusada') {
                $error = new RuntimeException('Solução recusada');
                $error->http_code = 400;
                throw $error;
            }
            $input = $payload['input'] ?? [];
            self::$solutions[] = ['id' => count(self::$solutions) + 1, 'itemtype' => 'Ticket',
                'items_id' => (int) ($input['items_id'] ?? 0), 'content' => (string) ($input['content'] ?? ''),
                'status' => 3];
            // post_addItem do ITILSolution força o status do item para SOLVED.
            self::$ticket['status'] = 5;
        }
        return ['id' => count(self::$solutions) + 1];
    }
    public function getWithParams(string $path, string $session, array $params = []): array
    {
        if (str_starts_with($path, '/User')) {
            echo "USERS_READ\n";
            return self::$users;
        }
        if (self::$scenario === 'transporte') throw new RuntimeException('GLPI indisponível');
        if (self::$scenario === 'nao_encontrado') return ['id' => 999999];
        if (self::$scenario === 'status_ilegivel') {
            return ['id' => 78, 'name' => self::$ticket['name'], 'content' => '',
                'date' => self::$ticket['date'], 'status' => 'Resolvido', 'urgency' => 'Média',
                'entities_id' => 'Escola', 'locations_id' => 'Sala 16', 'itilcategories_id' => 'Projetor'];
        }
        if (self::$scenario === 'fora_da_fila') {
            return ['id' => 78, 'name' => 'Chamado administrativo', 'content' => '',
                'date' => '2026-09-28 12:00:00', 'status' => 1, 'urgency' => 3, 'entities_id' => 'Escola',
                'locations_id' => 0, 'itilcategories_id' => 0];
        }
        return self::$ticket;
    }
    public function getCollection(string $path, string $session, array $params = [], int $size = 100): array
    {
        if (str_starts_with($path, '/Ticket/') && str_ends_with($path, '/Ticket_User')) {
            return ['items' => self::$actors, 'total' => count(self::$actors)];
        }
        if (str_starts_with($path, '/Ticket/') && str_ends_with($path, '/ITILSolution')) {
            return ['items' => self::$solutions, 'total' => count(self::$solutions)];
        }
        if (str_starts_with($path, '/User')) {
            echo "USERS_READ\n";
            return ['items' => self::$users, 'total' => count(self::$users)];
        }
        if ($path === '/SolutionType') {
            echo 'SOLUTION_TYPES_READ' . "\n";
            return ['items' => self::$solutionTypes, 'total' => count(self::$solutionTypes)];
        }
        if ($path === '/Ticket_User') return ['items' => self::$actors, 'total' => count(self::$actors)];
        return ['items' => [], 'total' => 0];
    }
}

final class Request
{
    public static array $body = [];
    public static function json(int $maxBytes = 1048576): array { return self::$body; }
    public static function rateLimit(string $scope, int $limit, int $windowSeconds): void {}
}

final class PermissionMiddleware
{
    public static function getUserName(): ?string { return 'Kelvin'; }
    public static function getUserEmail(): ?string { return 'kelvin@colegiosatelite.com.br'; }
}

require_once __DIR__ . '/../api/utils/responde.php';
require_once __DIR__ . '/../api/room_tickets.php';

$ackFile = sys_get_temp_dir() . '/gcc-accept-order-' . bin2hex(random_bytes(6)) . '.json';
$workFile = sys_get_temp_dir() . '/gcc-accept-order-work-' . bin2hex(random_bytes(6)) . '.json';
putenv('GCC_ROOM_TICKET_ACKS_FILE=' . $ackFile);
putenv('GCC_ROOM_TICKET_WORK_FILE=' . $workFile);
register_shutdown_function(static function () use ($ackFile, $workFile): void {
    // Status HTTP real, capturado depois do exit do Responde.
    $status = http_response_code();
    fwrite(STDERR, 'STATUS:' . ($status === false ? 'none' : (string) $status) . "\n");
    foreach ([$ackFile, $workFile, $ackFile . '.lock-78', $workFile . '.lock-78'] as $file) {
        if (is_file($file)) unlink($file);
    }
});

GlpiClient::$scenario = $scenario;
GlpiClient::$users = [['id' => 42, 'name' => 'Ana Ribeiro', 'is_technician' => 1]];
GlpiClient::$solutionTypes = [['id' => 1, 'name' => 'Solução rápida']];
// Estado inicial por cenário: definido uma única vez, nunca a cada releitura.
if ($scenario === 'ineligivel') GlpiClient::$ticket['status'] = 6;
if (in_array($scenario, ['concluir', 'escrita_recusada', 'escrita_aplicada', 'escrita_sem_efeito', 'solucao_recusada'], true)) {
    GlpiClient::$ticket['status'] = 2;
}

if ($scenario === 'ja_assumido') {
    // Outro técnico já é o ator ASSIGN: o registro existe antes da chamada.
    GlpiClient::$actors = [['id' => 1, 'tickets_id' => 78, 'users_id' => 42, 'type' => 2, 'use_notification' => 1]];
    GlpiClient::$users[] = ['id' => 99, 'name' => 'Ana Ribeiro', 'is_technician' => 1];
    RoomTicketWorkStore::recordAssignment(78, ['reference' => 'L-0078'],
        ['handlerName' => 'Ana Ribeiro', 'source' => 'glpi_user', 'glpiUserId' => 42, 'glpiUserName' => 'Ana Ribeiro'],
        ['name' => 'Coordenação']);
}
if ($scenario === 'autor_do_chamado') {
    // O Writer do chamado NÃO é o técnico responsável e não pode virar um.
    GlpiClient::$ticket['users_id_recipient'] = 7;
    GlpiClient::$users[] = ['id' => 7, 'name' => 'Maria Autora', 'is_technician' => 1];
}

switch ($scenario) {
    case 'assumir':
    case 'assumir_sem_correspondencia':
        Request::$body = ['handler' => $scenario === 'assumir' ? 'Ana Ribeiro' : 'Visitante sem cadastro',
            'requestId' => 'req-harness-01'];
        RoomTicketsEndpoint::assume(78, []);
        break;
    case 'autor_do_chamado':
        Request::$body = ['handler' => 'Kelvin', 'requestId' => 'req-harness-09'];
        RoomTicketsEndpoint::assume(78, []);
        break;
    case 'status_ilegivel':
        Request::$body = ['handler' => 'Ana Ribeiro', 'requestId' => 'req-harness-10'];
        RoomTicketsEndpoint::assume(78, []);
        break;
    case 'ja_assumido':
        Request::$body = ['handler' => 'Kelvin', 'requestId' => 'req-harness-02'];
        RoomTicketsEndpoint::assume(78, []);
        break;
    case 'concluir':
        Request::$body = ['action' => 'concluir', 'solution' => 'Troca do cabo do projetor.',
            'requestId' => 'req-harness-03'];
        RoomTicketsEndpoint::move(78, []);
        break;
    case 'solucao_recusada':
        Request::$body = ['action' => 'concluir', 'solution' => 'Troca do cabo do projetor.',
            'requestId' => 'req-harness-11'];
        RoomTicketsEndpoint::move(78, []);
        break;
    case 'escrita_recusada':
        Request::$body = ['action' => 'concluir', 'solution' => 'Troca do cabo do projetor.'];
        RoomTicketsEndpoint::move(78, []);
        break;
    case 'escrita_sem_efeito':
    case 'escrita_aplicada':
        Request::$body = ['action' => 'concluir', 'solution' => 'Troca do cabo do projetor.'];
        RoomTicketsEndpoint::move(78, []);
        break;
    case 'responsaveis':
        RoomTicketsEndpoint::responsaveis([]);
        break;
    case 'historico':
        RoomTicketsEndpoint::historico(78);
        break;
    case 'ja_aceito':
        RoomTicketAcknowledgementStore::accept(78, [
            'reference' => 'L-0078', 'openedAt' => '2026-09-28 12:00:00',
        ], ['name' => 'T.I.', 'email' => 'ti@colegiosatelite.com.br']);
        RoomTicketsEndpoint::accept(78, []);
        break;
    default:
        RoomTicketsEndpoint::accept(78, []);
}
echo "FELL_THROUGH\n";
