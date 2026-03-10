<?php
/**
 * api/endpoints.php
 * -----------------------------------------------------------------------------
 * Roteador + endpoints do backend.
 *
 * Rotas disponíveis:
 *   GET /api/health
 *   GET /api/assets/computers
 *   GET /api/assets/chromebooks-geekiees
 *   GET /api/assets/chromebooks-apoio
 *   GET /api/assets/projetores
 *   GET /api/assets/impressoras
 */

declare(strict_types=1);

require_once __DIR__ . '/utils/env.php';
require_once __DIR__ . '/utils/responde.php';

Env::load(__DIR__ . '/../../.env');

$config = require __DIR__ . '/../../config/config.php';

// CORS
header('Access-Control-Allow-Origin: ' . ($config['cors']['origin'] ?? '*'));
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/client.php';
require_once __DIR__ . '/mappers.php';

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

  // ── computers ───────────────────────────────────────────────────────────

  public static function computers(array $config): void
  {
    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    $raw   = $glpi->get('/Computer?range=0-500&expand_dropdowns=true', $session);
    $items = [];

    foreach ($raw as $c) {
      if (is_array($c)) {
        $items[] = Mappers::computer($c);
      }
    }

    $glpi->killSession($session);
    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  // ── chromebooks geekiees ─────────────────────────────────────────────────

  public static function chromebooksGeekiees(array $config): void
  {
    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    $raw = $glpi->get(
      '/Computer?range=0-500&expand_dropdowns=true&searchText[computertypes_id]=Chromebook',
      $session
    );

    $items = [];
    foreach ($raw as $c) {
      if (!is_array($c)) continue;

      $grupo = is_string($c['groups_id'] ?? null) ? $c['groups_id'] : '';

      if (str_contains($grupo, 'Geekie') && !str_contains($grupo, 'Apoio')) {
        $items[] = Mappers::chromebookGeekiee($c);
      }
    }

    $glpi->killSession($session);
    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  // ── chromebooks apoio (carrinhos) ────────────────────────────────────────

  public static function chromebooksApoio(array $config): void
  {
    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    $raw = $glpi->get(
      '/Computer?range=0-500&expand_dropdowns=true&searchText[computertypes_id]=Chromebook',
      $session
    );

    $apoioItems = [];
    foreach ($raw as $c) {
      if (!is_array($c)) continue;

      $grupo = is_string($c['groups_id'] ?? null) ? $c['groups_id'] : '';

      if (str_contains($grupo, 'Carrinho') || str_contains($grupo, 'Apoio')) {
        $apoioItems[] = $c;
      }
    }

    $carrinhos = Mappers::chromebooksApoioAgrupados($apoioItems);

    $glpi->killSession($session);
    Responde::ok([
      'data'  => $carrinhos,
      'count' => count($apoioItems),
    ]);
  }

  // ── projetores ───────────────────────────────────────────────────────────

  public static function projetores(array $config): void
  {
    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    $raw = $glpi->get(
      '/Computer?range=0-200&expand_dropdowns=true&searchText[computertypes_id]=PROJETOR',
      $session
    );

    $items = [];
    foreach ($raw as $c) {
      if (is_array($c)) {
        $items[] = Mappers::projetor($c);
      }
    }

    $glpi->killSession($session);
    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  // ── impressoras ──────────────────────────────────────────────────────────

  public static function impressoras(array $config): void
  {
    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    $raw = $glpi->get('/Printer?range=0-200&expand_dropdowns=true', $session);

    $items = [];
    foreach ($raw as $p) {
      if (is_array($p)) {
        $items[] = Mappers::impressora($p);
      }
    }

    $glpi->killSession($session);
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
    default                            => Responde::erro('Endpoint não encontrado.', 404, ['path' => $path]),
  };
} catch (Throwable $e) {
  Responde::erro('Erro interno no backend.', 500, [
    'message' => $e->getMessage(),
  ]);
}