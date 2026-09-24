<?php
/**
 * api/services/AssetService.php
 * -----------------------------------------------------------------------------
 * Serviço centralizado de consulta de ativos.
 *
 * Fornece interface única para buscar ativos por categoria, tipo ou itemtype.
 * Usa GlpiClient para consultas reais e Classifier para classificação v2.
 */

declare(strict_types=1);

final class AssetService
{
  private GlpiClient $glpi;
  private string $session;

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
   * Retorna os ativos das coleções configuradas, sem descartar tipos desconhecidos.
   */
  public function all(): array
  {
    $catalog = Classifier::getCatalog();
    $all = [];
    foreach ($catalog['sync']['collections'] ?? ['Computer', 'Printer', 'Monitor', 'Peripheral', 'NetworkEquipment', 'Phone'] as $type) {
      $all = array_merge($all, $this->fetchCollection('/' . $type));
    }

    $result = Classifier::classifyBatch($all);

    return [
      'items' => $result['items'],
      'stats' => $result['stats'],
    ];
  }

  /**
   * Retorna ativos de uma categoria específica.
   *
   * @param string $category Código da categoria v2
   */
  public function byCategory(string $category): array
  {
    $result = $this->all();
    $items = array_values(array_filter(
      $result['items'],
      fn(array $a): bool => ($a['category'] ?? '') === $category
    ));

    return ['items' => $items, 'total' => count($items)];
  }

  /**
   * Retorna computadores de uma categoria específica.
   */
  public function computersByCategory(string $category): array
  {
    $computers = $this->fetchCollection('/Computer');
    $classified = [];

    foreach ($computers as $raw) {
      $asset = Classifier::classifyAsset($raw);
      if (($asset['category'] ?? '') === $category) {
        $classified[] = $asset;
      }
    }

    return ['items' => $classified, 'total' => count($classified)];
  }

  /**
   * Retorna impressoras (todas).
   */
  public function printers(): array
  {
    $raw = $this->fetchCollection('/Printer');
    $items = [];
    foreach ($raw as $p) {
      $items[] = Mappers::impressora($p);
    }
    return ['items' => $items, 'total' => count($items)];
  }

  /**
   * Retorna um ativo específico por itemtype + id.
   */
  public function get(string $itemtype, int $id): ?array
  {
    $path = '/' . $itemtype . '/' . $id;
    try {
      $raw = $this->glpi->getWithParams($path, $this->session, [
        'expand_dropdowns' => 'true',
      ]);
      if (!is_array($raw) || !isset($raw['id'])) {
        return null;
      }
      $raw['itemtype'] = $itemtype;
      return Classifier::classifyAsset($raw);
    } catch (\Throwable $e) {
      if ($e->getCode() === 404 || str_contains($e->getMessage(), 'HTTP 404')) return null;
      throw $e;
    }
  }

  /**
   * Retorna cache classified_assets.json se existir.
   */
  public static function fromCache(): ?array
  {
    $cacheFile = __DIR__ . '/../../data/cache/classified_assets.json';
    if (!file_exists($cacheFile)) {
      return null;
    }
    $content = file_get_contents($cacheFile);
    if ($content === false) {
      return null;
    }
    $data = json_decode($content, true);
    if (!is_array($data)) {
      return null;
    }
    return $data;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private function fetchCollection(string $path): array
  {
    $result = $this->glpi->getAllWithParams($path, $this->session, [
      'expand_dropdowns' => 'true',
    ], 500);

    if (($result['complete'] ?? false) !== true) {
      throw new RuntimeException('Consulta de ativos incompleta. Tente sincronizar novamente.', 502);
    }
    return array_map(static function (array $item) use ($path): array {
      $item['itemtype'] = ltrim($path, '/');
      return $item;
    }, $result['items']);
  }
}
