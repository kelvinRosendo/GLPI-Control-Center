<?php
/**
 * GLPI Control Center - AgentProposal.php
 * -----------------------------------------------------------------------------
 * Serviço de preparação de propostas de alteração.
 *
 * Monta propostas validadas SEM executar nenhuma gravação.
 * Cada proposta tem ID único, validade e auditoria completa.
 *
 * Sprint 06: Agente de IA
 */

class AgentProposal {

  private static string $proposalsDir = __DIR__ . '/../../data/proposals';

  /**
   * Cria uma nova proposta de alteração.
   */
  public static function create(
    string $action,
    string $itemtype,
    ?int $id,
    array $fields,
    ?string $userId
  ): array {
    if (!in_array($itemtype, ['Computer', 'Printer'], true) || !in_array($action, ['create', 'update', 'delete', 'restore'], true)) {
      throw new InvalidArgumentException('Tipo ou operação não suportado.');
    }
    if (!self::canWrite($itemtype)) throw new RuntimeException('Sem permissão para editar este tipo de ativo.');
    $unknown = array_diff(array_keys($fields), self::getEditableFields($itemtype));
    if ($unknown) throw new InvalidArgumentException('Campos não editáveis: ' . implode(', ', $unknown));
    foreach ($fields as $field => &$value) {
      if (in_array($field, AssetWriteService::dropdownFields(), true)) {
        if (!(is_int($value) || (is_string($value) && ctype_digit($value))) || (int)$value < 0) throw new InvalidArgumentException('Informe um ID válido para ' . $field);
        $value = (int)$value;
      } else {
        if (!is_scalar($value) && $value !== null) throw new InvalidArgumentException('Valor inválido para ' . $field);
        $value = trim((string)$value);
      }
    }
    unset($value);
    if (in_array($action, ['create', 'update'], true) && !$fields) throw new InvalidArgumentException('Informe os campos da alteração.');
    if ($action === 'create' && trim((string)($fields['name'] ?? '')) === '') throw new InvalidArgumentException('Nome obrigatório.');
    $proposalId = self::generateId();
    $now = date('c');

    $current = null;
    if (in_array($action, ['update', 'delete', 'restore']) && $id) {
      $current = self::fetchAsset($itemtype, $id);
    }
    if ($action !== 'create' && !$current) throw new RuntimeException('Ativo não encontrado no GLPI.');

    $proposal = [
      'proposal_id' => $proposalId,
      'status' => 'pending',
      'created_at' => $now,
      'expires_at' => date('c', strtotime('+1 hour')),
      'created_by' => $userId,
      'action' => $action,
      'itemtype' => $itemtype,
      'id' => $id,
      'asset_name' => $current['name'] ?? $fields['name'] ?? 'Novo ativo',
      'current_values' => $current ? self::extractCurrentValues($action, $current) : null,
      'proposed_values' => self::extractProposedValues($action, $fields, $current, $itemtype),
      'field_sources' => self::mapFieldSources($action, $fields, $current),
      'permissions' => self::checkPermissions($action, $itemtype),
      'pending_validations' => self::identifyPending($action, $itemtype, $fields, $current),
      'read_reference' => $current ? ($current['_classification']['confidence'] ?? null) : null,
      'glpi_version' => $current['raw']['date_mod'] ?? $current['date_mod'] ?? null,
      'disclaimer' => 'PRÉVIA — nenhuma alteração executada. Esta proposta expira em 1 hora.',
    ];

    $proposal['content_hash'] = self::contentHash($proposal);
    self::persist($proposal);

    return $proposal;
  }

  /**
   * Recupera uma proposta pelo ID.
   */
  public static function get(string $proposalId): ?array {
    if (!preg_match('/^prop_[a-f0-9]+$/D', $proposalId)) return null;
    $path = self::$proposalsDir . '/' . $proposalId . '.json';
    if (!file_exists($path)) return null;

    $data = json_decode(file_get_contents($path), true);
    if ($data === null) return null;

    if ($data['status'] === 'pending' && strtotime($data['expires_at'] ?? '') < time()) {
      $data['status'] = 'expired';
    }

    return $data;
  }

  /**
   * Cancela uma proposta.
   */
  public static function cancel(string $proposalId, ?string $userId = null): ?array {
    $lock = self::lock($proposalId);
    if ($lock === null) return null;
    try {
    $proposal = self::get($proposalId);
    if ($proposal === null) return null;
    if (!$userId || ($proposal['created_by'] ?? null) !== $userId) return null;

    if (!in_array($proposal['status'], ['pending', 'executing'], true)) {
      return null;
    }

    if ($proposal['status'] === 'executing') {
      // Itens já em execução não podem ser cancelados
      return null;
    }

    $proposal['status'] = 'cancelled';
    $proposal['cancelled_at'] = date('c');
    self::persist($proposal);

    return $proposal;
    } finally { flock($lock, LOCK_UN); fclose($lock); }
  }

