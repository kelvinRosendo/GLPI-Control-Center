<?php
/**
 * api/endpoints.php
 */

declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('html_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/utils/env.php';
require_once __DIR__ . '/utils/responde.php';

Env::load(__DIR__ . '/../.env');
Env::load(__DIR__ . '/../.env.local', true);

$config = require __DIR__ . '/../config/config.php';

header('Access-Control-Allow-Origin: ' . ($config['cors']['origin'] ?? '*'));
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/client.php';
require_once __DIR__ . '/mappers.php';
require_once __DIR__ . '/tickets.php';
require_once __DIR__ . '/chat.php';

function isConfigValid(array $config): array
{
  $errors = [];
  $glpi = $config['glpi'] ?? [];

  if (empty($glpi['url']) || $glpi['url'] === 'https://seu-glpi.interno/apirest.php') {
    $errors[] = 'GLPI_URL não configurada ou usando valor padrão.';
  }
  if (empty($glpi['app_token'])) {
    $errors[] = 'GLPI_APP_TOKEN não configurado.';
  }
  if (empty($glpi['user_token'])) {
    $errors[] = 'GLPI_USER_TOKEN não configurado.';
  }

  return $errors;
}

function isComputador(string $nome): bool
{
  return preg_match('/^(CS-|CO-)/i', $nome) === 1;
}

function isGeekiee(string $nome): bool
{
  return preg_match('/^Chrome\s+G-/i', $nome) === 1;
}

function isApoio(string $nome): bool
{
  return preg_match('/^Chrome-/i', $nome) === 1;
}

function isProjetor(string $nome): bool
{
  return preg_match('/^Projetor/i', $nome) === 1;
}

final class Endpoints
{
  public static function health(): void
  {
    Responde::ok([
      'service' => 'glpi-control-center-backend',
      'time' => date('c'),
      'env' => $GLOBALS['config']['app']['env'] ?? 'dev',
    ]);
  }

  private static function getAllComputers(array $config): array
  {
    $glpi = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    $raw = $glpi->getWithParams('/Computer', $session, [
      'range' => '0-999',
      'expand_dropdowns' => 'true',
    ]);
    $glpi->killSession($session);

    return array_filter($raw, 'is_array');
  }

  private static function getComputerById(array $config, int $id): array
  {
    $glpi = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    $raw = $glpi->getWithParams("/Computer/{$id}", $session, [
      'expand_dropdowns' => 'true',
    ]);
    $glpi->killSession($session);

    if (!is_array($raw) || !isset($raw['id'])) {
      Responde::erro('Computador não encontrado no GLPI.', 404, ['glpiId' => $id]);
    }

    return $raw;
  }

  private static function parseJsonBody(): array
  {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
      return [];
    }

    $json = json_decode($raw, true);
    if (!is_array($json)) {
      Responde::erro('Corpo JSON inválido.', 400);
    }

    return $json;
  }

  public static function computers(array $config): void
  {
    $all = self::getAllComputers($config);
    $items = [];

    foreach ($all as $c) {
      $nome = trim($c['name'] ?? '');
      if (isComputador($nome)) {
        $items[] = Mappers::computer($c);
      }
    }

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  public static function computerDetails(array $config, int $id): void
  {
    $computer = self::getComputerById($config, $id);

    Responde::ok([
      'data' => Mappers::computerDetails($computer),
    ]);
  }

  public static function updateComputer(array $config, int $id): void
  {
    $body = self::parseJsonBody();
    $input = is_array($body['input'] ?? null) ? $body['input'] : $body;
    $payload = Mappers::filterEditableComputerInput($input);

    if ($payload === []) {
      Responde::erro('Nenhum campo editável foi enviado para atualização.', 422);
    }

    $glpi = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    $glpi->put("/Computer/{$id}", $session, [
      'input' => $payload,
    ]);
    $updated = $glpi->getWithParams("/Computer/{$id}", $session, [
      'expand_dropdowns' => 'true',
    ]);
    $glpi->killSession($session);

    Responde::ok([
      'message' => 'Computador atualizado com sucesso no GLPI.',
      'data' => Mappers::computerDetails($updated),
    ]);
  }

  public static function chromebooksGeekiees(array $config): void
  {
    $all = self::getAllComputers($config);
    $items = [];

    foreach ($all as $c) {
      $nome = trim($c['name'] ?? '');
      if (isGeekiee($nome)) {
        $items[] = Mappers::chromebookGeekiee($c);
      }
    }

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  public static function chromebooksApoio(array $config): void
  {
    $all = self::getAllComputers($config);
    $apoioItems = [];

    foreach ($all as $c) {
      $nome = trim($c['name'] ?? '');
      if (isApoio($nome)) {
        $apoioItems[] = $c;
      }
    }

    $carrinhos = Mappers::chromebooksApoioAgrupados($apoioItems);

    Responde::ok([
      'data' => $carrinhos,
      'count' => count($apoioItems),
    ]);
  }

  public static function projetores(array $config): void
  {
    $all = self::getAllComputers($config);
    $items = [];

    foreach ($all as $c) {
      $nome = trim($c['name'] ?? '');
      if (isProjetor($nome)) {
        $items[] = Mappers::projetor($c);
      }
    }

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  public static function impressoras(array $config): void
  {
    $glpi = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    $raw = $glpi->getWithParams('/Printer', $session, [
      'range' => '0-200',
      'expand_dropdowns' => 'true',
    ]);
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

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$uri = rtrim($uri, '/');
$normalized = str_replace('/api/endpoints.php', '', $uri);
$path = $normalized ?: '/';

try {
  $configErrors = isConfigValid($config);
  $needsGlpi = !in_array($path, ['/api/health'], true);

  if ($needsGlpi && $configErrors !== []) {
    Responde::erro(
      'Configuração do GLPI incompleta. Verifique o arquivo .env',
      500,
      ['config_errors' => $configErrors]
    );
  }

  match ($path) {
    '/api/health' => Endpoints::health(),
    '/api/assets/computers' => Endpoints::computers($config),
    '/api/assets/chromebooks-geekiees' => Endpoints::chromebooksGeekiees($config),
    '/api/assets/chromebooks-apoio' => Endpoints::chromebooksApoio($config),
    '/api/assets/projetores' => Endpoints::projetores($config),
    '/api/assets/impressoras' => Endpoints::impressoras($config),
    '/api/chat' => ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'
      ? ChatEndpoint::handle()
      : Responde::erro('Método não permitido.', 405),
    '/api/tickets' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'POST' => TicketsEndpoint::create($config),
      default => TicketsEndpoint::listAll($config),
    },
    default => (function () use ($path, $config) {
      if (preg_match('#^/api/assets/computers/(\d+)$#', $path, $m)) {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method === 'GET') {
          Endpoints::computerDetails($config, (int) $m[1]);
          return;
        }
        if ($method === 'POST' || $method === 'PUT') {
          Endpoints::updateComputer($config, (int) $m[1]);
          return;
        }
        Responde::erro('Método não permitido.', 405);
      }

      if (preg_match('#^/api/tickets/asset/(\d+)$#', $path, $m)) {
        TicketsEndpoint::listByAsset($config, (int) $m[1]);
        return;
      }

      Responde::erro('Endpoint não encontrado.', 404, ['path' => $path]);
    })(),
  };
} catch (Throwable $e) {
  $logDir = __DIR__ . '/../logs';
  if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
  }
  $logFile = $logDir . '/error_' . date('Y-m-d') . '.log';
  $logEntry = '[' . date('Y-m-d H:i:s') . '] '
    . $e->getFile() . ':' . $e->getLine() . ' '
    . $e->getMessage() . ' '
    . $e->getTraceAsString() . "\n";
  @file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);

  Responde::erro('Erro interno no backend.', 500, [
    'message' => $e->getMessage(),
  ]);
}
