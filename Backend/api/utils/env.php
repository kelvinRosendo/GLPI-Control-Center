<?php
/**
 * utils/env.php
 * -----------------------------------------------------------------------------
 * Loader simples de arquivo .env (sem bibliotecas).
 * - Lê linhas no formato: CHAVE=VALOR
 * - Ignora comentários (#) e linhas vazias
 */

declare(strict_types=1);

final class Env
{
  public static function load(string $path, bool $override = false): void
  {
    if (!file_exists($path)) return;

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) return;

    foreach ($lines as $line) {
      $line = trim($line);

      if ($line === '' || str_starts_with($line, '#')) continue;

      $pos = strpos($line, '=');
      if ($pos === false) continue;

      $key = trim(substr($line, 0, $pos));
      $val = trim(substr($line, $pos + 1));

      $val = trim($val, "\"'");
      if ($key === '') continue;

      if ($override || getenv($key) === false) {
        putenv($key . '=' . $val);
        $_ENV[$key] = $val;
      }
    }
  }
}
