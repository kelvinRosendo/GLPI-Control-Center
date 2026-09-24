<?php
/**
 * api/sync_status.php
 * -----------------------------------------------------------------------------
 * Endpoint de status e indicadores de sincronização.
 *
 * GET /api/sync/status  → Indicadores gerais
 * POST /api/sync/run    → Executa sincronização completa
 * POST /api/sync/incremental → Executa sincronização incremental
 */

declare(strict_types=1);

require_once __DIR__ . '/sync.php';
require_once __DIR__ . '/classifier.php';

final class SyncEndpoint
{
  /**
   * GET /api/sync/status — Retorna indicadores de observabilidade.
   */
  public static function status(array $config): void
  {
    $catalog = Classifier::getCatalog();
    $sync = new AssetSync($config['glpi'] ?? [], $catalog);
    $indicators = $sync->getIndicators();

    Responde::ok([
      'data' => $indicators,
      'catalog_version' => $catalog['version'] ?? '0.0.0',
    ]);
  }

  /**
   * POST /api/sync/run — Executa sincronização completa.
   */
  public static function run(array $config): void
  {
    $catalog = Classifier::getCatalog();
    $sync = new AssetSync($config['glpi'] ?? [], $catalog);

    $result = $sync->fullSync();
    $status = $result['syncInfo']['status'] ?? 'failed';
    if ($status !== 'success') {
      Responde::erro($status === 'locked'
        ? 'Sincronização em execução ou diretório sem permissão de escrita.'
        : 'Sincronização falhou. Inventário anterior preservado; consulte o relatório.',
        $status === 'locked' ? 409 : 502);
      return;
    }

    Responde::ok([
      'message' => 'Sincronização completa executada.',
      'data'    => [
        'total'      => $result['stats']['total'] ?? 0,
        'classified' => $result['stats']['classified'] ?? 0,
        'unclassified' => $result['stats']['unclassified'] ?? 0,
        'by_category' => $result['stats']['byCategory'] ?? [],
        'by_itemtype' => $result['stats']['byItemtype'] ?? [],
        'sync_info'  => $result['syncInfo'],
      ],
    ]);
  }

  /**
   * POST /api/sync/incremental — Executa sincronização incremental.
   */
  public static function incremental(array $config): void
  {
    $catalog = Classifier::getCatalog();
    $sync = new AssetSync($config['glpi'] ?? [], $catalog);

    $result = $sync->incrementalSync();
    $status = $result['syncInfo']['status'] ?? 'failed';
    if ($status !== 'success') {
      Responde::erro($status === 'locked'
        ? 'Sincronização em execução ou diretório sem permissão de escrita.'
        : 'Sincronização falhou. Inventário anterior preservado; consulte o relatório.',
        $status === 'locked' ? 409 : 502);
      return;
    }

    Responde::ok([
      'message' => 'Sincronização incremental executada.',
      'data'    => [
        'total'      => $result['stats']['total'] ?? 0,
        'classified' => $result['stats']['classified'] ?? 0,
        'unclassified' => $result['stats']['unclassified'] ?? 0,
        'by_category' => $result['stats']['byCategory'] ?? [],
        'by_itemtype' => $result['stats']['byItemtype'] ?? [],
        'sync_info'  => $result['syncInfo'],
      ],
    ]);
  }

  /**
   * GET /api/sync/report — Retorna relatório completo da última sincronização.
   */
  public static function report(array $config): void
  {
    $catalog = Classifier::getCatalog();
    $sync = new AssetSync($config['glpi'] ?? [], $catalog);
    $report = $sync->getSyncStats();

    Responde::ok(['data' => $report]);
  }

  /**
   * GET /api/sync/assets — Retorna todos os ativos classificados do cache.
   */
  public static function assets(array $config): void
  {
    $catalog = Classifier::getCatalog();
    $sync = new AssetSync($config['glpi'] ?? [], $catalog);
    $items = $sync->loadClassifiedData();

    header('Cache-Control: no-store');
    Responde::ok([
      'data'  => $items,
      'count' => count($items),
    ]);
  }

  /**
   * GET /api/sync/cache-state — Retorna estado explícito do cache com metadados.
   */
  public static function cacheState(array $config): void
  {
    $catalog = Classifier::getCatalog();
    $sync = new AssetSync($config['glpi'] ?? [], $catalog);
    $state = $sync->getCacheState();

    Responde::ok(['data' => $state]);
  }
}