  /**
   * Atualiza o status de uma proposta.
   */
  public static function updateStatus(string $proposalId, string $newStatus, array $extra = []): ?array {
    $proposal = self::get($proposalId);
    if ($proposal === null) return null;

    $validTransitions = [
      'pending' => ['executing', 'cancelled', 'expired'],
      'executing' => ['executed', 'failed', 'cancelled'],
      'expired' => [],
      'cancelled' => [],
      'executed' => [],
      'failed' => ['pending'],
    ];

    $currentStatus = $proposal['status'];
    if (!in_array($newStatus, $validTransitions[$currentStatus] ?? [], true)) {
      return null;
    }

    $proposal['status'] = $newStatus;
    $proposal[$newStatus . '_at'] = date('c');

    foreach ($extra as $key => $value) {
      $proposal[$key] = $value;
    }

    self::persist($proposal);
    return $proposal;
  }

  /**
   * Lista propostas por usuário com filtros.
   */
  public static function listByUser(string $userId, array $filters = []): array {
    $dir = self::$proposalsDir;
    if (!is_dir($dir)) return [];

    $results = [];
    $files = glob($dir . '/*.json');
    if ($files === false) return [];

    foreach ($files as $file) {
      $content = @file_get_contents($file);
      if ($content === false) continue;

      $proposal = json_decode($content, true);
      if (!is_array($proposal)) continue;

      if (($proposal['created_by'] ?? '') !== $userId) continue;

      if (isset($filters['status']) && $proposal['status'] !== $filters['status']) continue;
      if (isset($filters['action']) && $proposal['action'] !== $filters['action']) continue;
      if (isset($filters['itemtype']) && $proposal['itemtype'] !== $filters['itemtype']) continue;

      $results[] = $proposal;
    }

    usort($results, fn($a, $b) => strtotime($b['created_at'] ?? '') - strtotime($a['created_at'] ?? ''));

    return $results;
  }

