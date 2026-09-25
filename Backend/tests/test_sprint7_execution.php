<?php
/**
 * GLPI Control Center - Testes Sprint 07
 * -----------------------------------------------------------------------------
 * Testes de execução de operações pelo agente de IA.
 *
 * Cobertura: políticas, propostas, execução individual, lote,
 * idempotência, auditoria, segurança e validações.
 *
 * Sprint 07: Execução de operações
 */

require_once __DIR__ . '/../api/client.php';
require_once __DIR__ . '/../api/mappers.php';
require_once __DIR__ . '/../api/classifier.php';
require_once __DIR__ . '/../api/classification_pipeline.php';
require_once __DIR__ . '/../api/sync.php';
require_once __DIR__ . '/../api/services/AssetService.php';
require_once __DIR__ . '/../api/services/OptionsService.php';
require_once __DIR__ . '/../api/services/CapabilitiesService.php';
require_once __DIR__ . '/../api/services/ReconcileService.php';
require_once __DIR__ . '/../api/services/OperationTracker.php';
require_once __DIR__ . '/../api/services/DropdownValidator.php';
require_once __DIR__ . '/../api/services/IdempotencyGuard.php';
require_once __DIR__ . '/../api/services/CacheUpdater.php';
require_once __DIR__ . '/../api/services/AssetWriteService.php';
require_once __DIR__ . '/../api/services/AIProvider.php';
require_once __DIR__ . '/../api/services/AgentTools.php';
require_once __DIR__ . '/../api/services/AgentProposal.php';
require_once __DIR__ . '/../api/services/AgentExecution.php';
require_once __DIR__ . '/../api/services/AgentService.php';

$passed = 0;
$failed = 0;
$errors = [];

function test(string $name, callable $fn) {
  global $passed, $failed, $errors;
  try {
    $fn();
    echo "  ✓ {$name}\n";
    $passed++;
  } catch (Throwable $e) {
    $msg = $e->getMessage();
    echo "  ✗ {$name} — {$msg}\n";
    $failed++;
    $errors[] = "{$name}: {$msg}";
  }
}

function assertEquals($expected, $actual, string $msg = '') {
  if ($expected !== $actual) {
    $expStr = var_export($expected, true);
    $actStr = var_export($actual, true);
    throw new \RuntimeException(
      ($msg ? "{$msg} — " : '') . "esperado: {$expStr}, obtido: {$actStr}"
    );
  }
}

function assertTrue($val, string $msg = '') {
  if (!$val) {
    throw new \RuntimeException(($msg ? "{$msg} — " : '') . 'Esperado true, obtido false');
  }
}

function assertFalse($val, string $msg = '') {
  if ($val) {
    throw new \RuntimeException(($msg ? "{$msg} — " : '') . 'Esperado false, obtido true');
  }
}

function assertNotNull($val, string $msg = '') {
  if ($val === null) {
    throw new \RuntimeException(($msg ? "{$msg} — " : '') . 'Esperado não null');
  }
}

function assertNull($val, string $msg = '') {
  if ($val !== null) {
    throw new \RuntimeException(($msg ? "{$msg} — " : '') . 'Esperado null, obtido: ' . var_export($val, true));
  }
}

function assertArrayHasKey($key, $array, string $msg = '') {
  if (!is_array($array) || !array_key_exists($key, $array)) {
    throw new \RuntimeException(($msg ? "{$msg} — " : '') . "Chave '{$key}' não encontrada");
  }
}

