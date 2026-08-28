<?php

declare(strict_types=1);

final class AuthService
{
  private static ?array $context = null;

  public static function login(array $config): void
  {
    $body = self::readJsonBody();
    $credential = trim((string) ($body['credential'] ?? ''));
    if ($credential === '') {
      Responde::erro('Credencial Google obrigatória.', 422);
    }

    $claims = self::verifyGoogleCredential($credential, $config);
    self::completeLogin($claims, $config);
  }

  public static function demoLogin(array $config): void
  {
    if (($config['app']['env'] ?? 'production') === 'production') {
      Responde::erro('Login de demonstração desabilitado.', 404);
    }

    $body = self::readJsonBody();
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
      Responde::erro('E-mail inválido.', 422);
    }

    self::completeLogin([
      'sub' => 'demo:' . hash('sha256', $email),
      'email' => $email,
      'name' => trim((string) ($body['name'] ?? strstr($email, '@', true))),
      'picture' => '',
      'email_verified' => true,
    ], $config);
  }

  public static function logout(): void
  {
    self::setSessionCookie('', time() - 3600);
    Responde::ok(['message' => 'Sessão encerrada.']);
  }

  public static function requireAuthenticated(array $config, bool $requireCsrf = false): array
  {
    $token = self::bearerToken();
    if ($token === null) {
      Responde::erro('Autenticação obrigatória.', 401);
    }

    $claims = self::verifySessionToken($token, $config);
    if ($requireCsrf) {
      $provided = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
      if ($provided === '' || !hash_equals((string) ($claims['csrf'] ?? ''), $provided)) {
        Responde::erro('Token CSRF inválido.', 403);
      }
    }

    self::$context = $claims;
    return $claims;
  }

  public static function context(): ?array
  {
    return self::$context;
  }

  private static function completeLogin(array $claims, array $config): void
  {
    $email = strtolower(trim((string) ($claims['email'] ?? '')));
    if (($claims['email_verified'] ?? false) !== true || !self::domainAllowed($email, $config)) {
      Responde::erro('Conta não autorizada para este sistema.', 403);
    }

    $now = time();
    $ttl = max(900, min(43200, (int) ($config['auth']['session_ttl'] ?? 43200)));
    $csrf = self::base64UrlEncode(random_bytes(32));
    $profile = in_array($email, $config['auth']['admin_emails'] ?? [], true) ? 'ADMIN' : 'SUPORTE';
    $sessionClaims = [
      'sub' => (string) ($claims['sub'] ?? hash('sha256', $email)),
      'email' => $email,
      'name' => trim((string) ($claims['name'] ?? $email)),
      'picture' => filter_var($claims['picture'] ?? '', FILTER_VALIDATE_URL) ? (string) $claims['picture'] : '',
      'profile' => $profile,
      'csrf' => $csrf,
      'iat' => $now,
      'exp' => $now + $ttl,
    ];

    $token = self::signSessionToken($sessionClaims, $config);
    self::setSessionCookie($token, $sessionClaims['exp']);
    Responde::ok([
      'csrfToken' => $csrf,
      'expiresAt' => gmdate('c', $sessionClaims['exp']),
      'user' => [
        'id' => $sessionClaims['sub'],
        'name' => $sessionClaims['name'],
        'email' => $email,
        'picture' => $sessionClaims['picture'],
        'profile' => $profile,
      ],
    ]);
  }

  private static function verifyGoogleCredential(string $credential, array $config): array
  {
    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($credential);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 10,
      CURLOPT_SSL_VERIFYPEER => true,
      CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    $ch = null;

    if ($raw === false || $code !== 200) {
      error_log('[Auth] Falha ao validar token Google: ' . self::logValue($error ?: ('HTTP ' . $code)));
      Responde::erro('Não foi possível validar o login Google.', 401);
    }

    $claims = json_decode((string) $raw, true);
    $clientId = (string) ($config['auth']['google_client_id'] ?? '');
    if (!is_array($claims) || $clientId === '' || !hash_equals($clientId, (string) ($claims['aud'] ?? ''))) {
      Responde::erro('Credencial Google inválida para esta aplicação.', 401);
    }

    $claims['email_verified'] = filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);
    return $claims;
  }

  private static function signSessionToken(array $claims, array $config): string
  {
    $payload = self::base64UrlEncode(json_encode($claims, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $signature = hash_hmac('sha256', $payload, self::secret($config), true);
    return $payload . '.' . self::base64UrlEncode($signature);
  }

  private static function verifySessionToken(string $token, array $config): array
  {
    $parts = explode('.', $token);
    if (count($parts) !== 2) Responde::erro('Sessão inválida.', 401);
    [$payload, $signature] = $parts;
    $expected = self::base64UrlEncode(hash_hmac('sha256', $payload, self::secret($config), true));
    if (!hash_equals($expected, $signature)) Responde::erro('Sessão inválida.', 401);

    $decoded = self::base64UrlDecode($payload);
    $claims = json_decode($decoded, true);
    if (!is_array($claims) || (int) ($claims['exp'] ?? 0) <= time()) {
      Responde::erro('Sessão expirada.', 401);
    }
    return $claims;
  }

  private static function secret(array $config): string
  {
    $secret = (string) ($config['auth']['session_secret'] ?? '');
    if (strlen($secret) < 32) {
      throw new RuntimeException('AUTH_SESSION_SECRET deve ter pelo menos 32 caracteres.');
    }
    return $secret;
  }

  private static function domainAllowed(string $email, array $config): bool
  {
    $domain = strtolower((string) substr(strrchr($email, '@') ?: '', 1));
    return $domain !== '' && in_array($domain, $config['auth']['allowed_domains'] ?? [], true);
  }

  private static function bearerToken(): ?string
  {
    $header = trim((string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if (preg_match('/^Bearer\s+(.+)$/i', $header, $match) === 1) return trim($match[1]);
    $cookie = $_COOKIE['gcc_session'] ?? null;
    return is_string($cookie) && $cookie !== '' ? $cookie : null;
  }

  private static function setSessionCookie(string $token, int $expires): void
  {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    setcookie('gcc_session', $token, [
      'expires' => $expires,
      'path' => '/',
      'secure' => $https,
      'httponly' => true,
      'samesite' => 'Strict',
    ]);
  }

  private static function readJsonBody(): array
  {
    $max = 1024 * 1024;
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > $max) Responde::erro('Corpo da requisição muito grande.', 413);
    $raw = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($raw === false || strlen($raw) > $max) Responde::erro('Corpo da requisição muito grande.', 413);
    try {
      $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
      Responde::erro('Corpo JSON inválido.', 400);
    }
    return is_array($data) ? $data : [];
  }

  private static function base64UrlEncode(string $value): string
  {
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
  }

  private static function base64UrlDecode(string $value): string
  {
    return (string) base64_decode(strtr($value, '-_', '+/'), true);
  }

  private static function logValue(string $value): string
  {
    return str_replace(["\r", "\n", "\0"], ' ', substr($value, 0, 500));
  }
}
