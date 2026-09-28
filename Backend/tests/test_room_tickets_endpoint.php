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
    public function __construct(array $config) {}
    public function initSession(): string { return 'test'; }
    public function killSession(string $session): void { self::$closed++; }
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
    public function getReportPage(string $path, string $session, int $offset, int $size, bool $expand = false): array {
        if (isset(self::$errors[$path])) throw new RuntimeException('fixture', self::$errors[$path]);
        $items = [];
        if ($path === '/Ticket' && !self::$empty) $items = [[
            'id' => $expand && self::$changed ? 79 : 78,
            'name' => '[L-0009] Projetor não liga', 'content' => '',
            'date' => date('Y-m-d H:i:s'), 'status' => 1,
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
    public static function json(int $maxBytes = 1048576): array { return []; }
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
    public static function ok(array $result): void { self::$result = $result['data']; self::$status = 200; }
    public static function erro(string $message, int $status): void { self::$result = []; self::$status = $status; }
}
require_once __DIR__ . '/../api/room_tickets.php';
$ackFile = sys_get_temp_dir() . '/gcc-room-ticket-acks-' . bin2hex(random_bytes(6)) . '.json';
putenv('GCC_ROOM_TICKET_ACKS_FILE=' . $ackFile);
register_shutdown_function(static function () use ($ackFile): void {
    if (is_file($ackFile)) unlink($ackFile);
    putenv('GCC_ROOM_TICKET_ACKS_FILE');
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
$openedAt = date('Y-m-d H:i:s');
GlpiClient::$singleTicket = [
    'id' => 78, 'name' => '[L-0009] Projetor não liga', 'content' => '',
    'date' => $openedAt, 'status' => 1, 'entities_id' => 'Escola',
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
    'date' => $openedAt, 'status' => 6, 'entities_id' => 'Escola',
    'locations_id' => 'Sala 16', 'itilcategories_id' => 'Projetor',
];
$closedBefore = GlpiClient::$closed;
RoomTicketsEndpoint::accept(79, []);
check(Responde::$status === 422, 'closed ticket is not acceptable');
check(GlpiClient::$closed === $closedBefore + 1, 'GLPI session closed after rejection');

GlpiClient::$singleTicket = [
    'id' => 80, 'name' => 'Chamado administrativo', 'content' => '',
    'date' => $openedAt, 'status' => 1, 'entities_id' => 'Escola',
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

echo "$checks endpoint checks passed\n";