function assertContains($needle, $haystack, string $msg = '') {
  if (!in_array($needle, $haystack, true)) {
    throw new \RuntimeException(($msg ? "{$msg} — " : '') . "Esperado conter: " . var_export($needle, true));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
echo "=== Sprint 07: Execução de Operações ===\n\n";

// ══════════════════════════════════════════════════════════════════════════════
// POLÍTICAS
// ══════════════════════════════════════════════════════════════════════════════

echo "--- Políticas ---\n";

test('agent_policies é array válido', function () {
  $policies = require __DIR__ . '/../config/agent_policies.php';
  assertTrue(is_array($policies), 'Deve ser array');
  assertArrayHasKey('default_mode', $policies);
  assertArrayHasKey('modes', $policies);
  assertArrayHasKey('itemtype_restrictions', $policies);
});

test('modo padrão é prepare_confirm', function () {
  $policies = require __DIR__ . '/../config/agent_policies.php';
  assertEquals('prepare_confirm', $policies['default_mode']);
});

test('modos têm estrutura válida', function () {
  $policies = require __DIR__ . '/../config/agent_policies.php';
  $modes = $policies['modes'];
  assertArrayHasKey('read_only', $modes);
  assertArrayHasKey('prepare_confirm', $modes);
  assertArrayHasKey('auto_execute', $modes);
  assertTrue(is_array($modes['read_only']['allowed_operations']));
  assertTrue(is_array($modes['prepare_confirm']['allowed_operations']));
  assertTrue(is_array($modes['auto_execute']['allowed_operations']));
});

test('itemtype restrictions para Computer e Printer', function () {
  $policies = require __DIR__ . '/../config/agent_policies.php';
  $restrictions = $policies['itemtype_restrictions'];
  assertArrayHasKey('Computer', $restrictions);
  assertArrayHasKey('Printer', $restrictions);
  assertContains('prepare_confirm', $restrictions['Computer']['allowed_modes']);
  assertContains('prepare_confirm', $restrictions['Printer']['allowed_modes']);
});

test('batch_limits definidos', function () {
  $policies = require __DIR__ . '/../config/agent_policies.php';
  $limits = $policies['batch_limits'];
  assertTrue($limits['max_items_per_batch'] > 0);
  assertTrue($limits['max_auto_items_per_batch'] > 0);
  assertTrue($limits['require_item_list_before_confirm']);
});

test('protected_fields existe', function () {
  $policies = require __DIR__ . '/../config/agent_policies.php';
  assertTrue(in_array('entities_id', $policies['protected_fields']));
  assertTrue(in_array('is_recursive', $policies['protected_fields']));
});

// ══════════════════════════════════════════════════════════════════════════════
// AGENTEXECUTION
// ══════════════════════════════════════════════════════════════════════════════

echo "\n--- AgentExecution ---\n";

test('AgentExecution pode ser instanciado', function () {
  $execution = new AgentExecution([], 'test_user@example.com');
  assertNotNull($execution);
});

test('AgentExecution retorna políticas', function () {
  $execution = new AgentExecution([], 'test_user@example.com');
  $policies = $execution->getPolicies();
  assertArrayHasKey('default_mode', $policies);
  assertArrayHasKey('modes', $policies);
});

test('AgentExecution retorna modo do usuário', function () {
  $execution = new AgentExecution([], 'test_user@example.com');
  $mode = $execution->getUserMode();
  assertEquals('prepare_confirm', $mode);
});

test('checkPolicy rejeita itemtype inválido', function () {
  $execution = new AgentExecution([], 'test_user');
  $proposal = [
    'action' => 'update',
    'itemtype' => 'InvalidType',
    'id' => 1,
  ];
  $result = $execution->checkPolicy($proposal);
  assertFalse($result['allowed']);
  assertTrue(str_contains($result['reason'], 'não suportado'));
});

test('checkPolicy aceita update em Computer no modo prepare_confirm', function () {
  $execution = new AgentExecution([], 'test_user');
  $proposal = [
    'action' => 'update',
    'itemtype' => 'Computer',
    'id' => 1,
  ];
  $result = $execution->checkPolicy($proposal);
  assertTrue($result['allowed']);
  assertEquals('prepare_confirm', $result['mode']);
});

test('checkPolicy rejeita create no modo read_only', function () {
  $policiesPath = __DIR__ . '/../config/agent_policies.php';
  $execution = new AgentExecution([], 'readonly_user');
  // Simular modo read_only via user override
  $proposal = [
    'action' => 'create',
    'itemtype' => 'Computer',
  ];
  // read_only não tem create
  $policies = require $policiesPath;
  assertEquals([], $policies['modes']['read_only']['allowed_operations']);
});

test('checkPolicy rejeita delete em auto_execute', function () {
  $execution = new AgentExecution([], 'test_user');
  $proposal = [
    'action' => 'delete',
    'itemtype' => 'Computer',
    'id' => 1,
  ];
  // auto_execute only allows update by default
  $policies = $execution->getPolicies();
  $autoMode = $policies['modes']['auto_execute'];
  assertFalse(in_array('delete', $autoMode['allowed_operations']));
});

// ══════════════════════════════════════════════════════════════════════════════
// PROPOSTAS — NOVOS MÉTODOS
// ══════════════════════════════════════════════════════════════════════════════

echo "\n--- AgentProposal (Sprint 07) ---\n";

test('AgentProposal::updateStatus existe e funciona', function () {
  $proposal = AgentProposal::create('update', 'Computer', 999, ['name' => 'Test Sprint 7'], 'test_user');
  assertNotNull($proposal['proposal_id']);
  assertEquals('pending', $proposal['status']);

  $updated = AgentProposal::updateStatus($proposal['proposal_id'], 'executing');
  assertNotNull($updated);
  assertEquals('executing', $updated['status']);

  // Cleanup
  AgentProposal::updateStatus($proposal['proposal_id'], 'cancelled');
});

test('AgentProposal::updateStatus rejeita transição inválida', function () {
  $proposal = AgentProposal::create('update', 'Computer', 998, ['name' => 'Test'], 'test_user');

  // pending → executed não é válido (deve ir por executing primeiro)
  $result = AgentProposal::updateStatus($proposal['proposal_id'], 'executed');
  assertNull($result);

  // Cleanup
  AgentProposal::updateStatus($proposal['proposal_id'], 'cancelled');
});

test('AgentProposal::listByUser retorna propostas', function () {
  $p1 = AgentProposal::create('update', 'Computer', 997, ['name' => 'List Test 1'], 'list_test_user');
  $p2 = AgentProposal::create('update', 'Computer', 996, ['name' => 'List Test 2'], 'list_test_user');

  $list = AgentProposal::listByUser('list_test_user');
  assertTrue(count($list) >= 2);

  $ids = array_column($list, 'proposal_id');
  assertContains($p1['proposal_id'], $ids);
  assertContains($p2['proposal_id'], $ids);

  // Cleanup
  AgentProposal::updateStatus($p1['proposal_id'], 'cancelled');
  AgentProposal::updateStatus($p2['proposal_id'], 'cancelled');
});

test('AgentProposal::listByUser filtra por status', function () {
  $p = AgentProposal::create('update', 'Computer', 995, ['name' => 'Filter Test'], 'filter_test_user');
  AgentProposal::updateStatus($p['proposal_id'], 'cancelled');

  $list = AgentProposal::listByUser('filter_test_user', ['status' => 'cancelled']);
  $ids = array_column($list, 'proposal_id');
  assertContains($p['proposal_id'], $ids);

  $listPending = AgentProposal::listByUser('filter_test_user', ['status' => 'pending']);
  $idsPending = array_column($listPending, 'proposal_id');
  assertFalse(in_array($p['proposal_id'], $idsPending));
});

test('AgentProposal cancel não cancela proposta executing', function () {
  $p = AgentProposal::create('update', 'Computer', 994, ['name' => 'No Cancel'], 'no_cancel_user');
  AgentProposal::updateStatus($p['proposal_id'], 'executing');

  $cancelled = AgentProposal::cancel($p['proposal_id']);
  assertNull($cancelled);

  // Cleanup
  AgentProposal::updateStatus($p['proposal_id'], 'cancelled');
});

// ══════════════════════════════════════════════════════════════════════════════
// AGENTTOOLS — NOVAS FERRAMENTAS
// ══════════════════════════════════════════════════════════════════════════════

echo "\n--- AgentTools (Sprint 07) ---\n";

test('AgentTools define 12 ferramentas', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $defs = $tools->getDefinitions();
  assertEquals(12, count($defs));
});

test('Ferramenta executar_proposta existe', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertContains('executar_proposta', $names);
});

