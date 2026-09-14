<?php
/**
 * api/diagnostic.php
 * -----------------------------------------------------------------------------
 * Ferramenta de diagnóstico: compara inventário GLPI x GCC.
 *
 * Protegido por autenticação de administrador.
 * Retorna divergências, contagens, registros ausentes e detalhes.
 */

declare(strict_types=1);

final class DiagnosticEndpoint
{
  public static function compare(array $config): void
  {
    $glpi = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    try {
      $result = [
        'timestamp' => date('c'),
        'glpi_url' => $config['glpi']['url'] ?? '',
        'collections' => [],
        'summary' => [
          'total_glpi' => 0,
          'total_gcc' => 0,
          'divergences' => 0,
          'missing_in_gcc' => 0,
          'extra_in_gcc' => 0,
        ],
      ];

      // ── Computer ──────────────────────────────────────────────────────────
      $computerResult = $glpi->getAllWithParams('/Computer', $session, [
        'expand_dropdowns' => 'true',
      ], 500);
      $glpiComputers = $computerResult['items'];
      $gccComputers = [];

      foreach ($glpiComputers as $c) {
        if (!is_array($c)) continue;
        $nome = trim($c['name'] ?? '');
        if ($nome === '') continue;
        if (preg_match('/^Chrome\s+G-/i', $nome) === 1) continue;
        if (preg_match('/^Chrome-/i', $nome) === 1) continue;
        if (preg_match('/^Projetor/i', $nome) === 1) continue;
        $type = '';
        if (is_array($c['computertypes_id'] ?? null)) {
          $type = strtolower(trim($c['computertypes_id']['name'] ?? ''));
        } elseif (is_string($c['computertypes_id'] ?? '')) {
          $type = strtolower(trim($c['computertypes_id']));
        }
        if ($type === 'impressora' || $type === 'impressoras') continue;
        $gccComputers[] = Mappers::computer($c);
      }

      $glpiComputerIds = array_map(fn($c) => (int) ($c['id'] ?? 0), array_filter($glpiComputers, fn($c) => is_array($c)));
      $gccComputerIds = array_map(fn($c) => (int) ($c['glpiId'] ?? 0), $gccComputers);
      $missingComputers = array_diff($glpiComputerIds, $gccComputerIds);
      $extraComputers = array_diff($gccComputerIds, $glpiComputerIds);

      $result['collections']['computers'] = [
        'glpi_count' => count($glpiComputerIds),
        'gcc_count' => count($gccComputerIds),
        'missing_in_gcc' => array_values($missingComputers),
        'extra_in_gcc' => array_values($extraComputers),
        'duplicates_in_gcc' => array_values(array_diff_key($gccComputerIds, array_unique($gccComputerIds))),
      ];

      // ── Printer ───────────────────────────────────────────────────────────
      $printerResult = $glpi->getAllWithParams('/Printer', $session, [
        'expand_dropdowns' => 'true',
      ], 500);
      $glpiPrinters = $printerResult['items'];
      $gccPrinters = [];

      foreach ($glpiPrinters as $p) {
        if (!is_array($p)) continue;
        $gccPrinters[] = Mappers::impressora($p);
      }

      $glpiPrinterIds = array_map(fn($p) => (int) ($p['id'] ?? 0), array_filter($glpiPrinters, fn($p) => is_array($p)));
      $gccPrinterIds = array_map(fn($p) => (int) ($p['glpiId'] ?? 0), $gccPrinters);
      $missingPrinters = array_diff($glpiPrinterIds, $gccPrinterIds);
      $extraPrinters = array_diff($gccPrinterIds, $glpiPrinterIds);

      $result['collections']['printers'] = [
        'glpi_count' => count($glpiPrinterIds),
        'gcc_count' => count($gccPrinterIds),
        'missing_in_gcc' => array_values($missingPrinters),
        'extra_in_gcc' => array_values($extraPrinters),
      ];

      // ── Summary ───────────────────────────────────────────────────────────
      $result['summary']['total_glpi'] = count($glpiComputerIds) + count($glpiPrinterIds);
      $result['summary']['total_gcc'] = count($gccComputerIds) + count($gccPrinterIds);
      $result['summary']['missing_in_gcc'] = count($missingComputers) + count($missingPrinters);
      $result['summary']['extra_in_gcc'] = count($extraComputers) + count($extraPrinters);
      $result['summary']['divergences'] = $result['summary']['missing_in_gcc'] + $result['summary']['extra_in_gcc'];

      Responde::ok($result);
    } catch (\Throwable $e) {
      $glpi->killSession($session);
      throw $e;
    }

    $glpi->killSession($session);
  }

  /**
   * Exporta todos os registros GLPI e GCC para conferência.
   */
  public static function export(array $config): void
  {
    $glpi = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    try {
      $export = [
        'timestamp' => date('c'),
        'glpi_url' => $config['glpi']['url'] ?? '',
        'computers' => [],
        'printers' => [],
      ];

      $computerResult = $glpi->getAllWithParams('/Computer', $session, [
        'expand_dropdowns' => 'true',
      ], 500);

      foreach ($computerResult['items'] as $c) {
        if (!is_array($c)) continue;
        $export['computers'][] = [
          'glpi_id' => $c['id'] ?? null,
          'name' => $c['name'] ?? '',
          'serial' => $c['serial'] ?? '',
          'otherserial' => $c['otherserial'] ?? '',
          'states_id' => $c['states_id'] ?? null,
          'locations_id' => $c['locations_id'] ?? null,
          'users_id' => $c['users_id'] ?? null,
          'groups_id' => $c['groups_id'] ?? null,
          'computermodels_id' => $c['computermodels_id'] ?? null,
          'computertypes_id' => $c['computertypes_id'] ?? null,
          'manufacturers_id' => $c['manufacturers_id'] ?? null,
        ];
      }

      $printerResult = $glpi->getAllWithParams('/Printer', $session, [
        'expand_dropdowns' => 'true',
      ], 500);

      foreach ($printerResult['items'] as $p) {
        if (!is_array($p)) continue;
        $export['printers'][] = [
          'glpi_id' => $p['id'] ?? null,
          'name' => $p['name'] ?? '',
          'serial' => $p['serial'] ?? '',
          'otherserial' => $p['otherserial'] ?? '',
          'states_id' => $p['states_id'] ?? null,
          'locations_id' => $p['locations_id'] ?? null,
          'users_id' => $p['users_id'] ?? null,
          'printermodels_id' => $p['printermodels_id'] ?? null,
          'manufacturers_id' => $p['manufacturers_id'] ?? null,
        ];
      }

      $glpi->killSession($session);

      header('Content-Type: application/json; charset=utf-8');
      header('Content-Disposition: attachment; filename="gcc-diagnostic-' . date('Y-m-d-His') . '.json"');
      echo json_encode($export, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
      exit;
    } catch (\Throwable $e) {
      $glpi->killSession($session);
      throw $e;
    }
  }
}
