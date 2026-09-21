<?php
/**
 * api/services/AssetWriteService.php
 * -----------------------------------------------------------------------------
 * Serviço centralizado de escrita de ativos no GLPI.
 *
 * Opera sobre Computer e Printer com allow-list de campos e operações.
 * Valida permissões, valida payload, grava no GLPI, relê e retorna resultado
 * completo incluindo itemtype:id, ação, campos, resultado da gravação e releitura.
 *
 * SPRINT 4 — Confiabilidade:
 * - Validação de dropdowns via DropdownValidator antes de gravar
 * - Controle de concorrência via date_mod antes/depois
 * - ID de operação persistente com estados claros
 * - Idempotência via IdempotencyGuard
 * - Auditoria via OperationTracker
 * - Atualização do cache via CacheUpdater
 */

declare(strict_types=1);

final class AssetWriteService
{
  private GlpiClient $glpi;
  private string $session;
  private OperationTracker $tracker;
  private ?string $userId;

  // ── Allow-lists ──────────────────────────────────────────────────────────────

  private const EDITABLE_FIELDS = [
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

  private const REQUIRED_FIELDS_CREATE = [
    'Computer' => ['name'],
    'Printer'  => ['name'],
  ];

  private const DROPDOWN_FIELDS = [
    'locations_id', 'groups_id', 'users_id', 'states_id',
    'computermodels_id', 'computertypes_id', 'manufacturers_id',
    'printermodels_id', 'printertypes_id', 'entities_id',
    'operatingsystems_id',
  ];

  // ── Operações suportadas por itemtype ────────────────────────────────────────

  private const SUPPORTED_OPERATIONS = [
    'Computer' => ['create', 'update', 'delete', 'restore'],
    'Printer'  => ['create', 'update', 'delete', 'restore'],
  ];

  public function __construct(array $glpiConfig, ?string $userId = null)
  {
    $this->glpi = new GlpiClient($glpiConfig);
    $this->session = $this->glpi->initSession();
    $this->tracker = new OperationTracker();
    $this->userId = $userId ?? 'system';
    $this->glpiConfig = $glpiConfig;
  }

  private array $glpiConfig;

  public function __destruct()
  {
    try {
      $this->glpi->killSession($this->session);
    } catch (\Throwable) {
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CREATE
  // ══════════════════════════════════════════════════════════════════════════════

  public function create(string $itemtype, array $input, ?string $idempotencyKey = null): array
  {
    $this->assertSupportedOperation($itemtype, 'create');

    // Filtrar campos
    $filtered = $this->filterEditableFields($itemtype, $input);
    $this->validateRequiredFields($itemtype, $filtered);

    // Validar dropdowns
    $dropdownResult = $this->validateDropdowns($filtered);
    if ($dropdownResult['errors'] !== []) {
      $operation = $this->tracker->prepare($itemtype, 0, 'create', $filtered, $this->userId, $idempotencyKey);
      $operation = $this->tracker->transition($operation, 'refused');
      $this->tracker->audit($operation, 'dropdown_validation_failed', ['errors' => $dropdownResult['errors']]);
      return $this->buildResult($operation, false, 'Dropdowns inválidos: ' . implode('; ', array_map(fn($e) => $e['message'], $dropdownResult['errors'])));
    }

    // Verificar idempotência
    $idempotency = $this->checkIdempotency($itemtype, 0, 'create', $filtered, $idempotencyKey);
    if (!$idempotency['allowed']) {
      return $idempotency['result'];
    }

    // Preparar e executar operação
    $operation = $idempotency['operation'] ?? $this->tracker->prepare($itemtype, 0, 'create', $filtered, $this->userId, $idempotencyKey);
    $operation = $this->tracker->transition($operation, 'executing');

    try {
      $result = $this->glpi->post('/' . $itemtype, $this->session, [
        'input' => $filtered,
      ]);

      $newId = $result['id'] ?? null;
      if ($newId === null) {
        $operation = $this->tracker->transition($operation, 'failed');
        $operation = $this->tracker->recordGlpiResult($operation, false, $result, 'GLPI não retornou ID.');
        $this->tracker->audit($operation, 'create_failed_no_id');
        return $this->buildResult($operation, false, 'GLPI não retornou ID.');
      }

      $operation['id'] = (int) $newId;
      $operation = $this->tracker->recordGlpiResult($operation, true, $result);

      // Releitura
      $operation = $this->tracker->transition($operation, 'verifying');
      $readBack = $this->readAsset($itemtype, (int) $newId);
      $verified = $readBack !== null;
      $operation = $this->tracker->recordReadback($operation, $verified, $readBack);

      // Cache
      $cacheResult = $this->updateCacheAfterWrite($itemtype, (int) $newId, $readBack ?? [], 'create');
      $operation = $this->tracker->recordCacheUpdate($operation, $cacheResult['success'], $cacheResult['error'] ?? null);

      // Estado final
      if ($verified && $cacheResult['success']) {
        $operation = $this->tracker->transition($operation, 'completed');
      } elseif ($verified || $cacheResult['success']) {
        $operation = $this->tracker->transition($operation, 'partial');
      } else {
        $operation = $this->tracker->transition($operation, 'partial');
      }

      $this->tracker->audit($operation, 'create_completed', [
        'glpi_success' => true,
        'readback_verified' => $verified,
        'cache_updated' => $cacheResult['success'],
      ]);

      return $this->buildResult($operation, $verified, null, [
        'read' => $readBack,
      ]);

    } catch (\Throwable $e) {
      $operation = $this->tracker->transition($operation, 'failed');
      $operation = $this->tracker->recordGlpiResult($operation, false, null, $e->getMessage());
      $this->tracker->audit($operation, 'create_exception', ['error' => $e->getMessage()]);
      return $this->buildResult($operation, false, $e->getMessage());
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ══════════════════════════════════════════════════════════════════════════════

  public function update(string $itemtype, int $id, array $input, ?string $idempotencyKey = null): array
  {
    $this->assertSupportedOperation($itemtype, 'update');

    // Leitura inicial (before)
    $before = $this->readAsset($itemtype, $id);
    if ($before === null) {
      $operation = $this->tracker->prepare($itemtype, $id, 'update', [], $this->userId, $idempotencyKey);
      $operation = $this->tracker->transition($operation, 'refused');
      $this->tracker->audit($operation, 'asset_not_found');
      return $this->buildResult($operation, false, "Ativo {$itemtype}:{$id} não encontrado no GLPI.");
    }

    // Filtrar campos
    $filtered = $this->filterEditableFields($itemtype, $input);

    if ($filtered === []) {
      $operation = $this->tracker->prepare($itemtype, $id, 'update', [], $this->userId, $idempotencyKey);
      $operation = $this->tracker->transition($operation, 'refused');
      $this->tracker->audit($operation, 'no_editable_fields');
      return $this->buildResult($operation, false, 'Nenhum campo editável enviado.');
    }

    // Validar dropdowns
    $dropdownResult = $this->validateDropdowns($filtered, $before);
    if ($dropdownResult['errors'] !== []) {
      $operation = $this->tracker->prepare($itemtype, $id, 'update', $filtered, $this->userId, $idempotencyKey);
      $operation = $this->tracker->transition($operation, 'refused');
      $this->tracker->audit($operation, 'dropdown_validation_failed', ['errors' => $dropdownResult['errors']]);
      return $this->buildResult($operation, false, 'Dropdowns inválidos: ' . implode('; ', array_map(fn($e) => $e['message'], $dropdownResult['errors'])));
    }

    // Verificar concorrência
    $concurrencyCheck = $this->checkConcurrency($before, $filtered);
    if (!$concurrencyCheck['allowed']) {
      $operation = $this->tracker->prepare($itemtype, $id, 'update', $filtered, $this->userId, $idempotencyKey);
      $operation = $this->tracker->transition($operation, 'refused');
      $this->tracker->audit($operation, 'concurrency_conflict', $concurrencyCheck);
      return $this->buildResult($operation, false, $concurrencyCheck['reason'], [
        'conflict' => $concurrencyCheck,
      ]);
    }

    // Verificar idempotência
    $idempotency = $this->checkIdempotency($itemtype, $id, 'update', $filtered, $idempotencyKey);
    if (!$idempotency['allowed']) {
      return $idempotency['result'];
    }

    // Preparar e executar
    $operation = $idempotency['operation'] ?? $this->tracker->prepare($itemtype, $id, 'update', $filtered, $this->userId, $idempotencyKey);
    $operation = $this->tracker->transition($operation, 'executing');

    try {
      $this->glpi->put("/{$itemtype}/{$id}", $this->session, [
        'input' => $filtered,
      ]);

      $operation = $this->tracker->recordGlpiResult($operation, true);

      // Releitura
      $operation = $this->tracker->transition($operation, 'verifying');
      $after = $this->readAsset($itemtype, $id);
      $verified = $after !== null;
      $changed = $this->computeChanges($before, $after, array_keys($filtered));
      $operation = $this->tracker->recordReadback($operation, $verified, $after);

      // Verificar se houve mudança concorrente após gravação
      if ($verified && $after !== null) {
        $afterMod = $after['date_mod'] ?? null;
        $beforeMod = $before['date_mod'] ?? null;
        if ($afterMod !== null && $beforeMod !== null && $afterMod !== $beforeMod) {
          // date_mod mudou — pode ter havido outra escrita
          $operation['concurrent_write_detected'] = true;
        }
      }

      // Cache
      $cacheResult = $this->updateCacheAfterWrite($itemtype, $id, $after ?? [], 'update', $before);
      $operation = $this->tracker->recordCacheUpdate($operation, $cacheResult['success'], $cacheResult['error'] ?? null);

      // Estado final
      if ($verified && $cacheResult['success']) {
        $operation = $this->tracker->transition($operation, 'completed');
      } else {
        $operation = $this->tracker->transition($operation, 'partial');
      }

      $this->tracker->audit($operation, 'update_completed', [
        'glpi_success' => true,
        'readback_verified' => $verified,
        'cache_updated' => $cacheResult['success'],
        'fields_changed' => count($changed),
      ]);

      return $this->buildResult($operation, $verified, null, [
        'before'  => $before,
        'after'   => $after,
        'changes' => $changed,
      ]);

    } catch (\Throwable $e) {
      $operation = $this->tracker->transition($operation, 'failed');
      $operation = $this->tracker->recordGlpiResult($operation, false, null, $e->getMessage());
      $this->tracker->audit($operation, 'update_exception', ['error' => $e->getMessage()]);
      return $this->buildResult($operation, false, $e->getMessage());
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DELETE (logical — states_id)
  // ══════════════════════════════════════════════════════════════════════════════

  public function delete(string $itemtype, int $id): array
  {
    $this->assertSupportedOperation($itemtype, 'delete');

    $before = $this->readAsset($itemtype, $id);
    if ($before === null) {
      $operation = $this->tracker->prepare($itemtype, $id, 'delete', [], $this->userId);
      $operation = $this->tracker->transition($operation, 'refused');
      $this->tracker->audit($operation, 'asset_not_found');
      return $this->buildResult($operation, false, "Ativo {$itemtype}:{$id} não encontrado.");
    }

    $inactiveStateId = $this->resolveStateId('Inativo');
    if ($inactiveStateId === null) {
      $operation = $this->tracker->prepare($itemtype, $id, 'delete', [], $this->userId);
      $operation = $this->tracker->transition($operation, 'refused');
      $this->tracker->audit($operation, 'state_resolution_failed');
      return $this->buildResult($operation, false, 'Não foi possível resolver ID do estado "Inativo". Coleção State pode estar inacessível.');
    }

    $payload = ['states_id' => $inactiveStateId];

    // Idempotência — delete é idempotente por natureza
    $operation = $this->tracker->prepare($itemtype, $id, 'delete', $payload, $this->userId);
    $operation = $this->tracker->transition($operation, 'executing');

    try {
      $this->glpi->put("/{$itemtype}/{$id}", $this->session, [
        'input' => $payload,
      ]);

      $operation = $this->tracker->recordGlpiResult($operation, true);

      // Releitura
      $operation = $this->tracker->transition($operation, 'verifying');
      $after = $this->readAsset($itemtype, $id);
      $verified = $after !== null;
      $operation = $this->tracker->recordReadback($operation, $verified, $after);

      // Cache
      $cacheResult = $this->updateCacheAfterWrite($itemtype, $id, $after ?? [], 'delete');
      $operation = $this->tracker->recordCacheUpdate($operation, $cacheResult['success'], $cacheResult['error'] ?? null);

      if ($verified && $cacheResult['success']) {
        $operation = $this->tracker->transition($operation, 'completed');
      } else {
        $operation = $this->tracker->transition($operation, 'partial');
      }

      $this->tracker->audit($operation, 'delete_completed', [
        'glpi_success' => true,
        'readback_verified' => $verified,
        'cache_updated' => $cacheResult['success'],
      ]);

      return $this->buildResult($operation, $verified, null, [
        'before' => $before,
        'after'  => $after,
      ]);

    } catch (\Throwable $e) {
      $operation = $this->tracker->transition($operation, 'failed');
      $operation = $this->tracker->recordGlpiResult($operation, false, null, $e->getMessage());
      $this->tracker->audit($operation, 'delete_exception', ['error' => $e->getMessage()]);
      return $this->buildResult($operation, false, $e->getMessage());
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESTORE
  // ══════════════════════════════════════════════════════════════════════════════

  public function restore(string $itemtype, int $id): array
  {
    $this->assertSupportedOperation($itemtype, 'restore');

    $before = $this->readAsset($itemtype, $id);
    if ($before === null) {
      $operation = $this->tracker->prepare($itemtype, $id, 'restore', [], $this->userId);
      $operation = $this->tracker->transition($operation, 'refused');
      $this->tracker->audit($operation, 'asset_not_found');
      return $this->buildResult($operation, false, "Ativo {$itemtype}:{$id} não encontrado.");
    }

    $activeStateId = $this->resolveStateId('Em uso');
    if ($activeStateId === null) {
      $operation = $this->tracker->prepare($itemtype, $id, 'restore', [], $this->userId);
      $operation = $this->tracker->transition($operation, 'refused');
      $this->tracker->audit($operation, 'state_resolution_failed');
      return $this->buildResult($operation, false, 'Não foi possível resolver ID do estado "Em uso". Coleção State pode estar inacessível.');
    }

    $payload = ['states_id' => $activeStateId];

    $operation = $this->tracker->prepare($itemtype, $id, 'restore', $payload, $this->userId);
    $operation = $this->tracker->transition($operation, 'executing');

    try {
      $this->glpi->put("/{$itemtype}/{$id}", $this->session, [
        'input' => $payload,
      ]);

      $operation = $this->tracker->recordGlpiResult($operation, true);

      // Releitura
      $operation = $this->tracker->transition($operation, 'verifying');
      $after = $this->readAsset($itemtype, $id);
      $verified = $after !== null;
      $operation = $this->tracker->recordReadback($operation, $verified, $after);

      // Cache
      $cacheResult = $this->updateCacheAfterWrite($itemtype, $id, $after ?? [], 'restore');
      $operation = $this->tracker->recordCacheUpdate($operation, $cacheResult['success'], $cacheResult['error'] ?? null);

      if ($verified && $cacheResult['success']) {
        $operation = $this->tracker->transition($operation, 'completed');
      } else {
        $operation = $this->tracker->transition($operation, 'partial');
      }

      $this->tracker->audit($operation, 'restore_completed', [
        'glpi_success' => true,
        'readback_verified' => $verified,
        'cache_updated' => $cacheResult['success'],
      ]);

      return $this->buildResult($operation, $verified, null, [
        'before' => $before,
        'after'  => $after,
      ]);

    } catch (\Throwable $e) {
      $operation = $this->tracker->transition($operation, 'failed');
      $operation = $this->tracker->recordGlpiResult($operation, false, null, $e->getMessage());
      $this->tracker->audit($operation, 'restore_exception', ['error' => $e->getMessage()]);
      return $this->buildResult($operation, false, $e->getMessage());
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════════

  public static function editableFields(string $itemtype): array
  {
    return self::EDITABLE_FIELDS[$itemtype] ?? [];
  }

  public static function dropdownFields(): array
  {
    return self::DROPDOWN_FIELDS;
  }

  public static function supportedOperations(string $itemtype): array
  {
    return self::SUPPORTED_OPERATIONS[$itemtype] ?? [];
  }

  public static function isSupported(string $itemtype, string $operation): bool
  {
    return in_array($operation, self::SUPPORTED_OPERATIONS[$itemtype] ?? [], true);
  }

  private function resolveStateId(string $stateName): ?int
  {
    try {
      $result = $this->glpi->getAllWithParams('/State', $this->session, [
        'expand_dropdowns' => 'true',
      ], 500);

      foreach ($result['items'] as $item) {
        if (!is_array($item)) continue;
        if (mb_strtolower(trim($item['name'] ?? '')) === mb_strtolower($stateName)) {
          return (int) $item['id'];
        }
      }
    } catch (\Throwable) {
      $fixtures = OptionsService::fixtures('State');
      foreach ($fixtures['items'] as $item) {
        if (mb_strtolower(trim($item['name'] ?? '')) === mb_strtolower($stateName)) {
          return (int) $item['id'];
        }
      }
    }

    return null;
  }

  private function readAsset(string $itemtype, int $id): ?array
  {
    try {
      $raw = $this->glpi->getWithParams("/{$itemtype}/{$id}", $this->session, [
        'expand_dropdowns' => 'true',
      ]);
      if (!is_array($raw) || !isset($raw['id'])) {
        return null;
      }
      return $raw;
    } catch (\Throwable) {
      return null;
    }
  }

  private function filterEditableFields(string $itemtype, array $input): array
  {
    $allowed = self::EDITABLE_FIELDS[$itemtype] ?? [];
    $filtered = [];

    foreach ($input as $key => $value) {
      if (!in_array($key, $allowed, true)) {
        continue;
      }

      if (in_array($key, self::DROPDOWN_FIELDS, true)) {
        if ($value === 0 || $value === '0' || $value === '') {
          $filtered[$key] = 0;
        } elseif (is_int($value)) {
          $filtered[$key] = $value;
        } elseif (is_string($value) && ctype_digit($value)) {
          $filtered[$key] = (int) $value;
        }
        continue;
      }

      if ($value === null) {
        $filtered[$key] = '';
      } elseif (is_string($value)) {
        $filtered[$key] = trim($value);
      } else {
        $filtered[$key] = trim((string) $value);
      }
    }

    return $filtered;
  }

  private function validateRequiredFields(string $itemtype, array $filtered): void
  {
    $required = self::REQUIRED_FIELDS_CREATE[$itemtype] ?? [];

    foreach ($required as $field) {
      if (!isset($filtered[$field]) || $filtered[$field] === '') {
        Responde::erro(
          "Campo obrigatório ausente: {$field}.",
          422,
          ['field' => $field, 'itemtype' => $itemtype]
        );
      }
    }
  }

  private function assertSupportedOperation(string $itemtype, string $operation): void
  {
    if (!isset(self::SUPPORTED_OPERATIONS[$itemtype])) {
      Responde::erro(
        "Itemtype '{$itemtype}' não suportado para operações de escrita.",
        422,
        ['itemtype' => $itemtype, 'supported' => array_keys(self::SUPPORTED_OPERATIONS)]
      );
    }

    if (!in_array($operation, self::SUPPORTED_OPERATIONS[$itemtype], true)) {
      Responde::erro(
        "Operação '{$operation}' não suportada para '{$itemtype}'.",
        422,
        ['itemtype' => $itemtype, 'operation' => $operation, 'supported' => self::SUPPORTED_OPERATIONS[$itemtype]]
      );
    }
  }

  private function computeChanges(array $before, array $after, array $fields): array
  {
    if ($after === null) return [];

    $changes = [];
    foreach ($fields as $field) {
      $oldVal = $this->extractFieldValue($before, $field);
      $newVal = $this->extractFieldValue($after, $field);

      if ($oldVal !== $newVal) {
        $changes[] = [
          'field'    => $field,
          'previous' => $oldVal,
          'current'  => $newVal,
        ];
      }
    }

    return $changes;
  }

  private function extractFieldValue(array $asset, string $field): string
  {
    $value = $asset[$field] ?? null;

    if (is_array($value)) {
      return $value['name'] ?? $value['completename'] ?? '';
    }

    return trim((string) ($value ?? ''));
  }

  // ── Sprint 4: Validação de dropdowns ──────────────────────────────────────

  private function validateDropdowns(array $input, array $before = []): array
  {
    $validator = new DropdownValidator($this->glpiConfig);
    return $validator->validate($input, $before);
  }

  // ── Sprint 4: Controle de concorrência ────────────────────────────────────

  private function checkConcurrency(array $before, array $input): array
  {
    // Verifica se o ativo foi modificado desde que foi lido
    $beforeMod = $before['date_mod'] ?? null;
    if ($beforeMod === null) {
      return ['allowed' => true];
    }

    // Releitura para verificar concorrência
    $current = $this->readAsset($before['itemtype'] ?? 'Computer', (int) $before['id']);
    if ($current === null) {
      return ['allowed' => true];
    }

    $currentMod = $current['date_mod'] ?? null;
    if ($currentMod !== null && $currentMod !== $beforeMod) {
      return [
        'allowed' => false,
        'reason'  => 'O ativo foi modificado por outro usuário desde a abertura do formulário.',
        'before_date_mod' => $beforeMod,
        'current_date_mod' => $currentMod,
        'current_values' => $current,
      ];
    }

    return ['allowed' => true];
  }

  // ── Sprint 4: Idempotência ───────────────────────────────────────────────

  private function checkIdempotency(string $itemtype, int|string $id, string $action, array $fields, ?string $clientKey): array
  {
    $guard = new IdempotencyGuard($this->tracker);
    $result = $guard->check($itemtype, $id, $action, $fields, $clientKey);

    if (!$result['allowed'] && isset($result['existing'])) {
      $existing = $result['existing'];
      return [
        'allowed'   => false,
        'operation' => $existing,
        'result'    => $this->buildResult($existing, $existing['state'] === 'completed', $result['reason']),
      ];
    }

    $operation = $guard->registerPending($itemtype, $id, $action, $fields, $this->userId);

    return [
      'allowed'   => true,
      'operation' => $operation,
    ];
  }

  // ── Sprint 4: Cache ──────────────────────────────────────────────────────

  private function updateCacheAfterWrite(string $itemtype, int $id, array $after, string $action, array $before = []): array
  {
    $updater = new CacheUpdater();

    return match ($action) {
      'create' => $updater->addAsset(array_merge($after, ['itemtype' => $itemtype])),
      'delete' => $updater->removeAsset($itemtype, $id),
      'restore' => $updater->restoreAsset($itemtype, $id),
      default => $updater->updateAsset($itemtype, $id, $after),
    };
  }

  // ── Resultado padronizado ─────────────────────────────────────────────────

  private function buildResult(array $operation, bool $verified, ?string $error = null, array $extra = []): array
  {
    $result = [
      'operation_id'     => $operation['operation_id'],
      'itemtype'         => $operation['itemtype'],
      'id'               => $operation['id'],
      'action'           => $operation['action'],
      'requested_fields' => $operation['requested_fields'],
      'user_id'          => $operation['user_id'],
      'state'            => $operation['state'],
      'verified'         => $verified,
      'timestamp'        => date('c'),
      'attempts'         => $operation['attempts'] ?? 0,
    ];

    if ($error !== null) {
      $result['status'] = 'failed';
      $result['error']  = $error;
    } elseif ($operation['state'] === 'completed') {
      $result['status'] = 'completed_verified';
    } elseif ($operation['state'] === 'partial') {
      $result['status'] = 'completed_partial';
    } else {
      $result['status'] = 'completed_unverified';
    }

    // Status do cache
    if (isset($operation['cache_result'])) {
      $result['cache_status'] = $operation['cache_result']['success'] ? 'updated' : 'pending';
      if (!$operation['cache_result']['success']) {
        $result['cache_error'] = $operation['cache_result']['error'] ?? 'Erro desconhecido';
      }
    }

    // Concorrência
    if (isset($operation['concurrent_write_detected']) && $operation['concurrent_write_detected']) {
      $result['concurrent_warning'] = 'Modificação concorrente detectada após gravação.';
    }

    foreach ($extra as $key => $value) {
      $result[$key] = $value;
    }

    return $result;
  }
}
