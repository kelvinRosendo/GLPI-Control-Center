<?php
/**
 * utils/responde.php
 * -----------------------------------------------------------------------------
 * Helpers para resposta JSON padronizada.
 */

declare(strict_types=1);

final class Responde
{
  public static function json(array $data, int $status = 200): void
  {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  public static function ok(array $data = [], int $status = 200): void
  {
    self::json(array_merge(['ok' => true], $data), $status);
  }

  public static function erro(string $message, int $status = 400, array $meta = []): void
  {
    self::json([
      'ok' => false,
      'error' => $message,
      'meta' => $meta,
    ], $status);
  }
}