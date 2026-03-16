config<?php
/**
 * api/endpoints.php
 */

declare(strict_types=1);

require_once __DIR__ . '/utils/env.php';
require_once __DIR__ . '/utils/responde.php';

Env::load(__DIR__ . '/../.env');

$config = require __DIR__ . '/../config/config.php';

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/client.php';
require_once __DIR__ . '/mappers.php';
require_once __DIR__ . '/tickets.php';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de classificação por nome
// Ajuste os prefixos conforme os nomes reais do seu GLPI
// ─────────────────────────────────────────────────────────────────────────────

function isComputador(string $nome): bool {
  return preg_match('/^(CS-|CO-)/i', $nome) === 1;
}

function isGeekiee(string $nome): bool {
  // Chrome G-001 até Chrome G-NNN
  return preg_match('/^Chrome\s+G-/i', $nome) === 1;
}

function isApoio(string $nome): bool {
  // Chrome-NNN (sem o "G-"), Chrome-EDU, Chrome-M, etc.
  return preg_match('/^Chrome-/i', $nome) === 1;
}

function isProjetor(string $nome): bool {
  return preg_match('/^Projetor/i', $nome) === 1;
}

// ─────────────────────────────────────────────────────────────────────────────

final class Endpoints
{
  // ── health ──────────────────────────────────────────────────────────────

  public static function health(): void
  {
    Responde::ok([
      'service' => 'glpi-control-center-backend',
      'time'    => date('c'),
    ]);
  }

  // ── busca todos os computadores de uma vez (reutilizável) ────────────────

  private static function getAllComputers(array $config): array
  {
    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    $raw     = $glpi->get('/Computer?range=0-999&expand_dropdowns=true', $session);
    $glpi->killSession($session);
    return array_filter($raw, 'is_array');
  }

  // ── computers ───────────────────────────────────────────────────────────

  public static function computers(array $config): void
  {
    $all   = self::getAllComputers($config);
    $items = [];

    foreach ($all as $c) {
      $nome = trim($c['name'] ?? '');
      if (isComputador($nome)) {
        $items[] = Mappers::computer($c);
      }
    }

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  // ── chromebooks geekiees ─────────────────────────────────────────────────

  public static function chromebooksGeekiees(array $config): void
  {
    $all   = self::getAllComputers($config);
    $items = [];

    foreach ($all as $c) {
      $nome = trim($c['name'] ?? '');
      if (isGeekiee($nome)) {
        $items[] = Mappers::chromebookGeekiee($c);
      }
    }

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  // ── chromebooks apoio ────────────────────────────────────────────────────

  public static function chromebooksApoio(array $config): void
  {
    $all        = self::getAllComputers($config);
    $apoioItems = [];

    foreach ($all as $c) {
      $nome = trim($c['name'] ?? '');
      if (isApoio($nome)) {
        $apoioItems[] = $c;
      }
    }

    $carrinhos = Mappers::chromebooksApoioAgrupados($apoioItems);

    Responde::ok([
      'data'  => $carrinhos,
      'count' => count($apoioItems),
    ]);
  }

  // ── projetores ───────────────────────────────────────────────────────────

  public static function projetores(array $config): void
  {
    $all   = self::getAllComputers($config);
    $items = [];

    foreach ($all as $c) {
      $nome = trim($c['name'] ?? '');
      if (isProjetor($nome)) {
        $items[] = Mappers::projetor($c);
      }
    }

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  // ── impressoras ──────────────────────────────────────────────────────────

  public static function impressoras(array $config): void
  {
    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    $raw     = $glpi->get('/Printer?range=0-200&expand_dropdowns=true', $session);
    $glpi->killSession($session);

    $items = [];
    foreach ($raw as $p) {
      if (is_array($p)) {
        $items[] = Mappers::impressora($p);
      }
    }

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTEAMENTO
// ─────────────────────────────────────────────────────────────────────────────

$uri        = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$uri        = rtrim($uri, '/');
$normalized = str_replace('/api/endpoints.php', '', $uri);
$path       = $normalized ?: '/';

try {
  match ($path) {
    '/api/health'                      => Endpoints::health(),
    '/api/assets/computers'            => Endpoints::computers($config),
    '/api/assets/chromebooks-geekiees' => Endpoints::chromebooksGeekiees($config),
    '/api/assets/chromebooks-apoio'    => Endpoints::chromebooksApoio($config),
    '/api/assets/projetores'           => Endpoints::projetores($config),
    '/api/assets/impressoras'          => Endpoints::impressoras($config),
        '/api/tickets'                     => match($_SERVER['REQUEST_METHOD'] ?? 'GET') {
                                            'POST'  => TicketsEndpoint::create($config),
                                            default => TicketsEndpoint::listAll($config),
                                          },
default => (function() use ($path, $config) {
               if (preg_match('#^/api/tickets/asset/(\d+)$#', $path, $m)) {
                 TicketsEndpoint::listByAsset($config, (int) $m[1]);
                 return;
               }
               Responde::erro('Endpoint não encontrado.', 404, ['path' => $path]);
             })(),
  };
  
} catch (Throwable $e) {
  Responde::erro('Erro interno no backend.', 500, [
    'message' => $e->getMessage(),
  ]);
}