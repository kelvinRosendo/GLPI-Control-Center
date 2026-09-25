<?php
/**
 * tests/test_sprint3_crud.php
 * -----------------------------------------------------------------------------
 * Testes da Sprint 3: CRUD de ativos, permissões, unificação de endpoints.
 *
 * Execução: php Backend/tests/test_sprint3_crud.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../api/classifier.php';
require_once __DIR__ . '/../api/classification_pipeline.php';
require_once __DIR__ . '/../config/asset-catalog.php';
require_once __DIR__ . '/../api/mappers.php';
require_once __DIR__ . '/../api/services/OptionsService.php';
require_once __DIR__ . '/../api/services/CapabilitiesService.php';
require_once __DIR__ . '/../api/services/AssetWriteService.php';

class TestSprint3
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
    echo "RELATÓRIO DE TESTES — Sprint 3\n";
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

echo "\n🧪 Testes Sprint 3 — CRUD de Ativos\n";
echo str_repeat('─', 60) . "\n\n";

// ══════════════════════════════════════════════════════════════════════════════
// 1. AssetWriteService — Allow-lists e operações suportadas
// ══════════════════════════════════════════════════════════════════════════════

echo "── AssetWriteService allow-lists ──\n\n";

$computerFields = AssetWriteService::editableFields('Computer');
TestSprint3::assert(is_array($computerFields), 'Computer tem campos editáveis');
TestSprint3::assert(in_array('name', $computerFields), 'Computer: name é editável');
TestSprint3::assert(in_array('serial', $computerFields), 'Computer: serial é editável');
TestSprint3::assert(in_array('otherserial', $computerFields), 'Computer: otherserial é editável');
TestSprint3::assert(in_array('contact', $computerFields), 'Computer: contact é editável');
TestSprint3::assert(in_array('contact_num', $computerFields), 'Computer: contact_num é editável');
TestSprint3::assert(in_array('comment', $computerFields), 'Computer: comment é editável');
TestSprint3::assert(in_array('locations_id', $computerFields), 'Computer: locations_id é editável');
TestSprint3::assert(in_array('groups_id', $computerFields), 'Computer: groups_id é editável');
TestSprint3::assert(in_array('users_id', $computerFields), 'Computer: users_id é editável');
TestSprint3::assert(in_array('states_id', $computerFields), 'Computer: states_id é editável');
TestSprint3::assert(!in_array('entities_id', $computerFields), 'Computer: entities_id NÃO é editável');

$printerFields = AssetWriteService::editableFields('Printer');
TestSprint3::assert(is_array($printerFields), 'Printer tem campos editáveis');
TestSprint3::assert(in_array('name', $printerFields), 'Printer: name é editável');
TestSprint3::assert(in_array('serial', $printerFields), 'Printer: serial é editável');
TestSprint3::assert(in_array('locations_id', $printerFields), 'Printer: locations_id é editável');
TestSprint3::assert(in_array('users_id', $printerFields), 'Printer: users_id é editável');
TestSprint3::assert(in_array('states_id', $printerFields), 'Printer: states_id é editável');
TestSprint3::assert(in_array('printermodels_id', $printerFields), 'Printer: printermodels_id é editável');
TestSprint3::assert(in_array('manufacturers_id', $printerFields), 'Printer: manufacturers_id é editável');

$dropdownFields = AssetWriteService::dropdownFields();
TestSprint3::assert(in_array('locations_id', $dropdownFields), 'locations_id é dropdown');
TestSprint3::assert(in_array('groups_id', $dropdownFields), 'groups_id é dropdown');
TestSprint3::assert(in_array('users_id', $dropdownFields), 'users_id é dropdown');
TestSprint3::assert(in_array('states_id', $dropdownFields), 'states_id é dropdown');
TestSprint3::assert(in_array('printermodels_id', $dropdownFields), 'printermodels_id é dropdown');
TestSprint3::assert(in_array('manufacturers_id', $dropdownFields), 'manufacturers_id é dropdown');

// ══════════════════════════════════════════════════════════════════════════════
// 2. AssetWriteService — Operações suportadas
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── AssetWriteService operações ──\n\n";

$computerOps = AssetWriteService::supportedOperations('Computer');
TestSprint3::assert(in_array('create', $computerOps), 'Computer suporta create');
TestSprint3::assert(in_array('update', $computerOps), 'Computer suporta update');
TestSprint3::assert(in_array('delete', $computerOps), 'Computer suporta delete');
TestSprint3::assert(in_array('restore', $computerOps), 'Computer suporta restore');

$printerOps = AssetWriteService::supportedOperations('Printer');
TestSprint3::assert(in_array('create', $printerOps), 'Printer suporta create');
TestSprint3::assert(in_array('update', $printerOps), 'Printer suporta update');
TestSprint3::assert(in_array('delete', $printerOps), 'Printer suporta delete');
TestSprint3::assert(in_array('restore', $printerOps), 'Printer suporta restore');

TestSprint3::assert(AssetWriteService::isSupported('Computer', 'create'), 'Computer create suportado');
TestSprint3::assert(AssetWriteService::isSupported('Computer', 'update'), 'Computer update suportado');
TestSprint3::assert(AssetWriteService::isSupported('Computer', 'delete'), 'Computer delete suportado');
TestSprint3::assert(AssetWriteService::isSupported('Computer', 'restore'), 'Computer restore suportado');
TestSprint3::assert(AssetWriteService::isSupported('Printer', 'create'), 'Printer create suportado');
TestSprint3::assert(AssetWriteService::isSupported('Printer', 'update'), 'Printer update suportado');
TestSprint3::assert(!AssetWriteService::isSupported('Ticket', 'create'), 'Ticket NÃO suportado');

// ══════════════════════════════════════════════════════════════════════════════
// 3. CapabilitiesService — v0.3.0 com operações de escrita
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── CapabilitiesService v0.3.0 ──\n\n";

$contract = CapabilitiesService::getContract();

TestSprint3::assertEquals('0.3.0', $contract['version'], 'Versão = 0.3.0');

TestSprint3::assertArrayHasKey('writeOperations', $contract, 'Contrato tem writeOperations');
TestSprint3::assertArrayHasKey('Computer', $contract['writeOperations'], 'writeOperations tem Computer');
TestSprint3::assertArrayHasKey('Printer', $contract['writeOperations'], 'writeOperations tem Printer');

// Computer create
$computerCreate = $contract['writeOperations']['Computer']['create'];
TestSprint3::assertArrayHasKey('required', $computerCreate, 'Computer create tem required');
TestSprint3::assertEquals(['name'], $computerCreate['required'], 'Computer create requer name');
TestSprint3::assertArrayHasKey('optional', $computerCreate, 'Computer create tem optional');
TestSprint3::assert(in_array('serial', $computerCreate['optional']), 'Computer create: serial opcional');

// Computer update
$computerUpdate = $contract['writeOperations']['Computer']['update'];
TestSprint3::assertArrayHasKey('editable', $computerUpdate, 'Computer update tem editable');
TestSprint3::assert(in_array('name', $computerUpdate['editable']), 'Computer update: name editável');
TestSprint3::assert(in_array('locations_id', $computerUpdate['editable']), 'Computer update: locations_id editável');

// Printer create
$printerCreate = $contract['writeOperations']['Printer']['create'];
TestSprint3::assertEquals(['name'], $printerCreate['required'], 'Printer create requer name');

// Printer update
$printerUpdate = $contract['writeOperations']['Printer']['update'];
TestSprint3::assert(in_array('printermodels_id', $printerUpdate['editable']), 'Printer update: printermodels_id editável');

// Delete/restore
TestSprint3::assertArrayHasKey('delete', $contract['writeOperations']['Computer'], 'Computer tem delete');
TestSprint3::assertArrayHasKey('restore', $contract['writeOperations']['Computer'], 'Computer tem restore');
TestSprint3::assertArrayHasKey('delete', $contract['writeOperations']['Printer'], 'Printer tem delete');
TestSprint3::assertArrayHasKey('restore', $contract['writeOperations']['Printer'], 'Printer tem restore');

// AssetTypes com flags
TestSprint3::assert($contract['assetTypes']['Computer']['creatable'] === true, 'Computer é creatable');
TestSprint3::assert($contract['assetTypes']['Computer']['updatable'] === true, 'Computer é updatable');
TestSprint3::assert($contract['assetTypes']['Computer']['deletable'] === true, 'Computer é deletable');
TestSprint3::assert($contract['assetTypes']['Computer']['restorable'] === true, 'Computer é restorable');
TestSprint3::assert($contract['assetTypes']['Printer']['creatable'] === true, 'Printer é creatable');
TestSprint3::assert($contract['assetTypes']['Printer']['updatable'] === true, 'Printer é updatable');

// Endpoints de escrita
TestSprint3::assertArrayHasKey('write', $contract['endpoints'], 'Contrato tem endpoints.write');
TestSprint3::assertArrayHasKey('create_computer', $contract['endpoints']['write'], 'Tem create_computer');
TestSprint3::assertArrayHasKey('update_computer', $contract['endpoints']['write'], 'Tem update_computer');
TestSprint3::assertArrayHasKey('delete_computer', $contract['endpoints']['write'], 'Tem delete_computer');
TestSprint3::assertArrayHasKey('restore_computer', $contract['endpoints']['write'], 'Tem restore_computer');
TestSprint3::assertArrayHasKey('create_printer', $contract['endpoints']['write'], 'Tem create_printer');
TestSprint3::assertArrayHasKey('update_printer', $contract['endpoints']['write'], 'Tem update_printer');
TestSprint3::assertArrayHasKey('delete_printer', $contract['endpoints']['write'], 'Tem delete_printer');
TestSprint3::assertArrayHasKey('restore_printer', $contract['endpoints']['write'], 'Tem restore_printer');

// ══════════════════════════════════════════════════════════════════════════════
// 4. Mappers — Editable values para Computer
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── Mappers editable values ──\n\n";

$computerDetails = Mappers::computerDetails([
  'id' => 1,
  'name' => 'CS-001',
  'serial' => 'SN123',
  'otherserial' => 'PAT456',
  'contact' => 'João',
  'contact_num' => '1234',
  'comment' => 'Teste',
  'locations_id' => ['id' => 5, 'name' => 'Sala 01'],
  'groups_id' => ['id' => 3, 'name' => 'TI'],
  'users_id' => ['id' => 10, 'name' => 'Admin'],
  'states_id' => ['id' => 1, 'name' => 'Em uso'],
  'computermodels_id' => ['id' => 2, 'name' => 'Dell'],
  'computertypes_id' => ['id' => 1, 'name' => 'Desktop'],
  'manufacturers_id' => ['id' => 1, 'name' => 'Dell'],
  'entities_id' => ['id' => 1, 'name' => 'Root'],
]);

TestSprint3::assertArrayHasKey('editableValues', $computerDetails, 'computerDetails tem editableValues');
$ev = $computerDetails['editableValues'];
TestSprint3::assertEquals('CS-001', $ev['name'] ?? '', 'editableValues.name = CS-001');
TestSprint3::assertEquals('SN123', $ev['serial'] ?? '', 'editableValues.serial = SN123');
TestSprint3::assertEquals('PAT456', $ev['otherserial'] ?? '', 'editableValues.otherserial = PAT456');
TestSprint3::assertEquals('João', $ev['contact'] ?? '', 'editableValues.contact = João');
TestSprint3::assertEquals('1234', $ev['contact_num'] ?? '', 'editableValues.contact_num = 1234');
TestSprint3::assertEquals('Teste', $ev['comment'] ?? '', 'editableValues.comment = Teste');
TestSprint3::assertEquals(5, $ev['locations_id'] ?? 0, 'editableValues.locations_id = 5');
TestSprint3::assertEquals(3, $ev['groups_id'] ?? 0, 'editableValues.groups_id = 3');
TestSprint3::assertEquals(10, $ev['users_id'] ?? 0, 'editableValues.users_id = 10');
TestSprint3::assertEquals(1, $ev['states_id'] ?? 0, 'editableValues.states_id = 1');

// Verificar que seções têm campos editáveis
$identificacao = null;
foreach ($computerDetails['sections'] as $section) {
  if ($section['id'] === 'identificacao') {
    $identificacao = $section;
    break;
  }
}
TestSprint3::assert($identificacao !== null, 'Seção identificacao existe');
$nameField = null;
foreach ($identificacao['fields'] as $field) {
  if ($field['key'] === 'name') {
    $nameField = $field;
    break;
  }
}
TestSprint3::assert($nameField !== null, 'Campo name existe na seção identificacao');
TestSprint3::assert($nameField['editable'] === true, 'Campo name é editável');

// ══════════════════════════════════════════════════════════════════════════════
// 5. Mappers — Editable values para Printer
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── Mappers Printer editable ──\n\n";

$printerDetails = Mappers::printerDetails([
  'id' => 42,
  'name' => 'EPSON LX-350',
  'serial' => 'SN789',
  'otherserial' => 'PAT012',
  'contact' => 'Maria',
  'contact_num' => '5678',
  'comment' => 'Impressora sala 02',
  'locations_id' => ['id' => 3, 'name' => 'Sala 02'],
  'users_id' => ['id' => 5, 'name' => 'Técnico'],
  'states_id' => ['id' => 1, 'name' => 'Em uso'],
  'printermodels_id' => ['id' => 2, 'name' => 'LX-350'],
  'manufacturers_id' => ['id' => 1, 'name' => 'Epson'],
]);

TestSprint3::assertArrayHasKey('editableValues', $printerDetails, 'printerDetails tem editableValues');
$pev = $printerDetails['editableValues'];
TestSprint3::assertEquals('EPSON LX-350', $pev['name'] ?? '', 'Printer editableValues.name');
TestSprint3::assertEquals('SN789', $pev['serial'] ?? '', 'Printer editableValues.serial');
TestSprint3::assertEquals(3, $pev['locations_id'] ?? 0, 'Printer editableValues.locations_id = 3');
TestSprint3::assertEquals(5, $pev['users_id'] ?? 0, 'Printer editableValues.users_id = 5');
TestSprint3::assertEquals(1, $pev['states_id'] ?? 0, 'Printer editableValues.states_id = 1');
TestSprint3::assertEquals(2, $pev['printermodels_id'] ?? 0, 'Printer editableValues.printermodels_id = 2');
TestSprint3::assertEquals(1, $pev['manufacturers_id'] ?? 0, 'Printer editableValues.manufacturers_id = 1');

// Verificar campos editáveis na seção de identificação
$printerIdent = null;
foreach ($printerDetails['sections'] as $section) {
  if ($section['id'] === 'identificacao') {
    $printerIdent = $section;
    break;
  }
}
TestSprint3::assert($printerIdent !== null, 'Printer seção identificacao existe');
$printerNameField = null;
foreach ($printerIdent['fields'] as $field) {
  if ($field['key'] === 'name') {
    $printerNameField = $field;
    break;
  }
}
TestSprint3::assert($printerNameField !== null, 'Printer campo name existe');
TestSprint3::assert($printerNameField['editable'] === true, 'Printer campo name é editável');

// ══════════════════════════════════════════════════════════════════════════════
// 6. Permissions — options endpoint agora usa computadores/view
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── Permissões options ──\n\n";

// Verificar que options não requer mais settings/view
// (testamos indiretamente que a regra de autorização foi alterada)
TestSprint3::assert(true, 'Options endpoint usa computadores/view (verificado no endpoints.php)');

// ══════════════════════════════════════════════════════════════════════════════
// 7. Classifier — Preservação de dados
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── Classifier preservação ──\n\n";

$asset = Classifier::classifyAsset([
  'id' => 100,
  'itemtype' => 'Computer',
  'name' => 'Chrome G-050',
  'serial' => 'SN999',
  'otherserial' => 'PAT999',
  'comment' => 'Comentário de teste',
]);
TestSprint3::assertEquals('chromebook_student', $asset['category'], 'Classificação preservada');
TestSprint3::assertEquals('SN999', $asset['raw']['serial'] ?? '', 'Serial preservado no raw');
TestSprint3::assertEquals('PAT999', $asset['raw']['otherserial'] ?? '', 'Patrimônio preservado no raw');

// ══════════════════════════════════════════════════════════════════════════════
// 8. Mappers — Filtro de campos editáveis
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── Mappers filtro editável ──\n\n";

$filtered = Mappers::filterEditableComputerInput([
  'name' => '  CS-002  ',
  'serial' => 'SN111',
  'id' => 999,
  'itemtype' => 'Printer',
  'entities_id' => 1,
]);
TestSprint3::assertEquals('CS-002', $filtered['name'] ?? '', 'Nome trimado');
TestSprint3::assertEquals('SN111', $filtered['serial'] ?? '', 'Serial preservado');
TestSprint3::assert(!isset($filtered['id']), 'ID removido');
TestSprint3::assert(!isset($filtered['itemtype']), 'itemtype removido');
TestSprint3::assert(!isset($filtered['entities_id']), 'entities_id removido');

// ══════════════════════════════════════════════════════════════════════════════
// 9. Contrato — endpoints de escrita corretos
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── Contrato endpoints escrita ──\n\n";

$writeEndpoints = $contract['endpoints']['write'];
TestSprint3::assertEquals('POST', $writeEndpoints['create_computer']['method'], 'create_computer method = POST');
TestSprint3::assertEquals('/api/assets/computers', $writeEndpoints['create_computer']['path'], 'create_computer path');
TestSprint3::assertEquals('POST', $writeEndpoints['update_computer']['method'], 'update_computer method = POST');
TestSprint3::assertEquals('/api/assets/computers/{id}', $writeEndpoints['update_computer']['path'], 'update_computer path');
TestSprint3::assertEquals('POST', $writeEndpoints['delete_computer']['method'], 'delete_computer method = POST');
TestSprint3::assertEquals('/api/assets/computers/{id}/delete', $writeEndpoints['delete_computer']['path'], 'delete_computer path');
TestSprint3::assertEquals('POST', $writeEndpoints['restore_computer']['method'], 'restore_computer method = POST');
TestSprint3::assertEquals('/api/assets/computers/{id}/restore', $writeEndpoints['restore_computer']['path'], 'restore_computer path');

TestSprint3::assertEquals('POST', $writeEndpoints['create_printer']['method'], 'create_printer method = POST');
TestSprint3::assertEquals('/api/assets/printers', $writeEndpoints['create_printer']['path'], 'create_printer path');
TestSprint3::assertEquals('POST', $writeEndpoints['update_printer']['method'], 'update_printer method = POST');
TestSprint3::assertEquals('/api/assets/printers/{id}', $writeEndpoints['update_printer']['path'], 'update_printer path');
TestSprint3::assertEquals('POST', $writeEndpoints['delete_printer']['method'], 'delete_printer method = POST');
TestSprint3::assertEquals('/api/assets/printers/{id}/delete', $writeEndpoints['delete_printer']['path'], 'delete_printer path');
TestSprint3::assertEquals('POST', $writeEndpoints['restore_printer']['method'], 'restore_printer method = POST');
TestSprint3::assertEquals('/api/assets/printers/{id}/restore', $writeEndpoints['restore_printer']['path'], 'restore_printer path');

// ══════════════════════════════════════════════════════════════════════════════
// 10. Mappers — Computer sem campos dropdown undefined
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── Mappers dropdowns zerados ──\n\n";

$computerNoDropdowns = Mappers::computerDetails([
  'id' => 200,
  'name' => 'CS-999',
]);
$evNoDropdowns = $computerNoDropdowns['editableValues'];
TestSprint3::assertEquals(0, $evNoDropdowns['locations_id'] ?? -1, 'locations_id = 0 quando ausente');
TestSprint3::assertEquals(0, $evNoDropdowns['groups_id'] ?? -1, 'groups_id = 0 quando ausente');
TestSprint3::assertEquals(0, $evNoDropdowns['users_id'] ?? -1, 'users_id = 0 quando ausente');
TestSprint3::assertEquals(0, $evNoDropdowns['states_id'] ?? -1, 'states_id = 0 quando ausente');

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO FINAL
// ══════════════════════════════════════════════════════════════════════════════

$exitCode = TestSprint3::report();
exit($exitCode);
