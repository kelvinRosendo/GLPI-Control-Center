<?php
declare(strict_types=1);
require_once __DIR__ . '/../api/services/RoomPushStore.php';
$checks = 0;
function checkPush(bool $condition, string $label): void {
    global $checks; $checks++;
    if (!$condition) throw new RuntimeException($label);
}
function subscription(string $endpoint = 'https://fcm.googleapis.com/fcm/send/test'): array {
    $b64 = static fn(string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    return ['endpoint' => $endpoint, 'keys' => ['p256dh' => $b64(chr(4) . str_repeat('a', 64)), 'auth' => $b64(str_repeat('b', 16))]];
}
foreach (['https://fcm.googleapis.com/fcm/send/test', 'https://web.push.apple.com/test', 'https://updates.push.services.mozilla.com/wpush/v2/test', 'https://wns2-bl2p.notify.windows.com/test'] as $url) {
    checkPush(RoomPushStore::validate(subscription($url))['endpoint'] === $url, 'known provider');
}
foreach (['http://fcm.googleapis.com/test', 'https://127.0.0.1/test', 'https://fcm.googleapis.com.evil.test/test', 'https://fcm.googleapis.com:443/test', 'https://user@fcm.googleapis.com/test', 'https://example.com/test'] as $url) {
    try { RoomPushStore::validate(subscription($url)); throw new LogicException('accepted malicious URL'); }
    catch (InvalidArgumentException $expected) { $checks++; }
}
$bad = subscription(); $bad['keys']['auth'] = 'short';
try { RoomPushStore::validate($bad); throw new LogicException('accepted invalid key'); }
catch (InvalidArgumentException $expected) { $checks++; }
putenv('GCC_PUSH_EMAILS=tech@school.test');
$config = ['auth' => ['allowed_domains' => ['school.test']]];
checkPush(RoomPushStore::allowed('tech@school.test', $config), 'authenticated school account eligible');
checkPush(RoomPushStore::allowed('another-tech@school.test', $config), 'account need not appear in legacy push list');
checkPush(!RoomPushStore::allowed('tech@other.test', $config), 'outside login domains denied');
checkPush(!RoomPushStore::allowed('', $config), 'empty account denied');
checkPush(!RoomPushStore::allowed('@school.test', $config), 'invalid account denied');
checkPush(!RoomPushStore::allowed('tech@school.test', []), 'domain revoked');
$now = 1790956800;
$row = static function(int $id, int $opened) { return ['id' => $id, 'openedAt' => (new DateTimeImmutable('@' . $opened))->setTimezone(new DateTimeZone('America/Sao_Paulo'))->format('Y-m-d H:i:s'), 'eligible' => true, 'room' => 'Sala 10']; };
$s = ['subscriptions' => ['device' => ['createdAt' => $now - 1000, 'expiresAt' => $now + 1000]]];
RoomPushStore::plan($s, [$row(1, $now - 10)], $now);
checkPush(empty($s['queue']), 'baseline does not alert old calls');
RoomPushStore::plan($s, [$row(2, $now + 5), $row(1, $now - 10)], $now + 60);
checkPush(count($s['queue']) === 1 && $s['queue']['device:2']['ticket'] === 2, 'new call queued');
unset($s['queue']['device:2']);
RoomPushStore::plan($s, [$row(2, $now + 5), $row(1, $now - 10)], $now + 120);
checkPush(empty($s['queue']), 'delivered call never queued every minute');
RoomPushStore::plan($s, [$row(3, $now + 121)], $now + 180);
$closed = $row(3, $now + 121); $closed['eligible'] = false;
RoomPushStore::plan($s, [$closed], $now + 240);
checkPush(empty($s['queue']), 'closed call removed from retry queue');
$invalid = $row(4, $now + 240); $invalid['openedAt'] = '2026-02-30 12:00:00';
RoomPushStore::plan($s, [$invalid, $row(5, $now - 10000), $row(6, $now + 10000)], $now + 300);
checkPush(empty($s['queue']), 'invalid, old and future dates ignored');
$s['subscriptions']['device']['createdAt'] = $now + 400;
RoomPushStore::plan($s, [$row(7, $now + 350)], $now + 420);
checkPush(empty($s['queue']), 'new subscription does not replay earlier calls');
$s['subscriptions']['device']['expiresAt'] = $now + 430;
RoomPushStore::plan($s, [$row(8, $now + 440)], $now + 480);
checkPush(empty($s['queue']), 'expired subscription not notified');
$fanout = ['checkedAt' => $now, 'known' => [], 'subscriptions' => [
    'phoneA' => ['email' => 'tech@school.test', 'createdAt' => $now - 10, 'expiresAt' => $now + 1000],
    'phoneB' => ['email' => 'another-tech@school.test', 'createdAt' => $now - 10, 'expiresAt' => $now + 1000],
]];
RoomPushStore::plan($fanout, [$row(9, $now + 1)], $now + 60);
checkPush(isset($fanout['queue']['phoneA:9'], $fanout['queue']['phoneB:9']), 'new ticket reaches all subscribed accounts on next scan');
checkPush($fanout['queue']['phoneA:9']['nextAt'] === $now + 60, 'delivery eligible immediately when detected');
$fanout['queue'] = [];
RoomPushStore::plan($fanout, [$row(9, $now + 1)], $now + 120);
checkPush(empty($fanout['queue']), 'no repeat delivery to any account on next scan');
// Files are isolated from Backend/data and any real subscription.
$dir = sys_get_temp_dir() . '/gcc-push-test-' . bin2hex(random_bytes(8));
putenv('GCC_PUSH_DIR=' . $dir);
try {
    RoomPushStore::transact(static function(array &$state) { $state['value'] = 7; });
    checkPush(RoomPushStore::transact(static fn(array &$state) => $state['value']) === 7, 'durable checkpoint');
    try { RoomPushStore::transact(static function(array &$state) { $state['value'] = 8; throw new RuntimeException('fail'); }); } catch (RuntimeException $expected) {}
    checkPush(RoomPushStore::transact(static fn(array &$state) => $state['value']) === 7, 'failed transaction keeps prior state');
} finally {
    foreach (glob($dir . '/*') ?: [] as $file) unlink($file);
    rmdir($dir); putenv('GCC_PUSH_DIR'); putenv('GCC_PUSH_EMAILS');
}
// A disabled installation must be inspectable even without writable push storage.
require_once __DIR__ . '/../api/room_push.php';
class AuthService { public static function context(): array { return ['email' => 'tech@school.test']; } }
class Responde { public static array $result = []; public static function ok(array $value): void { self::$result = $value; } }
$blockedDir = tempnam(sys_get_temp_dir(), 'gcc-push-blocked-');
putenv('GCC_PUSH_DIR=' . $blockedDir . '/push');
putenv('GCC_PUSH_ENABLED=0');
try {
    RoomPushEndpoint::handle('GET', $config);
    checkPush(Responde::$result['data']['enabled'] === false, 'disabled configuration remains disabled');
    checkPush(str_contains(Responde::$result['data']['message'], 'configuração'), 'configuration missing is not reported as account rejection');
    checkPush(filesize($blockedDir) === 0, 'disabled status does not write storage');
} finally { unlink($blockedDir); putenv('GCC_PUSH_DIR'); putenv('GCC_PUSH_ENABLED'); }
echo "$checks push checks passed\n";
