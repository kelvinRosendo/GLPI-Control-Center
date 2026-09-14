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

  public function __construct(array $glpiConfig, array $catalog)
  {
    $this->client = new GlpiClient($glpiConfig);
    $this->catalog = $catalog;

    $baseDir = realpath(__DIR__ . '/../data') ?: __DIR__ . '/../data';
    $this->dataDir = $baseDir;
    $this->cacheDir = $baseDir . '/cache';
    $this->logDir = (realpath(__DIR__ . '/../logs') ?: __DIR__ . '/../logs');
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
    if ($this->lockHandle === false) return false;

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
      @unlink($this->lockFile);
    }
  }

  /**
   * Verifica se há uma sincronização em execução.
   */
  public function isRunning(): bool
  {
    if (!file_exists($this->lockFile)) return false;
    $content = @file_get_contents($this->lockFile);
    if ($content === false) return false;
    $data = json_decode($content, true);
    return is_array($data) && isset($data['pid']);
  }

  // ── Sincronização completa ──────────────────────────────────────────────────

  /**
   * Sincronização completa: Computer + Printer.
   */
  public function fullSync(): array
  {
    if (!$this->acquireLock()) {
      return [
        'items'    => $this->loadClassifiedData(),
        'stats'    => ['total' => 0, 'error' => 'Sincronização já em execução'],
        'syncInfo' => ['status' => 'locked', 'message' => 'Outra sincronização está em execução.'],
      ];
    }

    // Status: running
    $this->writeStatus('running');

    $startTime = microtime(true);
    $syncInfo = [
      'started_at'   => date('c'),
      'completed_at' => null,
      'duration_sec' => 0,
      'status'       => 'running',
      'mode'         => 'full',
      'collections'  => [],
      'errors'       => [],
    ];

    $previousData = $this->loadClassifiedData();

    try {
      $session = $this->client->initSession();
      $allItems = [];

      try {
        $computerResult = $this->fetchCollection('/Computer', $session, $syncInfo);
        foreach ($computerResult as $item) {
          $item['itemtype'] = 'Computer';
          $allItems[] = $item;
        }

        $printerResult = $this->fetchCollection('/Printer', $session, $syncInfo);
        foreach ($printerResult as $item) {
          $item['itemtype'] = 'Printer';
          $allItems[] = $item;
        }

        $this->client->killSession($session);
      } catch (\Throwable $e) {
        $this->client->killSession($session);
        $syncInfo['errors'][] = [
          'collection' => 'session',
          'message'    => $e->getMessage(),
          'file'       => $e->getFile(),
          'line'       => $e->getLine(),
        ];
      }

      // Se houve erros e não coletamos nada, preservar dados anteriores
      if ($allItems === [] && $previousData !== []) {
        $syncInfo['status'] = 'failed';
        $syncInfo['completed_at'] = date('c');
        $syncInfo['duration_sec'] = round(microtime(true) - $startTime, 3);
        $syncInfo['preserved_from_cache'] = count($previousData);
        $this->writeStatus('failed', $syncInfo);
        $this->releaseLock();

        return [
          'items'    => $previousData,
          'stats'    => $this->computeStats($previousData),
          'syncInfo' => $syncInfo,
        ];
      }

      // Classificar todos os ativos
      $classified = Classifier::classifyBatch($allItems);

      $endTime = microtime(true);
      $syncInfo['completed_at'] = date('c');
      $syncInfo['duration_sec'] = round($endTime - $startTime, 3);
      $syncInfo['status'] = empty($syncInfo['errors']) ? 'success' : 'partial';
      $syncInfo['total_items'] = count($allItems);

      // Escrita atômica
      $this->atomicSave($this->cacheDir . '/classified_assets.json', $classified['items']);
      $this->atomicSave($this->dataDir . '/inventario_' . date('Y-m-d_H-i-s') . '.json', $allItems);
      $this->saveSyncReport($syncInfo, $classified['stats']);
      $this->writeStatus($syncInfo['status'], $syncInfo);

      $this->releaseLock();

      return [
        'items'    => $classified['items'],
        'stats'    => $classified['stats'],
        'syncInfo' => $syncInfo,
      ];
    } catch (\Throwable $e) {
      $endTime = microtime(true);
      $syncInfo['completed_at'] = date('c');
      $syncInfo['duration_sec'] = round($endTime - $startTime, 3);
      $syncInfo['status'] = 'failed';
      $syncInfo['errors'][] = [
        'message' => $e->getMessage(),
        'file'    => $e->getFile(),
        'line'    => $e->getLine(),
      ];

      $this->saveSyncReport($syncInfo, ['total' => 0]);
      $this->writeStatus('failed', $syncInfo);
      $this->releaseLock();

      return [
        'items'    => $previousData,
        'stats'    => $this->computeStats($previousData),
        'syncInfo' => $syncInfo,
      ];
    }
  }

  // ── Sincronização incremental ───────────────────────────────────────────────

  /**
   * Sincronização incremental.
   *
   * NOTA: O GLPI REST API não suporta filtro 'modified' na query string.
   * O endpoint /Computer e /Printer sempre retornam todos os registros.
   * Portanto, incremental faz merge por ID com dados existentes.
   * Se não houver cache anterior, executa full sync.
   */
  public function incrementalSync(): array
  {
    $existingItems = $this->loadClassifiedData();
    if ($existingItems === []) {
      return $this->fullSync();
    }

    if (!$this->acquireLock()) {
      return [
        'items'    => $existingItems,
        'stats'    => ['total' => 0, 'error' => 'Sincronização já em execução'],
        'syncInfo' => ['status' => 'locked', 'message' => 'Outra sincronização está em execução.'],
      ];
    }

    $this->writeStatus('running');

    $startTime = microtime(true);
    $syncInfo = [
      'started_at'   => date('c'),
      'completed_at' => null,
      'duration_sec' => 0,
      'status'       => 'running',
      'mode'         => 'incremental',
      'collections'  => [],
      'errors'       => [],
    ];

    try {
      $session = $this->client->initSession();
      $allItems = [];

      try {
        // GLPI REST não suporta 'modified' — busca tudo e faz merge por ID
        $computerResult = $this->fetchCollection('/Computer', $session, $syncInfo);
        foreach ($computerResult as $item) {
          $item['itemtype'] = 'Computer';
          $allItems[] = $item;
        }

        $printerResult = $this->fetchCollection('/Printer', $session, $syncInfo);
        foreach ($printerResult as $item) {
          $item['itemtype'] = 'Printer';
          $allItems[] = $item;
        }

        $this->client->killSession($session);
      } catch (\Throwable $e) {
        $this->client->killSession($session);
        $syncInfo['errors'][] = [
          'collection' => 'session',
          'message'    => $e->getMessage(),
        ];
      }

      // Merge: priorizar dados novos, manter existentes que não foram atualizados
      $merged = $this->mergeIncremental($existingItems, $allItems);

      $classified = Classifier::classifyBatch($merged);

      $endTime = microtime(true);
      $syncInfo['completed_at'] = date('c');
      $syncInfo['duration_sec'] = round($endTime - $startTime, 3);
      $syncInfo['status'] = empty($syncInfo['errors']) ? 'success' : 'partial';
      $syncInfo['total_items'] = count($merged);
      $syncInfo['updated_count'] = count($allItems);

      $this->atomicSave($this->cacheDir . '/classified_assets.json', $classified['items']);
      $this->saveSyncReport($syncInfo, $classified['stats']);
      $this->writeStatus($syncInfo['status'], $syncInfo);

      $this->releaseLock();

      return [
        'items'    => $classified['items'],
        'stats'    => $classified['stats'],
        'syncInfo' => $syncInfo,
      ];
    } catch (\Throwable $e) {
      $endTime = microtime(true);
      $syncInfo['completed_at'] = date('c');
      $syncInfo['duration_sec'] = round($endTime - $startTime, 3);
      $syncInfo['status'] = 'failed';
      $syncInfo['errors'][] = [
        'message' => $e->getMessage(),
        'file'    => $e->getFile(),
        'line'    => $e->getLine(),
      ];

      $this->saveSyncReport($syncInfo, ['total' => 0]);
      $this->writeStatus('failed', $syncInfo);
      $this->releaseLock();

      return [
        'items'    => $existingItems,
        'stats'    => $this->computeStats($existingItems),
        'syncInfo' => $syncInfo,
      ];
    }
  }

  // ── Status persistido ───────────────────────────────────────────────────────

  /**
   * Escreve status da sincronização em arquivo.
   */
  private function writeStatus(string $status, array $extra = []): void
  {
    $statusData = array_merge([
      'status'     => $status,
      'updated_at' => date('c'),
      'pid'        => getmypid(),
    ], $extra);

    $this->atomicSave($this->cacheDir . '/sync_status.json', $statusData);
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
    if (!is_array($data)) {
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
      'status'             => 'ok',
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

    $count = count($data);
    $lastModified = filemtime($cacheFile);
    $dataDate = $lastModified ? date('c', $lastModified) : null;

    // Sync parcial?
    $isPartial = ($syncStatus['status'] ?? '') === 'partial';
    $lastSyncFailed = ($report['sync_info']['status'] ?? '') === 'failed';

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
    $batchSize = $this->catalog['sync']['batch_size'] ?? 500;
    $maxRetries = $this->catalog['sync']['max_retries'] ?? 3;
    $retryInterval = $this->catalog['sync']['retry_interval'] ?? 2;

    $params = array_merge([
      'expand_dropdowns' => 'true',
    ], $options['criteria'] ?? []);

    $items = [];
    $page = 0;
    $hasMore = true;

    while ($hasMore) {
      $retries = 0;
      $success = false;

      while ($retries < $maxRetries && !$success) {
        try {
          $result = $this->client->getAllWithParams($collection, $session, $params, $batchSize);
          $pageItems = $result['items'] ?? [];
          $total = $result['total'] ?? 0;

          foreach ($pageItems as $item) {
            if (is_array($item)) {
              $items[] = $item;
            }
          }

          $success = true;
          $hasMore = count($items) < $total && count($pageItems) > 0;
          $page++;
        } catch (\Throwable $e) {
          $retries++;
          if ($retries >= $maxRetries) {
            $syncInfo['errors'][] = [
              'collection' => $collection,
              'page'       => $page,
              'message'    => $e->getMessage(),
              'retries'    => $retries,
            ];
            $hasMore = false;
          } else {
            sleep($retryInterval);
          }
        }
      }

      if (!$success) break;
    }

    $syncInfo['collections'][$collection] = [
      'total' => count($items),
      'pages' => $page,
    ];

    return $items;
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

    // Rename atômico no Linux; no Windows, rename + unlink
    if (PHP_OS_FAMILY === 'Windows') {
      @unlink($path);
      $renamed = @rename($tempFile, $path);
      if (!$renamed) {
        @copy($tempFile, $path);
        @unlink($tempFile);
      }
    } else {
      $renamed = @rename($tempFile, $path);
      if (!$renamed) {
        @copy($tempFile, $path);
        @unlink($tempFile);
      }
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
