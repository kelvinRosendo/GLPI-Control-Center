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

$requestOrigin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
$allowedOrigins = $config['cors']['origins'] ?? [];
if ($requestOrigin !== '' && in_array($requestOrigin, $allowedOrigins, true)) {
  header('Access-Control-Allow-Origin: ' . $requestOrigin);
  header('Access-Control-Allow-Credentials: true');
  header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/client.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/utils/request.php';
require_once __DIR__ . '/middleware/permissions.php';
require_once __DIR__ . '/mappers.php';
require_once __DIR__ . '/classifier.php';
require_once __DIR__ . '/classification_pipeline.php';
require_once __DIR__ . '/sync.php';
require_once __DIR__ . '/sync_status.php';
require_once __DIR__ . '/tickets.php';
require_once __DIR__ . '/room_tickets.php';
require_once __DIR__ . '/workflow.php';
require_once __DIR__ . '/assistance_action.php';
require_once __DIR__ . '/integration_audit.php';
require_once __DIR__ . '/integration_audit_repository.php';
require_once __DIR__ . '/integration_audit_service.php';
require_once __DIR__ . '/chat.php';
require_once __DIR__ . '/projetors.php';
require_once __DIR__ . '/diagnostic.php';
require_once __DIR__ . '/utils/mailer.php';
require_once __DIR__ . '/utils/mail_templates.php';
require_once __DIR__ . '/services/AssetService.php';
require_once __DIR__ . '/services/AssetWriteService.php';
require_once __DIR__ . '/services/OptionsService.php';
require_once __DIR__ . '/services/CapabilitiesService.php';
require_once __DIR__ . '/services/ReconcileService.php';
require_once __DIR__ . '/services/OperationTracker.php';
require_once __DIR__ . '/services/DropdownValidator.php';
require_once __DIR__ . '/services/IdempotencyGuard.php';
require_once __DIR__ . '/services/CacheUpdater.php';
require_once __DIR__ . '/services/AIProvider.php';
require_once __DIR__ . '/services/AgentTools.php';
require_once __DIR__ . '/services/AgentProposal.php';
require_once __DIR__ . '/services/AgentExecution.php';
require_once __DIR__ . '/services/AgentService.php';
require_once __DIR__ . '/services/FieldNormalizer.php';
require_once __DIR__ . '/services/VerificationService.php';
require_once __DIR__ . '/services/BatchStore.php';

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
  $cat = Classifier::classifyComputerByName($nome);
  return $cat === Classifier::CAT_COMPUTADOR;
}

function isGeekiee(string $nome): bool
{
  return Classifier::classifyComputerByName($nome) === Classifier::CAT_ALUNOS;
}

function isApoio(string $nome): bool
{
  return Classifier::classifyComputerByName($nome) === Classifier::CAT_APOIO;
}

function isExibicao(string $nome): bool
{
  return Classifier::classifyComputerByName($nome) === Classifier::CAT_EXIBICAO;
}

function isProjetor(string $nome): bool
{
  return Classifier::classifyComputerByName($nome) === Classifier::CAT_PROJETOR;
}

function getComputerType(array $c): string
{
  $type = $c['computertypes_id'] ?? null;
  if (is_string($type) && $type !== '') {
    return strtolower(trim($type));
  }
  if (is_array($type)) {
    $name = $type['name'] ?? '';
    if (is_string($name) && $name !== '') {
      return strtolower(trim($name));
    }
  }
  return '';
}

function isProjetorType(array $c): bool
{
  return Classifier::classify($c)[0] === Classifier::CAT_PROJETOR;
}

