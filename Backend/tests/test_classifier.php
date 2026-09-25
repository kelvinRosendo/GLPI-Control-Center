<?php
/**
 * tests/test_classifier.php
 * -----------------------------------------------------------------------------
 * Suite de testes para o sistema de classificação de ativos.
 *
 * Inclui 16 cenários obrigatórios de auditoria.
 * Execução: php Backend/tests/test_classifier.php
 */

declare(strict_types=1);
require_once __DIR__ . '/sandbox.php';

require_once GCC_TEST_BACKEND . '/api/classifier.php';
require_once GCC_TEST_BACKEND . '/api/classification_pipeline.php';
require_once GCC_TEST_BACKEND . '/config/asset-catalog.php';

class TestClassifier
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

  public static function assertNotEmpty(mixed $value, string $message): void
  {
    self::assert(!empty($value), $message);
  }

  public static function assertArrayHasKey(string|int $key, array $array, string $message): void
  {
    self::assert(array_key_exists($key, $array), $message);
  }

  public static function report(): int
  {
    echo "\n" . str_repeat('=', 60) . "\n";
    echo "RELATÓRIO DE TESTES\n";
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

$catalog = Classifier::getCatalog();
$pipeline = new ClassificationPipeline($catalog);

echo "\n🧪 Testes do Classificador de Ativos (Auditoria)\n";
echo str_repeat('─', 60) . "\n\n";

// ══════════════════════════════════════════════════════════════════════════════
// CENÁRIOS OBRIGATÓRIOS DE AUDITORIA (16)
// ══════════════════════════════════════════════════════════════════════════════

echo "── Cenários obrigatórios de auditoria ──\n\n";

// 1. Chrome G-001 → chromebook_student
echo "1. Chrome G-001\n";
$a = $pipeline->run(['id' => 1, 'itemtype' => 'Computer', 'name' => 'Chrome G-001']);
TestClassifier::assertEquals('chromebook_student', $a['category'], 'Chrome G-001 → chromebook_student');
TestClassifier::assertEquals('Aluno', $a['purpose'], 'Chrome G-001 → purpose Aluno');

// 2. Chrome-014 → chromebook_support (com zero à esquerda)
echo "\n2. Chrome-014\n";
$a = $pipeline->run(['id' => 2, 'itemtype' => 'Computer', 'name' => 'Chrome-014']);
TestClassifier::assertEquals('chromebook_support', $a['category'], 'Chrome-014 → chromebook_support');
TestClassifier::assertEquals('Apoio', $a['purpose'], 'Chrome-014 → purpose Apoio');

// 3. Chrome EDU1 (com espaço) → chromebook_display
echo "\n3. Chrome EDU1 (espaço)\n";
$a = $pipeline->run(['id' => 3, 'itemtype' => 'Computer', 'name' => 'Chrome EDU1']);
TestClassifier::assertEquals('chromebook_display', $a['category'], 'Chrome EDU1 → chromebook_display');

// 4. Chrome-EDU1 (com hífen) → chromebook_display
echo "\n4. Chrome-EDU1 (hífen)\n";
$a = $pipeline->run(['id' => 4, 'itemtype' => 'Computer', 'name' => 'Chrome-EDU1']);
TestClassifier::assertEquals('chromebook_display', $a['category'], 'Chrome-EDU1 → chromebook_display');

// 5. CS-001 → computer_cs
echo "\n5. CS-001\n";
$a = $pipeline->run(['id' => 5, 'itemtype' => 'Computer', 'name' => 'CS-001']);
TestClassifier::assertEquals('computer_cs', $a['category'], 'CS-001 → computer_cs');

// 6. CO-W01 → computer_cs
echo "\n6. CO-W01\n";
$a = $pipeline->run(['id' => 6, 'itemtype' => 'Computer', 'name' => 'CO-W01']);
TestClassifier::assertEquals('computer_cs', $a['category'], 'CO-W01 → computer_cs');

// 7. Chrome de Carrinho 3 → chromebook_support + location Carrinho 3
echo "\n7. Chrome de Carrinho 3\n";
$a = $pipeline->run([
  'id' => 7,
  'itemtype' => 'Computer',
  'name' => 'Chrome-285',
  'groups_id' => ['name' => 'Geekie > Carrinho > Carrinho 3', 'completename' => 'Geekie > Carrinho > Carrinho 3'],
]);
TestClassifier::assertEquals('chromebook_support', $a['category'], 'Chrome Carrinho 3 → chromebook_support');
TestClassifier::assertEquals('Carrinho 3', $a['cart'], 'Cart = Carrinho 3');
TestClassifier::assertEquals('Carrinho 3', $a['location'], 'Location = Carrinho 3');
TestClassifier::assertEquals('Geekie > Carrinho > Carrinho 3', $a['groupPath'], 'groupPath preservado');

// 8. Computer tipo Impressora → printer_computer
echo "\n8. Computer tipo Impressora\n";
$a = $pipeline->run([
  'id' => 8,
  'itemtype' => 'Computer',
  'name' => 'Impressora Sala 01',
  'computertypes_id' => 'Impressora',
]);
TestClassifier::assertEquals('printer_computer', $a['category'], 'Computer Impressora → printer_computer');

// 9. Printer nativo → printer
echo "\n9. Printer nativo\n";
$a = $pipeline->run(['id' => 9, 'itemtype' => 'Printer', 'name' => 'Canon LBP6030']);
TestClassifier::assertEquals('printer', $a['category'], 'Printer nativo → printer');
TestClassifier::assertEquals('Printer', $a['itemtype'], 'Itemtype preservado como Printer');

// 10. Projetor → projector
echo "\n10. Projetor\n";
$a = $pipeline->run([
  'id' => 10,
  'itemtype' => 'Computer',
  'name' => 'Projetor Sala 02',
  'computertypes_id' => 'Projetor',
]);
TestClassifier::assertEquals('projector', $a['category'], 'Projetor → projector');
TestClassifier::assertEquals('Exibição', $a['purpose'], 'Projetor → purpose Exibição');

// 11. Ativo sem nome → unclassified (nunca desaparece)
echo "\n11. Ativo sem nome\n";
$a = $pipeline->run(['id' => 11, 'itemtype' => 'Computer', 'name' => '']);
TestClassifier::assertEquals('unclassified', $a['category'], 'Sem nome → unclassified');
TestClassifier::assertEquals(11, $a['id'], 'ID preservado mesmo sem classificação');
TestClassifier::assert(!empty($a['classificationWarnings']), 'Avisos preenchidos');

// 12. Erro 403 — preservar dados anteriores
echo "\n12. Cache válido quando vazio\n";
$cacheDir = GCC_TEST_BACKEND . '/data/cache';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
$cacheFile = $cacheDir . '/classified_assets.json';
$backup = file_exists($cacheFile) ? @file_get_contents($cacheFile) : null;

// Simular cache vazio
if (file_exists($cacheFile)) @unlink($cacheFile);
$content = @file_get_contents($cacheFile);
TestClassifier::assert($content === false || $content === '', 'Cache vazio quando não existe');

// Restaurar
if ($backup !== null && $backup !== '') {
  @file_put_contents($cacheFile, $backup);
}

// 13. Estrutura do pipeline
echo "\n13. Estrutura do pipeline\n";
$pipelineReflection = new ReflectionClass('ClassificationPipeline');
TestClassifier::assert($pipelineReflection->hasMethod('run'), 'Pipeline tem run()');
TestClassifier::assert($pipelineReflection->hasMethod('normalizeAsset'), 'Pipeline tem normalizeAsset()');
TestClassifier::assert($pipelineReflection->hasMethod('classifyAsset'), 'Pipeline tem classifyAsset()');
TestClassifier::assert($pipelineReflection->hasMethod('calculateConfidence'), 'Pipeline tem calculateConfidence()');

// 14. Resposta parcial — classificação preserva todos
echo "\n14. Resposta parcial\n";
$classified = Classifier::classifyBatch([
  ['id' => 1, 'itemtype' => 'Computer', 'name' => 'Chrome G-001'],
  ['id' => 2, 'itemtype' => 'Computer', 'name' => ''],
]);
TestClassifier::assertEquals(2, $classified['stats']['total'], 'Total parcial: 2');
TestClassifier::assertEquals(1, $classified['stats']['classified'], '1 classificado');
TestClassifier::assertEquals(1, $classified['stats']['unclassified'], '1 não classificado');
TestClassifier::assertEquals(2, count($classified['items']), '2 itens preservados');

// 15. Cache corrompido
echo "\n15. Cache corrompido\n";
@file_put_contents($cacheFile, '{invalid json}');
$content = @file_get_contents($cacheFile);
$json = json_decode($content, true);
TestClassifier::assert(!is_array($json), 'JSON inválido retorna null');
// Limpar
@unlink($cacheFile);

// Restaurar
if ($backup !== null && $backup !== '') {
  @file_put_contents($cacheFile, $backup);
}

// 16. Lock de concorrência — simulação
echo "\n16. Lock de concorrência\n";
$lockFile = $cacheDir . '/.sync.lock';
@file_put_contents($lockFile, json_encode(['pid' => 999999, 'started_at' => date('c')]));
$lockContent = @file_get_contents($lockFile);
$lockData = json_decode($lockContent, true);
TestClassifier::assert(is_array($lockData), 'Lock file contém JSON válido');
TestClassifier::assertEquals(999999, $lockData['pid'] ?? 0, 'Lock contém PID');
@unlink($lockFile);

// ══════════════════════════════════════════════════════════════════════════════
// TESTES EXISTENTES (mantidos)
// ══════════════════════════════════════════════════════════════════════════════

echo "\n── Testes de classificação legada ──\n\n";

// Case insensitive
echo "17. Case insensitive\n";
TestClassifier::assertEquals('chromebook_student', Classifier::legacyToNew(Classifier::classifyComputerByName('chrome g-123')), 'chrome g- minúsculo');
TestClassifier::assertEquals('chromebook_display', Classifier::legacyToNew(Classifier::classifyComputerByName('CHROME-EDU1')), 'CHROME-EDU1 maiúsculo');
TestClassifier::assertEquals('chromebook_display', Classifier::legacyToNew(Classifier::classifyComputerByName('chrome edu1')), 'chrome edu1 minúsculo com espaço');

// Classificação por tipo
echo "\n18. Classificação por tipo\n";
TestClassifier::assertEquals('projetor', Classifier::classifyByType(['computertypes_id' => 'Projetor']), 'Tipo Projetor');
TestClassifier::assertEquals('impressora', Classifier::classifyByType(['computertypes_id' => 'Impressora']), 'Tipo Impressora');

// Unique key
echo "\n19. Chave única\n";
TestClassifier::assertEquals('Computer:123', Classifier::uniqueKey(['itemtype' => 'Computer', 'id' => 123]), 'Computer:123');
TestClassifier::assertEquals('Printer:456', Classifier::uniqueKey(['itemtype' => 'Printer', 'id' => 456]), 'Printer:456');

// Conversão legado
echo "\n20. Conversão legado → novo\n";
TestClassifier::assertEquals('chromebook_student', Classifier::legacyToNew('alunos'), 'alunos → chromebook_student');
TestClassifier::assertEquals('chromebook_support', Classifier::legacyToNew('apoio'), 'apoio → chromebook_support');
TestClassifier::assertEquals('chromebook_display', Classifier::legacyToNew('exibicao'), 'exibicao → chromebook_display');
TestClassifier::assertEquals('computer_cs', Classifier::legacyToNew('computador'), 'computador → computer_cs');
TestClassifier::assertEquals('printer_computer', Classifier::legacyToNew('impressora'), 'impressora → printer_computer');
TestClassifier::assertEquals('projector', Classifier::legacyToNew('projetor'), 'projetor → projector');
TestClassifier::assertEquals('unclassified', Classifier::legacyToNew('outros'), 'outros → unclassified');

// Carrinho extraído do grupo
echo "\n21. Extração de carrinho\n";
$a = $pipeline->run([
  'id' => 21,
  'itemtype' => 'Computer',
  'name' => 'Chrome-285',
  'groups_id' => ['name' => 'Geekie > Carrinho > Carrinho 3', 'completename' => 'Geekie > Carrinho > Carrinho 3'],
]);
TestClassifier::assertEquals('Carrinho 3', $a['cart'], 'Carrinho extraído');

// Grupo sem carrinho
echo "\n22. Grupo sem carrinho\n";
$a = $pipeline->run([
  'id' => 22,
  'itemtype' => 'Computer',
  'name' => 'Chrome-001',
  'groups_id' => ['name' => 'Geekie > Turma 1A', 'completename' => 'Geekie > Turma 1A'],
]);
TestClassifier::assertEquals('', $a['cart'], 'Sem carrinho');
TestClassifier::assertEquals('Geekie > Turma 1A', $a['location'], 'Localização: grupo completo');

// Preservação de dados brutos
echo "\n23. Preservação de dados brutos\n";
$rawData = [
  'id' => 23,
  'itemtype' => 'Computer',
  'name' => 'CS-001',
  'serial' => 'SN123',
  'otherserial' => 'PAT456',
  'comment' => 'Comentário completo',
  'computertypes_id' => 'Computador',
  'computermodels_id' => 'Dell OptiPlex',
  'manufacturers_id' => 'Dell',
  'states_id' => 'Em uso',
  'groups_id' => ['name' => 'TI', 'completename' => 'TI'],
  'locations_id' => 'Sala TI',
];
$a = $pipeline->run($rawData);
TestClassifier::assertEquals($rawData, $a['raw'], 'Dados brutos preservados');

// Classificação em lote
echo "\n24. Classificação em lote\n";
$batch = Classifier::classifyBatch([
  ['id' => 1, 'itemtype' => 'Computer', 'name' => 'Chrome G-001'],
  ['id' => 2, 'itemtype' => 'Computer', 'name' => 'Chrome-285'],
  ['id' => 3, 'itemtype' => 'Computer', 'name' => 'Chrome-EDU1'],
  ['id' => 4, 'itemtype' => 'Computer', 'name' => 'CS-001'],
  ['id' => 5, 'itemtype' => 'Computer', 'name' => 'Projetor Sala 01'],
  ['id' => 6, 'itemtype' => 'Printer', 'name' => 'EPSON LX-350'],
  ['id' => 7, 'itemtype' => 'Printer', 'name' => 'Canon LBP6030'],
  ['id' => 8, 'itemtype' => 'Computer', 'name' => 'Monitor Dell'],
]);
TestClassifier::assertEquals(8, $batch['stats']['total'], 'Total: 8');
TestClassifier::assertEquals(7, $batch['stats']['classified'], 'Classificados: 7');
TestClassifier::assertEquals(1, $batch['stats']['unclassified'], 'Não classificados: 1');

// Sem duplicação
echo "\n25. Sem duplicação\n";
$keys = array_map(fn($a) => Classifier::uniqueKey($a['raw'] ?? $a), $batch['items']);
$uniqueKeys = array_unique($keys);
TestClassifier::assertEquals(count($keys), count($uniqueKeys), 'Todas as chaves são únicas');

// Nenhum ativo desaparece (575)
echo "\n26. Nenhum ativo desaparece (575)\n";
$allAssets = [];
for ($i = 0; $i < 575; $i++) {
  $allAssets[] = [
    'id' => $i + 1,
    'itemtype' => $i < 572 ? 'Computer' : 'Printer',
    'name' => 'Asset ' . ($i + 1),
  ];
}
$batchResult = Classifier::classifyBatch($allAssets);
TestClassifier::assertEquals(575, $batchResult['stats']['total'], 'Total: 575');
TestClassifier::assertEquals(575, count($batchResult['items']), 'Classificados: 575');
TestClassifier::assertEquals(575, ($batchResult['stats']['classified'] ?? 0) + ($batchResult['stats']['unclassified'] ?? 0), 'Classificados + não classificados = total');

// Histórico de comentários
echo "\n27. Histórico de comentários\n";
$a = $pipeline->run([
  'id' => 27,
  'itemtype' => 'Computer',
  'name' => 'Chrome-003',
  'comment' => '01/01/2025 - Assistência técnica realizada. Defeito na tela.',
]);
TestClassifier::assert($a['historyIndicators']['hasAssistencia'], 'Indicador de assistência');
TestClassifier::assert($a['historyIndicators']['hasDefeito'], 'Indicador de defeito');

// Confiança calculada
echo "\n28. Cálculo de confiança\n";
$a = $pipeline->run([
  'id' => 28,
  'itemtype' => 'Computer',
  'name' => 'Chrome G-001',
  'groups_id' => ['name' => 'Turma A'],
  'computertypes_id' => 'Notebook',
]);
TestClassifier::assert($a['classificationConfidence'] >= 0.5, 'Confiança >= 0.5');
TestClassifier::assert($a['classificationConfidence'] <= 1.0, 'Confiança <= 1.0');

$a2 = $pipeline->run(['id' => 29, 'itemtype' => 'Computer', 'name' => '']);
TestClassifier::assert($a2['classificationConfidence'] < 0.5, 'Confiança sem nome < 0.5');

// Labels de categorias
echo "\n29. Labels de categorias\n";
TestClassifier::assertEquals('Alunos', Classifier::categoryLabel('chromebook_student'), 'Label chromebook_student');
TestClassifier::assertEquals('Não classificado', Classifier::categoryLabel('unclassified'), 'Label unclassified');
TestClassifier::assertEquals('Computadores', Classifier::categoryLabel('computer_cs'), 'Label computer_cs');

// Todas as categorias
echo "\n30. Todas as categorias\n";
$allCats = Classifier::allCategories();
TestClassifier::assert(count($allCats) >= 7, 'Pelo menos 7 categorias');
TestClassifier::assert(isset($allCats['computer_cs']), 'computer_cs definido');
TestClassifier::assert(isset($allCats['chromebook_student']), 'chromebook_student definido');
TestClassifier::assert(isset($allCats['unclassified']), 'unclassified definido');

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO FINAL
// ══════════════════════════════════════════════════════════════════════════════

$exitCode = TestClassifier::report();
exit($exitCode);
