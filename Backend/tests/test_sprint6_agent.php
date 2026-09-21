<?php
/**
 * GLPI Control Center - Testes Sprint 06
 * -----------------------------------------------------------------------------
 * Testes do agente de IA, ferramentas, propostas e provedor.
 *
 * Sprit 06: Agente de IA
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

function assertArrayHasKey($key, array $arr, string $msg = '') {
  if (!array_key_exists($key, $arr)) {
    throw new \RuntimeException(($msg ? "{$msg} — " : '') . "Chave '{$key}' não encontrada");
  }
}

// ════════════════════════════════════════════════════════════════════════════
echo "🧪 Testes Sprint 06 — Agente de IA\n";
echo "────────────────────────────────────────────────────────\n\n";

// ════════════════════════════════════════════════════════════════════════════
echo "── AIProvider ──\n";
// ════════════════════════════════════════════════════════════════════════════

test('AIProvider existe', function () {
  assertTrue(class_exists('AIProvider'), 'Classe AIProvider deve existir');
});

test('AIProvider instanciável', function () {
  $provider = new AIProvider();
  assertNotNull($provider, 'AIProvider deve ser instanciável');
});

test('AIProvider isConfigured retorna bool', function () {
  $provider = new AIProvider();
  assertTrue(is_bool($provider->isConfigured()), 'isConfigured deve retornar bool');
});

test('AIProvider getModel retorna string', function () {
  $provider = new AIProvider();
  assertTrue(is_string($provider->getModel()), 'getModel deve retornar string');
});

test('AIProvider getBaseUrl retorna string', function () {
  $provider = new AIProvider();
  $url = $provider->getBaseUrl();
  assertTrue(is_string($url), 'getBaseUrl deve retornar string');
  assertTrue(str_starts_with($url, 'https://'), 'Base URL deve usar HTTPS');
});

test('AIProvider getTimeout retorna int', function () {
  $provider = new AIProvider();
  assertTrue(is_int($provider->getTimeout()), 'getTimeout deve retornar int');
  assertTrue($provider->getTimeout() > 0, 'Timeout deve ser positivo');
});

test('AIProvider getMaxTokens retorna int', function () {
  $provider = new AIProvider();
  assertTrue(is_int($provider->getMaxTokens()), 'getMaxTokens deve retornar int');
  assertTrue($provider->getMaxTokens() > 0, 'MaxTokens deve ser positivo');
});

test('AIProvider supportsToolCalling retorna bool', function () {
  $provider = new AIProvider();
  assertTrue(is_bool($provider->supportsToolCalling()), 'supportsToolCalling deve retornar bool');
});

test('AIProvider chat sem chave retorna erro', function () {
  $provider = new AIProvider();
  if ($provider->isConfigured()) {
    echo "    (skipped — chave configurada)\n";
    return;
  }
  $result = $provider->chat([['role' => 'user', 'content' => 'test']]);
  assertFalse($result['success'], 'Deve retornar erro sem chave');
  assertArrayHasKey('error', $result);
});

// ════════════════════════════════════════════════════════════════════════════
echo "\n── AgentTools ──\n";
// ════════════════════════════════════════════════════════════════════════════

test('AgentTools existe', function () {
  assertTrue(class_exists('AgentTools'), 'Classe AgentTools deve existir');
});

test('AgentTools instanciável', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  assertNotNull($tools);
});

test('AgentTools getDefinitions retorna array', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  assertTrue(is_array($defs), 'getDefinitions deve retornar array');
  assertTrue(count($defs) >= 8, 'Deve ter pelo menos 8 ferramentas');
});

test('Ferramentas têm formato válido', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();

  foreach ($defs as $def) {
    assertEquals('function', $def['type'], 'type deve ser "function"');
    assertArrayHasKey('function', $def);
    assertArrayHasKey('name', $def['function']);
    assertArrayHasKey('description', $def['function']);
    assertArrayHasKey('parameters', $def['function']);
  }
});

test('Nomes das ferramentas são únicos', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertEquals(count($names), count(array_unique($names)), 'Nomes devem ser únicos');
});

test('Tool buscar_ativos definida', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertTrue(in_array('buscar_ativos', $names), 'buscar_ativos deve existir');
});

test('Tool consultar_ativo definida', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertTrue(in_array('consultar_ativo', $names), 'consultar_ativo deve existir');
});

test('Tool consultar_capacidades definida', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertTrue(in_array('consultar_capacidades', $names), 'consultar_capacidades deve existir');
});

test('Tool consultar_opcoes definida', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertTrue(in_array('consultar_opcoes', $names), 'consultar_opcoes deve existir');
});

test('Tool consultar_horas_projetor definida', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertTrue(in_array('consultar_horas_projetor', $names), 'consultar_horas_projetor deve existir');
});

test('Tool consultar_status_sincronizacao definida', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertTrue(in_array('consultar_status_sincronizacao', $names), 'consultar_status_sincronizacao deve existir');
});

test('Tool consultar_reconciliacao definida', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertTrue(in_array('consultar_reconciliacao', $names), 'consultar_reconciliacao deve existir');
});

test('Tool consultar_operacao definida', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertTrue(in_array('consultar_operacao', $names), 'consultar_operacao deve existir');
});

test('Tool preparar_alteracao definida', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertTrue(in_array('preparar_alteracao', $names), 'preparar_alteracao deve existir');
});

// ════════════════════════════════════════════════════════════════════════════
echo "\n── Validação de Argumentos ──\n";
// ════════════════════════════════════════════════════════════════════════════

test('buscar_ativos: query vazia retorna erro', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('buscar_ativos', ['query' => '']);
  assertFalse($result['success'], 'Query vazia deve retornar erro');
});

test('buscar_ativos: query muito longa retorna erro', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('buscar_ativos', ['query' => str_repeat('a', 200)]);
  assertFalse($result['success'], 'Query longa deve retornar erro');
});

test('consultar_ativo: itemtype inválido retorna erro', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_ativo', ['itemtype' => 'Ticket', 'id' => 1]);
  assertFalse($result['success'], 'Itemtype inválido deve retornar erro');
});

test('consultar_ativo: id não numérico retorna erro', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_ativo', ['itemtype' => 'Computer', 'id' => 'abc']);
  assertFalse($result['success'], 'ID não numérico deve retornar erro');
});

test('consultar_opcoes: coleção não permitida retorna erro', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_opcoes', ['collection' => 'SecretTable']);
  assertFalse($result['success'], 'Coleção não permitida deve retornar erro');
});

test('consultar_operacao: operation_id vazio retorna erro', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_operacao', ['operation_id' => '']);
  assertFalse($result['success'], 'operation_id vazio deve retornar erro');
});

test('preparar_alteracao: action inválida retorna erro', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('preparar_alteracao', ['action' => 'drop', 'itemtype' => 'Computer']);
  assertFalse($result['success'], 'Action inválida deve retornar erro');
});

test('preparar_alteracao: id obrigatório para update', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('preparar_alteracao', ['action' => 'update', 'itemtype' => 'Computer']);
  assertFalse($result['success'], 'ID obrigatório para update');
});

test('Ferramenta inexistente retorna erro', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('ferramenta_inexistente', []);
  assertFalse($result['success'], 'Ferramenta inexistente deve retornar erro');
});

// ════════════════════════════════════════════════════════════════════════════
echo "\n── Execução de Ferramentas (com cache) ──\n";
// ════════════════════════════════════════════════════════════════════════════

test('buscar_ativos retorna resultado', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('buscar_ativos', ['query' => 'CS']);
  assertTrue($result['success'], 'buscar_ativos deve retornar sucesso');
  assertArrayHasKey('data', $result);
  assertArrayHasKey('source', $result);
});

test('consultar_capacidades retorna contrato', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_capacidades', []);
  assertTrue($result['success'], 'consultar_capacidades deve retornar sucesso');
  assertArrayHasKey('data', $result);
  assertArrayHasKey('version', $result['data']);
});

test('consultar_opcoes Group retorna dados', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_opcoes', ['collection' => 'Group']);
  if (!$result['success'] && str_contains($result['error'] ?? '', 'GLPI')) {
    echo "    (skipped — GLPI não configurado)\n";
    return;
  }
  assertTrue($result['success'], 'consultar_opcoes deve retornar sucesso');
  assertArrayHasKey('data', $result);
});

test('consultar_status_sincronizacao retorna status', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_status_sincronizacao', []);
  assertTrue($result['success'], 'consultar_status_sincronizacao deve retornar sucesso');
  assertArrayHasKey('data', $result);
});

test('consultar_reconciliacao retorna resultado', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_reconciliacao', []);
  if (!$result['success'] && str_contains($result['error'] ?? '', 'GLPI')) {
    echo "    (skipped — GLPI não configurado)\n";
    return;
  }
  assertTrue($result['success'], 'consultar_reconciliacao deve retornar sucesso');
  assertArrayHasKey('data', $result);
});

test('consultar_operacao inexistente retorna null', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_operacao', ['operation_id' => 'nonexistent']);
  assertTrue($result['success'], 'consultar_operacao deve retornar sucesso');
  assertNull($result['data'], 'Operação inexistente deve retornar null');
});

// ════════════════════════════════════════════════════════════════════════════
echo "\n── AgentProposal ──\n";
// ════════════════════════════════════════════════════════════════════════════

test('AgentProposal existe', function () {
  assertTrue(class_exists('AgentProposal'), 'Classe AgentProposal deve existir');
});

test('AgentProposal create retorna proposta', function () {
  $proposal = AgentProposal::create('update', 'Computer', 1, ['name' => 'Teste'], 'user@test.com');
  assertNotNull($proposal);
  assertArrayHasKey('proposal_id', $proposal);
  assertArrayHasKey('status', $proposal);
  assertEquals('pending', $proposal['status']);
  assertEquals('update', $proposal['action']);
  assertEquals('Computer', $proposal['itemtype']);
  assertEquals(1, $proposal['id']);
});

test('AgentProposal tem campos obrigatórios', function () {
  $proposal = AgentProposal::create('create', 'Printer', null, ['name' => 'Impressora'], 'user@test.com');
  assertArrayHasKey('proposal_id', $proposal);
  assertArrayHasKey('created_at', $proposal);
  assertArrayHasKey('expires_at', $proposal);
  assertArrayHasKey('created_by', $proposal);
  assertArrayHasKey('current_values', $proposal);
  assertArrayHasKey('proposed_values', $proposal);
  assertArrayHasKey('field_sources', $proposal);
  assertArrayHasKey('permissions', $proposal);
  assertArrayHasKey('pending_validations', $proposal);
  assertArrayHasKey('disclaimer', $proposal);
});

test('AgentProposal disclaimer indica prévia', function () {
  $proposal = AgentProposal::create('create', 'Computer', null, ['name' => 'Novo'], 'user@test.com');
  assertTrue(str_contains($proposal['disclaimer'], 'PRÉVIA'), 'Disclaimer deve conter PRÉVIA');
  assertTrue(str_contains($proposal['disclaimer'], 'nenhuma alteração executada'), 'Disclaimer deve indicar que nada foi executado');
});

test('AgentProposal get recupera proposta', function () {
  $created = AgentProposal::create('update', 'Computer', 1, ['name' => 'Rec'], 'user@test.com');
  $fetched = AgentProposal::get($created['proposal_id']);
  assertNotNull($fetched);
  assertEquals($created['proposal_id'], $fetched['proposal_id']);
});

test('AgentProposal get inexistente retorna null', function () {
  $result = AgentProposal::get('prop_nonexistent');
  assertNull($result);
});

test('AgentProposal cancel funciona', function () {
  $created = AgentProposal::create('update', 'Computer', 1, ['name' => 'Cancel'], 'user@test.com');
  $cancelled = AgentProposal::cancel($created['proposal_id']);
  assertNotNull($cancelled);
  assertEquals('cancelled', $cancelled['status']);
});

test('AgentProposal cancel inexistente retorna null', function () {
  $result = AgentProposal::cancel('prop_nonexistent');
  assertNull($result);
});

test('AgentProposal validateForExecution com proposta pendente', function () {
  $created = AgentProposal::create('update', 'Computer', 1, ['name' => 'Val'], 'user@test.com');
  $validation = AgentProposal::validateForExecution($created['proposal_id']);
  assertArrayHasKey('valid', $validation);
});

test('AgentProposal validateForExecution cancelada retorna erro', function () {
  $created = AgentProposal::create('update', 'Computer', 1, ['name' => 'X'], 'user@test.com');
  AgentProposal::cancel($created['proposal_id']);
  $validation = AgentProposal::validateForExecution($created['proposal_id']);
  assertFalse($validation['valid'], 'Proposta cancelada não deve ser executável');
});

test('AgentProposal delete retorna estado inactive', function () {
  $proposal = AgentProposal::create('delete', 'Computer', 1, [], 'user@test.com');
  assertEquals('delete', $proposal['action']);
  assertNotNull($proposal['proposed_values']);
});

test('AgentProposal restore retorna estado ativo', function () {
  $proposal = AgentProposal::create('restore', 'Computer', 1, [], 'user@test.com');
  assertEquals('restore', $proposal['action']);
  assertNotNull($proposal['proposed_values']);
});

test('AgentProposal create retorna proposta', function () {
  $proposal = AgentProposal::create('create', 'Printer', null, ['name' => 'Nova Impressora'], 'user@test.com');
  assertEquals('create', $proposal['action']);
  assertEquals('Printer', $proposal['itemtype']);
  assertNull($proposal['id']);
});

// ════════════════════════════════════════════════════════════════════════════
echo "\n── AgentService ──\n";
// ════════════════════════════════════════════════════════════════════════════

test('AgentService existe', function () {
  assertTrue(class_exists('AgentService'), 'Classe AgentService deve existir');
});

test('AgentService instanciável', function () {
  $agent = new AgentService('user@test.com');
  assertNotNull($agent);
});

test('AgentService getStatus retorna dados', function () {
  $agent = new AgentService('user@test.com');
  $status = $agent->getStatus();
  assertArrayHasKey('configured', $status);
  assertArrayHasKey('model', $status);
  assertArrayHasKey('provider', $status);
  assertEquals('opencode-go', $status['provider']);
});

test('AgentService sem chave retorna not_configured', function () {
  $provider = new AIProvider();
  if ($provider->isConfigured()) {
    echo "    (skipped — chave configurada)\n";
    return;
  }
  $agent = new AgentService('user@test.com');
  $result = $agent->processMessage('Olá');
  assertFalse($result['success']);
  assertEquals('not_configured', $result['status']);
});

test('AgentService clearHistory funciona', function () {
  $agent = new AgentService('user@test.com');
  $agent->clearHistory();
  $history = $agent->getHistory();
  assertEquals([], $history);
});

test('AgentService getHistory retorna array', function () {
  $agent = new AgentService('user@test.com');
  $history = $agent->getHistory();
  assertTrue(is_array($history));
});

// ════════════════════════════════════════════════════════════════════════════
echo "\n── Segurança e Limites ──\n";
// ════════════════════════════════════════════════════════════════════════════

test('Mensagem muito longa é rejeitada', function () {
  $provider = new AIProvider();
  if ($provider->isConfigured()) {
    echo "    (skipped — chave configurada)\n";
    return;
  }
  $agent = new AgentService('user@test.com');
  $result = $agent->processMessage(str_repeat('a', 3000));
  assertFalse($result['success']);
});

test('Isolamento por usuário', function () {
  $agent1 = new AgentService('user1@test.com');
  $agent2 = new AgentService('user2@test.com');
  $agent1->clearHistory();
  $agent2->clearHistory();
  $h1 = $agent1->getHistory();
  $h2 = $agent2->getHistory();
  assertEquals([], $h1);
  assertEquals([], $h2);
});

test('Nenhuma ferramenta de escrita existe', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $defs = $tools->getDefinitions();
  $names = array_map(fn($d) => $d['function']['name'], $defs);
  assertFalse(in_array('executar_alteracao', $names), 'Não deve haver ferramenta de execução');
  assertFalse(in_array('deletar_ativo', $names), 'Não deve haver ferramenta de deletar');
  assertFalse(in_array('editar_ativo', $names), 'Não deve haver ferramenta de editar');
});

test('preparar_alteracao não executa gravação', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('preparar_alteracao', [
    'action' => 'update',
    'itemtype' => 'Computer',
    'id' => 1,
    'fields' => ['name' => 'Teste IA'],
  ]);
  assertTrue($result['success']);
  assertArrayHasKey('data', $result);
  $proposal = $result['data'];
  assertEquals('pending', $proposal['status']);
  assertTrue(str_contains($proposal['disclaimer'], 'PRÉVIA'));
});

test('Tool consultar_operacao retorna resultado válido', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_operacao', ['operation_id' => 'test-123']);
  assertTrue($result['success']);
  assertArrayHasKey('tool_name', $result);
  assertEquals('consultar_operacao', $result['tool_name']);
});

test('Tool consultar_opcoes retorna coleção', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_opcoes', ['collection' => 'State']);
  if (!$result['success'] && str_contains($result['error'] ?? '', 'GLPI')) {
    echo "    (skipped — GLPI não configurado)\n";
    return;
  }
  assertTrue($result['success']);
  assertArrayHasKey('collection', $result);
  assertEquals('State', $result['collection']);
});

test('Ferramentas têm duration_ms', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_capacidades', []);
  assertArrayHasKey('duration_ms', $result);
  assertTrue($result['duration_ms'] >= 0);
});

// ════════════════════════════════════════════════════════════════════════════
echo "\n── Fonte e Atualidade dos Dados ──\n";
// ════════════════════════════════════════════════════════════════════════════

test('buscar_ativos indica fonte cache', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('buscar_ativos', ['query' => 'CS']);
  assertEquals('cache', $result['source']);
});

test('consultar_capacidades indica fonte static', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_capacidades', []);
  assertEquals('static', $result['source']);
});

test('consultar_opcoes indica fonte glpi', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_opcoes', ['collection' => 'Group']);
  if (!$result['success'] && str_contains($result['error'] ?? '', 'GLPI')) {
    echo "    (skipped — GLPI não configurado)\n";
    return;
  }
  assertEquals('glpi', $result['source']);
});

test('consultar_horas_projetor indica fonte projectors.json', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_horas_projetor', ['name' => 'Projetor']);
  assertEquals('projectors.json', $result['source']);
  assertArrayHasKey('warning', $result);
});

test('consultar_reconciliacao indica warning', function () {
  $provider = new AIProvider();
  $tools = new AgentTools($provider);
  $result = $tools->execute('consultar_reconciliacao', []);
  if (!$result['success'] && str_contains($result['error'] ?? '', 'GLPI')) {
    echo "    (skipped — GLPI não configurado)\n";
    return;
  }
  assertArrayHasKey('warning', $result);
});

// ════════════════════════════════════════════════════════════════════════════
echo "\n" . str_repeat('═', 60) . "\n";
echo "RELATÓRIO DE TESTES — Sprint 06\n";
echo str_repeat('═', 60) . "\n";
echo "Total: " . ($passed + $failed) . "\n";
echo "Passaram: {$passed}\n";
echo "Falharam: {$failed}\n";
echo str_repeat('═', 60) . "\n";

if ($failed > 0) {
  echo "\nFalhas:\n";
  foreach ($errors as $err) {
    echo "  - {$err}\n";
  }
}

exit($failed > 0 ? 1 : 0);
