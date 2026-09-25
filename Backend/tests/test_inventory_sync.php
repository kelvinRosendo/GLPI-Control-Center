<?php
declare(strict_types=1);
require_once __DIR__ . '/sandbox.php';
putenv('GLPI_INVENTORY_COLLECTIONS'); // Tests always start with the default catalog.
require_once GCC_TEST_BACKEND . '/api/services/GlpiCollectionReader.php';
// Fake transport; no .env or network is accessed.
final class GlpiClient {
    public static array $data = [];
    public static array $calls = [];
    public static ?string $fail = null;
    public function __construct(array $config) {}
    public function initSession(): string { return 'offline'; }
    public function killSession(string $session): void {}
    public function getAllWithParams(string $path, string $session, array $params, int $size): array {
        self::$calls[] = $path;
        $rows = self::$data[$path] ?? [];
        return ['items' => $rows, 'total' => count($rows), 'pages' => 1,
            'complete' => self::$fail !== $path,
            'errors' => self::$fail === $path ? ['HTTP 403'] : []];
    }
}
require_once GCC_TEST_BACKEND . '/api/sync.php';
$count = 0;
function check(bool $value, string $message): void {
    global $count;
    if (!$value) throw new RuntimeException($message);
    $count++;
}
function page(array $ids, int $total, int $code = 206): array {
    return ['items' => array_map(fn($id) => ['id' => $id], $ids),
        '_http_code' => $code, '_content_range' => 'items */' . $total];
}
$offsets = [];
$r = GlpiCollectionReader::collect(function ($offset, $size) use (&$offsets) {
    $offsets[] = $offset;
    return page(array_slice([1,2,3,4,5], $offset, 2), 5);
}, 500);
check($r['complete'] && count($r['items']) === 5, 'server page-size cap must not truncate inventory');
check($offsets === [0,2,4], 'advance by rows actually received');
$r = GlpiCollectionReader::collect(fn($offset) => page([1,2], 5), 2);
check(!$r['complete'] && $r['pages'] === 2, 'repeated page stops without infinite loop');
$r = GlpiCollectionReader::collect(fn($offset) => $offset ? page([], 3) : page([1,2], 3), 2);
check(!$r['complete'], 'early empty page must fail');
foreach ([401,403,404,500,0] as $http) {
    $r = GlpiCollectionReader::collect(fn() => page([], 0, $http));
    check(!$r['complete'], 'HTTP failure must not be an empty successful inventory');
}
$r = GlpiCollectionReader::collect(fn() => ['items' => [], '_http_code' => 200]);
check(!$r['complete'], 'missing total is unverified');
$r = GlpiCollectionReader::collect(fn($offset) => $offset ? page([3], 4) : page([1,2], 3), 2);
check(!$r['complete'], 'changing total rejected');
$r = GlpiCollectionReader::collect(fn() => page([], 0, 200));
check($r['complete'], 'real empty collection succeeds');
$r = GlpiCollectionReader::collect(fn() => ['items' => [['name' => 'missing id']], '_http_code' => 200, '_content_range' => '0-0/1']);
check(!$r['complete'], 'missing identifier rejected');
$r = GlpiCollectionReader::collect(function () { throw new RuntimeException('SECRET'); });
check(!str_contains(json_encode($r), 'SECRET'), 'transport failure does not leak payload');
$catalog = Classifier::getCatalog();
putenv('GLPI_INVENTORY_COLLECTIONS=Computer, Printer,Computer');
$customCatalog = require GCC_TEST_BACKEND . '/config/asset-catalog.php';
check($customCatalog['sync']['collections'] === ['Computer', 'Printer'], 'configured scope is normalized and deduplicated');
putenv('GLPI_INVENTORY_COLLECTIONS=../User');
$invalidScopeRejected = false;
try { require GCC_TEST_BACKEND . '/config/asset-catalog.php'; }
catch (RuntimeException $error) { $invalidScopeRejected = true; }
check($invalidScopeRejected, 'invalid collection path rejected');
putenv('GLPI_INVENTORY_COLLECTIONS');
$types = $catalog['sync']['collections'];
check(in_array('Peripheral', $types, true) && in_array('Monitor', $types, true), 'collect peripherals and monitors');
foreach ($types as $type) GlpiClient::$data['/' . $type] = [['id' => 1, 'name' => $type . '-one']];
$sync = new AssetSync([], $catalog, GCC_TEST_BACKEND . '/data', GCC_TEST_BACKEND . '/logs');
$path = GCC_TEST_BACKEND . '/data/cache/classified_assets.json';
file_put_contents($path, json_encode([['id' => 7, 'name' => 'OLD', 'itemtype' => 'Computer']]));
check($sync->getCacheState()['state'] === 'unverified', 'legacy cache not advertised as verified');
$result = $sync->fullSync();
check($result['syncInfo']['status'] === 'success', 'complete snapshot succeeds');
check(count($result['items']) === count($types), 'same id across itemtypes remains distinct');
check(count(array_unique(array_column($result['items'], 'itemtype'))) === count($types), 'identity preserves every itemtype');
check($sync->getCacheState()['state'] === 'valid', 'validated snapshot marked valid');
check($sync->getCacheState()['collections'] === $types, 'cache reports the exact configured scope');
check(!$sync->isRunning(), 'persistent lock inode not mistaken for running sync');
$before = file_get_contents($path);
GlpiClient::$fail = '/Peripheral';
$result = $sync->fullSync();
check($result['syncInfo']['status'] === 'failed', 'one inaccessible collection fails snapshot');
check(file_get_contents($path) === $before, 'partial sync preserves exact previous cache');
check($sync->getCacheState()['state'] === 'stale', 'failure visible in cache state');
$result = $sync->incrementalSync();
check($result['syncInfo']['status'] === 'failed' && file_get_contents($path) === $before, 'incremental uses same preservation rule');
GlpiClient::$fail = null;
GlpiClient::$data = [];
$result = $sync->fullSync();
check($result['syncInfo']['status'] === 'success' && $result['items'] === [], 'verified empty inventory replaces obsolete records');
check($sync->getCacheState()['state'] === 'empty', 'verified zero is distinct from failure');
$lock = fopen(GCC_TEST_BACKEND . '/data/cache/.sync.lock', 'c');
flock($lock, LOCK_EX);
check($sync->fullSync()['syncInfo']['status'] === 'locked', 'concurrent sync blocked');
flock($lock, LOCK_UN); fclose($lock);
unlink($path); mkdir($path);
$result = $sync->fullSync();
check($result['syncInfo']['status'] === 'failed', 'cache write failure must not succeed');
// Read endpoint must ignore unverified fixture and must not write the live-read result.
rmdir($path);
@unlink(GCC_TEST_BACKEND . '/data/sync_report.json');
@unlink(GCC_TEST_BACKEND . '/data/cache/sync_status.json');
file_put_contents($path, json_encode([['id' => 99, 'name' => 'FIXTURE', 'itemtype' => 'Computer']]));
$fixtureBefore = file_get_contents($path);
GlpiClient::$data = ['/Peripheral' => [['id' => 88, 'name' => 'Real mouse']]];
final class Responde {
    public static array $response = [];
    public static function ok(array $data): void { self::$response = $data; }
    public static function erro(string $message, int $status): void { self::$response = ['error' => $message, 'status' => $status]; }
}
require_once GCC_TEST_BACKEND . '/api/sync_status.php';
SyncEndpoint::assets(['glpi' => []]);
check(Responde::$response['source'] === 'glpi', 'unverified cache uses live authorized read');
check(Responde::$response['data'][0]['itemtype'] === 'Peripheral' && Responde::$response['data'][0]['id'] === 88, 'live read returns real asset identity instead of fixture');
check(file_get_contents($path) === $fixtureBefore, 'read-only fallback does not overwrite cache');
GlpiClient::$fail = '/Peripheral';
SyncEndpoint::assets(['glpi' => []]);
check(Responde::$response['status'] === 502, 'live fallback failure does not return fixture as inventory');
echo "OK: $count inventory regression checks; isolated data, no GLPI connection.\n";
