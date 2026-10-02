<?php
declare(strict_types=1);
// Read-only GLPI polling, independent of any browser or logged-in session.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../api/utils/env.php';
Env::load(__DIR__ . '/../.env');
Env::load(__DIR__ . '/../.env.local', true);
require_once __DIR__ . '/../api/client.php';
require_once __DIR__ . '/../api/services/AssetService.php';
require_once __DIR__ . '/../api/room_tickets.php';
require_once __DIR__ . '/../api/services/RoomPushStore.php';
if (!RoomPushStore::configured()) { fwrite(STDERR, "Push não configurado.\n"); exit(1); }
require_once __DIR__ . '/../vendor/autoload.php';
$config = require __DIR__ . '/../config/config.php';
RoomPushStore::transact(static fn(array &$s) => null);
$lock = fopen(RoomPushStore::dir() . '/worker.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0);
try {
    $snapshot = RoomTicketsEndpoint::snapshot($config, RoomTicketsService::filters([]), 10000);
    if (!$snapshot || empty($snapshot['meta']['complete'])) throw new RuntimeException('Incomplete GLPI read');
    $jobs = RoomPushStore::transact(static function (array &$s) use ($snapshot, $config): array {
        foreach ($s['subscriptions'] ?? [] as $sid => $entry) {
            if ($entry['expiresAt'] <= time() || !RoomPushStore::allowed($entry['email'], $config)) unset($s['subscriptions'][$sid]);
        }
        RoomPushStore::plan($s, $snapshot['monitor']['recent'] ?? [], time());
        return array_slice($s['queue'] ?? [], 0, 100, true);
    });
    $sender = new Minishlink\WebPush\WebPush(['VAPID' => [
        'subject' => getenv('GCC_PUSH_SUBJECT'), 'publicKey' => getenv('GCC_PUSH_PUBLIC_KEY'),
        'privateKey' => getenv('GCC_PUSH_PRIVATE_KEY'),
    ]], ['TTL' => 300, 'urgency' => 'high'], 8, ['allow_redirects' => false, 'connect_timeout' => 5]);
    foreach ($jobs as $key => $job) {
        if ($job['nextAt'] > time()) continue;
        $entry = RoomPushStore::transact(static fn(array &$s) => $s['subscriptions'][$job['sid']] ?? null);
        if (!$entry) continue;
        $subscription = Minishlink\WebPush\Subscription::create($entry['subscription']);
        try {
            $report = $sender->sendOneNotification($subscription, json_encode([
                'title' => 'Novo chamado · ' . $job['room'],
                'body' => 'Chamado #' . $job['ticket'] . '. Abra o GCC para atender.',
                'ticketId' => $job['ticket'],
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
            $success = $report->isSuccess();
            $expired = $report->isSubscriptionExpired();
        } catch (Throwable $error) { $success = false; $expired = false; }
        RoomPushStore::transact(static function (array &$s) use ($key, $job, $entry, $success, $expired): void {
            if (($s['subscriptions'][$job['sid']]['session'] ?? null) !== $entry['session']) return;
            if ($expired) unset($s['subscriptions'][$job['sid']]);
            if ($success || $expired || $job['attempts'] >= 3) unset($s['queue'][$key]);
            elseif (isset($s['queue'][$key])) {
                $s['queue'][$key]['attempts']++;
                $s['queue'][$key]['nextAt'] = time() + 60 * (2 ** $job['attempts']);
            }
            $s['lastDeliveryAt'] = time();
            $s['lastDeliveryOk'] = $success;
        });
    }
    echo "Consulta e fila push processadas.\n";
} catch (Throwable $error) {
    // Never log subscription URLs, credentials or upstream responses.
    fwrite(STDERR, 'Falha no worker push: ' . get_class($error) . "\n");
    exit(1);
} finally { flock($lock, LOCK_UN); fclose($lock); }
