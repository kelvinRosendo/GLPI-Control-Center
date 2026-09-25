<?php
declare(strict_types=1);
// Controller regression: no network, credentials or operational cache writes.
final class GlpiClient {
    public static array $errors = [];
    public static bool $changed = false;
    public static bool $empty = false;
    public static int $closed = 0;
    public function __construct(array $config) {}
    public function initSession(): string { return 'test'; }
    public function killSession(string $session): void { self::$closed++; }
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
$checks = 0;
function check(bool $condition, string $label): void {
    global $checks;
    if (!$condition) throw new RuntimeException($label);
    $checks++;
}
function runEndpoint(): void {
    $_GET = ['period' => '30d'];
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
echo "$checks endpoint checks passed\n";
