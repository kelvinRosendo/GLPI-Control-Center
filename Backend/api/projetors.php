<?php
/**
 * api/projetors.php
 * -----------------------------------------------------------------------------
 * Endpoints REST para Gestão Preventiva de Projetores.
 *
 * Endpoints:
 *   GET    /api/projetors              - Lista todos os projetores (GLPI + dados extras)
 *   GET    /api/projetors/{id}         - Detalhe completo de um projetor
 *   PUT    /api/projetors/{id}/lamp    - Atualiza horas da lâmpada
 *   POST   /api/projetors/{id}/maintenance - Registra manutenção
 *   GET    /api/projetors/{id}/history - Timeline de eventos
 *   GET    /api/projetors/alerts       - Alertas globais
 *   POST   /api/projetors/check        - Dispara verificação preventiva
 *   GET    /api/projetors/config       - Retorna configuração
 *   PUT    /api/projetors/config       - Atualiza configuração
 */

declare(strict_types=1);

final class ProjectorsEndpoint
{
  private const DATA_DIR = __DIR__ . '/../data';
  private const DATA_FILE = self::DATA_DIR . '/projectors.json';

  // ══════════════════════════════════════════════════════════════════════════
  // PERSISTÊNCIA
  // ══════════════════════════════════════════════════════════════════════════

  private static function loadData(): array
  {
    if (!is_file(self::DATA_FILE)) {
      return self::defaultData();
    }

    $raw = file_get_contents(self::DATA_FILE);
    if ($raw === false) {
      return self::defaultData();
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
      return self::defaultData();
    }

    return $data;
  }

  private static function saveData(array $data): void
  {
    if (!is_dir(self::DATA_DIR)) {
      @mkdir(self::DATA_DIR, 0755, true);
    }

    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    @file_put_contents(self::DATA_FILE, $json, LOCK_EX);
  }