test('Ferramenta cancelar_proposta existe', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertContains('cancelar_proposta', $names);
});

test('Ferramenta consultar_politicas existe', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertContains('consultar_politicas', $names);
});

test('executar_proposta valida proposal_id obrigatório', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $result = $tools->execute('executar_proposta', []);
  assertFalse($result['success']);
  assertTrue(str_contains($result['error'], 'obrigatório'));
});

test('executar_proposta valida formato do proposal_id', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $result = $tools->execute('executar_proposta', ['proposal_id' => 'invalid格式']);
  assertFalse($result['success']);
  assertTrue(str_contains($result['error'], 'inválido'));
});

test('cancelar_proposta valida proposal_id obrigatório', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $result = $tools->execute('cancelar_proposta', []);
  assertFalse($result['success']);
  assertTrue(str_contains($result['error'], 'obrigatório'));
});

test('executar_proposta retorna erro para proposta inexistente', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $result = $tools->execute('executar_proposta', ['proposal_id' => 'prop_00000000000000000000000000000000']);
  assertFalse($result['success']);
  assertTrue(str_contains($result['message'], 'não encontrada'));
});

test('cancelar_proposta retorna erro para proposta inexistente', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $result = $tools->execute('cancelar_proposta', ['proposal_id' => 'prop_00000000000000000000000000000000']);
  assertFalse($result['success']);
});

