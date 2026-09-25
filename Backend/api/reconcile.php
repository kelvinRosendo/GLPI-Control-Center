<?php
/**
 * api/reconcile.php
 * -----------------------------------------------------------------------------
 * Endpoint: GET /api/reconcile/compare
 *
 * Compara ativos do GLPI (fonte oficial) com o cache/classified do GCC.
 *
 * Query params:
 *   ?category=chromebook_student  (opcional, filtra por categoria)
 */

declare(strict_types=1);

require_once __DIR__ . '/services/ReconcileService.php';

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$uri = rtrim($uri, '/');
$normalized = str_replace('/api/endpoints.php', '', $uri);
$path = $normalized ?: '/';

if ($path === '/api/reconcile/compare') {
  $category = $_GET['category'] ?? null;
  if ($category !== null && $category !== '') {
    $category = (string) $category;
  } else {
    $category = null;
  }

  $config = require __DIR__ . '/../config/config.php';
  $service = new ReconcileService($config['glpi'] ?? []);
  $result = $service->compare($category);

  Responde::ok(['data' => $result]);
} else {
  Responde::erro('Rota de reconciliação não encontrada.', 404, ['path' => $path]);
}
