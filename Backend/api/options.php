<?php
/**
 * api/options.php
 * -----------------------------------------------------------------------------
 * Endpoint: GET /api/options/{collection}
 *
 * Retorna itens de uma coleção auxiliar do GLPI.
 * Coleções permitidas: Group, State, Location, Manufacturer, ComputerModel,
 * ComputerType, User, Entity, PrinterModel, PrinterType, ItilCategory.
 *
 * Query param: ?simulated=1 retorna fixtures sem chamar GLPI.
 */

declare(strict_types=1);

require_once __DIR__ . '/services/OptionsService.php';

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$uri = rtrim($uri, '/');
$normalized = str_replace('/api/endpoints.php', '', $uri);
$path = $normalized ?: '/';

if (preg_match('#^/api/options/([A-Za-z]+)$#', $path, $m)) {
  $collection = $m[1];

  if (!OptionsService::isAllowed($collection)) {
    Responde::erro(
      "Coleção '{$collection}' não é permitida.",
      404,
      ['allowed' => OptionsService::allowedCollections()]
    );
  }

  $simulated = ($_GET['simulated'] ?? '') === '1';
  if ($simulated) {
    Responde::ok(['data' => OptionsService::fixtures($collection)]);
  }

  $config = require __DIR__ . '/../config/config.php';
  $service = new OptionsService($config['glpi'] ?? []);
  Responde::ok(['data' => $service->fetch($collection)]);
} else {
  Responde::erro('Rota inválida.', 404, ['path' => $path]);
}
