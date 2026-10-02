<?php
declare(strict_types=1);
require_once __DIR__ . '/services/RoomPushStore.php';

final class RoomPushEndpoint
{
    public static function handle(string $method, array $config): void
    {
        header('Cache-Control: no-store');
        $actor = AuthService::context() ?? [];
        $email = strtolower((string) ($actor['email'] ?? ''));
        $permitted = RoomPushStore::allowed($email, $config);
        $enabled = RoomPushStore::configured() && $permitted;
        if ($method === 'GET') {
            $checked = RoomPushStore::transact(static fn(array &$s) => $s['checkedAt'] ?? null);
            Responde::ok(['data' => ['enabled' => $enabled, 'publicKey' => $enabled ? getenv('GCC_PUSH_PUBLIC_KEY') : null,
                'workerHealthy' => $enabled && $checked && time() - $checked < 180,
                'message' => !$permitted ? 'Notificações disponíveis apenas para a equipe de TI autorizada.' : 'Notificações aguardam configuração no servidor.']]);
            return;
        }
        if ($method !== 'POST') { Responde::erro('Método não permitido.', 405); return; }
        Request::rateLimit('room-push', 20, 60);
        $body = Request::json(4096);
        try { $subscription = RoomPushStore::validate($body['subscription'] ?? []); }
        catch (InvalidArgumentException $error) { Responde::erro($error->getMessage(), 422); return; }
        $id = hash('sha256', $subscription['endpoint']);
        $remove = ($body['action'] ?? '') === 'remove';
        if (!$remove && !$enabled) { Responde::erro('Notificações ainda não habilitadas para esta conta.', 503); return; }
        $saved = RoomPushStore::transact(static function (array &$s) use ($id, $subscription, $actor, $email, $remove): bool {
            $existing = $s['subscriptions'][$id] ?? null;
            if ($remove) {
                if (($existing['email'] ?? null) === $email) unset($s['subscriptions'][$id]);
                return true;
            }
            foreach ($s['subscriptions'] ?? [] as $sid => $entry) if ($entry['expiresAt'] <= time()) unset($s['subscriptions'][$sid]);
            $owned = array_filter($s['subscriptions'] ?? [], static fn($entry) => $entry['email'] === $email);
            if (!$existing && (count($owned) >= 10 || count($s['subscriptions'] ?? []) >= 200)) return false;
            $sameOwner = ($existing['email'] ?? null) === $email;
            $s['subscriptions'][$id] = ['subscription' => $subscription, 'email' => $email,
                'session' => hash('sha256', (string) ($actor['csrf'] ?? '')),
                'createdAt' => $sameOwner ? $existing['createdAt'] : time(), 'expiresAt' => time() + 30 * 86400];
            if (!$sameOwner) foreach ($s['queue'] ?? [] as $key => $job) if ($job['sid'] === $id) unset($s['queue'][$key]);
            return true;
        });
        if (!$saved) { Responde::erro('Limite de aparelhos atingido.', 409); return; }
        Responde::ok(['data' => ['subscribed' => !$remove]]);
    }
}
