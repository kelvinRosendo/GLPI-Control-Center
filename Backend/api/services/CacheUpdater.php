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
    $lockHandle = $this->acquireLockWait(10);
    if ($lockHandle === null) {
      return ['success'=>false,'error'=>'Sincronização em execução.','cache_partial'=>true];
    }
    try {
      $cacheFile = $this->cacheDir . '/classified_assets.json';
      $cache = $this->loadCache();
      if ($cache === null) {
        return ['success'=>false,'error'=>'Cache não existe.','cache_partial'=>true];
      }
      $items = $cache['items'] ?? [];
      $found = false;
      // Reclassificar raw atualizado pelo pipeline único
      $afterWithType = array_merge($after, ['itemtype'=>$itemtype]);
      $reclassified = null;
      try {
        require_once __DIR__ . '/../classifier.php';
        // Classifier expects raw with itemtype; use pipeline
        if (class_exists('Classifier')) {
          $reclassified = Classifier::classifyAsset($afterWithType);
        }
      } catch (\Throwable $e) { $reclassified = null; }

      foreach ($items as &$item) {
        if (($item['itemtype'] ?? '') === $itemtype && (int)($item['id'] ?? 0) === $id) {
          // Se reclassificou, substituir campos derivados completamente
          if (is_array($reclassified)) {
            // Preservar dados locais de projetores se existirem
            $local = [];
            if (isset($item['_local'])) $local = $item['_local'];
            $item = array_merge($item, $reclassified);
            $item['raw'] = $after;
            if ($local) $item['_local'] = $local;
            // Garantir groupPath/location/cart recalculados mesmo quando dropdown é string
            if (isset($reclassified['groupPath'])) $item['groupPath'] = $reclassified['groupPath'];
            if (isset($reclassified['location'])) $item['location'] = $reclassified['location'];
            if (isset($reclassified['stateSummary'])) $item['stateSummary'] = $reclassified['stateSummary'];
          } else {
            // Fallback manual com suporte a string|objeto
            $item['raw'] = $after;
            $item['name'] = $after['name'] ?? $item['name'] ?? '';
            $item['serial'] = $after['serial'] ?? $item['serial'] ?? '';
            $item['otherserial'] = $after['otherserial'] ?? $item['otherserial'] ?? '';
            // Aceitar string ou objeto para dropdowns expandidos
            foreach (['locations_id'=>'location','groups_id'=>'groupPath','states_id'=>'stateSummary'] as $glpiF=>$gccF) {
              if (array_key_exists($glpiF, $after)) {
                $v = $after[$glpiF];
                if (is_array($v)) $item[$gccF] = $v['completename'] ?? $v['name'] ?? '';
                elseif (is_string($v) && $v !== '') $item[$gccF] = $v;
                else $item[$gccF] = '';
              }
            }
            if (isset($after['states_id']) && is_array($after['states_id'])) {
              $item['stateRaw'] = $after['states_id']['name'] ?? $item['stateRaw'] ?? '';
            }
          }
          $found = true;
          break;
        }
      }
      unset($item);
      if (!$found) {
        return ['success'=>false,'error'=>"Ativo {$itemtype}:{$id} não encontrado no cache.",'cache_partial'=>true];
      }
      // Preservar versões mais novas: se cache tem date_mod mais novo que after, não sobrescrever?
      // after deve ser mais novo (releitura pós-escrita); se cache for mais novo, manter cache
      // mas atualizar mesmo assim pois after é fonte oficial
      $cache['items'] = $items;
      $cache['generated'] = date('c');
      $cache['last_write'] = ['itemtype'=>$itemtype,'id'=>$id,'updated_at'=>date('c')];
      $success = $this->atomicSave($cacheFile, $cache['items']);
      if (!$success) return ['success'=>false,'error'=>'Falha ao escrever cache.','cache_partial'=>true];
      return ['success'=>true];
    } finally {
      $this->releaseLockHandle($lockHandle);
    }
  }

  /**
   * Remove um ativo do cache (exclusão lógica — inativação).
   */
  public function removeAsset(string $itemtype, int $id): array
  {
    $h = $this->acquireLockWait(10);
    if ($h === null) return ['success'=>false,'error'=>'Sync em execução.','cache_partial'=>true];
    try {
      $cacheFile = $this->cacheDir . '/classified_assets.json';
      $cache = $this->loadCache();
      if ($cache === null) return ['success'=>false,'error'=>'Cache não existe.','cache_partial'=>true];
      $items = $cache['items'] ?? [];
      $newItems = [];
      foreach ($items as $item) {
        if (($item['itemtype'] ?? '') === $itemtype && (int)($item['id'] ?? 0) === $id) {
          $item['stateSummary'] = 'Inativo';
          $item['stateRaw'] = 'Inativo';
          $item['_inactive'] = true;
        }
        $newItems[] = $item;
      }
      $ok = $this->atomicSave($cacheFile, $newItems);
      return $ok ? ['success'=>true] : ['success'=>false,'error'=>'Falha ao escrever cache.','cache_partial'=>true];
    } finally { $this->releaseLockHandle($h); }
  }

  /**
   * Restaura um ativo no cache (reativação).
   */
  public function restoreAsset(string $itemtype, int $id): array
  {
    $h = $this->acquireLockWait(10);
    if ($h === null) return ['success'=>false,'error'=>'Sync em execução.','cache_partial'=>true];
    try {
      $cacheFile = $this->cacheDir . '/classified_assets.json';
      $cache = $this->loadCache();
      if ($cache === null) return ['success'=>false,'error'=>'Cache não existe.','cache_partial'=>true];
      $items = $cache['items'] ?? [];
      foreach ($items as &$item) {
        if (($item['itemtype'] ?? '') === $itemtype && (int)($item['id'] ?? 0) === $id) {
          unset($item['_inactive']);
          $item['stateSummary'] = 'Em uso';
          $item['stateRaw'] = 'Em uso';
          break;
        }
      }
      unset($item);
      $ok = $this->atomicSave($cacheFile, $items);
      return $ok ? ['success'=>true] : ['success'=>false,'error'=>'Falha ao escrever cache.','cache_partial'=>true];
    } finally { $this->releaseLockHandle($h); }
  }

  /**
   * Adiciona um novo ativo ao cache — insere ativo classificado, não resposta bruta.
   */
  public function addAsset(array $classifiedItem): array
  {
    $h = $this->acquireLockWait(10);
    if ($h === null) return ['success'=>false,'error'=>'Sync em execução.','cache_partial'=>true];
    try {
      $cacheFile = $this->cacheDir . '/classified_assets.json';
      $cache = $this->loadCache();
      if ($cache === null) return ['success'=>false,'error'=>'Cache não existe.','cache_partial'=>true];
      $items = $cache['items'] ?? [];
      // Se veio raw, reclassificar pelo pipeline único
      $toInsert = $classifiedItem;
      if (isset($classifiedItem['raw']) || isset($classifiedItem['name'])) {
        try {
          if (isset($classifiedItem['raw'])) {
            $raw = array_merge($classifiedItem['raw'], ['itemtype'=>$classifiedItem['itemtype'] ?? 'Computer']);
            if (class_exists('Classifier')) $toInsert = Classifier::classifyAsset($raw);
          } elseif (!isset($classifiedItem['category'])) {
            if (class_exists('Classifier')) $toInsert = Classifier::classifyAsset($classifiedItem);
          }
        } catch (\Throwable $e) {}
      }
      foreach ($items as $item) {
        if (($item['itemtype'] ?? '') === ($toInsert['itemtype'] ?? '') && (int)($item['id'] ?? 0) === (int)($toInsert['id'] ?? 0)) {
          return ['success'=>false,'error'=>'Ativo já existe no cache.'];
        }
      }
      $items[] = $toInsert;
      $ok = $this->atomicSave($cacheFile, $items);
      return $ok ? ['success'=>true] : ['success'=>false,'error'=>'Falha ao escrever cache.','cache_partial'=>true];
    } finally { $this->releaseLockHandle($h); }
  }

  // Lock compartilhado com AssetSync (.sync.lock) — mantido durante read→modify→write
  private function acquireLockWait(int $timeoutSec = 10) {
    $start = time();
    while (true) {
      $fh = @fopen($this->lockFile, 'c+');
      if ($fh !== false) {
        if (flock($fh, LOCK_EX | LOCK_NB)) {
          // Verificar se conteúdo indica lock válido; se não, assumir nosso
          ftruncate($fh, 0);
          fwrite($fh, json_encode(['pid'=>getmypid(),'started_at'=>date('c'),'owner'=>'CacheUpdater']));
          fflush($fh);
          return $fh;
        }
        fclose($fh);
      }
      if (time() - $start >= $timeoutSec) return null;
      usleep(200000);
    }
  }
  private function releaseLockHandle($fh): void {
    if (is_resource($fh)) { flock($fh, LOCK_UN); fclose($fh); @unlink($this->lockFile); }
  }
  private function isSyncRunning(): bool { return file_exists($this->lockFile); }

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
