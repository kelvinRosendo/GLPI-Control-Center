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
    $response = [
      'ok' => false,
      'error' => [
        'code'    => self::errorCodeFromStatus($status),
        'message' => $message,
      ],
    ];

    if (!empty($meta)) {
      $response['error']['details'] = $meta;
    }

    self::json($response, $status);
  }

  private static function errorCodeFromStatus(int $status): string
  {
    return match (true) {
      $status === 400 => 'BAD_REQUEST',
      $status === 401 => 'UNAUTHORIZED',
      $status === 403 => 'FORBIDDEN',
      $status === 404 => 'NOT_FOUND',
      $status === 405 => 'METHOD_NOT_ALLOWED',
      $status === 422 => 'UNPROCESSABLE_ENTITY',
      $status === 500 => 'INTERNAL_ERROR',
      $status === 502 => 'BAD_GATEWAY',
      $status === 503 => 'SERVICE_UNAVAILABLE',
      default         => 'ERROR_' . $status,
    };
  }
}