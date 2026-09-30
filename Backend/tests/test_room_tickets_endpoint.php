<?php
declare(strict_types=1);
// Controller regression: no network, credentials or operational cache writes.
final class GlpiClient {
    public static array $errors = [];
    public static bool $changed = false;
    public static bool $empty = false;
    public static int $closed = 0;
    public static int $singleCalls = 0;
    public static int $singleHttpCode = 0;
    public static ?array $singleTicket = null;
    public static array $putWrites = [];
    public static array $postWrites = [];
    public static array $users = [];
    public static int $userHttpCode = 0;
    public static int $failPutHttp = 0;
    public static bool $ignoreStatusWrite = false;
    public static bool $failSolution = false;
    public static array $actors = [];
    public static array $solutions = [];
    public static array $solutionTypes = [['id' => 1, 'name' => 'Solução rápida']];
    public static bool $ignoreActorWrite = false;
    public static int $userCollectionHttpCode = 0;
    /** Callback executado no meio da escrita do GLPI, para simular corrida. */
    public static $duringWrite = null;
    public function __construct(array $config) {}
    public function initSession(): string { return 'test'; }
    public function killSession(string $session): void { self::$closed++; }
    public function put(string $path, string $session, array $payload): array {
        $input = is_array($payload['input'] ?? null) ? $payload['input'] : [];
        self::$putWrites[] = ['path' => $path, 'input' => $input];
        if (self::$failPutHttp !== 0) {
            $error = new RuntimeException('GLPI recusou a alteração', 502);
            $error->http_code = self::$failPutHttp;
            throw $error;
        }
        $id = 0;
        if (preg_match('#^/Ticket/(\d+)$#', $path, $m) === 1) $id = (int) $m[1];
        // Janela de corrida: outro técnico registra entre a verificação e a gravação.
        if (is_callable(self::$duringWrite)) { $hook = self::$duringWrite; self::$duringWrite = null; $hook($id); }
        // O GLPI real aplica a alteração; a releitura precisa refletir o novo estado.
        if ($id > 0 && !self::$ignoreStatusWrite && is_array(self::$singleTicket)
            && (int) (self::$singleTicket['id'] ?? 0) === $id) {
            if (isset($input['status'])) self::$singleTicket['status'] = (int) $input['status'];
            // `_actors.assign` é conjunto completo e implícito no tipo ASSIGN.
            if (isset($input['_actors']['assign']) && is_array($input['_actors']['assign'])) {
                self::$actors = [];
                if (!self::$ignoreActorWrite) {
                    foreach ($input['_actors']['assign'] as $actor) {
                        if (!is_array($actor) || (int) ($actor['items_id'] ?? 0) < 1) continue;
                        self::$actors[] = ['id' => count(self::$actors) + 1, 'tickets_id' => $id,
                            'users_id' => (int) $actor['items_id'], 'type' => 2, 'use_notification' => 1];
                    }
                }
            }
        }
        return ['id' => $id, 'status' => $input['status'] ?? null];
    }
    public function post(string $path, string $session, array $payload): array {
        $input = is_array($payload['input'] ?? null) ? $payload['input'] : [];
        self::$postWrites[] = ['path' => $path, 'input' => $input];
        if (str_starts_with($path, '/ITILSolution')) {
            if (self::$failSolution) {
                $error = new RuntimeException('Solução recusada', 502);
                $error->http_code = 400;
                throw $error;
            }
            self::$solutions[] = ['id' => count(self::$solutions) + 1, 'itemtype' => 'Ticket',
                'items_id' => (int) ($input['items_id'] ?? 0), 'content' => (string) ($input['content'] ?? ''),
                'status' => 3];
            // post_addItem do ITILSolution força o status do item.
            if (is_array(self::$singleTicket)) self::$singleTicket['status'] = 5;
        }
        return ['id' => 1];
    }
    public function getWithParams(string $path, string $session, array $params = []): array {
        self::$singleCalls++;
        if (self::$singleHttpCode !== 0) {
            $error = new RuntimeException('GLPI retornou erro HTTP ' . self::$singleHttpCode, 502);
            $error->http_code = self::$singleHttpCode;
            throw $error;
        }
        if (self::$singleTicket === null) throw new RuntimeException('Sem fixture de chamado único.', 502);
        return self::$singleTicket;
    }
    public function getCollection(string $path, string $session, array $params = [], int $size = 100): array {
        if (str_starts_with($path, '/Ticket/') && str_ends_with($path, '/Ticket_User')) {
            return ['items' => self::$actors, 'total' => count(self::$actors)];
        }
        if (str_starts_with($path, '/Ticket/') && str_ends_with($path, '/ITILSolution')) {
            return ['items' => self::$solutions, 'total' => count(self::$solutions)];
        }
        if (str_starts_with($path, '/User')) {
            if (self::$userCollectionHttpCode !== 0) {
                $error = new RuntimeException('GLPI recusou a leitura de usuários', 502);
                $error->http_code = self::$userCollectionHttpCode;
                throw $error;
            }
            // Honra o `range`: a paginação de técnicos precisa ser exercitada.
            $rows = self::$users;
            if (isset($params['range']) && preg_match('/^(\d+)-(\d+)$/', (string) $params['range'], $m) === 1) {
                $rows = array_slice($rows, (int) $m[1], (int) $m[2] - (int) $m[1] + 1);
            }
            return ['items' => $rows, 'total' => count(self::$users)];
        }
        if ($path === '/SolutionType' && isset(self::$errors[$path])) throw new RuntimeException('Restricted', self::$errors[$path]);
        if ($path === '/SolutionType') return ['items' => self::$solutionTypes, 'total' => count(self::$solutionTypes)];
        if ($path === '/Ticket_User') return ['items' => self::$actors, 'total' => count(self::$actors)];
        return ['items' => [], 'total' => 0];
    }
    public function getReportPage(string $path, string $session, int $offset, int $size, bool $expand = false): array {
        if (isset(self::$errors[$path])) throw new RuntimeException('fixture', self::$errors[$path]);
        $items = [];
        if ($path === '/Ticket' && !self::$empty) $items = [[
            'id' => $expand && self::$changed ? 79 : 78,
            'name' => '[L-0009] Projetor não liga', 'content' => '',
            'date' => (new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d H:i:s'), 'status' => 1,
            'entities_id' => $expand ? 'Escola' : 7,
            'locations_id' => $expand ? 'Sala 16' : 16,
            'itilcategories_id' => $expand ? 'Projetor' : 2,
        ]];
        if ($path === '/Item_Ticket') $items = [['id' => 1, 'tickets_id' => 78, 'items_id' => 12, 'itemtype' => 'Computer']];
        return ['items' => $items, 'total' => count($items)];
    }
}
final class Request {
    public static array $scopes = [];
    public static array $body = [];
    public static function json(int $maxBytes = 1048576): array { return self::$body; }
    public static function rateLimit(string $scope, int $limit, int $windowSeconds): void { self::$scopes[] = $scope; }
}
final class PermissionMiddleware {
    public static function getUserName(): ?string { return 'Kelvin'; }
    public static function getUserEmail(): ?string { return 'kelvin@colegiosatelite.com.br'; }
}
final class AssetService {
    public static bool $wrapped = false;
    public static function fromCache(): array {
        $items = [['id' => 12, 'itemtype' => 'Computer', 'name' => 'Projetor Epson', 'category' => 'projector']];
        return self::$wrapped ? ['items' => $items] : $items;
    }
}
final class Responde {
    public static array $result = [];
    public static int $status = 0;
    public static string $error = '';
    public static array $meta = [];
    public static function ok(array $result, int $status = 200): void {
        self::$result = $result['data'] ?? []; self::$status = $status;
        self::$error = ''; self::$meta = [];
    }
    public static function erro(string $message, int $status, array $meta = []): void {
        self::$result = []; self::$status = $status; self::$error = $message; self::$meta = $meta;
    }
}
require_once __DIR__ . '/../api/room_tickets.php';
$ackFile = sys_get_temp_dir() . '/gcc-room-ticket-acks-' . bin2hex(random_bytes(6)) . '.json';
$workFile = sys_get_temp_dir() . '/gcc-room-ticket-work-' . bin2hex(random_bytes(6)) . '.json';
putenv('GCC_ROOM_TICKET_ACKS_FILE=' . $ackFile);
putenv('GCC_ROOM_TICKET_WORK_FILE=' . $workFile);
register_shutdown_function(static function () use ($ackFile, $workFile): void {
    if (is_file($ackFile)) unlink($ackFile);
    if (is_file($workFile)) unlink($workFile);
    putenv('GCC_ROOM_TICKET_ACKS_FILE');
    putenv('GCC_ROOM_TICKET_WORK_FILE');
});
$checks = 0;
function check(bool $condition, string $label): void {
    global $checks;
    if (!$condition) throw new RuntimeException($label);
    $checks++;
}
function runEndpoint(array $query = ['period' => '30d']): void {
    $_GET = $query;
    $before = GlpiClient::$closed;
    RoomTicketsEndpoint::list([]);
    check(GlpiClient::$closed === $before + 1, 'session cleanup');
}
GlpiClient::$errors = ['/Location' => 403, '/ITILCategory' => 403];
foreach ([false, true] as $wrapped) {
    AssetService::$wrapped = $wrapped;
    runEndpoint();
    check(Responde::$status === 200, 'restricted dropdowns must not block tickets');
    $data = Responde::$result;
    check($data['summary']['total'] === 1 && $data['meta']['complete'], 'complete ticket report');
    check($data['items'][0]['room'] === 'Sala 16', 'expanded location');
    check(str_starts_with($data['items'][0]['roomKey'], '7:'), 'raw entity ID retained');
    check($data['items'][0]['types'] === ['projector'], 'equipment classification');
    check($data['items'][0]['assets'][0]['name'] === 'Projetor Epson', 'flat and wrapped cache names');
    check(count($data['meta']['restrictedLookups']) === 2, 'restricted lookups reported');
}
foreach (['/Ticket' => 403, '/Item_Ticket' => 403, '/Location' => 500] as $path => $status) {
    GlpiClient::$errors = [$path => $status];
    runEndpoint();
    check(Responde::$status === 502, 'required or transport failures must fail closed');
}
GlpiClient::$errors = ['/Location' => 403];
GlpiClient::$changed = true;
runEndpoint();
check(Responde::$status === 502, 'changed expanded ticket IDs must fail');
GlpiClient::$empty = true;
runEndpoint();
check(Responde::$status === 200 && Responde::$result['summary']['total'] === 0, 'empty tickets skip lookups');

// Monitoring slice: filter-independent queue present in every successful read.
GlpiClient::$errors = [];
GlpiClient::$changed = false;
GlpiClient::$empty = false;
$_GET = ['period' => '30d'];
runEndpoint();
$monitor = Responde::$result['monitor'] ?? null;
check(is_array($monitor) && isset($monitor['recent'], $monitor['recentLimit']), 'monitor slice exposed');
check(count($monitor['recent']) === 1, 'monitor carries the whole queue');
check($monitor['recent'][0]['id'] === 78 && $monitor['recent'][0]['eligible'] === true, 'monitor flags eligibility');
check($monitor['recent'][0]['acknowledgement'] === null, 'monitor annotates missing acknowledgement');
check($monitor['collectedAt'] === Responde::$result['meta']['collectedAt'], 'monitor timestamp matches collection');
$_GET = ['period' => '30d'];
runEndpoint(['period' => '30d', 'status' => 'fechado']);
check(Responde::$result['summary']['total'] === 0, 'report filter still applied');
check(count(Responde::$result['monitor']['recent']) === 1, 'monitor ignores report filters');

// Acceptance is verified against GLPI; the client only identifies the ticket.
$_GET = ['period' => '30d'];
$openedAt = (new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d H:i:s');
GlpiClient::$singleTicket = [
    'id' => 78, 'name' => '[L-0009] Projetor não liga', 'content' => '',
    'date' => $openedAt, 'status' => 1, 'urgency' => 3, 'entities_id' => 'Escola',
    'locations_id' => 'Sala 16', 'itilcategories_id' => 'Projetor',
];
$closedBefore = GlpiClient::$closed;
RoomTicketsEndpoint::accept(78, []);
check(Responde::$status === 200, 'eligible ticket acknowledged');
$entry = Responde::$result['acknowledgement'] ?? [];
check($entry['ticketId'] === 78 && $entry['reference'] === 'L-0009', 'reference comes from GLPI');
check($entry['openedAt'] === $openedAt, 'openedAt comes from GLPI');
check($entry['acceptedBy']['name'] === 'Kelvin', 'acknowledging user recorded');
check(!isset(Responde::$result['alreadyAccepted']), 'first acknowledgement is new');
check(GlpiClient::$closed === $closedBefore + 1, 'GLPI session closed after accept');
$calls = GlpiClient::$singleCalls;
RoomTicketsEndpoint::accept(78, []);
check(Responde::$result['alreadyAccepted'] === true, 'repeat acknowledgement reported as already accepted');
check(GlpiClient::$singleCalls === $calls, 'repeat acknowledgement skips GLPI');

GlpiClient::$singleTicket = [
    'id' => 79, 'name' => '[L-0010] Projetor queimado', 'content' => '',
    'date' => $openedAt, 'status' => 6, 'urgency' => 3, 'entities_id' => 'Escola',
    'locations_id' => 'Sala 16', 'itilcategories_id' => 'Projetor',
];
$closedBefore = GlpiClient::$closed;
RoomTicketsEndpoint::accept(79, []);
check(Responde::$status === 422, 'closed ticket is not acceptable');
check(GlpiClient::$closed === $closedBefore + 1, 'GLPI session closed after rejection');

GlpiClient::$singleTicket = [
    'id' => 80, 'name' => 'Chamado administrativo', 'content' => '',
    'date' => $openedAt, 'status' => 1, 'urgency' => 3, 'entities_id' => 'Escola',
    'locations_id' => 0, 'itilcategories_id' => 0,
];
RoomTicketsEndpoint::accept(80, []);
check(Responde::$status === 422, 'ticket outside the room queue is not acceptable');

GlpiClient::$singleTicket = null;
GlpiClient::$singleHttpCode = 404;
$closedBefore = GlpiClient::$closed;
RoomTicketsEndpoint::accept(81, []);
check(Responde::$status === 404, 'unknown ticket reports not found');
check(GlpiClient::$closed === $closedBefore + 1, 'GLPI session closed after not found');
GlpiClient::$singleHttpCode = 500;
RoomTicketsEndpoint::accept(82, []);
check(Responde::$status === 502, 'GLPI transport failure fails closed');
GlpiClient::$singleHttpCode = 0;

// Shared acknowledgement read: no GLPI, bounded ids, explicit validation.
$_GET = ['ids' => '78,79,80,81,82'];
RoomTicketsEndpoint::acknowledgements();
check(Responde::$status === 200, 'acknowledgement read succeeds');
check(array_keys(Responde::$result['acknowledgements']) === [78], 'only acknowledged tickets returned');
check(Responde::$result['acknowledgements'][78]['acceptedBy']['name'] === 'Kelvin', 'stored acknowledgement served');
check(isset(Responde::$result['checkedAt']), 'read timestamp provided');
$_GET = ['ids' => '78x'];
RoomTicketsEndpoint::acknowledgements();
check(Responde::$status === 422, 'non numeric id rejected');
$_GET = ['ids' => ''];
RoomTicketsEndpoint::acknowledgements();
check(Responde::$status === 422, 'empty id list rejected');
$_GET = ['ids' => implode(',', range(1, 101))];
RoomTicketsEndpoint::acknowledgements();
check(Responde::$status === 422, 'id list bounded to 100');
$_GET = ['period' => '30d'];
check(in_array('room-ticket-accept', Request::$scopes, true), 'acceptance rate limited');
check(in_array('room-ticket-acks-read', Request::$scopes, true), 'acknowledgement read rate limited');

// ── Aceite com o Responde REAL (exit) em subprocesso ────────────────────────
// Responde::ok/erro encerram o processo dentro do try: a sessão do GLPI só é
// encerrada se a limpeza acontecer antes da resposta. O mock deste arquivo
// retorna normalmente e mascara esse defeito; o subprocesso não mascara.
function runAcceptProcess(string $scenario, array $extraEnv = []): array
{
    $harness = __DIR__ . '/accept_subprocess.php';
    $process = proc_open([PHP_BINARY, $harness, $scenario],
        [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, array_merge(getenv(), $extraEnv));
    if (!is_resource($process)) throw new RuntimeException('subprocesso de aceite não iniciado');
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $stdout = $stderr = '';
    $exitCode = -1;
    $waited = 0.0;
    while (true) {
        $status = proc_get_status($process);
        $stdout .= (string) stream_get_contents($pipes[1]);
        $stderr .= (string) stream_get_contents($pipes[2]);
        if (!$status['running']) { $exitCode = (int) $status['exitcode']; break; }
        if ($waited > 30) {
            proc_terminate($process);
            throw new RuntimeException('subprocesso de aceite travou: ' . $scenario);
        }
        usleep(20000);
        $waited += 0.02;
    }
    $stdout .= (string) stream_get_contents($pipes[1]);
    $stderr .= (string) stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);
    $httpStatus = null;
    if (preg_match('/^STATUS:(\d+|none)$/m', $stderr, $m)) {
        $httpStatus = $m[1] === 'none' ? null : (int) $m[1];
    }
    $jsonPos = strpos($stdout, '{"');
    $json = $jsonPos === false ? null : json_decode(substr($stdout, $jsonPos), true);
    $killPos = strpos($stdout, 'KILL_SESSION');
    $writePos = strpos($stdout, 'PUT ');
    if ($writePos === false) $writePos = strpos($stdout, 'POST ');
    return [
        'exit' => $exitCode, 'status' => $httpStatus, 'json' => $json, 'stdout' => $stdout,
        'opened' => str_contains($stdout, 'SESSION_OPENED'),
        'killed' => $killPos !== false,
        'killFirst' => $killPos !== false && $jsonPos !== false && $killPos < $jsonPos,
        'writeBeforeKill' => $writePos !== false && $killPos !== false && $writePos < $killPos,
        'fellThrough' => str_contains($stdout, 'FELL_THROUGH'),
    ];
}

$success = runAcceptProcess('sucesso');
check($success['exit'] === 0, 'subprocesso real: aceite bem-sucedido termina com 0');
check(!$success['fellThrough'], 'subprocesso real: resposta sempre sai pelo Responde');
check($success['opened'], 'subprocesso real: sessão GLPI aberta no aceite');
check($success['killed'], 'subprocesso real: killSession antes do exit (aceite)');
check($success['killFirst'], 'subprocesso real: killSession antes da resposta JSON (aceite)');
check(is_array($success['json']) && ($success['json']['ok'] ?? null) === true
    && isset($success['json']['data']['acknowledgement']), 'subprocesso real: aceite confirmado após a limpeza');
check($success['status'] === 200, 'subprocesso real: status 200 do aceite');

$missing = runAcceptProcess('nao_encontrado');
check($missing['opened'] && $missing['killed'] && $missing['killFirst'],
    'subprocesso real: killSession antes da resposta 404');
check(($missing['json']['error'] ?? '') === 'Chamado não encontrado.',
    'subprocesso real: chamado inexistente responde 404');
check($missing['status'] === 404, 'subprocesso real: status 404 do chamado inexistente');

$closed = runAcceptProcess('ineligivel');
check($closed['opened'] && $closed['killed'] && $closed['killFirst'],
    'subprocesso real: killSession antes da resposta 422');
check(($closed['json']['error'] ?? '') === 'O chamado não está mais em aberto.',
    'subprocesso real: chamado fechado não é aceito');
check($closed['status'] === 422, 'subprocesso real: status 422 do chamado fechado');

$outside = runAcceptProcess('fora_da_fila');
check($outside['opened'] && $outside['killed'] && $outside['killFirst'],
    'subprocesso real: killSession antes da resposta de fila');
check($outside['status'] === 422
    && ($outside['json']['error'] ?? '') === 'O chamado não pertence à fila de salas.',
    'subprocesso real: chamado fora da fila responde 422');

$transport = runAcceptProcess('transporte');
check($transport['opened'] && $transport['killed'] && $transport['killFirst'],
    'subprocesso real: killSession antes da resposta 502');
check($transport['status'] === 502
    && ($transport['json']['error'] ?? '') === 'Não foi possível verificar o chamado no GLPI. Tente novamente.',
    'subprocesso real: falha após sessão aberta não vaza detalhes internos');

$killFail = runAcceptProcess('kill_falha', ['GCC_TEST_KILL_THROWS' => '1']);
check($killFail['killed'], 'subprocesso real: killSession tentado mesmo quando falha');
check($killFail['status'] === 200 && ($killFail['json']['ok'] ?? null) === true,
    'subprocesso real: falha ao encerrar a sessão não apaga o resultado');

$repeat = runAcceptProcess('ja_aceito');
check(!$repeat['opened'] && !$repeat['killed'], 'subprocesso real: aceite repetido não abre sessão');
check($repeat['status'] === 200
    && ($repeat['json']['data']['alreadyAccepted'] ?? null) === true,
    'subprocesso real: aceite repetido reportado sem tocar no GLPI');

// ── Escritas no GLPI também fecham a sessão antes da resposta ─────────────
$assumeProcess = runAcceptProcess('assumir');
check($assumeProcess['exit'] === 0 && $assumeProcess['opened'], 'subprocesso real: assumir abre sessão');
check($assumeProcess['writeBeforeKill'], 'subprocesso real: gravação no GLPI antes do encerramento da sessão');
check($assumeProcess['killed'] && $assumeProcess['killFirst'], 'subprocesso real: killSession antes da resposta ao assumir');
check($assumeProcess['status'] === 200 && ($assumeProcess['json']['ok'] ?? false) === true,
    'subprocesso real: assumir confirmado');
check(($assumeProcess['json']['data']['glpiUserId'] ?? 0) === 42,
    'subprocesso real: técnico atribuído pelo ID do GLPI');

$informedProcess = runAcceptProcess('assumir_sem_correspondencia');
check($informedProcess['killed'] && $informedProcess['killFirst'],
    'subprocesso real: killSession antes da resposta sem correspondência');
check($informedProcess['status'] === 200
    && ($informedProcess['json']['data']['handlerSource'] ?? '') === 'informado',
    'subprocesso real: nome sem correspondência fica como informado');

$conflictProcess = runAcceptProcess('ja_assumido');
check($conflictProcess['killed'] && $conflictProcess['killFirst'],
    'subprocesso real: killSession antes da resposta de conflito');
check($conflictProcess['status'] === 409
    && str_contains((string) ($conflictProcess['json']['error'] ?? ''), 'Ana Ribeiro'),
    'subprocesso real: conflito informa o responsável atual');
check(!str_contains($conflictProcess['stdout'], 'PUT '), 'subprocesso real: conflito não grava no GLPI');

$concludeProcess = runAcceptProcess('concluir');
check($concludeProcess['writeBeforeKill'] && $concludeProcess['killed'] && $concludeProcess['killFirst'],
    'subprocesso real: conclusão e histórico antes da resposta');
check($concludeProcess['status'] === 200 && ($concludeProcess['json']['ok'] ?? false) === true,
    'subprocesso real: conclusão confirmada pelo GLPI');
check(($concludeProcess['json']['data']['toStatus'] ?? 0) === 5,
    'subprocesso real: concluído corresponde a Resolvido');

$rejectedProcess = runAcceptProcess('escrita_recusada');
check($rejectedProcess['killed'] && $rejectedProcess['killFirst'],
    'subprocesso real: killSession antes da resposta de recusa');
check($rejectedProcess['status'] === 422, 'subprocesso real: recusa do GLPI traduzida');

$noEffectProcess = runAcceptProcess('escrita_sem_efeito');
check($noEffectProcess['killed'] && $noEffectProcess['killFirst'],
    'subprocesso real: killSession antes da resposta sem confirmação');
check($noEffectProcess['status'] === 502 && ($noEffectProcess['json']['ok'] ?? true) === false,
    'subprocesso real: escrita sem efeito não vira sucesso');

$techProcess = runAcceptProcess('responsaveis');
check($techProcess['opened'] && $techProcess['killed'] && $techProcess['killFirst'],
    'subprocesso real: lista de responsáveis encerra a sessão');
check($techProcess['status'] === 200 && ($techProcess['json']['data']['available'] ?? false) === true,
    'subprocesso real: lista de técnicos disponível');

$historyProcess = runAcceptProcess('historico');
check(!$historyProcess['opened'] && !$historyProcess['killed'], 'subprocesso real: histórico não abre sessão do GLPI');
check($historyProcess['status'] === 200, 'subprocesso real: histórico responde sem tocar no GLPI');

// ── Kanban, assumir chamado, movimentação e conclusão ───────────────────────
/**
 * Agora em São Paulo. O backend interpreta openedAt como horário de parede de
 * America/Sao_Paulo, então a fixture não pode usar o fuso do servidor.
 */
function spNow(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d H:i:s');
}

/** Chamado de sala aberto, elegível e sem responsável. */
function openTicket(int $id, array $extra = []): array
{
    return array_merge([
        'id' => $id, 'name' => '[L-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT) . '] Projetor sem imagem',
        'content' => 'Equipamento: Projetor', 'date' => spNow(), 'status' => 1,
        'urgency' => 3, 'entities_id' => 'Escola', 'locations_id' => 'Sala 16',
        'itilcategories_id' => 'Projetor',
    ], $extra);
}

function resetGlpi(): void
{
    GlpiClient::$putWrites = [];
    GlpiClient::$postWrites = [];
    GlpiClient::$failPutHttp = 0;
    GlpiClient::$ignoreStatusWrite = false;
    GlpiClient::$failSolution = false;
    GlpiClient::$ignoreActorWrite = false;
    GlpiClient::$duringWrite = null;
    GlpiClient::$singleHttpCode = 0;
    GlpiClient::$userCollectionHttpCode = 0;
    GlpiClient::$actors = [];
    GlpiClient::$solutions = [];
    GlpiClient::$solutionTypes = [['id' => 1, 'name' => 'Solução rápida']];
    GlpiClient::$users = [
        ['id' => 42, 'name' => 'Kelvin Souza', 'is_technician' => 1],
        ['id' => 43, 'name' => 'Ana Ribeiro', 'is_technician' => 1],
        ['id' => 45, 'name' => 'Conta Não Técnica', 'is_technician' => 0],
        // Mesmo nome normalizado em dois usuários: correspondência ambígua.
        ['id' => 46, 'name' => 'Bia Alves', 'is_technician' => 1],
        ['id' => 47, 'name' => 'bia alves', 'is_technician' => 1],
    ];
    Request::$body = [];
}

/** Ator ASSIGN de um usuário, no formato de `GET /Ticket/{id}/Ticket_User`. */
function assignActor(int $userId): array
{
    return ['id' => 1, 'tickets_id' => 0, 'users_id' => $userId, 'type' => 2, 'use_notification' => 1];
}

function lastPutInput(string $field): mixed
{
    foreach (array_reverse(GlpiClient::$putWrites) as $write) {
        if (array_key_exists($field, $write['input'])) return $write['input'][$field];
    }
    return null;
}

// 1. Assumir com correspondência exata: atribui pelo ator ASSIGN do GLPI 10.
resetGlpi();
GlpiClient::$singleTicket = openTicket(201);
Request::$body = ['handler' => 'Kelvin Souza', 'requestId' => 'req-assumir-0001'];
$closedBefore = GlpiClient::$closed;
RoomTicketsEndpoint::assume(201, []);
check(Responde::$status === 200, 'assumir chamado responde 200');
check(lastPutInput('status') === 2, 'chamado passa para Em andamento no GLPI');
$assignInput = lastPutInput('_actors');
check(is_array($assignInput['assign'] ?? null) && $assignInput['assign'][0]['items_id'] === 42,
    'técnico é atribuído pelo ID do GLPI no mecanismo de atores');
check(($assignInput['assign'][0]['itemtype'] ?? '') === 'User', 'ator enviado como User');
check(lastPutInput('users_id_recipient') === null, 'a atribuição nunca escreve users_id_recipient (autor)');
check(count(GlpiClient::$putWrites) === 1, 'status e atribuição vão na mesma gravação');
check(GlpiClient::$closed === $closedBefore + 1, 'sessão do GLPI encerrada após assumir');
check(GlpiClient::$actors[0]['users_id'] === 42, 'o ator ASSIGN aparece na releitura');
$work = RoomTicketWorkStore::forTicket(201);
check($work['assignment']['handlerName'] === 'Kelvin Souza', 'responsável informado é registrado');
check($work['assignment']['glpiUserId'] === 42, 'responsável vinculado ao técnico do GLPI');
check($work['assignment']['recordedBy'] === 'Kelvin', 'autor do registro vem da sessão autenticada');
check((int) $work['assignment']['at'] > 0, 'data e hora do registro');
check(count($work['moves']) === 1 && $work['moves'][0]['action'] === 'assumir', 'movimentação no histórico');
check(RoomTicketAcknowledgementStore::forTicket(201) !== null, 'alerta compartilhado é reconhecido ao assumir');

// 2. Nome ambíguo no GLPI: registrado como informado, sem usuário inventado.
resetGlpi();
GlpiClient::$singleTicket = openTicket(202);
Request::$body = ['handler' => 'Bia  Alves'];
RoomTicketsEndpoint::assume(202, []);
check(Responde::$status === 200, 'nome ambíguo não impede o atendimento');
check(lastPutInput('_actors') === null, 'nenhum ator é enviado por ambiguidade de nome');
check(lastPutInput('status') === 2, 'chamado segue para Em andamento');
$ambiguous = RoomTicketWorkStore::forTicket(202);
check($ambiguous['assignment']['source'] === 'informado', 'origem registrada como informada');
check($ambiguous['assignment']['glpiUserId'] === 0, 'sem usuário do GLPI inventado');
check(str_contains(RoomTicketsService::text($ambiguous['moves'][0]['note']), 'informado'),
    'histórico explica que não houve correspondência');

// 3. Nome sem correspondente no GLPI.
resetGlpi();
GlpiClient::$singleTicket = openTicket(203);
Request::$body = ['handler' => 'Estagiário sem cadastro'];
RoomTicketsEndpoint::assume(203, []);
check(Responde::$status === 200, 'nome desconhecido é aceito como informação de atendimento');
check(lastPutInput('_actors') === null, 'nada é atribuído no GLPI sem correspondência');
check(RoomTicketWorkStore::summary(RoomTicketWorkStore::forTicket(203))['handlerSource'] === 'informado',
    'diferença entre nome informado e técnico atribuído');

// 3b. O Writer do chamado (users_id_recipient) não pode virar responsável.
resetGlpi();
GlpiClient::$singleTicket = openTicket(210, ['users_id_recipient' => 45]);
GlpiClient::$users[] = ['id' => 45, 'name' => 'Kelvin Souza', 'is_technician' => 1];
Request::$body = ['handler' => 'Kelvin Souza'];
RoomTicketsEndpoint::assume(210, []);
check(Responde::$status === 200, 'assumir não é bloqueado pelo autor do chamado');
check(lastPutInput('users_id_recipient') === null, 'o autor do chamado nunca é reescrito');
$authorOnly = RoomTicketWorkStore::forTicket(210);
check($authorOnly['assignment']['source'] === 'informado',
    'sem ator ASSIGN no GLPI, o responsável é o informado, não o autor');

// 4. Conflito entre dois técnicos: informa o responsável atual e não sobrescreve.
resetGlpi();
GlpiClient::$singleTicket = openTicket(204, ['users_id_recipient' => 45]);
GlpiClient::$actors = [assignActor(42)];
GlpiClient::$users[] = ['id' => 45, 'name' => 'Pessoa Que Abriu', 'is_technician' => 0];
Request::$body = ['handler' => 'Ana Ribeiro'];
$closedBefore = GlpiClient::$closed;
RoomTicketsEndpoint::assume(204, []);
check(Responde::$status === 409, 'conflito entre técnicos responde 409');
check(GlpiClient::$putWrites === [], 'conflito não grava nada no GLPI');
check((Responde::$meta['currentHandler'] ?? '') === 'Kelvin Souza', 'responsável atual vem do ator ASSIGN');
check((Responde::$meta['currentSource'] ?? '') === 'glpi', 'conflito informa a origem do responsável');
check(RoomTicketWorkStore::forTicket(204) === null, 'conflito não cria registro de atendimento');
check(GlpiClient::$closed === $closedBefore + 1, 'sessão encerrada também no conflito');
check(is_array(Responde::$meta['allowedActions'] ?? null) && Responde::$meta['allowedActions'] !== [],
    'conflito informa as ações realmente disponíveis');

// 5. Mesmo técnico repetindo o assumir não duplica histórico nem reescreve.
resetGlpi();
GlpiClient::$singleTicket = openTicket(201, ['status' => 2]);
GlpiClient::$actors = [assignActor(42)];
RoomTicketWorkStore::recordAssignment(201, ['reference' => 'L-0201'],
    ['handlerName' => 'Kelvin Souza', 'source' => 'glpi_user', 'glpiUserId' => 42, 'glpiUserName' => 'Kelvin Souza'],
    ['name' => 'Kelvin']);
$movesBefore = count(RoomTicketWorkStore::forTicket(201)['moves']);
Request::$body = ['handler' => 'Kelvin Souza'];
RoomTicketsEndpoint::assume(201, []);
check(Responde::$status === 200, 'repetição do mesmo responsável é idempotente');
check(GlpiClient::$putWrites === [], 'repetição não grava de novo no GLPI');
check(count(RoomTicketWorkStore::forTicket(201)['moves']) === $movesBefore, 'histórico não ganha movimento duplicado');
check((Responde::$result['alreadyAssumed'] ?? false) === true, 'repetição é identificada como idempotente');
$keptAck = RoomTicketAcknowledgementStore::forTicket(201);
check(is_array($keptAck), 'o aceite anterior é preservado');

// 6. Validações de entrada.
resetGlpi();
GlpiClient::$singleTicket = openTicket(205);
Request::$body = [];
RoomTicketsEndpoint::assume(205, []);
check(Responde::$status === 422, 'assumir sem nome é recusado');
check(GlpiClient::$putWrites === [], 'chamada inválida não abre gravação');
Request::$body = ['handler' => '   '];
RoomTicketsEndpoint::assume(205, []);
check(Responde::$status === 422, 'nome em branco é recusado');
RoomTicketsEndpoint::assume(0, []);
check(Responde::$status === 422, 'identificador inválido é recusado');
check(in_array('room-ticket-assume', Request::$scopes, true), 'assumir é limitado por taxa');

// 7. Chamado fora da fila de salas não é assumido.
resetGlpi();
GlpiClient::$singleTicket = ['id' => 206, 'name' => 'Chamado administrativo', 'content' => '',
    'date' => (new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d H:i:s'), 'status' => 1, 'urgency' => 3, 'entities_id' => 'Escola',
    'locations_id' => 0, 'itilcategories_id' => 0];
Request::$body = ['handler' => 'Kelvin Souza'];
RoomTicketsEndpoint::assume(206, []);
check(Responde::$status === 422, 'chamado fora da fila de salas é recusado');
check(GlpiClient::$putWrites === [], 'recusa não grava no GLPI');

// 8. Concluir com solução: status Resolvido e ITILSolution confirmada.
resetGlpi();
GlpiClient::$singleTicket = openTicket(207, ['status' => 2]);
Request::$body = ['action' => 'concluir', 'solution' => 'Troca do cabo HDMI do projetor.', 'requestId' => 'req-concluir-0001'];
$closedBefore = GlpiClient::$closed;
RoomTicketsEndpoint::move(207, []);
check(Responde::$status === 200, 'concluir responde 200');
check(lastPutInput('status') === 5, 'Concluído corresponde a Resolvido, sem fechar');
check(lastPutInput('resolution') === null, 'nenhum campo `resolution` inventado no Ticket do GLPI 10');
check(count(GlpiClient::$postWrites) === 1 && GlpiClient::$postWrites[0]['path'] === '/ITILSolution',
    'solução registrada pelo itemtype oficial ITILSolution');
check(GlpiClient::$postWrites[0]['input']['itemtype'] === 'Ticket'
    && GlpiClient::$postWrites[0]['input']['items_id'] === 207, 'solução ligada ao chamado certo');
check(str_contains((string) GlpiClient::$postWrites[0]['input']['content'], 'Troca do cabo HDMI'),
    'texto da solução vai para o GLPI');
check(!isset(GlpiClient::$postWrites[0]['input']['tickets_id']), 'tickets_id não é aceito no GLPI 10');
$closed = RoomTicketWorkStore::forTicket(207);
check($closed['solution']['text'] === 'Troca do cabo HDMI do projetor.', 'solução consultável no GCC');
check($closed['solution']['recordedBy'] === 'Kelvin', 'autor da solução registrado');
check($closed['solution']['glpi'] === true, 'solução marcada como registrada no GLPI');
check($closed['moves'][0]['to'] === 5, 'movimentação para Resolvido no histórico');
check(GlpiClient::$closed === $closedBefore + 1, 'sessão encerrada após concluir');
check((int) GlpiClient::$singleTicket['status'] === 5, 'o GLPI termina com o status resolvido');

// 9. Concluir exige solução.
resetGlpi();
GlpiClient::$singleTicket = openTicket(208, ['status' => 2]);
Request::$body = ['action' => 'concluir', 'solution' => '  '];
RoomTicketsEndpoint::move(208, []);
check(Responde::$status === 422, 'concluir sem solução é recusado');
check(GlpiClient::$putWrites === [], 'sem solução não grava status');
Request::$body = ['action' => 'concluir', 'solution' => 'ok'];
RoomTicketsEndpoint::move(208, []);
check(Responde::$status === 422, 'solução curta demais é recusada');

// 10. Movimento inválido para o status atual.
resetGlpi();
GlpiClient::$singleTicket = openTicket(209, ['status' => 1]);
Request::$body = ['action' => 'reabrir'];
RoomTicketsEndpoint::move(209, []);
check(Responde::$status === 409, 'reabrir chamado novo é recusado');
check(GlpiClient::$putWrites === [], 'transição inválida não grava');
Request::$body = ['action' => 'assumir'];
RoomTicketsEndpoint::move(209, []);
check(Responde::$status === 422, 'assumir não é uma movimentação do Kanban');
Request::$body = ['action' => 'inventado'];
RoomTicketsEndpoint::move(209, []);
check(Responde::$status === 422, 'movimentação desconhecida é recusada');

// 11. Reabertura respeita a transição permitida.
resetGlpi();
GlpiClient::$singleTicket = openTicket(210, ['status' => 5]);
Request::$body = ['action' => 'reabrir'];
RoomTicketsEndpoint::move(210, []);
check(Responde::$status === 200, 'reabrir resolvido responde 200');
check(lastPutInput('status') === 1, 'reabertura leva o chamado para Novo');
resetGlpi();
GlpiClient::$singleTicket = openTicket(211, ['status' => 6]);
Request::$body = ['action' => 'reabrir'];
RoomTicketsEndpoint::move(211, []);
check(Responde::$status === 200, 'chamado fechado pode ser reaberto');
check(lastPutInput('status') === 1, 'reabertura de fechado vai para Novo');

// 12. Pendente e retomar.
resetGlpi();
GlpiClient::$singleTicket = openTicket(212, ['status' => 2]);
Request::$body = ['action' => 'pendente'];
RoomTicketsEndpoint::move(212, []);
check(Responde::$status === 200 && lastPutInput('status') === 4, 'pendente leva para Pendente');
resetGlpi();
GlpiClient::$singleTicket = openTicket(213, ['status' => 4]);
Request::$body = ['action' => 'retomar'];
RoomTicketsEndpoint::move(213, []);
check(Responde::$status === 200 && lastPutInput('status') === 2, 'retomar leva para Em atendimento');

// 13. GLPI rejeita a alteração: nada é confirmado nem registrado.
resetGlpi();
GlpiClient::$singleTicket = openTicket(214, ['status' => 2]);
GlpiClient::$failPutHttp = 400;
Request::$body = ['action' => 'concluir', 'solution' => 'Ajuste no cabo de força.'];
RoomTicketsEndpoint::move(214, []);
check(Responde::$status === 422, 'GLPI recusa a alteração é traduzida em 422');
check(RoomTicketWorkStore::forTicket(214) === null, 'recusa do GLPI não registra histórico local');
check(str_contains((string) (Responde::$error ?? ''), 'recusou'), 'mensagem compreensível na recusa');
check(GlpiClient::$closed > 0, 'sessão encerrada mesmo com recusa');

// 14. GLPI aceita mas não confirma o status: resultado real é informado.
resetGlpi();
GlpiClient::$singleTicket = openTicket(215, ['status' => 2]);
GlpiClient::$ignoreStatusWrite = true;
Request::$body = ['action' => 'concluir', 'solution' => 'Reposicionamento do cabo.'];
RoomTicketsEndpoint::move(215, []);
check(Responde::$status === 502, 'mudança não confirmada pelo GLPI não vira sucesso');
check((Responde::$meta['partial'] ?? false) === false, 'sem alteração aplicada não é parcial');
check(count(RoomTicketWorkStore::forTicket(215)['moves']) === 1, 'a tentativa fica registrada no histórico');
check(RoomTicketWorkStore::forTicket(215)['moves'][0]['confirmed'] === false, 'movimentação marcada como não confirmada');

// 15. Falha parcial: status aplicado e solução recusada pelo GLPI.
resetGlpi();
GlpiClient::$singleTicket = openTicket(216, ['status' => 2]);
GlpiClient::$failSolution = true;
Request::$body = ['action' => 'concluir', 'solution' => 'Troca do projetor.', 'requestId' => 'req-concluir-0016'];
RoomTicketsEndpoint::move(216, []);
check(Responde::$status === 502, 'falha parcial não é apresentada como sucesso');
check((Responde::$meta['data']['partial'] ?? false) === true, 'falha parcial é sinalizada');
check(RoomTicketWorkStore::forTicket(216)['solution']['text'] === 'Troca do projetor.',
    'solução fica salva no GCC apesar da falha parcial');
check(count(RoomTicketWorkStore::forTicket(216)['moves']) === 1, 'uma única tentativa registrada');
check(RoomTicketWorkStore::forTicket(216)['solution']['glpi'] === false,
    'solução recusada pelo GLPI não é marcada como registrada nele');
$steps = Responde::$meta['data']['steps'] ?? [];
$stepNames = array_column($steps, 'step');
check(in_array('status', $stepNames, true) && in_array('solucao', $stepNames, true),
    'os passos realmente executados são informados');
$solutionStep = null;
foreach ($steps as $step) if ($step['step'] === 'solucao') $solutionStep = $step;
check(($solutionStep['ok'] ?? null) === false, 'a etapa da solução é a que falhou');
check((Responde::$meta['data']['applied']['status'] ?? false) === true,
    'a resposta distingue o que foi aplicado do que não foi');
check((Responde::$meta['data']['applied']['solution'] ?? true) === false,
    'a resposta informa que a solução não foi aplicada');
check(str_contains((string) Responde::$error, 'antes de repetir'),
    'a orientação não manda reenviar às cegas uma operação parcial');

// 16. Reenvio da mesma requisição não duplica gravações.
resetGlpi();
GlpiClient::$singleTicket = openTicket(207, ['status' => 2]);
Request::$body = ['action' => 'concluir', 'solution' => 'Troca do cabo HDMI do projetor.', 'requestId' => 'req-concluir-0001'];
RoomTicketsEndpoint::move(207, []);
check(Responde::$status === 200, 'reenvio do requestId anterior responde 200');
check(GlpiClient::$putWrites === [] && GlpiClient::$postWrites === [], 'reenvio não grava no GLPI de novo');
check((Responde::$result['replayed'] ?? false) === true, 'reenvio é identificado como repetição');
check(count(RoomTicketWorkStore::forTicket(207)['moves']) === 1, 'histórico continua com um movimento');

// 16b. Segunda conclusão legítima depois de reabrir: novo requestId, nova escrita.
resetGlpi();
GlpiClient::$singleTicket = openTicket(207, ['status' => 1]);
GlpiClient::$solutions = [];
Request::$body = ['action' => 'concluir', 'solution' => 'Segunda resolucao, texto diferente.', 'requestId' => 'req-concluir-0002'];
RoomTicketsEndpoint::move(207, []);
check(Responde::$status === 200, 'concluir de novo após reabrir responde 200');
check(count(GlpiClient::$putWrites) === 1 && count(GlpiClient::$postWrites) === 1,
    'concluir de novo realmente grava no GLPI');
check(RoomTicketWorkStore::forTicket(207)['solution']['text'] === 'Troca do cabo HDMI do projetor.',
    'a solução anterior não é sobrescrita por uma segunda conclusão');
check((Responde::$result['replayed'] ?? false) === false, 'não é tratado como repetição');

// 16c. requestId de outra operação é recusado em vez de devolver resultado antigo.
resetGlpi();
GlpiClient::$singleTicket = openTicket(209, ['status' => 2]);
Request::$body = ['action' => 'pendente', 'requestId' => 'req-concluir-0001'];
RoomTicketsEndpoint::move(209, []);
check(Responde::$status === 409, 'requestId de outra ação é recusado');
check((Responde::$meta['reason'] ?? '') === 'requestId_reused', 'a recusa explica o motivo');
check(GlpiClient::$putWrites === [], 'a recusa não grava nada');

// 17. Histórico consultável.
resetGlpi();
RoomTicketsEndpoint::historico(207);
check(Responde::$status === 200, 'histórico responde 200');
check((Responde::$result['ticketId'] ?? 0) === 207, 'histórico é do chamado pedido');
check(count(Responde::$result['moves']) >= 1, 'histórico traz a movimentação');
check(is_array(Responde::$result['solution']), 'histórico traz a solução');
check(array_key_exists('assignment', Responde::$result), 'histórico distingue responsável de aceite');
// Concluir não gera aceite: a chave existe e fica vazia.
check(array_key_exists('acknowledgement', Responde::$result) && Responde::$result['acknowledgement'] === null,
    'concluir sem assumir não cria aceite');
RoomTicketsEndpoint::historico(201);
check(is_array(Responde::$result['acknowledgement']), 'histórico traz o aceite do chamado assumido');
check(Responde::$result['assignment']['handlerName'] === 'Kelvin Souza', 'histórico traz quem vai atender');
check(Responde::$result['assignment']['recordedBy'] === 'Kelvin', 'histórico traz quem registrou');
RoomTicketsEndpoint::historico(0);
check(Responde::$status === 422, 'histórico de chamado inválido é recusado');

// 18. Lista de responsáveis.
resetGlpi();
RoomTicketsEndpoint::responsaveis([]);
check(Responde::$status === 200, 'responsaveis responde 200');
check((Responde::$result['available'] ?? false) === true, 'lista de técnicos disponível');
check(count(Responde::$result['technicians']) === 4, 'somente técnicos do GLPI são listados');
check(Responde::$result['technicians'][0]['name'] === 'Ana Ribeiro', 'lista ordenada por nome');
resetGlpi();
GlpiClient::$userCollectionHttpCode = 403;
RoomTicketsEndpoint::responsaveis([]);
check(Responde::$status === 200 && (Responde::$result['available'] ?? true) === false,
    'sem acesso a lista, o formulário continua com texto livre');
check((string) (Responde::$result['message'] ?? '') !== '', 'motivo da indisponibilidade é informado');
check(Responde::$result['technicians'] === [], 'nenhum técnico é inventado sem acesso à lista');
GlpiClient::$userCollectionHttpCode = 0;

// 19. O Kanban da lista usa o conjunto completo e traz o registro do GCC.
resetGlpi();
GlpiClient::$singleTicket = openTicket(78);
Request::$body = ['handler' => 'Kelvin Souza'];
RoomTicketsEndpoint::assume(78, []);
check(Responde::$status === 200, 'chamado 78 assume antes da leitura da lista');
GlpiClient::$errors = [];
GlpiClient::$changed = false;
GlpiClient::$empty = false;
$_GET = ['period' => '30d'];
RoomTicketsEndpoint::list([]);
check(Responde::$status === 200, 'lista com Kanban responde 200');
$kanban = Responde::$result['kanban'] ?? null;
check(is_array($kanban) && isset($kanban['columns']['abertos'], $kanban['columns']['andamento'], $kanban['columns']['concluidos']),
    'lista devolve as três colunas');
check($kanban['columns']['abertos']['count'] >= 1, 'coluna Abertos conta o chamado novo do fixture');
check(array_sum(array_column($kanban['columns'], 'count')) === $kanban['total'],
    'a soma das colunas bate com o total consultado');
check(isset($kanban['limit']) && $kanban['limit'] > 0, 'limite por coluna explícito');
$card78 = $kanban['columns']['abertos']['items'][0] ?? [];
check(($card78['work']['handlerName'] ?? '') === 'Kelvin Souza', 'cartão do Kanban traz o responsável registrado');
check(is_array($card78['acknowledgement'] ?? null), 'cartão do Kanban traz o aceite compartilhado');
check(array_key_exists('work', $card78), 'cartão sempre declara o registro do GCC, mesmo vazio');
$_GET = ['period' => '30d', 'kanban_limit' => '500'];
RoomTicketsEndpoint::list([]);
check(Responde::$status === 422, 'limite do Kanban inválido é recusado');
$_GET = ['period' => '30d'];

// 20. Concorrência: outro técnico assume entre a verificação e a gravação.
resetGlpi();
GlpiClient::$singleTicket = openTicket(220, ['status' => 1]);
Request::$body = ['handler' => 'Ana Ribeiro', 'requestId' => 'req-corr-0001'];
GlpiClient::$duringWrite = static function (int $id) use (&$ticketRow) {
    // Registro do GCC do técnico que chegou primeiro, já gravado no store.
    RoomTicketWorkStore::recordAssignment($id, $ticketRow,
        ['handlerName' => 'Kelvin Souza', 'source' => 'glpi_user', 'glpiUserId' => 42, 'glpiUserName' => 'Kelvin Souza'],
        ['name' => 'Kelvin']);
};
$ticketRow = ['reference' => 'L-0220'];
RoomTicketsEndpoint::assume(220, []);
check(Responde::$status === 409, 'conflito de corrida não vira sucesso');
check(str_contains((string) Responde::$error, 'Kelvin Souza'), 'o responsável que chegou primeiro é informado');
check((Responde::$meta['currentHandler'] ?? '') === 'Kelvin Souza',
    'a resposta não atribui o chamado a quem perdeu a corrida');
check(!isset(Responde::$result) || Responde::$result === [], 'a resposta de conflito não traz sucesso');
check(RoomTicketWorkStore::forTicket(220)['assignment']['handlerName'] === 'Kelvin Souza',
    'o registro do servidor preserva quem assumiu primeiro');
GlpiClient::$duringWrite = null;

// 21. Recuperação de falha parcial: reenviar a MESMA operação não duplica nada.
resetGlpi();
GlpiClient::$singleTicket = openTicket(221, ['status' => 2]);
GlpiClient::$failSolution = true;
Request::$body = ['action' => 'concluir', 'solution' => 'Troca do cabo do projetor.', 'requestId' => 'req-parcial-1'];
RoomTicketsEndpoint::move(221, []);
check(Responde::$status === 502, 'primeira tentativa falha parcialmente');
check(count(GlpiClient::$postWrites) === 1, 'a primeira tentativa tentou a solução uma vez');
$writesAfterFirst = count(GlpiClient::$putWrites);
// A conexão volta: a MESMA intenção (mesmo requestId) não repete a escrita.
GlpiClient::$failSolution = false;
Request::$body = ['action' => 'concluir', 'solution' => 'Troca do cabo do projetor.', 'requestId' => 'req-parcial-1'];
RoomTicketsEndpoint::move(221, []);
check(count(GlpiClient::$putWrites) === $writesAfterFirst, 'o reenvio não grava o status de novo');
check(count(GlpiClient::$postWrites) === 1, 'o reenvio não cria uma segunda solução no GLPI');
check(count(RoomTicketWorkStore::forTicket(221)['moves']) === 1, 'o reenvio não duplica o histórico');
check(Responde::$status === 502, 'o reenvio da operação parcial devolve o mesmo desfecho, sem repetir');
check((Responde::$meta['data']['replayed'] ?? false) === true, 'o reenvio é reconhecido como a mesma operação');
check(RoomTicketWorkStore::forTicket(221)['solution']['glpi'] === false,
    'a solução continua marcada como não registrada no GLPI');

// 21. Técnico além da primeira página de usuários ainda é encontrado.
resetGlpi();
$many = [];
for ($i = 1; $i <= 250; $i++) {
    $many[] = ['id' => 1000 + $i, 'name' => 'Tecnico ' . $i, 'is_technician' => 1];
}
GlpiClient::$users = $many;
GlpiClient::$singleTicket = openTicket(230, ['status' => 1]);
Request::$body = ['handler' => 'Tecnico 250', 'requestId' => 'req-pagina-0001'];
RoomTicketsEndpoint::assume(230, []);
check(Responde::$status === 200, 'assume com técnico na segunda página responde 200');
$assign = lastPutInput('_actors');
check(($assign['assign'][0]['items_id'] ?? 0) === 1250,
    'técnico além da primeira página é atribuído pelo ID correto · ' . json_encode($assign));

// 22. Contrato de permissões das novas rotas.
$endpointsSource = (string) file_get_contents(__DIR__ . '/../api/endpoints.php');
foreach ([
    "'#^/api/tickets/salas/\\d+/aceite$#' => ['chamados', 'edit']",
    "'#^/api/tickets/salas/\\d+/(?:assumir|mover)$#' => ['chamados', 'edit']",
    "'#^/api/tickets/salas/\\d+/historico$#' => ['chamados', 'view']",
    "'#^/api/tickets/salas/responsaveis$#' => ['chamados', 'view']",
] as $rule) {
    check(str_contains($endpointsSource, $rule), 'rota protegida: ' . $rule);
}
foreach (['RoomTicketsEndpoint::assume(', 'RoomTicketsEndpoint::move(', 'RoomTicketsEndpoint::historico(',
    'RoomTicketsEndpoint::responsaveis('] as $dispatch) {
    check(str_contains($endpointsSource, $dispatch), 'rota encaminhada: ' . $dispatch);
}

resetGlpi();
GlpiClient::$actors = [array_merge(assignActor(42), ['tickets_id' => 230])];
GlpiClient::$userCollectionHttpCode = 403;
$actorIndex = RoomTicketsGlpi::readActorIndex(new GlpiClient([]), 'test');
check($actorIndex['available'] === true, 'atores disponíveis mesmo com User restrito');
$actor = array_values($actorIndex['index'])[0];
check($actor['userId'] === 42 && $actor['name'] === '#42', 'ID do responsável preservado');
check($actorIndex['reason'] !== '', 'restrição dos nomes informada');
runEndpoint();
check(Responde::$status === 200, 'lista funciona mesmo com nomes restritos');
check(count(Responde::$result['meta']['warnings']) > 0, 'lista explica nomes indisponíveis');

resetGlpi();
GlpiClient::$singleTicket = openTicket(331, ['status' => 1]);
GlpiClient::$userCollectionHttpCode = 403;
Request::$body = ['handler' => 'Tecnico informado', 'requestId' => 'req-restrito-331'];
RoomTicketsEndpoint::assume(331, []);
check(Responde::$status === 200, 'assume com nome informado e diretório restrito');
check(lastPutInput('_actors') === null, 'não inventa atribuição GLPI sem acesso ao diretório');
check(Responde::$result['handlerSource'] === 'informado', 'nome livre permanece identificado como informado');
resetGlpi();
GlpiClient::$singleTicket = openTicket(332, ['status' => 2]);
GlpiClient::$errors['/SolutionType'] = 403;
Request::$body = ['action' => 'concluir', 'solution' => 'Cabo reconectado no teste', 'requestId' => 'req-solucao-332'];
RoomTicketsEndpoint::move(332, []);
check(Responde::$status === 200, 'solução sem tipo opcional quando cadastro é restrito');

echo "$checks endpoint checks passed\n";