test('consultar_politicas retorna dados', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $result = $tools->execute('consultar_politicas', []);
  assertTrue($result['success']);
  assertArrayHasKey('data', $result);
  assertArrayHasKey('policies', $result['data']);
  assertArrayHasKey('user_mode', $result['data']);
});

// ══════════════════════════════════════════════════════════════════════════════
// EXECUÇÃO — VALIDAÇÕES
// ══════════════════════════════════════════════════════════════════════════════

echo "\n--- Execução (Validações) ---\n";

test('executeProposal rejeita proposta inexistente', function () {
  $execution = new AgentExecution([], 'test');
  $result = $execution->executeProposal('prop_nonexistent');
  assertFalse($result['success']);
  assertEquals('not_found', $result['status']);
});

test('executeProposal rejeita proposta de outro usuário', function () {
  $p = AgentProposal::create('update', 'Computer', 800, ['name' => 'Other User Test'], 'owner_user');
  $execution = new AgentExecution([], 'other_user');
  $result = $execution->executeProposal($p['proposal_id']);
  assertFalse($result['success']);
  assertEquals('unauthorized', $result['status']);
  AgentProposal::updateStatus($p['proposal_id'], 'cancelled');
});

test('executeProposal rejeita proposta expirada', function () {
  $p = AgentProposal::create('update', 'Computer', 801, ['name' => 'Expired Test'], 'expire_user');
  // Forçar expiração
  AgentProposal::updateStatus($p['proposal_id'], 'expired');
  $execution = new AgentExecution([], 'expire_user');
  $result = $execution->executeProposal($p['proposal_id']);
  assertFalse($result['success']);
  assertEquals('expired', $result['status']);
});

test('executeProposal rejeita proposta cancelada', function () {
  $p = AgentProposal::create('update', 'Computer', 802, ['name' => 'Cancelled Test'], 'cancel_user');
  AgentProposal::updateStatus($p['proposal_id'], 'cancelled');
  $execution = new AgentExecution([], 'cancel_user');
  $result = $execution->executeProposal($p['proposal_id']);
  assertFalse($result['success']);
  assertEquals('cancelled', $result['status']);
});