  private static function defaultData(): array
  {
    return [
      'config' => [
        'lamp_life_hours' => 3000,
        'warning_percentage' => 80,
        'critical_percentage' => 95,
        'maintenance_interval_days' => 90,
        'cleaning_interval_days' => 30,
        'email_enabled' => false,
        'email_recipients' => [],
      ],
      'projectors' => [],
    ];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GLPI INTEGRATION
  // ══════════════════════════════════════════════════════════════════════════

  private static function getProjectorsFromGlpi(array $config): array
  {
    $glpi = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    $raw = $glpi->getWithParams('/Computer', $session, [
      'range' => '0-999',
      'expand_dropdowns' => 'true',
    ]);
    $glpi->killSession($session);

    $items = [];
    foreach ($raw as $c) {
      if (!is_array($c)) continue;
      $nome = trim($c['name'] ?? '');
      if (preg_match('/^Projetor/i', $nome) === 1) {
        $items[] = Mappers::projetor($c);
      }
    }

    return $items;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CÁLCULOS
  // ══════════════════════════════════════════════════════════════════════════

  private static function calculateStatus(array $projector, array $config): string
  {
    if (($projector['glpi_status'] ?? '') === 'manutencao') {
      return 'manutencao';
    }

    $horas = (int) ($projector['horas_lampada'] ?? 0);
    $vidaUtil = (int) ($projector['vida_util_estimada'] ?? $config['lamp_life_hours']);
    $alertas = $projector['alertas'] ?? [];

    if (in_array('lampada_critica', $alertas) || in_array('manutencao_atrasada', $alertas)) {
      return 'atencao';
    }

    if (count($alertas) > 0) {
      return 'atencao';
    }

    return 'operando';
  }

  private static function calculateAlerts(array $projector, array $config): array
  {
    $alertas = [];
    $horas = (int) ($projector['horas_lampada'] ?? 0);
    $vidaUtil = (int) ($projector['vida_util_estimada'] ?? $config['lamp_life_hours']);

    // Verificar lâmpada
    if ($horas > 0 && $vidaUtil > 0) {
      $percentage = ($horas / $vidaUtil) * 100;
      if ($percentage >= $config['critical_percentage']) {
        $alertas[] = 'lampada_critica';
      } elseif ($percentage >= $config['warning_percentage']) {
        $alertas[] = 'lampada_aviso';
      }
    }

    // Verificar manutenção
    if (!empty($projector['ultima_manutencao'])) {
      $daysSince = self::daysSince($projector['ultima_manutencao']);
      if ($daysSince > $config['maintenance_interval_days']) {
        $alertas[] = 'manutencao_atrasada';
      }
    }

    // Verificar limpeza
    if (!empty($projector['ultima_limpeza'])) {
      $daysSince = self::daysSince($projector['ultima_limpeza']);
      if ($daysSince > $config['cleaning_interval_days']) {
        $alertas[] = 'limpeza_necessaria';
      }
    }

    return $alertas;
  }

  private static function daysSince(string $date): int
  {
    $then = new DateTime($date);
    $now = new DateTime();
    return (int) $now->diff($then)->days;
  }

  private static function enrichProjector(array $glpiData, array $savedData, array $config): array
  {
    $enriched = [
      'glpiId' => $glpiData['glpiId'] ?? null,
      'nome' => $glpiData['nome'] ?? '',
      'serial' => $glpiData['serial'] ?? '',
      'patrimonio' => $glpiData['patrimonio'] ?? '',
      'modelo' => $glpiData['modelo'] ?? '',
      'reparticao' => $glpiData['reparticao'] ?? '',
      'usuario' => $glpiData['usuario'] ?? '',
      'glpi_status' => $glpiData['status'] ?? 'ativo',
      // Dados salvos
      'data_aquisicao' => $savedData['data_aquisicao'] ?? '',
      'fabricante' => $savedData['fabricante'] ?? '',
      'horas_lampada' => (int) ($savedData['horas_lampada'] ?? 0),
      'vida_util_estimada' => (int) ($savedData['vida_util_estimada'] ?? $config['lamp_life_hours']),
      'data_troca_lampada' => $savedData['data_troca_lampada'] ?? '',
      'ultima_manutencao' => $savedData['ultima_manutencao'] ?? '',
      'ultima_limpeza' => $savedData['ultima_limpeza'] ?? '',
      'horas_totais' => (int) ($savedData['horas_totais'] ?? 0),
      'notas' => $savedData['notas'] ?? '',
      'responsavel_atual' => $savedData['responsavel_atual'] ?? '',
    ];

    // Calcular percentual
    $horas = $enriched['horas_lampada'];
    $vidaUtil = $enriched['vida_util_estimada'];
    $enriched['percentual_uso'] = ($horas > 0 && $vidaUtil > 0)
      ? round(($horas / $vidaUtil) * 100, 1)
      : 0;

    // Calcular alertas
    $enriched['alertas'] = self::calculateAlerts($enriched, $config);

    // Calcular status
    $enriched['status_calculado'] = self::calculateStatus($enriched, $config);

    // Dias desde última manutenção
    $enriched['dias_desde_manutencao'] = !empty($enriched['ultima_manutencao'])
      ? self::daysSince($enriched['ultima_manutencao'])
      : null;

    // Histórico
    $enriched['manutencoes'] = $savedData['manutencoes'] ?? [];

    return $enriched;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/projetors
   * Lista todos os projetores com dados enriquecidos.
   */
  public static function list(array $config): void
  {
    $data = self::loadData();
    $configData = $data['config'] ?? self::defaultData()['config'];
    $savedProjectors = $data['projectors'] ?? [];

    // Buscar projetores do GLPI
    $glpiProjectors = self::getProjectorsFromGlpi($config);

    // Enriquecer com dados salvos
    $items = [];
    foreach ($glpiProjectors as $glpi) {
      $glpiId = $glpi['glpiId'] ?? null;
      $saved = $savedProjectors[(string) $glpiId] ?? [];
      $items[] = self::enrichProjector($glpi, $saved, $configData);
    }

    // Calcular indicadores
    $indicators = self::calculateIndicators($items);

    Responde::ok([
      'data' => $items,
      'count' => count($items),
      'indicators' => $indicators,
      'config' => $configData,
    ]);
  }

  /**
   * GET /api/projetors/{id}
   * Detalhe completo de um projetor.
   */
  public static function detail(array $config, int $id): void
  {
    $data = self::loadData();
    $configData = $data['config'] ?? self::defaultData()['config'];
    $savedProjectors = $data['projectors'] ?? [];

    // Buscar projetor específico do GLPI
    $glpi = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    $raw = $glpi->getWithParams("/Computer/{$id}", $session, [
      'expand_dropdowns' => 'true',
    ]);
    $glpi->killSession($session);

    if (!is_array($raw) || !isset($raw['id'])) {
      Responde::erro('Projetor não encontrado no GLPI.', 404, ['glpiId' => $id]);
    }

    $glpiData = Mappers::projetor($raw);
    $saved = $savedProjectors[(string) $id] ?? [];
    $enriched = self::enrichProjector($glpiData, $saved, $configData);

    Responde::ok(['data' => $enriched]);
  }

  /**
   * PUT /api/projetors/{id}/lamp
   * Atualiza horas da lâmpada.
   */
  public static function updateLamp(array $config, int $id): void
  {
    $body = self::parseJsonBody();
    $horas = (int) ($body['horas_lampada'] ?? 0);
    $vidaUtil = (int) ($body['vida_util_estimada'] ?? 0);

    if ($horas < 0) {
      Responde::erro('Horas da lâmpada não pode ser negativa.', 422);
    }

    $data = self::loadData();
    $configData = $data['config'] ?? self::defaultData()['config'];

    $key = (string) $id;
    if (!isset($data['projectors'][$key])) {
      $data['projectors'][$key] = [];
    }

    $data['projectors'][$key]['horas_lampada'] = $horas;
    if ($vidaUtil > 0) {
      $data['projectors'][$key]['vida_util_estimada'] = $vidaUtil;
    }
    $data['projectors'][$key]['_updatedAt'] = date('c');

    self::saveData($data);

    Responde::ok([
      'message' => 'Horas da lâmpada atualizadas.',
      'horas_lampada' => $horas,
      'percentual_uso' => ($vidaUtil > 0) ? round(($horas / $vidaUtil) * 100, 1) : 0,
    ]);
  }

  /**
   * POST /api/projetors/{id}/maintenance
   * Registra uma manutenção.
   */
  public static function registerMaintenance(array $config, int $id): void
  {
    $body = self::parseJsonBody();

    $tipo = trim($body['tipo'] ?? '');
    $dataStr = trim($body['data'] ?? '');
    $responsavel = trim($body['responsavel'] ?? '');
    $descricao = trim($body['descricao'] ?? '');
    $horasReg = (int) ($body['horas_lampada_registradas'] ?? 0);

    if ($tipo === '') {
      Responde::erro('Tipo de manutenção é obrigatório.', 422);
    }
    if ($dataStr === '') {
      Responde::erro('Data da manutenção é obrigatória.', 422);
    }

    $validTypes = ['lampada', 'limpeza', 'manutencao', 'reparo', 'observacao'];
    if (!in_array($tipo, $validTypes)) {
      Responde::erro('Tipo de manutenção inválido.', 422, ['tipos_permitidos' => $validTypes]);
    }

    $data = self::loadData();
    $key = (string) $id;

    if (!isset($data['projectors'][$key])) {
      $data['projectors'][$key] = [];
    }

    // Criar registro de manutenção
    $record = [
      'id' => bin2hex(random_bytes(16)),
      'tipo' => $tipo,
      'data' => $dataStr,
      'responsavel' => $responsavel,
      'descricao' => $descricao,
      'horas_lampada_registradas' => $horasReg,
      'criado_em' => date('c'),
    ];

    // Adicionar ao histórico
    if (!isset($data['projectors'][$key]['manutencoes'])) {
      $data['projectors'][$key]['manutencoes'] = [];
    }
    array_unshift($data['projectors'][$key]['manutencoes'], $record);

    // Limitar histórico a 200 registros
    if (count($data['projectors'][$key]['manutencoes']) > 200) {
      $data['projectors'][$key]['manutencoes'] = array_slice($data['projectors'][$key]['manutencoes'], 0, 200);
    }

    // Atualizar campos de referência
    if ($tipo === 'lampada') {
      $data['projectors'][$key]['data_troca_lampada'] = $dataStr;
      if ($horasReg > 0) {
        $data['projectors'][$key]['horas_lampada'] = 0;
      }
    } elseif ($tipo === 'limpeza') {
      $data['projectors'][$key]['ultima_limpeza'] = $dataStr;
    } else {
      $data['projectors'][$key]['ultima_manutencao'] = $dataStr;
    }

    $data['projectors'][$key]['_updatedAt'] = date('c');

    self::saveData($data);

    Responde::ok([
      'message' => 'Manutenção registrada com sucesso.',
      'record' => $record,
    ]);
  }

  /**
   * GET /api/projetors/{id}/history
   * Timeline de eventos do projetor.
   */
  public static function history(array $config, int $id): void
  {
    $data = self::loadData();
    $key = (string) $id;
    $manutencoes = $data['projectors'][$key]['manutencoes'] ?? [];

    Responde::ok([
      'data' => $manutencoes,
      'count' => count($manutencoes),
    ]);
  }

  /**
   * GET /api/projetors/alerts
   * Alertas globais de todos os projetores.
   */
  public static function alerts(array $config): void
  {
    $data = self::loadData();
    $configData = $data['config'] ?? self::defaultData()['config'];
    $savedProjectors = $data['projectors'] ?? [];

    // Buscar projetores do GLPI
    $glpiProjectors = self::getProjectorsFromGlpi($config);

    $allAlerts = [];
    foreach ($glpiProjectors as $glpi) {
      $glpiId = $glpi['glpiId'] ?? null;
      $saved = $savedProjectors[(string) $glpiId] ?? [];
      $enriched = self::enrichProjector($glpi, $saved, $configData);

      foreach ($enriched['alertas'] as $alertType) {
        $allAlerts[] = [
          'glpiId' => $glpiId,
          'nome' => $enriched['nome'],
          'patrimonio' => $enriched['patrimonio'],
          'tipo' => $alertType,
          'horas_lampada' => $enriched['horas_lampada'],
          'percentual_uso' => $enriched['percentual_uso'],
          'dias_desde_manutencao' => $enriched['dias_desde_manutencao'],
        ];
      }
    }

    Responde::ok([
      'data' => $allAlerts,
      'count' => count($allAlerts),
    ]);
  }

  /**
   * POST /api/projetors/check
   * Dispara verificação preventiva (para scheduler).
   */
  public static function check(array $config): void
  {
    $data = self::loadData();
    $configData = $data['config'] ?? self::defaultData()['config'];
    $savedProjectors = $data['projectors'] ?? [];

    // Buscar projetores do GLPI
    $glpiProjectors = self::getProjectorsFromGlpi($config);

    $results = [
      'checked' => 0,
      'alerts' => 0,
      'critical' => 0,
      'warning' => 0,
      'maintenance_overdue' => 0,
      'timestamp' => date('c'),
    ];

    foreach ($glpiProjectors as $glpi) {
      $glpiId = $glpi['glpiId'] ?? null;
      $saved = $savedProjectors[(string) $glpiId] ?? [];
      $enriched = self::enrichProjector($glpi, $saved, $configData);

      $results['checked']++;
      $alertCount = count($enriched['alertas']);
      $results['alerts'] += $alertCount;

      if (in_array('lampada_critica', $enriched['alertas'])) {
        $results['critical']++;
      }
      if (in_array('lampada_aviso', $enriched['alertas'])) {
        $results['warning']++;
      }
      if (in_array('manutencao_atrasada', $enriched['alertas'])) {
        $results['maintenance_overdue']++;
      }
    }

    // Salvar log da verificação
    $logDir = self::DATA_DIR . '/logs';
    if (!is_dir($logDir)) {
      @mkdir($logDir, 0755, true);
    }
    $logFile = $logDir . '/check_' . date('Y-m-d') . '.json';
    @file_put_contents($logFile, json_encode($results, JSON_PRETTY_PRINT), LOCK_EX);

    Responde::ok([
      'message' => 'Verificação preventiva concluída.',
      'results' => $results,
    ]);
  }

  /**
   * GET /api/projetors/config
   * Retorna configuração dos projetores.
   */
  public static function getConfig(array $config): void
  {
    $data = self::loadData();
    $configData = $data['config'] ?? self::defaultData()['config'];

    Responde::ok(['data' => $configData]);
  }

  /**
   * PUT /api/projetors/config
   * Atualiza configuração dos projetores.
   */
  public static function updateConfig(array $config): void
  {
    $body = self::parseJsonBody();

    $data = self::loadData();
    $currentConfig = $data['config'] ?? self::defaultData()['config'];

    // Atualizar apenas campos permitidos
    $allowedFields = [
      'lamp_life_hours', 'warning_percentage', 'critical_percentage',
      'maintenance_interval_days', 'cleaning_interval_days',
      'email_enabled', 'email_recipients',
    ];

    foreach ($allowedFields as $field) {
      if (array_key_exists($field, $body)) {
        $currentConfig[$field] = $body[$field];
      }
    }

    $data['config'] = $currentConfig;
    self::saveData($data);

    Responde::ok([
      'message' => 'Configuração atualizada.',
      'data' => $currentConfig,
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════════════════════════════════════

  private static function calculateIndicators(array $items): array
  {
    $total = count($items);
    $operando = 0;
    $atencao = 0;
    $manutencao = 0;
    $fora_de_uso = 0;

    foreach ($items as $item) {
      match ($item['status_calculado'] ?? 'operando') {
        'operando' => $operando++,
        'atencao' => $atencao++,
        'manutencao' => $manutencao++,
        'fora_de_uso' => $fora_de_uso++,
        default => $operando++,
      };
    }

    return [
      'total' => $total,
      'operando' => $operando,
      'atencao' => $atencao,
      'manutencao' => $manutencao,
      'fora_de_uso' => $fora_de_uso,
    ];
  }

  private static function parseJsonBody(): array
  {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
      return [];
    }

    $json = json_decode($raw, true);
    if (!is_array($json)) {
      Responde::erro('Corpo JSON inválido.', 400);
    }

    return $json;
  }
}
