<?php
/**
 * api/services/ReconcileService.php
 * -----------------------------------------------------------------------------
 * Serviço de reconciliação entre GLPI (fonte oficial) e cache/classified do GCC.
 *
 * Compara ativos por itemtype:id e identifica:
 *   - only_glpi: existe no GLPI mas não no cache GCC
 *   - only_gcc: existe no cache GCC mas não no GLPI
 *   - divergent: existe em ambos mas com campos diferentes
 *   - synced: idênticos
 */

declare(strict_types=1);

final class ReconcileService
{
  private GlpiClient $glpi;
  private string $session;

  private const COMPARE_FIELDS = ['name', 'serial', 'otherserial', 'comment'];

  public function __construct(array $glpiConfig)
  {
    $this->glpi = new GlpiClient($glpiConfig);
    $this->session = $this->glpi->initSession();
  }

  public function __destruct()
  {
    try {
      $this->glpi->killSession($this->session);
    } catch (\Throwable) {
    }
  }

  /**
   * Compara todos os ativos do GLPI com o cache do GCC.
   *
   * @param string|null $category Filtrar por categoria (opcional)
   * @return array Resultado da comparação
   */
  public function compare(?string $category = null): array
  {
    $glpiAssets = $this->fetchGlpiAssets();
    $gccAssets = $this->loadGccCache();

    $gccByKey = [];
    foreach ($gccAssets as $gcc) {
      $key = Classifier::uniqueKey($gcc);
      $gccByKey[$key] = $gcc;
    }

    $onlyGlpi = [];
    $onlyGcc = [];
    $divergent = [];
    $synced = [];

    foreach ($glpiAssets as $glpiAsset) {
      $key = Classifier::uniqueKey($glpiAsset);
      $glpiCategory = $glpiAsset['category'] ?? 'unclassified';

      if ($category !== null && $glpiCategory !== $category) {
        continue;
      }

      if (!isset($gccByKey[$key])) {
        $onlyGlpi[] = [
          'key'      => $key,
          'itemtype' => $glpiAsset['itemtype'] ?? 'Computer',
          'id'       => $glpiAsset['id'] ?? 0,
          'name'     => $glpiAsset['name'] ?? '',
          'category' => $glpiCategory,
          'source'   => 'glpi',
        ];
        continue;
      }

      $gccAsset = $gccByKey[$key];
      $diffs = $this->diffAssets($glpiAsset, $gccAsset);

      if ($diffs === []) {
        $synced[] = [
          'key'      => $key,
          'itemtype' => $glpiAsset['itemtype'] ?? 'Computer',
          'id'       => $glpiAsset['id'] ?? 0,
          'name'     => $glpiAsset['name'] ?? '',
          'category' => $glpiCategory,
        ];
      } else {
        $divergent[] = [
          'key'       => $key,
          'itemtype'  => $glpiAsset['itemtype'] ?? 'Computer',
          'id'        => $glpiAsset['id'] ?? 0,
          'name'      => $glpiAsset['name'] ?? '',
          'category'  => $glpiCategory,
          'diffs'     => $diffs,
          'glpi'      => $this->extractCompareFields($glpiAsset),
          'gcc'       => $this->extractCompareFields($gccAsset),
        ];
      }

      unset($gccByKey[$key]);
    }

    foreach ($gccByKey as $key => $gccAsset) {
      $gccCategory = $gccAsset['category'] ?? 'unclassified';
      if ($category !== null && $gccCategory !== $category) {
        continue;
      }
      $onlyGcc[] = [
        'key'      => $key,
        'itemtype' => $gccAsset['itemtype'] ?? 'Computer',
        'id'       => $gccAsset['id'] ?? 0,
        'name'     => $gccAsset['name'] ?? '',
        'category' => $gccCategory,
        'source'   => 'gcc',
      ];
    }

    return [
      'summary' => [
        'total_glpi'  => count($glpiAssets),
        'total_gcc'   => count($gccAssets),
        'synced'      => count($synced),
        'divergent'   => count($divergent),
        'only_glpi'   => count($onlyGlpi),
        'only_gcc'    => count($onlyGcc),
        'category'    => $category,
        'compared_at' => date('c'),
      ],
      'only_glpi'  => $onlyGlpi,
      'only_gcc'   => $onlyGcc,
      'divergent'  => $divergent,
      'synced'     => array_slice($synced, 0, 100),
    ];
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private function fetchGlpiAssets(): array
  {
    $all = [];

    try {
      $computers = $this->glpi->getAllWithParams('/Computer', $this->session, [
        'expand_dropdowns' => 'true',
      ], 500);
      foreach ($computers['items'] as $raw) {
        if (is_array($raw)) {
          $all[] = Classifier::classifyAsset($raw);
        }
      }
    } catch (\Throwable) {
    }

    try {
      $printers = $this->glpi->getAllWithParams('/Printer', $this->session, [
        'expand_dropdowns' => 'true',
      ], 500);
      foreach ($printers['items'] as $raw) {
        if (is_array($raw)) {
          $all[] = Classifier::classifyAsset($raw);
        }
      }
    } catch (\Throwable) {
    }

    return $all;
  }

  private function loadGccCache(): array
  {
    $cacheFile = __DIR__ . '/../../data/cache/classified_assets.json';
    if (!file_exists($cacheFile)) {
      return [];
    }

    $content = file_get_contents($cacheFile);
    if ($content === false) {
      return [];
    }

    $data = json_decode($content, true);
    if (!is_array($data)) {
      return [];
    }

    return $data['items'] ?? $data ?? [];
  }

  private function diffAssets(array $glpi, array $gcc): array
  {
    $diffs = [];

    foreach (self::COMPARE_FIELDS as $field) {
      $glpiVal = $glpi[$field] ?? '';
      $gccVal = $gcc[$field] ?? '';

      if (is_array($glpiVal)) $glpiVal = $glpiVal['name'] ?? '';
      if (is_array($gccVal)) $gccVal = $gccVal['name'] ?? '';

      $glpiVal = trim((string) $glpiVal);
      $gccVal = trim((string) $gccVal);

      if ($glpiVal !== $gccVal) {
        $diffs[] = [
          'field' => $field,
          'glpi'  => $glpiVal,
          'gcc'   => $gccVal,
        ];
      }
    }

    $glpiState = $glpi['stateSummary'] ?? '';
    $gccState = $gcc['stateSummary'] ?? '';
    if ($glpiState !== $gccState) {
      $diffs[] = [
        'field' => 'stateSummary',
        'glpi'  => $glpiState,
        'gcc'   => $gccState,
      ];
    }

    return $diffs;
  }

  private function extractCompareFields(array $asset): array
  {
    $result = [];
    foreach (self::COMPARE_FIELDS as $field) {
      $val = $asset[$field] ?? '';
      if (is_array($val)) $val = $val['name'] ?? '';
      $result[$field] = trim((string) $val);
    }
    $result['stateSummary'] = $asset['stateSummary'] ?? '';
    return $result;
  }
}