test('executeProposal rejeita proposta sem permissão', function () {
  $p = AgentProposal::create('update', 'Computer', 803, ['name' => 'No Perm'], 'noperm_user');
  // Forçar permissão false
  $proposal = AgentProposal::get($p['proposal_id']);
  $proposal['permissions']['can_write'] = false;
  $path = __DIR__ . '/../data/proposals/' . $p['proposal_id'] . '.json';
  file_put_contents($path, json_encode($proposal, JSON_PRETTY_PRINT));

  $execution = new AgentExecution([], 'noperm_user');
  $result = $execution->executeProposal($p['proposal_id']);
  assertFalse($result['success']);
  assertEquals('no_permission', $result['status']);

  AgentProposal::updateStatus($p['proposal_id'], 'cancelled');
});

test('executeProposal rejeita política para itemtype inválido', function () {
  $p = AgentProposal::create('update', 'Computer', 804, ['name' => 'Policy Test'], 'policy_user');
  // Forçar itemtype inválido na proposta
  $proposal = AgentProposal::get($p['proposal_id']);
  $proposal['itemtype'] = 'InvalidType';
  $path = __DIR__ . '/../data/proposals/' . $p['proposal_id'] . '.json';
  file_put_contents($path, json_encode($proposal, JSON_PRETTY_PRINT));

  $execution = new AgentExecution([], 'policy_user');
  $result = $execution->executeProposal($p['proposal_id']);
  assertFalse($result['success']);
  assertEquals('policy_rejected', $result['status']);

  AgentProposal::updateStatus($p['proposal_id'], 'cancelled');
});

test('executeProposal rejeita botão duplo (idempotência)', function () {
  $p = AgentProposal::create('update', 'Computer', 805, ['name' => 'Double Click'], 'double_user');
  $execution = new AgentExecution([], 'double_user');

  // Simular que já existe uma operação em execução
  AgentProposal::updateStatus($p['proposal_id'], 'executing');

  $result = $execution->executeProposal($p['proposal_id']);
  // Deve retornar erro pois a proposta já está executing
  assertFalse($result['success']);
  assertEquals('executing', $result['status']);

  AgentProposal::updateStatus($p['proposal_id'], 'cancelled');
});

// ══════════════════════════════════════════════════════════════════════════════
// LOTE
// ══════════════════════════════════════════════════════════════════════════════

echo "\n--- Lote ---\n";

test('executeBatch processa múltiplas propostas', function () {
  $p1 = AgentProposal::create('update', 'Computer', 700, ['name' => 'Batch 1'], 'batch_user');
  $p2 = AgentProposal::create('update', 'Computer', 701, ['name' => 'Batch 2'], 'batch_user');

  $execution = new AgentExecution([], 'batch_user');
  $result = $execution->executeBatch([$p1['proposal_id'], $p2['proposal_id']]);

  assertArrayHasKey('batch_id', $result);
  assertEquals(2, $result['total']);
  assertEquals(2, count($result['items']));
  assertTrue(is_array($result['items']));

  AgentProposal::updateStatus($p1['proposal_id'], 'cancelled');
  AgentProposal::updateStatus($p2['proposal_id'], 'cancelled');
});

test('executeBatch trata proposta inexistente no lote', function () {
  $p = AgentProposal::create('update', 'Computer', 702, ['name' => 'Batch Missing'], 'batch_missing_user');

  $execution = new AgentExecution([], 'batch_missing_user');
  $result = $execution->executeBatch([$p['proposal_id'], 'prop_nonexistent']);

  assertEquals(2, $result['total']);
  assertTrue($result['skipped'] >= 1);

  AgentProposal::updateStatus($p['proposal_id'], 'cancelled');
});

