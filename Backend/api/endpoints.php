<?php
/**
 * api/endpoints.php
 * -----------------------------------------------------------------------------
 * Roteador simples + endpoints do backend.
 *
 * Rotas:
 * - GET /api/health
 * - GET /api/assets/computers
 */

declare(strict_types=1);

// Utils
require_once __DIR__ . '/utils/env.php';
require_once __DIR__ . '/utils/responde.php';

// Carrega .env (fica em Backend/.env)s
Env::load(__DIR__ . '/../.env');

// Config
$config = require __DIR__ . '/../config/config.php';

// CORS (básico)
header('Access-Control-Allow-Origin: ' . ($config['cors']['origin'] ?? '*'));
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

// Módulos GLPI
require_once __DIR__ . '/client.php';
require_once __DIR__ . '/mappers.php';

final class Endpoints
{
  public static function health(): void
  {
    Responde::ok([
      'service' => 'glpi-control-center-backend',
      'time' => date('c'),
    ]);
  }

  public static function computers(array $config): void
  {
    $glpi = new GlpiClient($config['glpi'] ?? []);

    $session = $glpi->initSession();

    // range pode ser aumentado depois
    $raw = $glpi->get('/Computer?range=0-200&expand_dropdowns=true', $session);

    $items = [];
    foreach ($raw as $c) {
      if (is_array($c)) {
        $items[] = Mappers::computer($c);
      }
    }

    $glpi->killSession($session);

    Responde::ok([
      'data' => $items,
      'count' => count($items),
    ]);
  }
}

/**
 * -----------------------------------------------------------------------------
 * ROTEAMENTO
 * -----------------------------------------------------------------------------
 */

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$uri = rtrim($uri, '/');

// Como você pode acessar /api/endpoints.php, vamos permitir os 2 formatos:
// - /api/health
// - /api/endpoints.php/api/health
$normalized = str_replace('/api/endpoints.php', '', $uri);
$path = $normalized ?: '/';

try {
  if ($path === '/api/health') {
    Endpoints::health();
  }

  if ($path === '/api/assets/computers') {
    Endpoints::computers($config);
  }

  Responde::erro('Endpoint não encontrado.', 404, ['path' => $path]);
} catch (Throwable $e) {
  Responde::erro('Erro interno no backend.', 500, [
    'message' => $e->getMessage(),
  ]);
}