function isImpressoraType(array $c): bool
{
  return Classifier::classify($c)[0] === Classifier::CAT_IMPRESSORA;
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
    try {
      $result = $glpi->getAllWithParams('/Computer', $session, [
        'expand_dropdowns' => 'true',
      ], 500);
      $items = $result['items'];
      $glpi->killSession($session);
      return array_filter($items, 'is_array');
    } catch (\Throwable $e) {
      $glpi->killSession($session);
      throw $e;
    }
  }

  private static function getAllPrinters(array $config): array
  {
    $glpi = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    try {
      $result = $glpi->getAllWithParams('/Printer', $session, [
        'expand_dropdowns' => 'true',
      ], 500);
      $items = $result['items'];
      $glpi->killSession($session);
      return array_filter($items, 'is_array');
    } catch (\Throwable $e) {
      $glpi->killSession($session);
      throw $e;
    }
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
    return Request::json();
  }

  public static function computers(array $config): void
  {
    $all = self::getAllComputers($config);
    $items = [];

    foreach ($all as $c) {
      [$cat] = Classifier::classify($c);
      if ($cat !== Classifier::CAT_COMPUTADOR) continue;
      $items[] = Mappers::computer($c);
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

  public static function printerDetails(array $config, int $id): void
  {
    $glpi = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    try {
      $raw = $glpi->getWithParams("/Printer/{$id}", $session, [
        'expand_dropdowns' => 'true',
      ]);
      $glpi->killSession($session);

      if (!is_array($raw) || !isset($raw['id'])) {
        Responde::erro('Impressora não encontrada no GLPI.', 404, ['glpiId' => $id]);
      }

      Responde::ok([
        'data' => Mappers::printerDetails($raw),
      ]);
    } catch (\Throwable $e) {
      $glpi->killSession($session);
      throw $e;
    }
  }

  public static function chromebooksGeekiees(array $config): void
  {
    $all = self::getAllComputers($config);
    $items = [];

    foreach ($all as $c) {
      [$cat] = Classifier::classify($c);
      if ($cat === Classifier::CAT_ALUNOS) {
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
      [$cat] = Classifier::classify($c);
      if ($cat === Classifier::CAT_APOIO) {
        $apoioItems[] = $c;
      }
    }

    $carrinhos = Mappers::chromebooksApoioAgrupados($apoioItems);

    Responde::ok([
      'data' => $carrinhos,
      'count' => count($apoioItems),
    ]);
  }

  public static function chromebooksExibicao(array $config): void
  {
    $all = self::getAllComputers($config);
    $items = [];

    foreach ($all as $c) {
      [$cat] = Classifier::classify($c);
      if ($cat === Classifier::CAT_EXIBICAO) {
        $items[] = Mappers::chromebookGeekiee($c);
      }
    }

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  public static function projetores(array $config): void
  {
    ProjectorsEndpoint::list($config);
  }

  public static function impressoras(array $config): void
  {
    $all = self::getAllPrinters($config);
    $items = [];

    foreach ($all as $p) {
      if (!is_array($p)) continue;
      $items[] = Mappers::impressora($p);
    }

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  public static function createAsset(array $config, string $itemtype): void
  {
    $body = self::parseJsonBody();
    $input = is_array($body['input'] ?? null) ? $body['input'] : $body;
    $idempotencyKey = $body['idempotency_key'] ?? null;
    $userId = AuthService::currentUserId($config) ?? 'anonymous';

    $service = new AssetWriteService($config['glpi'] ?? [], $userId);
    $result = $service->create($itemtype, $input, $idempotencyKey);

    $status = $result['status'] === 'completed_verified' ? 201 : 200;
    Responde::ok(['data' => $result], $status);
  }

  public static function updateAsset(array $config, string $itemtype, int $id): void
  {
    $body = self::parseJsonBody();
    $input = is_array($body['input'] ?? null) ? $body['input'] : $body;
    $idempotencyKey = $body['idempotency_key'] ?? null;
    $userId = AuthService::currentUserId($config) ?? 'anonymous';

    $service = new AssetWriteService($config['glpi'] ?? [], $userId);
    $result = $service->update($itemtype, $id, $input, $idempotencyKey);

    Responde::ok(['data' => $result]);
  }

  public static function deleteAsset(array $config, string $itemtype, int $id): void
  {
    $userId = AuthService::currentUserId($config) ?? 'anonymous';
    $service = new AssetWriteService($config['glpi'] ?? [], $userId);
    $result = $service->delete($itemtype, $id);

    Responde::ok(['data' => $result]);
  }

  public static function restoreAsset(array $config, string $itemtype, int $id): void
  {
    $userId = AuthService::currentUserId($config) ?? 'anonymous';
    $service = new AssetWriteService($config['glpi'] ?? [], $userId);
    $result = $service->restore($itemtype, $id);

    Responde::ok(['data' => $result]);
  }
}

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$uri = rtrim($uri, '/');
$normalized = str_replace('/api/endpoints.php', '', $uri);
$path = $normalized ?: '/';

function authorizeRequest(string $path, string $method, array $config): void
{
  if (in_array($path, ['/api/health', '/api/auth/google', '/api/auth/demo'], true)) return;

  AuthService::requireAuthenticated($config, in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true));

  if ($path === '/api/auth/logout') return;

  // Agent routes: explicit, não caem no fallback ADMIN
  if (str_starts_with($path, '/api/agent/')) {
    $agentWrite = ['/api/agent/execute', '/api/agent/execute/batch'];
    $isWrite = false;
    foreach ($agentWrite as $p) { if ($path === $p || str_starts_with($path, $p)) { $isWrite = true; break; } }
    // chat/history/status precisam assistente:chat ; propostas/execução precisam computadores:edit para write
    if ($isWrite) {
      // Requer computadores:edit ou impressoras:edit conforme alvo, mas checagem fina é no serviço; aqui exige ao menos assistente:chat
      PermissionMiddleware::requireAction('assistente', 'chat');
      return;
    }
    PermissionMiddleware::requireAction('assistente', $method === 'GET' && $path === '/api/agent/status' ? 'view' : 'chat');
    return;
  }

  if (in_array($path, ['/api/projetors/diagnostic', '/api/projetors/config', '/api/diagnostic/compare', '/api/diagnostic/export', '/api/sync/run', '/api/sync/incremental'], true)) {
    PermissionMiddleware::requireMinLevel('ADMIN');
    return;
  }

  $rules = [
    '#^/api/operations/.+$#' => ['computadores', 'view'],
    '#^/api/batches(?:/.+)?$#' => ['computadores', 'view'],
    '#^/api/assets/computers(?:/\d+/delete|/\d+/restore)?$#' => ['computadores', $method === 'GET' ? 'view' : 'edit'],
    '#^/api/assets/computers/\d+$#' => ['computadores', $method === 'GET' ? 'view' : 'edit'],
    '#^/api/assets/printers(?:/\d+/delete|/\d+/restore)?$#' => ['impressoras', $method === 'GET' ? 'view' : 'edit'],
    '#^/api/assets/printers/\d+$#' => ['impressoras', $method === 'GET' ? 'view' : 'edit'],
    '#^/api/assets/chromebooks#' => ['computadores', 'view'],
    '#^/api/assets/projetores#' => ['projetores', 'view'],
    '#^/api/assets/impressoras#' => ['impressoras', 'view'],
    '#^/api/assets/all#' => ['computadores', 'view'],
    '#^/api/sync/status#' => ['computadores', 'view'],
    '#^/api/sync/report#' => ['computadores', 'view'],
    '#^/api/sync/assets#' => ['computadores', 'view'],
    '#^/api/sync/cache-state#' => ['computadores', 'view'],
    '#^/api/projetors(?:/\d+/maintenance)?$#' => ['projetores', $method === 'GET' ? 'view' : 'maintenance'],
    '#^/api/projetors#' => ['projetores', $method === 'GET' ? 'view' : 'edit'],
    '#^/api/tickets#' => ['chamados', $method === 'GET' ? 'view' : 'create'],
    '#^/api/chat$#' => ['assistente', 'chat'],
    '#^/api/integration#' => ['integrations', $method === 'GET' ? 'view' : 'manage'],
    '#^/api/capabilities$#' => ['settings', 'view'],
    '#^/api/options#' => ['computadores', 'view'],
    '#^/api/reconcile#' => ['auditoria', 'view'],
  ];

  foreach ($rules as $pattern => [$module, $action]) {
    if (preg_match($pattern, $path) === 1) {
      PermissionMiddleware::requireAction($module, $action);
      return;
    }
  }
  PermissionMiddleware::requireMinLevel('ADMIN');
}

try {
  $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
  authorizeRequest($path, $method, $config);

  $configErrors = isConfigValid($config);
  $needsGlpi = !in_array($path, ['/api/health', '/api/auth/google', '/api/auth/demo', '/api/auth/logout'], true);

  if ($needsGlpi && $configErrors !== []) {
    Responde::erro(
      'Configuração do GLPI incompleta. Verifique o arquivo .env',
      500,
      ['config_errors' => $configErrors]
    );
  }

  match ($path) {
    '/api/health' => Endpoints::health(),
    '/api/auth/google' => $method === 'POST' ? AuthService::login($config) : Responde::erro('Método não permitido.', 405),
    '/api/auth/demo' => $method === 'POST' ? AuthService::demoLogin($config) : Responde::erro('Método não permitido.', 405),
    '/api/auth/logout' => $method === 'POST' ? AuthService::logout() : Responde::erro('Método não permitido.', 405),
    '/api/capabilities' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET' => (function () use ($config) { require __DIR__ . '/capabilities.php'; })(),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/assets/computers' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET'  => Endpoints::computers($config),
      'POST' => Endpoints::createAsset($config, 'Computer'),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/assets/chromebooks-geekiees' => Endpoints::chromebooksGeekiees($config),
    '/api/assets/chromebooks-apoio' => Endpoints::chromebooksApoio($config),
    '/api/assets/chromebooks-exibicao' => Endpoints::chromebooksExibicao($config),
    '/api/assets/projetores' => Endpoints::projetores($config),
    '/api/assets/impressoras' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET'  => Endpoints::impressoras($config),
      'POST' => Endpoints::createAsset($config, 'Printer'),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/assets/all' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET' => SyncEndpoint::assets($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/sync/status' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET' => SyncEndpoint::status($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/sync/run' => match ($_SERVER['REQUEST_METHOD'] ?? 'POST') {
      'POST' => SyncEndpoint::run($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/sync/incremental' => match ($_SERVER['REQUEST_METHOD'] ?? 'POST') {
      'POST' => SyncEndpoint::incremental($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/sync/report' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET' => SyncEndpoint::report($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/sync/cache-state' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET' => SyncEndpoint::cacheState($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/projetors' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET' => ProjectorsEndpoint::list($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/projetors/alerts' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET' => ProjectorsEndpoint::alerts($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/projetors/check' => match ($_SERVER['REQUEST_METHOD'] ?? 'POST') {
      'POST' => ProjectorsEndpoint::check($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/projetors/config' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET' => ProjectorsEndpoint::getConfig($config),
      'PUT' => ProjectorsEndpoint::updateConfig($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/projetors/diagnostic' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'GET' => ProjectorsEndpoint::diagnostic($config),
      default => Responde::erro('Método não permitido.', 405),
    },
    '/api/chat' => ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'
      ? ChatEndpoint::handle()
      : Responde::erro('Método não permitido.', 405),
    '/api/tickets/salas' => $method === 'GET'
      ? RoomTicketsEndpoint::list($config)
      : Responde::erro('Método não permitido.', 405),
    '/api/tickets' => match ($_SERVER['REQUEST_METHOD'] ?? 'GET') {
      'POST' => TicketsEndpoint::create($config),
      default => TicketsEndpoint::listAll($config),
    },
    default => (function () use ($path, $config) {
      if ($path === '/api/tickets/workflow') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        WorkflowEndpoint::create($config);
        return;
      }

      if ($path === '/api/tickets/workflow/assistance-action') {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        AssistanceActionEndpoint::register($config);
        return;
      }

      if ($path === '/api/integration/audit') {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method === 'POST') {
          IntegrationAuditController::receive($config);
          return;
        }
        if ($method === 'GET') {
          IntegrationAuditController::list($config);
          return;
        }
        Responde::erro('Método não permitido.', 405);
      }

      if (preg_match('#^/api/assets/computers/(\d+)$#', $path, $m)) {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method === 'GET') {
          Endpoints::computerDetails($config, (int) $m[1]);
          return;
        }
        if ($method === 'POST' || $method === 'PUT') {
          Endpoints::updateAsset($config, 'Computer', (int) $m[1]);
          return;
        }
        Responde::erro('Método não permitido.', 405);
      }

      if (preg_match('#^/api/assets/computers/(\d+)/delete$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        Endpoints::deleteAsset($config, 'Computer', (int) $m[1]);
        return;
      }

      if (preg_match('#^/api/assets/computers/(\d+)/restore$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        Endpoints::restoreAsset($config, 'Computer', (int) $m[1]);
        return;
      }

      if (preg_match('#^/api/assets/printers/(\d+)$#', $path, $m)) {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method === 'GET') {
          Endpoints::printerDetails($config, (int) $m[1]);
          return;
        }
        if ($method === 'POST' || $method === 'PUT') {
          Endpoints::updateAsset($config, 'Printer', (int) $m[1]);
          return;
        }
        Responde::erro('Método não permitido.', 405);
      }

      if (preg_match('#^/api/assets/printers/(\d+)/delete$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        Endpoints::deleteAsset($config, 'Printer', (int) $m[1]);
        return;
      }

      if (preg_match('#^/api/assets/printers/(\d+)/restore$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        Endpoints::restoreAsset($config, 'Printer', (int) $m[1]);
        return;
      }

      if (preg_match('#^/api/projetors/(\d+)$#', $path, $m)) {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method === 'GET') {
          ProjectorsEndpoint::detail($config, (int) $m[1]);
          return;
        }
        Responde::erro('Método não permitido.', 405);
      }

      if (preg_match('#^/api/projetors/(\d+)/lamp$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'PUT') {
          Responde::erro('Método não permitido.', 405);
        }
        ProjectorsEndpoint::updateLamp($config, (int) $m[1]);
        return;
      }

      if (preg_match('#^/api/projetors/(\d+)/maintenance$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        ProjectorsEndpoint::registerMaintenance($config, (int) $m[1]);
        return;
      }

      if (preg_match('#^/api/projetors/(\d+)/history$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
          Responde::erro('Método não permitido.', 405);
        }
        ProjectorsEndpoint::history($config, (int) $m[1]);
        return;
      }

      if (preg_match('#^/api/tickets/asset/(\d+)$#', $path, $m)) {
        TicketsEndpoint::listByAsset($config, (int) $m[1]);
        return;
      }

      if ($path === '/api/diagnostic/compare') {
        DiagnosticEndpoint::compare($config);
        return;
      }

      if ($path === '/api/diagnostic/export') {
        DiagnosticEndpoint::export($config);
        return;
      }

      if (preg_match('#^/api/options/([A-Za-z]+)$#', $path, $m)) {
        $collection = $m[1];
        if (!OptionsService::isAllowed($collection)) {
          Responde::erro("Coleção '{$collection}' não é permitida.", 404, ['allowed' => OptionsService::allowedCollections()]);
        }
        $simulated = ($_GET['simulated'] ?? '') === '1';
        if ($simulated) {
          Responde::ok(['data' => OptionsService::fixtures($collection)]);
        }
        $service = new OptionsService($config['glpi'] ?? []);
        Responde::ok(['data' => $service->fetch($collection)]);
        return;
      }

      if ($path === '/api/reconcile/compare') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
          Responde::erro('Método não permitido.', 405);
        }
        $category = $_GET['category'] ?? null;
        if ($category !== null && $category !== '') {
          $category = (string) $category;
        } else {
          $category = null;
        }
        $service = new ReconcileService($config['glpi'] ?? []);
        $result = $service->compare($category);
        Responde::ok(['data' => $result]);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // AGENTE DE IA (Sprint 06)
      // ════════════════════════════════════════════════════════════════════

      if ($path === '/api/agent/chat') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim($body['message'] ?? '');
        $context = $body['context'] ?? [];

        if ($message === '') {
          Responde::erro('Mensagem é obrigatória.', 400);
        }

        $userId = AuthService::currentUserId($config);
        $agent = new AgentService($userId);
        $result = $agent->processMessage($message, $context);
        Responde::ok($result);
        return;
      }

      if ($path === '/api/agent/status') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
          Responde::erro('Método não permitido.', 405);
        }
        $userId = AuthService::currentUserId($config);
        $agent = new AgentService($userId);
        Responde::ok(['data' => $agent->getStatus()]);
        return;
      }

      if ($path === '/api/agent/history') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
          Responde::erro('Método não permitido.', 405);
        }
        $userId = AuthService::currentUserId($config);
        $agent = new AgentService($userId);
        Responde::ok(['data' => $agent->getHistory()]);
        return;
      }

      if ($path === '/api/agent/clear') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        $userId = AuthService::currentUserId($config);
        $agent = new AgentService($userId);
        $agent->clearHistory();
        Responde::ok(['message' => 'Histórico limpo']);
        return;
      }

      if ($path === '/api/agent/proposal') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
          Responde::erro('Método não permitido.', 405);
        }
        $proposalId = $_GET['id'] ?? '';
        if ($proposalId === '') {
          Responde::erro('ID da proposta é obrigatório.', 400);
        }
        $proposal = AgentProposal::get($proposalId);
        if ($proposal === null) {
          Responde::erro('Proposta não encontrada.', 404);
        }
        if (($proposal['created_by'] ?? null) !== AuthService::currentUserId($config)) Responde::erro('Acesso negado.', 403);
        Responde::ok(['data' => $proposal]);
        return;
      }

      if ($path === '/api/agent/proposal/cancel') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $proposalId = $body['proposal_id'] ?? '';
        if ($proposalId === '') {
          Responde::erro('ID da proposta é obrigatório.', 400);
        }
        $proposal = AgentProposal::cancel($proposalId, AuthService::currentUserId($config));
        if ($proposal === null) {
          Responde::erro('Proposta não encontrada ou não pode ser cancelada.', 404);
        }
        Responde::ok(['data' => $proposal]);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // AGENTE DE IA — EXECUÇÃO (Sprint 07)
      // ════════════════════════════════════════════════════════════════════

      if ($path === '/api/agent/execute') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $proposalId = $body['proposal_id'] ?? '';
        if ($proposalId === '') {
          Responde::erro('ID da proposta é obrigatório.', 400);
        }
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $execution = new AgentExecution($config['glpi'] ?? [], $userId);
        $confirmedHash = $body['confirmed_hash'] ?? null;
        if (!is_string($confirmedHash) || !preg_match('/^[a-f0-9]{64}$/D', $confirmedHash)) Responde::erro('Confirme a prévia atual pelo painel.', 422);
        $result = $execution->executeProposal($proposalId, $confirmedHash);
        Responde::ok($result);
        return;
      }

      if ($path === '/api/agent/execute/batch') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') {
          Responde::erro('Método não permitido.', 405);
        }
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $proposalIds = $body['proposal_ids'] ?? [];
        if (empty($proposalIds) || !is_array($proposalIds)) {
          Responde::erro('proposal_ids é obrigatório e deve ser um array.', 400);
        }
        $maxBatch = 10;
        if (count($proposalIds) > $maxBatch) {
          Responde::erro("Lote máximo é {$maxBatch} itens.", 400);
        }
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $execution = new AgentExecution($config['glpi'] ?? [], $userId);
        $result = $execution->executeBatch($proposalIds, is_array($body['confirmations'] ?? null) ? $body['confirmations'] : []);
        Responde::ok($result);
        return;
      }

      if ($path === '/api/agent/policies') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
          Responde::erro('Método não permitido.', 405);
        }
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $execution = new AgentExecution($config['glpi'] ?? [], $userId);
        Responde::ok(['data' => $execution->getPolicies()]);
        return;
      }

      if ($path === '/api/agent/proposals') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
          Responde::erro('Método não permitido.', 405);
        }
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $filters = [];
        if (!empty($_GET['status'])) $filters['status'] = $_GET['status'];
        if (!empty($_GET['action'])) $filters['action'] = $_GET['action'];
        if (!empty($_GET['itemtype'])) $filters['itemtype'] = $_GET['itemtype'];
        $proposals = AgentProposal::listByUser($userId, $filters);
        Responde::ok(['data' => $proposals, 'count' => count($proposals)]);
        return;
      }

      // ── SPRINT 08: Verificação e comprovantes ───────────────────────────────
      if (preg_match('#^/api/operations/([a-f0-9\-]+)/receipt$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') Responde::erro('Método não permitido.', 405);
        $opId = $m[1];
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $tracker = new OperationTracker();
        $op = $tracker->find($opId);
        if ($op === null) Responde::erro('Operação não encontrada.', 404);
        if (($op['user_id'] ?? '') !== $userId) Responde::erro('Acesso negado.', 403);
        $vs = new VerificationService(null, $tracker);
        $receipt = $vs->verify($opId, $config['glpi'] ?? []);
        // Selecionar campos para comprovante ao usuário
        $comprovante = [
          'operation_id' => $receipt['operation_id'],
          'proposal_id' => $receipt['proposal_id'] ?? null,
          'asset' => ($receipt['itemtype'] ?? '') . ':' . ($receipt['id'] ?? ''),
          'itemtype' => $receipt['itemtype'],
          'id' => $receipt['id'],
          'action' => $receipt['action'],
          'fields_before' => $op['requested_fields'] ?? null,
          'overall' => $receipt['overall'],
          'layers' => $receipt['layers'],
          'divergences' => $receipt['divergences'],
          'cache_version' => $receipt['cache_version'],
          'verified_at' => $receipt['verified_at'],
          'link' => "/api/operations/{$opId}/receipt",
        ];
        // Mensagem humana
        $msgMap = [
          'verified' => 'operação concluída e verificada',
          'verified_glpi' => 'GLPI: valor confirmado após nova consulta',
          'verified_local' => 'operação local verificada',
          'partial_cache_pending' => 'GLPI confirmado, cache/API pendente — recuperação disponível',
          'partial_local' => 'operação local pendente',
          'divergent' => 'divergência observada entre esperado e GLPI',
          'unknown' => 'resultado desconhecido — verificar novamente',
          'failed' => 'falha de gravação',
        ];
        $comprovante['human_result'] = $msgMap[$receipt['overall']] ?? $receipt['overall'];
        Responde::ok(['data' => $comprovante]);
        return;
      }

      if (preg_match('#^/api/operations/([a-f0-9\-]+)/verify$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') Responde::erro('Método não permitido.', 405);
        $opId = $m[1];
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $tracker = new OperationTracker();
        $op = $tracker->find($opId);
        if ($op === null) Responde::erro('Operação não encontrada.', 404);
        if (($op['user_id'] ?? '') !== $userId) Responde::erro('Acesso negado.', 403);
        $vs = new VerificationService(null, $tracker);
        $result = $vs->reverify($opId, $config['glpi'] ?? []);
        Responde::ok(['data' => $result]);
        return;
      }

      if (preg_match('#^/api/operations/([a-f0-9\-]+)/recover-cache$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') Responde::erro('Método não permitido.', 405);
        $opId = $m[1];
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $tracker = new OperationTracker();
        $op = $tracker->find($opId);
        if ($op === null) Responde::erro('Operação não encontrada.', 404);
        if (($op['user_id'] ?? '') !== $userId) Responde::erro('Acesso negado.', 403);
        $vs = new VerificationService(null, $tracker);
        $result = $vs->recoverCache($opId, $config['glpi'] ?? []);
        Responde::ok(['data' => $result]);
        return;
      }

      if (preg_match('#^/api/operations/([a-f0-9\-]+)/representation$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') Responde::erro('Método não permitido.', 405);
        $vs = new VerificationService();
        $result = $vs->representation($m[1], AuthService::currentUserId($config) ?? 'anonymous');
        if (!$result['success']) Responde::erro($result['error'], 409);
        Responde::ok(['data' => $result]);
      }

      if (preg_match('#^/api/operations/([a-f0-9\-]+)/frontend-confirm$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'POST') !== 'POST') Responde::erro('Método não permitido.', 405);
        $opId = $m[1];
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $version = $body['api_version'] ?? $body['version'] ?? 'unknown';
        $vs = new VerificationService();
        $result = $vs->frontendConfirm($opId, $userId, (string)$version);
        if (!($result['success'] ?? false)) Responde::erro($result['error'] ?? 'Erro', 400);
        Responde::ok(['data' => $result]);
        return;
      }

      if (preg_match('#^/api/operations/([a-f0-9\-]+)/history$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') Responde::erro('Método não permitido.', 405);
        $opId = $m[1];
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $tracker = new OperationTracker();
        $op = $tracker->find($opId);
        if ($op === null) Responde::erro('Operação não encontrada.', 404);
        if (($op['user_id'] ?? '') !== $userId) Responde::erro('Acesso negado.', 403);
        $vs = new VerificationService(null, $tracker);
        $hist = $vs->verificationHistory($opId);
        Responde::ok(['data' => $hist, 'count' => count($hist)]);
        return;
      }

      if (preg_match('#^/api/batches/([a-zA-Z0-9_\-]+)$#', $path, $m)) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') Responde::erro('Método não permitido.', 405);
        $batchId = $m[1];
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $store = new BatchStore();
        $batch = $store->find($batchId);
        if ($batch === null) Responde::erro('Lote não encontrado.', 404);
        if (($batch['user_id'] ?? '') !== $userId) Responde::erro('Acesso negado.', 403);
        Responde::ok(['data' => $batch]);
        return;
      }

      if ($path === '/api/batches') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') Responde::erro('Método não permitido.', 405);
        $userId = AuthService::currentUserId($config) ?? 'anonymous';
        $store = new BatchStore();
        $list = $store->findByUser($userId);
        Responde::ok(['data' => $list, 'count' => count($list)]);
        return;
      }

      // ── autorização para novas rotas ───────────────────────────────────────
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

  Responde::erro('Erro interno no backend.', 500);
}