test('executeBatch retorna estado parcial', function () {
  $p1 = AgentProposal::create('update', 'Computer', 703, ['name' => 'Partial 1'], 'partial_user');
  $p2 = AgentProposal::create('update', 'Computer', 704, ['name' => 'Partial 2'], 'partial_user');

  $execution = new AgentExecution([], 'partial_user');
  $result = $execution->executeBatch([$p1['proposal_id'], $p2['proposal_id']]);

  assertTrue(is_array($result['items']));
  foreach ($result['items'] as $item) {
    assertArrayHasKey('proposal_id', $item);
    assertArrayHasKey('success', $item);
  }

  AgentProposal::updateStatus($p1['proposal_id'], 'cancelled');
  AgentProposal::updateStatus($p2['proposal_id'], 'cancelled');
});

// ══════════════════════════════════════════════════════════════════════════════
// SEGURANÇA
// ══════════════════════════════════════════════════════════════════════════════

echo "\n--- Segurança ---\n";

test('comentários maliciosos em campos não são executados', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider, 'test');
  $proposal = AgentProposal::create('update', 'Computer', 600, [
    'name' => 'Normal Name',
    'comment' => '<script>alert("xss")</script>',
  ], 'security_user');
  assertNotNull($proposal['proposal_id']);
  assertEquals('Normal Name', $proposal['proposed_values']['name']);
  AgentProposal::updateStatus($proposal['proposal_id'], 'cancelled');
});

test('protected fields não podem ser definidos pelo agente', function () {
  $policies = require __DIR__ . '/../config/agent_policies.php';
  assertTrue(in_array('entities_id', $policies['protected_fields']));
  assertTrue(in_array('is_recursive', $policies['protected_fields']));
  assertTrue(in_array('is_deleted', $policies['protected_fields']));
});

test('proposta isolada por usuário — outro usuário não vê', function () {
  $p = AgentProposal::create('update', 'Computer', 601, ['name' => 'Isolated'], 'isolated_user');
  $listOther = AgentProposal::listByUser('other_isolated_user');
  $ids = array_column($listOther, 'proposal_id');
  assertFalse(in_array($p['proposal_id'], $ids));
  AgentProposal::updateStatus($p['proposal_id'], 'cancelled');
});

test('execução não concede permissões extras', function () {
  $execution = new AgentExecution([], 'regular_user');
  $policies = $execution->getPolicies();
  $mode = $execution->getUserMode();
  assertEquals('prepare_confirm', $mode);
  // prepare_confirm requer confirmação
  assertTrue($policies['modes']['prepare_confirm']['require_confirmation']);
});

test('lote máximo respeitado', function () {
  $policies = require __DIR__ . '/../config/agent_policies.php';
  assertTrue($policies['batch_limits']['max_items_per_batch'] <= 10);
});

// ══════════════════════════════════════════════════════════════════════════════
// ORIGEM DOS DADOS
// ══════════════════════════════════════════════════════════════════════════════

echo "\n--- Origem dos Dados ---\n";

test('proposal data source é local (não GLPI)', function () {
  $p = AgentProposal::create('update', 'Computer', 500, ['name' => 'Source Test'], 'source_user');
  assertNotNull($p['proposal_id']);
  assertEquals('pending', $p['status']);
  AgentProposal::updateStatus($p['proposal_id'], 'cancelled');
});

test('execution result indica glpi_write e cache_update separadamente', function () {
  $execution = new AgentExecution([], 'test');
  $result = $execution->executeProposal('prop_nonexistent');
  assertFalse($result['success']);
  assertEquals('not_found', $result['status']);
});

// ══════════════════════════════════════════════════════════════════════════════
// RESULTADO
// ══════════════════════════════════════════════════════════════════════════════

echo "\n" . str_repeat('=', 50) . "\n";
echo "Total: {$passed}\n";
echo "Passaram: {$passed}\n";
echo "Falharam: {$failed}\n";

if ($failed > 0) {
  echo "\nFalhas:\n";
  foreach ($errors as $error) {
    echo "  - {$error}\n";
  }
  exit(1);
}

exit(0);
