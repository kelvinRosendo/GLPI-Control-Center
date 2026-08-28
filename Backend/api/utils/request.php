<?php

declare(strict_types=1);

final class Request
{
  public static function json(int $maxBytes = 1048576): array
  {
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > $maxBytes) Responde::erro('Corpo da requisição muito grande.', 413);
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) Responde::erro('Corpo da requisição muito grande.', 413);
    if (trim($raw) === '') return [];
    try {
      $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
      Responde::erro('Corpo JSON inválido.', 400);
    }
    return is_array($data) ? $data : [];
  }

  public static function rateLimit(string $scope, int $limit, int $windowSeconds): void
  {
    $identity = (string) (AuthService::context()['sub'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'anonymous'));
    $key = hash('sha256', $scope . '|' . $identity);
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gcc-rate-limits';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $file = $dir . DIRECTORY_SEPARATOR . $key . '.json';
    $handle = fopen($file, 'c+');
    if ($handle === false) return;
    flock($handle, LOCK_EX);
    $raw = stream_get_contents($handle);
    $entries = json_decode($raw ?: '[]', true);
    $now = time();
    $entries = array_values(array_filter(is_array($entries) ? $entries : [], static fn($time): bool => (int) $time > $now - $windowSeconds));
    if (count($entries) >= $limit) {
      flock($handle, LOCK_UN);
      fclose($handle);
      header('Retry-After: ' . $windowSeconds);
      Responde::erro('Muitas requisições. Tente novamente em instantes.', 429);
    }
    $entries[] = $now;
    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, json_encode($entries));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
  }
}
