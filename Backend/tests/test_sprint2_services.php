<?php
/**
 * tests/test_sprint2_services.php
 * -----------------------------------------------------------------------------
 * Testes dos serviços Sprint 2: Capabilities, Options, Reconcile.
 *
 * Execução: php Backend/tests/test_sprint2_services.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../api/classifier.php';
require_once __DIR__ . '/../api/classification_pipeline.php';
require_once __DIR__ . '/../config/asset-catalog.php';
require_once __DIR__ . '/../api/mappers.php';
require_once __DIR__ . '/../api/services/OptionsService.php';
require_once __DIR__ . '/../api/services/CapabilitiesService.php';

class TestSprint2
{
  private static int $passed = 0;
  private static int $failed = 0;
  private static int $total = 0;
  private static array $errors = [];

  public static function assert(bool $condition, string $message): void
  {
    self::$total++;
    if ($condition) {
      self::$passed++;
      echo "  ✓ {$message}\n";
    } else {
      self::$failed++;
      self::$errors[] = $message;
      echo "  ✗ {$message}\n";
    }
  }

  public static function assertEquals(mixed $expected, mixed $actual, string $message): void
  {
    self::assert($expected === $actual, "{$message} — esperado: " . var_export($expected, true) . ", obtido: " . var_export($actual, true));
  }

  public static function assertArrayHasKey(string|int $key, array $array, string $message): void
  {
    self::assert(array_key_exists($key, $array), $message);
  }

  public static function report(): int
  {
    echo "\n" . str_repeat('=', 60) . "\n";
    echo "RELATÓRIO DE TESTES — Sprint 2\n";
    echo str_repeat('=', 60) . "\n";
    echo "Total: " . self::$total . "\n";
    echo "Passaram: " . self::$passed . "\n";
    echo "Falharam: " . self::$failed . "\n";

    if (self::$failed > 0) {
      echo "\nErros:\n";
      foreach (self::$errors as $err) {
        echo "  - {$err}\n";
      }
    }

    echo str_repeat('=', 60) . "\n";
    return self::$failed > 0 ? 1 : 0;
  }
}

echo "\n🧪 Testes Sprint 2 — Serviços de Consulta e Reconciliação\n";
echo str_repeat('─', 60) . "\n\n";

// ══════════════════════════════════════════════════════════════════════════════
// 1. CapabilitiesService
// ══════════════════════════════════════════════════════════════════════════════

echo "── CapabilitiesService ──\n\n";

$contract = CapabilitiesService::getContract();

TestSprint2::assertArrayHasKey('version', $contract, 'Contrato tem version');
TestSprint2::assertEquals('0.3.0', $contract['version'], 'Versão do contrato = 0.3.0');

TestSprint2::assertArrayHasKey('catalog', $contract, 'Contrato tem catalog');
TestSprint2::assertArrayHasKey('version', $contract['catalog'], 'Catalog tem version');
TestSprint2::assertArrayHasKey('categories', $contract['catalog'], 'Catalog tem categories');
TestSprint2::assert(is_array($contract['catalog']['categories']), 'Categories é array');

TestSprint2::assertArrayHasKey('assetTypes', $contract, 'Contrato tem assetTypes');
TestSprint2::assertArrayHasKey('Computer', $contract['assetTypes'], 'assetTypes tem Computer');
TestSprint2::assertArrayHasKey('Printer', $contract['assetTypes'], 'assetTypes tem Printer');
TestSprint2::assert($contract['assetTypes']['Computer']['queryable'] === true, 'Computer é queryable');
TestSprint2::assert($contract['assetTypes']['Printer']['queryable'] === true, 'Printer é queryable');

TestSprint2::assertArrayHasKey('editableFields', $contract, 'Contrato tem editableFields');
TestSprint2::assertArrayHasKey('Computer', $contract['editableFields'], 'editableFields tem Computer');
TestSprint2::assertArrayHasKey('Printer', $contract['editableFields'], 'editableFields tem Printer');
TestSprint2::assertArrayHasKey('strings', $contract['editableFields']['Computer'], 'Computer tem strings');
TestSprint2::assertArrayHasKey('dropdowns', $contract['editableFields']['Computer'], 'Computer tem dropdowns');
TestSprint2::assertEquals(['name', 'serial', 'otherserial', 'contact', 'contact_num', 'comment'], array_keys($contract['editableFields']['Computer']['strings']), 'Campos string do Computer');

TestSprint2::assertArrayHasKey('auxiliaryCollections', $contract, 'Contrato tem auxiliaryCollections');
TestSprint2::assert(is_array($contract['auxiliaryCollections']), 'auxiliaryCollections é array');
TestSprint2::assert(count($contract['auxiliaryCollections']) >= 5, 'Pelo menos 5 coleções auxiliares');

TestSprint2::assertArrayHasKey('endpoints', $contract, 'Contrato tem endpoints');
TestSprint2::assertArrayHasKey('assets', $contract['endpoints'], 'Endpoints tem assets');
TestSprint2::assertArrayHasKey('auxiliary', $contract['endpoints'], 'Endpoints tem auxiliary');

TestSprint2::assertArrayHasKey('permissions', $contract, 'Contrato tem permissions');
TestSprint2::assertArrayHasKey('modules', $contract['permissions'], 'Permissions tem modules');
TestSprint2::assertArrayHasKey('profiles', $contract['permissions'], 'Permissions tem profiles');
TestSprint2::assertEquals(['ADMIN', 'SUPORTE'], $contract['permissions']['profiles'], 'Profiles = ADMIN, SUPORTE');

TestSprint2::assertArrayHasKey('stateMapping', $contract, 'Contrato tem stateMapping');
TestSprint2::assert(is_array($contract['stateMapping']), 'stateMapping é array');
TestSprint2::assert(isset($contract['stateMapping']['em uso']), 'stateMapping tem "em uso"');

// ══════════════════════════════════════════════════════════════════════════════
// 2. OptionsService
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── OptionsService ──\n\n";

$allowed = OptionsService::allowedCollections();
TestSprint2::assert(is_array($allowed), 'allowedCollections retorna array');
TestSprint2::assert(in_array('Group', $allowed), 'Group é permitido');
TestSprint2::assert(in_array('State', $allowed), 'State é permitido');
TestSprint2::assert(in_array('Location', $allowed), 'Location é permitido');
TestSprint2::assert(in_array('Manufacturer', $allowed), 'Manufacturer é permitido');
TestSprint2::assert(in_array('ComputerModel', $allowed), 'ComputerModel é permitido');
TestSprint2::assert(in_array('ComputerType', $allowed), 'ComputerType é permitido');
TestSprint2::assert(in_array('User', $allowed), 'User é permitido');
TestSprint2::assert(in_array('Entity', $allowed), 'Entity é permitido');
TestSprint2::assert(in_array('PrinterModel', $allowed), 'PrinterModel é permitido');
TestSprint2::assert(in_array('PrinterType', $allowed), 'PrinterType é permitido');
TestSprint2::assert(in_array('ItilCategory', $allowed), 'ItilCategory é permitido');
TestSprint2::assertEquals(11, count($allowed), '11 coleções permitidas');

TestSprint2::assert(OptionsService::isAllowed('Group'), 'Group é allowed');
TestSprint2::assert(!OptionsService::isAllowed('InvalidCollection'), 'InvalidCollection não é allowed');

TestSprint2::assertEquals('Grupos', OptionsService::collectionLabel('Group'), 'Label Group = Grupos');
TestSprint2::assertEquals('Estados', OptionsService::collectionLabel('State'), 'Label State = Estados');
TestSprint2::assertEquals('Localizações', OptionsService::collectionLabel('Location'), 'Label Location = Localizações');
TestSprint2::assertEquals('Categorias de Chamado', OptionsService::collectionLabel('ItilCategory'), 'Label ItilCategory');

$fixtures = OptionsService::fixtures('Group');
TestSprint2::assertArrayHasKey('items', $fixtures, 'Fixtures tem items');
TestSprint2::assertArrayHasKey('total', $fixtures, 'Fixtures tem total');
TestSprint2::assertArrayHasKey('collection', $fixtures, 'Fixtures tem collection');
TestSprint2::assertArrayHasKey('label', $fixtures, 'Fixtures tem label');
TestSprint2::assertArrayHasKey('simulated', $fixtures, 'Fixtures tem simulated');
TestSprint2::assertEquals(true, $fixtures['simulated'], 'Fixtures é simulated');
TestSprint2::assertEquals('Group', $fixtures['collection'], 'Fixtures collection = Group');
TestSprint2::assert(count($fixtures['items']) > 0, 'Group fixtures tem itens');

$stateFixtures = OptionsService::fixtures('State');
TestSprint2::assertEquals('State', $stateFixtures['collection'], 'State fixtures collection');
TestSprint2::assert(count($stateFixtures['items']) >= 4, 'State fixtures tem >= 4 itens');

$invalidFixtures = OptionsService::fixtures('NotExist');
TestSprint2::assertEquals(0, $invalidFixtures['total'], 'Fixtures inexistente retorna 0 itens');

// ══════════════════════════════════════════════════════════════════════════════
// 3. ReconcileService — lógica de diff (sem GLPI)
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── ReconcileService (diff logic) ──\n\n";

// Testa uniqueKey para reconciliação
TestSprint2::assertEquals('Computer:1', Classifier::uniqueKey(['itemtype' => 'Computer', 'id' => 1]), 'uniqueKey Computer:1');
TestSprint2::assertEquals('Printer:42', Classifier::uniqueKey(['itemtype' => 'Printer', 'id' => 42]), 'uniqueKey Printer:42');
TestSprint2::assertEquals('Computer:0', Classifier::uniqueKey(['itemtype' => 'Computer']), 'uniqueKey sem id');

// Testa classificação de ativos para reconciliação
$asset1 = Classifier::classifyAsset(['id' => 1, 'itemtype' => 'Computer', 'name' => 'Chrome G-001']);
TestSprint2::assertEquals('chromebook_student', $asset1['category'], 'Reconcile: Chrome G-001 classificado');
TestSprint2::assertEquals('Computer:1', Classifier::uniqueKey($asset1['raw']), 'Reconcile: uniqueKey preservado');

$asset2 = Classifier::classifyAsset(['id' => 2, 'itemtype' => 'Printer', 'name' => 'EPSON LX-350']);
TestSprint2::assertEquals('printer', $asset2['category'], 'Reconcile: Printer classificado');

// Testa classificação em lote para reconciliação
$batch = Classifier::classifyBatch([
  ['id' => 1, 'itemtype' => 'Computer', 'name' => 'Chrome G-001'],
  ['id' => 2, 'itemtype' => 'Computer', 'name' => 'CS-001'],
  ['id' => 3, 'itemtype' => 'Printer', 'name' => 'EPSON LX-350'],
]);
TestSprint2::assertEquals(3, $batch['stats']['total'], 'Reconcile batch: 3 total');
TestSprint2::assertEquals(3, $batch['stats']['classified'], 'Reconcile batch: 3 classificados');
TestSprint2::assertArrayHasKey('chromebook_student', $batch['stats']['byCategory'], 'Reconcile batch: tem chromebook_student');
TestSprint2::assertArrayHasKey('computer_cs', $batch['stats']['byCategory'], 'Reconcile batch: tem computer_cs');
TestSprint2::assertArrayHasKey('printer', $batch['stats']['byCategory'], 'Reconcile batch: tem printer');

// ══════════════════════════════════════════════════════════════════════════════
// 4. Integração — AssetService.fromCache (sem GLPI)
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── AssetService::fromCache ──\n\n";

$cacheDir = __DIR__ . '/../data/cache';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
$cacheFile = $cacheDir . '/classified_assets.json';

// Backup
$backup = file_exists($cacheFile) ? @file_get_contents($cacheFile) : null;

// Criar cache de teste
$testCache = [
  'items' => [
    ['id' => 1, 'itemtype' => 'Computer', 'name' => 'Chrome G-001', 'category' => 'chromebook_student'],
    ['id' => 2, 'itemtype' => 'Computer', 'name' => 'CS-001', 'category' => 'computer_cs'],
    ['id' => 3, 'itemtype' => 'Printer', 'name' => 'EPSON', 'category' => 'printer'],
  ],
  'stats' => ['total' => 3],
  'generated' => date('c'),
];
@file_put_contents($cacheFile, json_encode($testCache));

require_once __DIR__ . '/../api/services/AssetService.php';
$cached = AssetService::fromCache();
TestSprint2::assert($cached !== null, 'fromCache retorna dados');
TestSprint2::assertArrayHasKey('items', $cached, 'Cache tem items');
TestSprint2::assertEquals(3, count($cached['items']), 'Cache tem 3 items');

// Cache inexistente
@unlink($cacheFile);
$noCache = AssetService::fromCache();
TestSprint2::assert($noCache === null, 'fromCache retorna null sem cache');

// Cache corrompido
@file_put_contents($cacheFile, '{invalid}');
$badCache = AssetService::fromCache();
TestSprint2::assert($badCache === null, 'fromCache retorna null com JSON inválido');

// Restaurar
@unlink($cacheFile);
if ($backup !== null && $backup !== '') {
  @file_put_contents($cacheFile, $backup);
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. Contrato — estrutura completa
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── Contrato estrutura completa ──\n\n";

// Verificar que o contrato tem todos os campos necessários para o frontend
$requiredKeys = ['version', 'generated', 'catalog', 'assetTypes', 'editableFields', 'auxiliaryCollections', 'endpoints', 'permissions', 'stateMapping'];
foreach ($requiredKeys as $key) {
  TestSprint2::assertArrayHasKey($key, $contract, "Contrato tem chave '{$key}'");
}

// Verificar que auxiliaryCollections tem endpoint
foreach ($contract['auxiliaryCollections'] as $col) {
  TestSprint2::assertArrayHasKey('name', $col, "Coleção '{$col['name']}' tem name");
  TestSprint2::assertArrayHasKey('label', $col, "Coleção '{$col['name']}' tem label");
  TestSprint2::assertArrayHasKey('endpoint', $col, "Coleção '{$col['name']}' tem endpoint");
  TestSprint2::assert(str_starts_with($col['endpoint'], '/api/options/'), "Endpoint da coleção '{$col['name']}' começa com /api/options/");
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO FINAL
// ══════════════════════════════════════════════════════════════════════════════

$exitCode = TestSprint2::report();
exit($exitCode);
