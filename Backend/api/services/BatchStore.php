<?php
/**
 * BatchStore.php
 * -----------------------------------------------------------------------------
 * Persistência de lotes (até 10 itens) — sobrevive ao fechamento da aba.
 * Cada item tem estado e resultado próprios; totais por categoria.
 *
 * Sprint 08
 */
declare(strict_types=1);

final class BatchStore
{
  private string $batchDir;

  public function __construct(?string $baseDir = null)
  {
    $base = $baseDir ?? (realpath(__DIR__ . '/../../data') ?: __DIR__ . '/../../data');
    $this->batchDir = $base . '/batches';
    if (!is_dir($this->batchDir)) @mkdir($this->batchDir, 0755, true);
  }

  public function create(array $proposalIds, string $userId): array
  {
    $batchId = 'batch_' . bin2hex(random_bytes(8));
    $batch = [
      'batch_id' => $batchId,
      'user_id' => $userId,
      'created_at' => date('c'),
      'proposal_ids' => $proposalIds,
      'items' => [],
      'totals' => ['total'=>count($proposalIds),'verified'=>0,'pending_verification'=>0,'partial'=>0,'failed'=>0,'cancelled'=>0,'unknown'=>0],
      'status' => 'pending',
    ];
    $this->persist($batch);
    return $batch;
  }

  public function updateItem(string $batchId, array $itemResult): void
  {
    $batch = $this->find($batchId);
    if ($batch === null) return;
    // itemResult contém proposal_id, success, status, operation, etc.
    $found = false;
    foreach ($batch['items'] as &$it) {
      if (($it['proposal_id'] ?? '') === ($itemResult['proposal_id'] ?? '')) {
        $it = array_merge($it, $itemResult);
        $it['updated_at'] = date('c');
        $found = true;
        break;
      }
    }
    unset($it);
    if (!$found) {
      $itemResult['updated_at'] = date('c');
      $batch['items'][] = $itemResult;
    }
    $batch['totals'] = $this->computeTotals($batch['items']);
    $batch['totals']['total'] = count($batch['proposal_ids']);
    $batch['updated_at'] = date('c');
    $batch['status'] = $this->deriveStatus($batch['totals']);
    $this->persist($batch);
  }

  public function setItems(string $batchId, array $items): void
  {
    $batch = $this->find($batchId);
    if ($batch === null) return;
    $batch['items'] = $items;
    $batch['totals'] = $this->computeTotals($items);
    $batch['totals']['total'] = count($batch['proposal_ids']);
    $batch['updated_at'] = date('c');
    $batch['status'] = $this->deriveStatus($batch['totals']);
    $this->persist($batch);
  }

  public function find(string $batchId): ?array
  {
    $file = $this->batchDir . '/' . $batchId . '.json';
    if (!file_exists($file)) return null;
    $c = @file_get_contents($file);
    if ($c === false) return null;
    return json_decode($c, true);
  }

  public function findByUser(string $userId): array
  {
    $files = glob($this->batchDir . '/*.json') ?: [];
    $res = [];
    foreach ($files as $f) {
      $c = @file_get_contents($f);
      $j = json_decode($c ?: '', true);
      if (is_array($j) && ($j['user_id'] ?? '') === $userId) $res[] = $j;
    }
    usort($res, fn($a,$b)=> strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''));
    return $res;
  }

  private function computeTotals(array $items): array
  {
    $t = ['total'=>count($items),'verified'=>0,'pending_verification'=>0,'partial'=>0,'failed'=>0,'cancelled'=>0,'unknown'=>0];
    foreach ($items as $it) {
      $status = $it['status'] ?? $it['verification']['overall'] ?? 'unknown';
      $success = $it['success'] ?? false;
      // Mapear status para totais do spec
      if ($status === 'verified' || $status === 'completed_verified' || $status === 'verified_glpi' || $status === 'verified_local') {
        $t['verified']++;
      } elseif ($status === 'failed' || $status === 'not_found' || $status === 'policy_rejected' || $status === 'no_permission') {
        $t['failed']++;
      } elseif ($status === 'cancelled' || $status === 'expired') {
        $t['cancelled']++;
      } elseif ($status === 'partial' || $status === 'completed_partial' || $status === 'partial_cache_pending' || $status === 'divergent') {
        $t['partial']++;
      } elseif ($status === 'unknown' || $status === 'in_progress' || $status === 'pending') {
        $t['unknown']++;
        // se execução ok mas verificação pendente
        if ($success) $t['pending_verification']++;
      } else {
        $t['unknown']++;
      }
    }
    // Corrigir: pending_verification é subcategoria de verified? Manter separado
    return $t;
  }

  private function deriveStatus(array $totals): string
  {
    if ($totals['failed'] > 0 && $totals['verified'] > 0) return 'partial';
    if ($totals['failed'] === $totals['total'] && $totals['total'] > 0) return 'failed';
    if ($totals['verified'] === $totals['total'] && $totals['total'] > 0) return 'completed';
    return 'partial';
  }

  private function persist(array $batch): void
  {
    $file = $this->batchDir . '/' . $batch['batch_id'] . '.json';
    @file_put_contents($file, json_encode($batch, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
  }
}
