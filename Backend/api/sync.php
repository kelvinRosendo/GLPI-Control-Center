<?php
/**
 * api/sync.php
 * -----------------------------------------------------------------------------
 * Camada de sincronização com GLPI.
 *
 * Correções de auditoria:
 * - Lock de arquivo para evitar sobrescrita concorrente
 * - Escrita atômica (write-to-temp + rename) para evitar cache corrompido
 * - Status persistido durante a execução (running/completed/partial/failed)
 * - Sincronização incremental com fallback para completa quando GLPI não suporta
 * - Validação de caminhos contra path traversal
 * - Preservação de dados anteriores em falha parcial
 * - Sem exposição de tokens no relatório
 */

declare(strict_types=1);

require_once __DIR__ . '/classifier.php';
require_once __DIR__ . '/classification_pipeline.php';

final class AssetSync
{
  private GlpiClient $client;
  private array $catalog;
  private string $dataDir;
  private string $cacheDir;
  private string $logDir;
  private string $lockFile;
  /** @var resource|null */
  private $lockHandle = null;

  public function __construct(array $glpiConfig, array $catalog, ?string $dataDir = null, ?string $logDir = null)
  {
    $this->client = new GlpiClient($glpiConfig);
    $this->catalog = $catalog;

    $baseDir = $dataDir ?? (realpath(__DIR__ . '/../data') ?: __DIR__ . '/../data');
    $this->dataDir = $baseDir;
    $this->cacheDir = $baseDir . '/cache';
    $this->logDir = $logDir ?? (realpath(__DIR__ . '/../logs') ?: __DIR__ . '/../logs');
    $this->lockFile = $this->cacheDir . '/.sync.lock';

    foreach ([$this->dataDir, $this->cacheDir, $this->logDir] as $dir) {
      if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
      }
    }
  }

  public function __destruct()
  {
    $this->releaseLock();
  }

  // ── Lock de concorrência ────────────────────────────────────────────────────

  /**
   * Adquire lock exclusivo. Retorna false se já estiver em execução.
   */
  private function acquireLock(): bool
  {
    $this->lockHandle = @fopen($this->lockFile, 'c');
    if ($this->lockHandle === false) { $this->lockHandle = null; return false; }

    if (!flock($this->lockHandle, LOCK_EX | LOCK_NB)) {
      fclose($this->lockHandle);
      $this->lockHandle = null;
      return false;
    }

    ftruncate($this->lockHandle, 0);
    fwrite($this->lockHandle, json_encode([
      'pid'       => getmypid(),
      'started_at'=> date('c'),
    ]));
    fflush($this->lockHandle);
    return true;
  }

  private function releaseLock(): void
  {
    if ($this->lockHandle !== null) {
      flock($this->lockHandle, LOCK_UN);
      fclose($this->lockHandle);
      $this->lockHandle = null;
      // Keep the inode: deleting a lock file can allow two independent locks.
    }
  }

  /**
   * Verifica se há uma sincronização em execução.
   */
  public function isRunning(): bool
  {
    $handle = @fopen($this->lockFile, 'c');
    if ($handle === false) return false;
    $available = flock($handle, LOCK_EX | LOCK_NB);
    if ($available) flock($handle, LOCK_UN);
    fclose($handle);
    return !$available;
  }

  // ── Sincronização completa ──────────────────────────────────────────────────

  /** Full snapshot of every configured physical asset collection. */
  public function fullSync(): array
  {
    if (!$this->acquireLock()) {
      return ['items' => $this->loadClassifiedData(), 'stats' => [],
        'syncInfo' => ['status' => 'locked', 'message' => 'Sincronização indisponível: em execução ou sem permissão de escrita.']];
    }
    $started = microtime(true);
    $previousData = $this->loadClassifiedData();
    $info = ['started_at' => date('c'), 'completed_at' => null, 'duration_sec' => 0,
      'status' => 'running', 'mode' => 'full', 'collections' => [], 'errors' => []];
    $session = null;
    $items = $previousData;
    try {
      if (!$this->writeStatus('running', $info)) {
        throw new RuntimeException('Não foi possível gravar o status da sincronização.');
      }
      $session = $this->client->initSession();
      $raw = [];
      foreach ($this->collections() as $type) {
        foreach ($this->fetchCollection('/' . $type, $session, $info) as $item) {
          $item['itemtype'] = $type;
          $raw[] = $item;
        }
      }
      if ($info['errors'] !== []) {
        // Never publish a mixture of partial fresh data and old records.
        throw new RuntimeException('Uma ou mais coleções não foram lidas integralmente.');
      }
      $classified = Classifier::classifyBatch($raw);
      if (!$this->atomicSave($this->cacheDir . '/classified_assets.json', $classified['items'])) {
        throw new RuntimeException('Não foi possível substituir o cache de ativos.');
      }
      $items = $classified['items'];
      $info['status'] = 'success';
      $info['total_items'] = count($items);
      $info['coverage'] = $this->collections();
      $info['source'] = 'glpi';
      $this->atomicSave($this->dataDir . '/inventario_' . date('Y-m-d_H-i-s') . '.json', $raw);
    } catch (Throwable $e) {
      $info['status'] = 'failed';
      $info['preserved_from_cache'] = count($previousData);
      $info['errors'][] = ['collection' => 'sync',
        'message' => 'Sincronização não concluída. Confira conexão, credenciais, permissões de leitura e gravação.',
        'error_class' => get_class($e)];
    } finally {
      if ($session !== null) {
        try { $this->client->killSession($session); } catch (Throwable $ignored) {}
      }
      $info['completed_at'] = date('c');
      $info['duration_sec'] = round(microtime(true) - $started, 3);
      $stats = $this->computeStats($items);
      $this->saveSyncReport($info, $stats);
      $this->writeStatus($info['status'], $info);
      $this->releaseLock();
    }
    return ['items' => $items, 'stats' => $stats, 'syncInfo' => $info];
  }

  /** GLPI collection reads are full snapshots; use the same validated path. */
  public function incrementalSync(): array
  {
    return $this->fullSync();
  }

  private function collections(): array
  {
    $types = $this->catalog['sync']['collections']
      ?? ['Computer', 'Printer', 'Monitor', 'Peripheral', 'NetworkEquipment', 'Phone'];
    if (!is_array($types) || $types === []) throw new RuntimeException('Coleções não configuradas.');
    foreach ($types as $type) {
      if (!is_string($type) || !preg_match('/^[A-Za-z][A-Za-z0-9_]*$/D', $type)) {
        throw new RuntimeException('Coleção inválida.');
      }
    }
    return array_values(array_unique($types));
  }

  // ── Status persistido ───────────────────────────────────────────────────────

  /**
   * Escreve status da sincronização em arquivo.
   */
  private function writeStatus(string $status, array $extra = []): bool
  {
    $statusData = array_merge([
      'status'     => $status,
      'updated_at' => date('c'),
      'pid'        => getmypid(),
    ], $extra);

    return $this->atomicSave($this->cacheDir . '/sync_status.json', $statusData);
  }

  /**
   * Retorna status da última sincronização.
   */
  public function getSyncStatus(): array
  {
    $statusFile = $this->cacheDir . '/sync_status.json';
    if (!file_exists($statusFile)) {
      return ['status' => 'never_synced'];
    }

    $content = @file_get_contents($statusFile);
    if ($content === false) return ['status' => 'error'];

    return json_decode($content, true) ?? ['status' => 'error'];
  }

  // ── Cache ───────────────────────────────────────────────────────────────────

  /**
   * Carrega dados classificados do cache com validação.
   */
  public function loadClassifiedData(): array
  {
    $cacheFile = $this->cacheDir . '/classified_assets.json';
    if (!file_exists($cacheFile)) return [];

    $content = @file_get_contents($cacheFile);
    if ($content === false) return [];

    // Validação de tamanho máximo (50MB)
    if (strlen($content) > 50 * 1024 * 1024) {
      $this->logError('Cache excede 50MB — ignorando');
      return [];
    }

    $data = json_decode($content, true);
    if (is_array($data) && isset($data['items'])) $data = $data['items'];
    if (!is_array($data) || $data !== array_values($data)) {
      $this->logError('Cache JSON inválido — ignorando');
      return [];
    }

    return $data;
  }

  /**
   * Retorna estatísticas da última sincronização.
   */
  public function getSyncStats(): array
  {
    $reportFile = $this->dataDir . '/sync_report.json';
    if (!file_exists($reportFile)) {
      return ['status' => 'never_synced'];
    }

    $content = @file_get_contents($reportFile);
    if ($content === false) return ['status' => 'error'];

    $data = json_decode($content, true);
    if (!is_array($data)) return ['status' => 'error'];

    // Remover tokens sensíveis do relatório
    unset($data['glpi_tokens'], $data['session_token']);

    return $data;
  }

  /**
   * Retorna indicadores de observabilidade.
   */
  public function getIndicators(): array
  {
    $items = $this->loadClassifiedData();
    $report = $this->getSyncStats();
    $syncStatus = $this->getSyncStatus();

    if ($items === []) {
      return [
        'status'             => 'no_data',
        'total_received'     => 0,
        'total_classified'   => 0,
        'total_unclassified' => 0,
        'total_warnings'     => 0,
        'by_category'        => [],
        'by_itemtype'        => [],
        'by_group'           => [],
        'by_state'           => [],
        'last_sync'          => $report['sync_info'] ?? null,
        'sync_status'        => $syncStatus['status'] ?? 'unknown',
        'categories_with_error' => [],
        'total_sync_time_sec'   => 0,
      ];
    }

    return [
      'status'             => $syncStatus['status'] ?? 'unknown',
      'total_received'     => count($items),
      'total_classified'   => count($items) - $this->countByCategory($items, 'unclassified'),
      'total_unclassified' => $this->countByCategory($items, 'unclassified'),
      'total_warnings'     => $this->countWarnings($items),
      'by_category'        => $this->groupByField($items, 'category'),
      'by_itemtype'        => $this->groupByField($items, 'itemtype'),
      'by_group'           => $this->groupByField($items, 'groupPath', '(sem grupo)'),
      'by_state'           => $this->groupByField($items, 'stateSummary', 'desconhecido'),
      'last_sync'          => $report['sync_info'] ?? null,
      'sync_status'        => $syncStatus['status'] ?? 'unknown',
      'categories_with_error' => [],
      'total_sync_time_sec'   => $report['sync_info']['duration_sec'] ?? 0,
    ];
  }

  /**
   * Retorna estado explícito do cache com metadados detalhados.
   *
   * Estados possíveis:
   * - "not_created": cache nunca foi criado
   * - "valid": cache válido com ativos
   * - "empty": sync completa com zero ativos
   * - "partial": sync parcial (algumas coleções falharam)
   * - "invalid": cache corrompido ou ilegível
   * - "stale": cache existe mas última sync falhou
   */
  public function getCacheState(): array
  {
    $cacheFile = $this->cacheDir . '/classified_assets.json';
    $report = $this->getSyncStats();
    $syncStatus = $this->getSyncStatus();

    // Cache não existe
    if (!file_exists($cacheFile)) {
      return [
        'state'           => 'not_created',
        'exists'          => false,
        'items_count'     => 0,
        'file_size'       => 0,
        'catalog_version' => $this->catalog['version'] ?? null,
        'last_sync'       => $report['sync_info'] ?? null,
        'sync_status'     => $syncStatus['status'] ?? 'unknown',
        'data_date'       => null,
        'message'         => 'Cache ainda não foi criado. Execute uma sincronização.',
      ];
    }

    $fileSize = filesize($cacheFile);
    $content = @file_get_contents($cacheFile);

    // Cache ilegível
    if ($content === false) {
      return [
        'state'           => 'invalid',
        'exists'          => true,
        'items_count'     => 0,
        'file_size'       => $fileSize,
        'catalog_version' => $this->catalog['version'] ?? null,
        'last_sync'       => $report['sync_info'] ?? null,
        'sync_status'     => $syncStatus['status'] ?? 'unknown',
        'data_date'       => null,
        'message'         => 'Cache existe mas não pode ser lido.',
      ];
    }

    // Cache muito grande
    if ($fileSize > 50 * 1024 * 1024) {
      return [
        'state'           => 'invalid',
        'exists'          => true,
        'items_count'     => 0,
        'file_size'       => $fileSize,
        'catalog_version' => $this->catalog['version'] ?? null,
        'last_sync'       => $report['sync_info'] ?? null,
        'sync_status'     => $syncStatus['status'] ?? 'unknown',
        'data_date'       => null,
        'message'         => 'Cache excede 50MB — possivelmente corrompido.',
      ];
    }

    $data = json_decode($content, true);

    // Cache JSON inválido
    if (!is_array($data)) {
      return [
        'state'           => 'invalid',
        'exists'          => true,
        'items_count'     => 0,
        'file_size'       => $fileSize,
        'catalog_version' => $this->catalog['version'] ?? null,
        'last_sync'       => $report['sync_info'] ?? null,
        'sync_status'     => $syncStatus['status'] ?? 'unknown',
        'data_date'       => null,
        'message'         => 'Cache JSON inválido.',
      ];
    }

    if (isset($data['items']) && is_array($data['items'])) $data = $data['items'];
    $count = count($data);
    $lastModified = filemtime($cacheFile);
    $dataDate = $lastModified ? date('c', $lastModified) : null;

    // Sync parcial?
    $isPartial = ($syncStatus['status'] ?? '') === 'partial';
    $lastSyncFailed = ($syncStatus['status'] ?? $report['sync_info']['status'] ?? '') === 'failed';

    $verified = ($report['sync_info']['source'] ?? '') === 'glpi'
      && ($report['sync_info']['coverage'] ?? []) === $this->collections()
      && ($report['sync_info']['status'] ?? '') === 'success';
    if (!$verified || $lastSyncFailed || $isPartial) {
      return ['state' => $lastSyncFailed ? 'stale' : ($isPartial ? 'partial' : 'unverified'),
        'exists' => true, 'items_count' => $count, 'file_size' => $fileSize,
        'catalog_version' => $this->catalog['version'] ?? null,
        'last_sync' => $report['sync_info'] ?? null,
        'sync_status' => $syncStatus['status'] ?? 'unknown', 'data_date' => $dataDate,
        'message' => $lastSyncFailed
          ? 'Última sincronização falhou. O inventário anterior foi preservado.'
          : 'Cobertura do inventário não confirmada. Execute uma sincronização completa.',
        'collections' => $this->collections()];
    }

    if ($count === 0) {
      return [
        'state'           => 'empty',
        'exists'          => true,
        'items_count'     => 0,
        'file_size'       => $fileSize,
        'catalog_version' => $this->catalog['version'] ?? null,
        'last_sync'       => $report['sync_info'] ?? null,
        'sync_status'     => $syncStatus['status'] ?? 'unknown',
        'data_date'       => $dataDate,
        'message'         => 'Sincronização concluída com zero ativos.',
      ];
    }

    if ($isPartial) {
      return [
        'state'           => 'partial',
        'exists'          => true,
        'items_count'     => $count,
        'file_size'       => $fileSize,
        'catalog_version' => $this->catalog['version'] ?? null,
        'last_sync'       => $report['sync_info'] ?? null,
        'sync_status'     => $syncStatus['status'] ?? 'unknown',
        'data_date'       => $dataDate,
        'message'         => 'Cache parcial — última sincronização não foi completa.',
      ];
    }

    if ($lastSyncFailed) {
      return [
        'state'           => 'stale',
        'exists'          => true,
        'items_count'     => $count,
        'file_size'       => $fileSize,
        'catalog_version' => $this->catalog['version'] ?? null,
        'last_sync'       => $report['sync_info'] ?? null,
        'sync_status'     => $syncStatus['status'] ?? 'unknown',
        'data_date'       => $dataDate,
        'message'         => 'Cache válido mas última sync falhou. Dados podem estar desatualizados.',
      ];
    }

    return [
      'state'           => 'valid',
      'exists'          => true,
      'items_count'     => $count,
      'file_size'       => $fileSize,
      'catalog_version' => $this->catalog['version'] ?? null,
      'last_sync'       => $report['sync_info'] ?? null,
      'sync_status'     => $syncStatus['status'] ?? 'unknown',
      'data_date'       => $dataDate,
      'message'         => 'Cache válido com ' . $count . ' ativos.',
    ];
  }

  // ── Métodos auxiliares privados ─────────────────────────────────────────────

  private function fetchCollection(string $collection, string $session, array &$syncInfo, array $options = []): array
  {
    $result = $this->client->getAllWithParams($collection, $session, array_merge([
      'expand_dropdowns' => 'true', 'is_deleted' => 'false',
    ], $options['criteria'] ?? []), (int)($this->catalog['sync']['batch_size'] ?? 500));
    $syncInfo['collections'][$collection] = [
      'total' => count($result['items']), 'expected' => $result['total'],
      'pages' => $result['pages'] ?? 0, 'complete' => $result['complete'] === true,
    ];
    if ($result['complete'] !== true) {
      foreach ($result['errors'] ?: ['Coleção incompleta.'] as $error) {
        $syncInfo['errors'][] = ['collection' => $collection, 'message' => $error];
      }
      return [];
    }
    return $result['items'];
  }

  private function mergeIncremental(array $existing, array $updated): array
  {
    $map = [];
    foreach ($existing as $item) {
      $raw = $item['raw'] ?? $item;
      $key = Classifier::uniqueKey($raw);
      $map[$key] = $item;
    }

    foreach ($updated as $item) {
      $key = Classifier::uniqueKey($item);
      // Sobrescrever com dados atualizados
      $map[$key] = $item;
    }

    return array_values($map);
  }

  /**
   * Escrita atômica: escreve em temp + rename para evitar cache corrompido.
   */
  private function atomicSave(string $path, mixed $data): bool
  {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) return false;

    $tempFile = $path . '.tmp.' . getmypid();
    $dir = dirname($path);

    if (!is_dir($dir)) {
      @mkdir($dir, 0755, true);
    }

    $written = @file_put_contents($tempFile, $json, LOCK_EX);
    if ($written === false) {
      @unlink($tempFile);
      return false;
    }

    if (!@rename($tempFile, $path)) {
      @unlink($tempFile);
      return false;
    }
    return true;
  }

  private function saveSyncReport(array $syncInfo, array $stats): void
  {
    $report = [
      'sync_info' => $syncInfo,
      'stats'     => $stats,
      'catalog_version' => $this->catalog['version'] ?? '0.0.0',
    ];

    $this->atomicSave($this->dataDir . '/sync_report.json', $report);

    // Log (append com lock)
    $logFile = $this->logDir . '/sync_' . date('Y-m-d') . '.log';
    $logEntry = sprintf(
      "[%s] Sync %s (%s): %d items, %s sec, %d errors\n",
      date('Y-m-d H:i:s'),
      $syncInfo['status'],
      $syncInfo['mode'] ?? 'full',
      $stats['total'] ?? 0,
      $syncInfo['duration_sec'] ?? 0,
      count($syncInfo['errors'] ?? [])
    );
    @file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
  }

  private function computeStats(array $items): array
  {
    $stats = [
      'total'       => count($items),
      'classified'  => 0,
      'unclassified'=> 0,
      'byCategory'  => [],
      'byItemtype'  => [],
    ];

    foreach ($items as $item) {
      $cat = $item['category'] ?? 'unknown';
      $it = $item['itemtype'] ?? 'unknown';
      if ($cat === 'unclassified') $stats['unclassified']++;
      else $stats['classified']++;
      $stats['byCategory'][$cat] = ($stats['byCategory'][$cat] ?? 0) + 1;
      $stats['byItemtype'][$it] = ($stats['byItemtype'][$it] ?? 0) + 1;
    }

    return $stats;
  }

  private function groupByField(array $items, string $field, string $emptyLabel = '(vazio)'): array
  {
    $groups = [];
    foreach ($items as $item) {
      $key = $item[$field] ?? $emptyLabel;
      if ($key === '') $key = $emptyLabel;
      $groups[$key] = ($groups[$key] ?? 0) + 1;
    }
    arsort($groups);
    return $groups;
  }

  private function countByCategory(array $items, string $category): int
  {
    $count = 0;
    foreach ($items as $item) {
      if (($item['category'] ?? '') === $category) $count++;
    }
    return $count;
  }

  private function countWarnings(array $items): int
  {
    $count = 0;
    foreach ($items as $item) {
      $count += count($item['classificationWarnings'] ?? []);
    }
    return $count;
  }

  private function logError(string $message): void
  {
    $logFile = $this->logDir . '/sync_errors_' . date('Y-m-d') . '.log';
    @file_put_contents($logFile, '[' . date('Y-m-d H:i:s') . '] ' . $message . "\n", FILE_APPEND | LOCK_EX);
  }
}
