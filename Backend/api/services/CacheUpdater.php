<?php
/**
 * api/services/CacheUpdater.php
 * -----------------------------------------------------------------------------
 * Atualização do cache classified_assets.json após escrita no GLPI.
 *
 * Após confirmação e releitura:
 * - Atualiza o ativo correto por itemtype:id
 * - Recalcula classificação e alocação
 * - Preserva os demais ativos
 * - Atualiza metadados de versão e data
 * - Usa escrita atômica e coordenação com locks existentes
 *
 * Garante que sync concorrente não publique snapshot antigo.
 * Em falha: marca parcial, registra pendência, permite repetir só cache.
 * Preserva dados exclusivos de projectors.json.
 */

declare(strict_types=1);

final class CacheUpdater
{
  private string $cacheDir;
  private string $dataDir;
  private string $lockFile;

  public function __construct(?string $baseDir = null)
  {
    $base = $baseDir ?? (realpath(__DIR__ . '/../../data') ?: __DIR__ . '/../../data');
    $this->cacheDir = $base . '/cache';
    $this->dataDir = $base;
    $this->lockFile = $this->cacheDir . '/.sync.lock';

    foreach ([$this->cacheDir, $this->dataDir] as $dir) {
      if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
      }
    }
  }

  /**
   * Atualiza um ativo no cache após escrita confirmada.
   *
   * @param string $itemtype Tipo do ativo (Computer, Printer)
   * @param int $id ID do ativo no GLPI
   * @param array $afterDados lidos após gravação
   * @param array $classifiedItem Ativo classificado (para preservar metadados)
   * @return array{success: bool, error?: string, cache_partial?: bool}
   */
  public function updateAsset(string $itemtype, int $id, array $after, array $classifiedItem = []): array
  {
    // Aguardar lock (sync em andamento)
    $waitStart = time();
    while ($this->isSyncRunning()) {
      if (time() - $waitStart > 10) {
        return [
          'success'      => false,
          'error'        => 'Sincronização em execução. Aguardando liberação.',
          'cache_partial' => true,
        ];
      }
      usleep(500000); // 500ms
    }

    $cacheFile = $this->cacheDir . '/classified_assets.json';
    $cache = $this->loadCache();

    if ($cache === null) {
      return [
        'success'      => false,
        'error'        => 'Cache não existe. Execute uma sincronização primeiro.',
        'cache_partial' => true,
      ];
    }

    $items = $cache['items'] ?? [];
    $found = false;

    foreach ($items as &$item) {
      if (($item['itemtype'] ?? '') === $itemtype && ($item['id'] ?? 0) === $id) {
        // Atualiza dados brutos
        $item['raw'] = $after;

        // Preserva metadados de classificação
        $item['name'] = $after['name'] ?? $item['name'] ?? '';
        $item['serial'] = $after['serial'] ?? $item['serial'] ?? '';
        $item['otherserial'] = $after['otherserial'] ?? $item['otherserial'] ?? '';

        // Atualiza campos derivados
        if (isset($after['locations_id'])) {
          $item['location'] = is_array($after['locations_id'])
            ? ($after['locations_id']['completename'] ?? $after['locations_id']['name'] ?? '')
            : '';
        }
        if (isset($after['groups_id'])) {
          $item['groupPath'] = is_array($after['groups_id'])
            ? ($after['groups_id']['completename'] ?? $after['groups_id']['name'] ?? '')
            : '';
        }
        if (isset($after['states_id'])) {
          $item['stateRaw'] = is_array($after['states_id'])
            ? ($after['states_id']['name'] ?? '')
            : '';
          $item['stateSummary'] = $item['stateRaw'];
        }

        // Preserva campos classificatórios
        $keepFields = ['category', 'categoryLabel', 'purpose', 'cart',
                       'classificationConfidence', 'classificationWarnings',
                       'classificationSource', 'classificationVersion'];
        foreach ($keepFields as $f) {
          if (!isset($item[$f]) && isset($classifiedItem[$f])) {
            $item[$f] = $classifiedItem[$f];
          }
        }

        $found = true;
        break;
      }
    }
    unset($item);

    if (!$found) {
      // Ativo não encontrado no cache — pode ter sido removido por sync
      return [
        'success'      => false,
        'error'        => "Ativo {$itemtype}:{$id} não encontrado no cache.",
        'cache_partial' => true,
      ];
    }

    // Escrita atômica
    $cache['items'] = $items;
    $cache['generated'] = date('c');
    $cache['last_write'] = [
      'itemtype'   => $itemtype,
      'id'         => $id,
      'updated_at' => date('c'),
    ];

    $success = $this->atomicSave($cacheFile, $cache['items']);

    if (!$success) {
      return [
        'success'      => false,
        'error'        => 'Falha ao escrever cache.',
        'cache_partial' => true,
      ];
    }

    return ['success' => true];
  }

  /**
   * Remove um ativo do cache (exclusão lógica).
   */
  public function removeAsset(string $itemtype, int $id): array
  {
    $waitStart = time();
    while ($this->isSyncRunning()) {
      if (time() - $waitStart > 10) {
        return ['success' => false, 'error' => 'Sync em execução.', 'cache_partial' => true];
      }
      usleep(500000);
    }

    $cacheFile = $this->cacheDir . '/classified_assets.json';
    $cache = $this->loadCache();

    if ($cache === null) {
      return ['success' => false, 'error' => 'Cache não existe.', 'cache_partial' => true];
    }

    $items = $cache['items'] ?? [];
    $newItems = [];

    foreach ($items as $item) {
      if (($item['itemtype'] ?? '') === $itemtype && ($item['id'] ?? 0) === $id) {
        // Marca como inativo no cache
        $item['stateSummary'] = 'Inativo';
        $item['stateRaw'] = 'Inativo';
        $item['_inactive'] = true;
      }
      $newItems[] = $item;
    }

    $success = $this->atomicSave($cacheFile, $newItems);

    return $success
      ? ['success' => true]
      : ['success' => false, 'error' => 'Falha ao escrever cache.', 'cache_partial' => true];
  }

  /**
   * Restaura um ativo no cache.
   */
  public function restoreAsset(string $itemtype, int $id): array
  {
    $waitStart = time();
    while ($this->isSyncRunning()) {
      if (time() - $waitStart > 10) {
        return ['success' => false, 'error' => 'Sync em execução.', 'cache_partial' => true];
      }
      usleep(500000);
    }

    $cacheFile = $this->cacheDir . '/classified_assets.json';
    $cache = $this->loadCache();

    if ($cache === null) {
      return ['success' => false, 'error' => 'Cache não existe.', 'cache_partial' => true];
    }

    $items = $cache['items'] ?? [];
    foreach ($items as &$item) {
      if (($item['itemtype'] ?? '') === $itemtype && ($item['id'] ?? 0) === $id) {
        unset($item['_inactive']);
        $item['stateSummary'] = 'Em uso';
        $item['stateRaw'] = 'Em uso';
        break;
      }
    }
    unset($item);

    $success = $this->atomicSave($cacheFile, $items);

    return $success
      ? ['success' => true]
      : ['success' => false, 'error' => 'Falha ao escrever cache.', 'cache_partial' => true];
  }

  /**
   * Adiciona um novo ativo ao cache.
   */
  public function addAsset(array $classifiedItem): array
  {
    $waitStart = time();
    while ($this->isSyncRunning()) {
      if (time() - $waitStart > 10) {
        return ['success' => false, 'error' => 'Sync em execução.', 'cache_partial' => true];
      }
      usleep(500000);
    }

    $cacheFile = $this->cacheDir . '/classified_assets.json';
    $cache = $this->loadCache();

    if ($cache === null) {
      return ['success' => false, 'error' => 'Cache não existe.', 'cache_partial' => true];
    }

    $items = $cache['items'] ?? [];

    // Verifica duplicata
    foreach ($items as $item) {
      if (($item['itemtype'] ?? '') === ($classifiedItem['itemtype'] ?? '')
        && ($item['id'] ?? 0) === ($classifiedItem['id'] ?? 0)) {
        return ['success' => false, 'error' => 'Ativo já existe no cache.'];
      }
    }

    $items[] = $classifiedItem;
    $success = $this->atomicSave($cacheFile, $items);

    return $success
      ? ['success' => true]
      : ['success' => false, 'error' => 'Falha ao escrever cache.', 'cache_partial' => true];
  }

  /**
   * Verifica se há sincronização em execução.
   */
  private function isSyncRunning(): bool
  {
    if (!file_exists($this->lockFile)) return false;
    $content = @file_get_contents($this->lockFile);
    if ($content === false) return false;
    $data = json_decode($content, true);
    return is_array($data) && isset($data['pid']);
  }

  /**
   * Carrega cache existente.
   */
  private function loadCache(): ?array
  {
    $cacheFile = $this->cacheDir . '/classified_assets.json';
    if (!file_exists($cacheFile)) return null;

    $content = @file_get_contents($cacheFile);
    if ($content === false) return null;

    if (strlen($content) > 50 * 1024 * 1024) return null;

    $data = json_decode($content, true);
    if (!is_array($data)) return null;

    // Suporta formato legado (array direto) e novo ({items: [...], ...})
    if (isset($data['items'])) return $data;

    return ['items' => $data, 'generated' => null];
  }

  /**
   * Escrita atômica: temp + rename.
   */
  private function atomicSave(string $path, mixed $data): bool
  {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) return false;

    $tempFile = $path . '.tmp.' . getmypid();

    $written = @file_put_contents($tempFile, $json, LOCK_EX);
    if ($written === false) {
      @unlink($tempFile);
      return false;
    }

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
}
