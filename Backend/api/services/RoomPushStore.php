<?php
declare(strict_types=1);

/** Private, persistent subscriptions and delivery checkpoints. Never store under Frontend. */
final class RoomPushStore
{
    public static function dir(): string
    {
        return rtrim(getenv('GCC_PUSH_DIR') ?: __DIR__ . '/../../data/push', '/\\');
    }

    public static function transact(callable $operation): mixed
    {
        $dir = self::dir();
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) throw new RuntimeException('Push storage unavailable');
        $lock = fopen($dir . '/state.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Push lock unavailable');
        try {
            $path = $dir . '/state.json';
            $state = is_file($path) ? json_decode((string) file_get_contents($path), true, 64, JSON_THROW_ON_ERROR) : [];
            if (!is_array($state)) throw new RuntimeException('Invalid push state');
            $result = $operation($state);
            $temp = tempnam($dir, '.state-');
            if ($temp === false) throw new RuntimeException('Push storage unavailable');
            try {
                chmod($temp, 0600);
                $json = json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
                if (file_put_contents($temp, $json) !== strlen($json) || !rename($temp, $path)) throw new RuntimeException('Push storage write failed');
            } finally { if (is_file($temp)) unlink($temp); }
            return $result;
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    public static function allowed(string $email, array $config): bool
    {
        $allowed = array_filter(array_map('trim', explode(',', strtolower(getenv('GCC_PUSH_EMAILS') ?: ''))));
        $domain = strtolower(substr(strrchr($email, '@') ?: '', 1));
        return in_array(strtolower($email), $allowed, true)
            && in_array($domain, $config['auth']['allowed_domains'] ?? [], true);
    }

    public static function configured(): bool
    {
        return PHP_VERSION_ID >= 80200 && (getenv('GCC_PUSH_ENABLED') === '1') && (bool) getenv('GCC_PUSH_PUBLIC_KEY')
            && (bool) getenv('GCC_PUSH_PRIVATE_KEY') && (bool) getenv('GCC_PUSH_SUBJECT')
            && is_file(__DIR__ . '/../../vendor/autoload.php');
    }

    public static function validate(array $input): array
    {
        $endpoint = $input['endpoint'] ?? '';
        if (!is_string($endpoint) || strlen($endpoint) > 2048) throw new InvalidArgumentException('Inscrição inválida.');
        $url = parse_url($endpoint);
        $host = strtolower($url['host'] ?? '');
        $provider = $host === 'fcm.googleapis.com' || $host === 'updates.push.services.mozilla.com'
            || preg_match('/^[a-z0-9-]+\.push\.apple\.com$/D', $host)
            || preg_match('/^[a-z0-9.-]+\.notify\.windows\.com$/D', $host);
        if (!$provider || ($url['scheme'] ?? '') !== 'https' || isset($url['user']) || isset($url['pass'])
            || isset($url['port']) || isset($url['fragment']) || empty($url['path'])) throw new InvalidArgumentException('Provedor de notificações não suportado.');
        $keys = [];
        foreach (['p256dh' => 65, 'auth' => 16] as $key => $length) {
            $value = $input['keys'][$key] ?? '';
            $raw = is_string($value) && preg_match('/^[A-Za-z0-9_-]+={0,2}$/D', $value)
                ? base64_decode(strtr($value, '-_', '+/'), true) : false;
            if ($raw === false || strlen($raw) !== $length || ($key === 'p256dh' && ord($raw[0]) !== 4)) throw new InvalidArgumentException('Chave de notificação inválida.');
            $keys[$key] = $value;
        }
        return ['endpoint' => $endpoint, 'keys' => $keys];
    }

    public static function revokeSession(): void
    {
        if (!is_dir(self::dir())) return;
        $session = hash('sha256', (string) (AuthService::context()['csrf'] ?? ''));
        self::transact(static function (array &$state) use ($session): void {
            foreach ($state['subscriptions'] ?? [] as $id => $entry) {
                if (($entry['session'] ?? '') === $session) unset($state['subscriptions'][$id]);
            }
        });
    }

    /** Called after a complete GLPI read. First read establishes a baseline only. */
    public static function plan(array &$state, array $rows, int $now): void
    {
        $previous = $state['checkedAt'] ?? null;
        $known = $state['known'] ?? [];
        $current = [];
        foreach ($rows as $row) {
            $id = (string) (int) ($row['id'] ?? 0);
            $current[$id] = !empty($row['eligible']) && empty($row['acknowledgement']);
            $opened = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', (string) ($row['openedAt'] ?? ''), new DateTimeZone('America/Sao_Paulo'));
            if (!$previous || isset($known[$id]) || !$current[$id] || !$opened
                || $opened->format('Y-m-d H:i:s') !== ($row['openedAt'] ?? '')
                || $opened->getTimestamp() < max((int) $previous - 120, $now - 900) || $opened->getTimestamp() > $now + 60) continue;
            foreach ($state['subscriptions'] ?? [] as $sid => $entry) {
                if ($entry['expiresAt'] <= $now || $entry['createdAt'] > $opened->getTimestamp()) continue;
                $key = $sid . ':' . $id;
                // Only room + id appear on the lock screen; descriptions stay authenticated.
                $state['queue'][$key] = ['sid' => $sid, 'ticket' => (int) $id, 'room' => mb_substr((string) ($row['room'] ?? 'Chamado de sala'), 0, 80),
                    'expiresAt' => $now + 900, 'attempts' => 0, 'nextAt' => $now];
            }
        }
        $state['known'] = $current;
        $state['checkedAt'] = $now;
        foreach ($state['queue'] ?? [] as $key => $job) {
            if ($job['expiresAt'] <= $now || !isset($state['subscriptions'][$job['sid']]) || empty($current[(string) $job['ticket']])) unset($state['queue'][$key]);
        }
    }
}
