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
    $proposalId = self::generateId();
    $now = date('c');

    $current = null;
    if (in_array($action, ['update', 'delete', 'restore']) && $id) {
      $current = self::fetchAsset($itemtype, $id);
    }

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
      'proposed_values' => self::extractProposedValues($action, $fields, $current),
      'field_sources' => self::mapFieldSources($action, $fields, $current),
      'permissions' => self::checkPermissions($action, $itemtype),
      'pending_validations' => self::identifyPending($action, $itemtype, $fields, $current),
      'read_reference' => $current ? ($current['_classification']['confidence'] ?? null) : null,
      'glpi_version' => $current['date_mod'] ?? null,
      'disclaimer' => 'PRÉVIA — nenhuma alteração executada. Esta proposta expira em 1 hora.',
    ];

    self::persist($proposal);

    return $proposal;
  }

  /**
   * Recupera uma proposta pelo ID.
   */
  public static function get(string $proposalId): ?array {
    $path = self::$proposalsDir . '/' . $proposalId . '.json';
    if (!file_exists($path)) return null;

    $data = json_decode(file_get_contents($path), true);
    if ($data === null) return null;

    if (strtotime($data['expires_at'] ?? '') < time()) {
      $data['status'] = 'expired';
    }

    return $data;
  }

  /**
   * Cancela uma proposta.
   */
  public static function cancel(string $proposalId): ?array {
    $proposal = self::get($proposalId);
    if ($proposal === null) return null;

    if ($proposal['status'] !== 'pending') {
      return null;
    }

    $proposal['status'] = 'cancelled';
    $proposal['cancelled_at'] = date('c');
    self::persist($proposal);

    return $proposal;
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

    if ($proposal['action'] === 'update' && $current) {
      $currentMod = $current['date_mod'] ?? null;
      $refMod = $proposal['glpi_version'] ?? null;
      if ($currentMod && $refMod && $currentMod !== $refMod) {
        return ['valid' => false, 'error' => 'Ativo foi modificado desde a leitura original'];
      }
    }

    $perms = $proposal['permissions'] ?? [];
    if (!($perms['can_write'] ?? false)) {
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

  private static function extractProposedValues(string $action, array $fields, ?array $current): array {
    if ($action === 'delete') {
      return ['states_id' => ['id' => null, 'name' => 'Inativo', 'note' => 'Exclusão lógica via states_id']];
    }

    if ($action === 'restore') {
      return ['states_id' => ['id' => null, 'name' => 'Em uso', 'note' => 'Restauração via states_id']];
    }

    $itemtype = $fields['itemtype'] ?? 'Computer';
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
      'can_write' => $typeInfo['updatable'] ?? false,
      'can_create' => $typeInfo['creatable'] ?? false,
      'can_delete' => $typeInfo['deletable'] ?? false,
      'can_restore' => $typeInfo['restorable'] ?? false,
      'supported_operation' => ($typeInfo[$action . 'able'] ?? false) || ($action === 'create' && ($typeInfo['creatable'] ?? false)),
    ];
  }

  private static function fetchAsset(string $itemtype, int $id): ?array {
    $glpiConfig = [
      'url' => getenv('GLPI_URL') ?: '',
      'app_token' => getenv('GLPI_APP_TOKEN') ?: '',
      'user_token' => getenv('GLPI_USER_TOKEN') ?: '',
      'ssl_insecure' => (getenv('GLPI_SSL_INSECURE') ?: '0') === '1',
    ];

    try {
      $service = new AssetService($glpiConfig);
      return $service->get($itemtype, $id);
    } catch (\Exception $e) {
      return null;
    }
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
    file_put_contents($path, json_encode($proposal, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
  }
}
