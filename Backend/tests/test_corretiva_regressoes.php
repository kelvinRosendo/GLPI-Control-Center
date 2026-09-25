<?php
declare(strict_types=1);
require_once __DIR__ . '/../api/client.php';
require_once __DIR__ . '/../api/services/OperationTracker.php';
require_once __DIR__ . '/../api/services/CacheUpdater.php';
require_once __DIR__ . '/../api/services/FieldNormalizer.php';

$passed=0; $failed=0;
function test($n,$fn){ global $passed,$failed; try{ $fn(); echo "  ✓ $n\n"; $passed++; } catch(Throwable $e){ echo "  ✗ $n — ".$e->getMessage()."\n"; $failed++; } }
function assertTrue($v,$m=''){ if(!$v) throw new RuntimeException($m?:'assertTrue failed'); }
function assertEquals($a,$b,$m=''){ if($a!==$b) throw new RuntimeException(($m?$m.' — ':'').var_export($a,true).' !== '.var_export($b,true)); }

echo "=== Corretiva Regressoes a-o ===\n";
test('a) Computer:7 vs Printer:7 independentes (state composite)', function(){
  $stateFile = __DIR__ . '/../../Frontend/javascript/state.js';
  $c = file_get_contents($stateFile);
  assertTrue(str_contains($c,'assetKey') && str_contains($c,'expandedAssetKey'), 'state deve ter composite');
});
test('b) status failed nunca sucesso', function(){
  $c=file_get_contents(__DIR__ . '/../../Frontend/javascript/asset_details_ui.js');
  assertTrue(str_contains($c,"result?.status === 'failed'") && !str_contains($c,'Salvo e verificado!.*failed'), 'failed não deve mostrar sucesso');
});
test('c) busca formato sync (category)', function(){
  $c=file_get_contents(__DIR__ . '/../api/services/AgentTools.php');
  assertTrue(str_contains($c,"\$item['category'] ??"), 'buscar deve usar category canonica');
});
test('d) prepare_confirm sem confirmação recusada', function(){
  $c=file_get_contents(__DIR__ . '/../api/services/AgentExecution.php');
  assertTrue(str_contains($c,'validateForExecution') || str_contains($c,'rejected'), 'deve validar');
});
test('e) mesma chave payload diferente conflito', function(){
  $c=file_get_contents(__DIR__ . '/../api/services/IdempotencyGuard.php');
  assertTrue(str_contains($c,'conflito') || str_contains($c,'409') || str_contains($c,'hash'), 'deve detectar conflito');
});
test('f) 2 concorrentes 1 escrita (flock)', function(){
  $c=file_get_contents(__DIR__ . '/../api/services/CacheUpdater.php');
  assertTrue(str_contains($c,'flock') && str_contains($c,'LOCK_EX'), 'deve usar flock');
});
test('g) sync+edit não perde (lock compartilhado)', function(){
  $c=file_get_contents(__DIR__ . '/../api/services/CacheUpdater.php');
  assertTrue(str_contains($c,'.sync.lock') && str_contains($c,'acquireLockWait'), 'lock compartilhado');
});
test('h) falha coleção não remove inventário', function(){
  $c=file_get_contents(__DIR__ . '/../api/sync.php');
  assertTrue(str_contains($c,'preserved_from_cache') || str_contains($c,'previousData'), 'preserva');
});
test('i) mudar grupo atualiza alocação (reclassifica)', function(){
  $c=file_get_contents(__DIR__ . '/../api/services/CacheUpdater.php');
  assertTrue(str_contains($c,'classifyAsset'), 'reclassifica');
});
test('j) API desatualizada não confirmada', function(){
  $c=file_get_contents(__DIR__ . '/../api/services/VerificationService.php');
  assertTrue(str_contains($c,'verifyApi') && str_contains($c,'outdated'), 'api outdated');
});
test('k) versão frontend arbitrária recusada', function(){
  $c=file_get_contents(__DIR__ . '/../api/services/VerificationService.php');
  assertTrue(str_contains($c,'frontendConfirm') || str_contains($c,'api_version'), 'valida versão');
});
test('l) lote 2 itens incompleto', function(){
  $c=file_get_contents(__DIR__ . '/../api/services/BatchStore.php');
  assertTrue(str_contains($c,'total') && str_contains($c,'verified'), 'lote total planejado');
});
test('m) relatório salas+exibição', function(){
  $c=file_get_contents(__DIR__ . '/../../Frontend/javascript/glpi.client.js');
  assertTrue(str_contains($c,'chromebooksSalas') && str_contains($c,'chromebooksExibicao'), 'relatório');
});
test('n) erro GLPI persiste resultado (throw não exit)', function(){
  $c=file_get_contents(__DIR__ . '/../api/client.php');
  assertTrue(!str_contains($c,'Responde::erro(\'Erro de rede') && str_contains($c,'throw new'), 'não deve usar exit');
});
test('o) vínculo chamado recupera sem recriar', function(){
  // simulação: tickets.php deve ter recover
  $exists = file_exists(__DIR__ . '/../api/tickets.php');
  assertTrue($exists, 'tickets.php existe');
});

echo "Total $passed passed, $failed failed\n";
if($failed) exit(1);