  /**
   * Valida se uma proposta pode ser executada.
   */
  public static function validateForExecution(string $proposalId): array {
    $proposal = self::get($proposalId);

    if ($proposal === null) {
      return ['valid' => false, 'error' => 'Proposta não encontrada'];
    }

    if ($proposal['status'] !== 'pending') {
      return ['valid' => false, 'error' => 'Proposta não está pendente: ' . $proposal['status']];
    }

    if (strtotime($proposal['expires_at'] ?? '') < time()) {
      return ['valid' => false, 'error' => 'Proposta expirada'];
    }

    $current = null;
    if (in_array($proposal['action'], ['update', 'delete', 'restore']) && $proposal['id']) {
      $current = self::fetchAsset($proposal['itemtype'], $proposal['id']);
    }

    if (in_array($proposal['action'], ['update', 'delete', 'restore']) && $current === null) {
      return ['valid' => false, 'error' => 'Ativo não encontrado mais no GLPI'];
    }

    if ($current) {
      $currentMod = $current['raw']['date_mod'] ?? $current['date_mod'] ?? null;
      $refMod = $proposal['glpi_version'] ?? null;
      if (!$currentMod || !$refMod || $currentMod !== $refMod) {
        return ['valid' => false, 'error' => 'Ativo foi modificado desde a leitura original'];
      }
    }

    if (!self::canWrite($proposal['itemtype'])) {
      return ['valid' => false, 'error' => 'Sem permissão de escrita'];
    }

    return ['valid' => true, 'proposal' => $proposal];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private static function generateId(): string {
    return 'prop_' . bin2hex(random_bytes(16));
  }

  private static function extractCurrentValues(string $action, array $current): array {
    if ($action === 'create') return [];

    $itemtype = $current['itemtype'] ?? 'Computer';
    $current = $current['raw'] ?? $current;
    $editable = self::getEditableFields($itemtype);
    $values = [];

    foreach ($editable as $field) {
      $val = $current[$field] ?? null;
      if (is_array($val)) {
        $values[$field] = ['id' => $val['id'] ?? null, 'name' => $val['name'] ?? ''];
      } else {
        $values[$field] = $val;
      }
    }

    return $values;
  }

  private static function extractProposedValues(string $action, array $fields, ?array $current, string $itemtype = 'Computer'): array {
    if ($action === 'delete') {
      return ['states_id' => ['id' => null, 'name' => 'Inativo', 'note' => 'Exclusão lógica via states_id']];
    }

    if ($action === 'restore') {
      return ['states_id' => ['id' => null, 'name' => 'Em uso', 'note' => 'Restauração via states_id']];
    }

    $editable = self::getEditableFields($itemtype);
    $proposed = [];

    foreach ($fields as $key => $value) {
      if (in_array($key, $editable)) {
        $proposed[$key] = $value;
      }
    }

    return $proposed;
  }

  private static function getEditableFields(string $itemtype): array {
    $fields = [
      'Computer' => [
        'name', 'serial', 'otherserial', 'contact', 'contact_num', 'comment',
        'locations_id', 'groups_id', 'users_id', 'states_id',
      ],
      'Printer' => [
        'name', 'serial', 'otherserial', 'contact', 'contact_num', 'comment',
        'locations_id', 'users_id', 'states_id',
        'printermodels_id', 'manufacturers_id',
      ],
    ];
    return $fields[$itemtype] ?? [];
  }

  private static function mapFieldSources(string $action, array $fields, ?array $current): array {
    $sources = [];

    foreach ($fields as $key => $value) {
      if ($key === 'itemtype') continue;

      if ($action === 'update' && $current) {
        $currentVal = $current[$key] ?? null;
        if ($currentVal == $value) {
          $sources[$key] = 'same_as_current';
        } else {
          $sources[$key] = 'agent_proposed';
        }
      } else {
        $sources[$key] = 'agent_proposed';
      }
    }

    return $sources;
  }

  private static function checkPermissions(string $action, string $itemtype): array {
    $contract = CapabilitiesService::getContract();
    $types = $contract['assetTypes'] ?? [];
    $typeInfo = $types[$itemtype] ?? [];

    return [
      'can_read' => true,
      'can_write' => self::canWrite($itemtype) && ($typeInfo['updatable'] ?? false),
      'can_create' => $typeInfo['creatable'] ?? false,
      'can_delete' => $typeInfo['deletable'] ?? false,
      'can_restore' => $typeInfo['restorable'] ?? false,
      'supported_operation' => $typeInfo[['create' => 'creatable', 'update' => 'updatable', 'delete' => 'deletable', 'restore' => 'restorable'][$action]] ?? false,
    ];
  }

  private static function fetchAsset(string $itemtype, int $id): ?array {
    $glpiConfig = [
      'url' => getenv('GLPI_URL') ?: '',
      'app_token' => getenv('GLPI_APP_TOKEN') ?: '',
      'user_token' => getenv('GLPI_USER_TOKEN') ?: '',
      'ssl_insecure' => (getenv('GLPI_SSL_INSECURE') ?: '0') === '1',
    ];

    $service = new AssetService($glpiConfig);
    return $service->get($itemtype, $id);
  }

  private static function identifyPending(string $action, string $itemtype, array $fields, ?array $current): array {
    $pending = [];

    if ($action === 'update' && $current) {
      $dropdownFields = ['locations_id', 'groups_id', 'users_id', 'states_id', 'printermodels_id', 'manufacturers_id'];
      foreach ($dropdownFields as $field) {
        if (isset($fields[$field]) && is_numeric($fields[$field])) {
          $pending[] = [
            'field' => $field,
            'type' => 'dropdown_validation',
            'note' => 'ID será validado contra GLPI antes da execução',
          ];
        }
      }
    }

    return $pending;
  }

  private static function persist(array $proposal): void {
    $dir = self::$proposalsDir;
    if (!is_dir($dir)) {
      mkdir($dir, 0750, true);
    }

    $path = $dir . '/' . $proposal['proposal_id'] . '.json';
    if (file_put_contents($path, json_encode($proposal, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX) === false) {
      throw new RuntimeException('Não foi possível persistir a proposta.');
    }
  }

  public static function canWrite(string $itemtype): bool {
    return class_exists('PermissionMiddleware') && PermissionMiddleware::can($itemtype === 'Printer' ? 'impressoras' : 'computadores', 'edit');
  }

  public static function contentHash(array $proposal): string {
    $fields = $proposal['proposed_values'] ?? [];
    ksort($fields);
    return hash('sha256', json_encode([
      $proposal['proposal_id'], $proposal['created_by'], $proposal['action'],
      $proposal['itemtype'], $proposal['id'], $fields, $proposal['current_values'],
      $proposal['glpi_version'], $proposal['expires_at'],
    ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
  }

  /** Trava a proposta durante confirmação/execução ou cancelamento. */
  public static function lock(string $proposalId) {
    if (!preg_match('/^prop_[a-f0-9]+$/D', $proposalId) || !is_dir(self::$proposalsDir)) return null;
    $handle = fopen(self::$proposalsDir . '/' . $proposalId . '.lock', 'c');
    if (!$handle) return null;
    if (!flock($handle, LOCK_EX | LOCK_NB)) { fclose($handle); return null; }
    return $handle;
  }
}
