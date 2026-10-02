<?php
declare(strict_types=1);
// Actual vendor encryption and VAPID; Guzzle transport is mocked, no push is sent.
require __DIR__ . '/../vendor/autoload.php';
$keys = Minishlink\WebPush\VAPID::createVapidKeys();
$clientKeys = Minishlink\WebPush\VAPID::createVapidKeys();
$history = [];
$handler = GuzzleHttp\HandlerStack::create(new GuzzleHttp\Handler\MockHandler([
    new GuzzleHttp\Psr7\Response(201), new GuzzleHttp\Psr7\Response(410),
]));
$handler->push(GuzzleHttp\Middleware::history($history));
$sender = new Minishlink\WebPush\WebPush(['VAPID' => [
    'subject' => 'mailto:ti@example.test', 'publicKey' => $keys['publicKey'], 'privateKey' => $keys['privateKey'],
]], ['TTL' => 300, 'urgency' => 'high'], 8, ['handler' => $handler, 'allow_redirects' => false]);
$subscription = Minishlink\WebPush\Subscription::create([
    'endpoint' => 'https://fcm.googleapis.com/fcm/send/offline-test',
    'keys' => ['p256dh' => $clientKeys['publicKey'], 'auth' => rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '=')],
]);
$payload = '{"title":"Novo chamado","ticketId":80}';
$ok = $sender->sendOneNotification($subscription, $payload);
$gone = $sender->sendOneNotification($subscription, $payload);
if (!$ok->isSuccess() || !$gone->isSubscriptionExpired()) throw new RuntimeException('Delivery response contract');
$request = $history[0]['request'];
if ($request->getHeaderLine('Content-Encoding') !== 'aes128gcm'
    || !str_starts_with($request->getHeaderLine('Authorization'), 'vapid ')
    || str_contains((string) $request->getBody(), 'Novo chamado')) throw new RuntimeException('Encryption/VAPID contract');
echo "Web Push encryption, VAPID and 201/410 transport contract OK (no network).\n";
