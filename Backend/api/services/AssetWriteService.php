<?php
/**
 * api/services/AssetWriteService.php
 * -----------------------------------------------------------------------------
 * Serviço centralizado de escrita de ativos no GLPI.
 *
 * Opera sobre Computer e Printer com allow-list de campos e operações.
 * Valida permissões, valida payload, grava no GLPI, relê e retorna resultado
 * completo incluindo itemtype:id, ação, campos, resultado da gravação e releitura.
 */

declare(strict_types=1);

final class AssetWriteService
{
  private GlpiClient $glpi;
  private string $session;

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

  // ══════════════════════════════════════════════════════════════════════════════
  // CREATE
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Cria um ativo no GLPI.
   *
   * @return array Resultado padronizado da operação
   */
  public function create(string $itemtype, array $input): array
  {
    $this->assertSupportedOperation($itemtype, 'create');

    $filtered = $this->filterEditableFields($itemtype, $input);
    $this->validateRequiredFields($itemtype, $filtered);

    $result = $this->glpi->post('/' . $itemtype, $this->session, [
      'input' => $filtered,
    ]);

    $newId = $result['id'] ?? null;
    if ($newId === null) {
      return $this->operationResult($itemtype, null, 'create', $filtered, false, 'GLPI não retornou ID.');
    }

    $readBack = $this->readAsset($itemtype, (int) $newId);

    return $this->operationResult($itemtype, (int) $newId, 'create', $filtered, $readBack !== null, null, [
      'read' => $readBack,
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Atualiza campos de um ativo no GLPI.
   *
   * Envia apenas campos explicitamente presentes no input.
   * Campos ausentes são ignorados (não limpos).
   * Campo com valor null/string vazia é limpo intencionalmente.
   *
   * @return array Resultado padronizado da operação
   */
  public function update(string $itemtype, int $id, array $input): array
  {
    $this->assertSupportedOperation($itemtype, 'update');

    $before = $this->readAsset($itemtype, $id);
    if ($before === null) {
      return $this->operationResult($itemtype, $id, 'update', [], false, "Ativo {$itemtype}:{$id} não encontrado no GLPI.");
    }

    $filtered = $this->filterEditableFields($itemtype, $input);

    if ($filtered === []) {
      return $this->operationResult($itemtype, $id, 'update', [], false, 'Nenhum campo editável enviado.');
    }

    $this->glpi->put("/{$itemtype}/{$id}", $this->session, [
      'input' => $filtered,
    ]);

    $after = $this->readAsset($itemtype, $id);
    $changed = $this->computeChanges($before, $after, array_keys($filtered));

    return $this->operationResult($itemtype, $id, 'update', $filtered, $after !== null, null, [
      'before'  => $before,
      'after'   => $after,
      'changes' => $changed,
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DELETE (logical — states_id)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Exclui logicamente um ativo definindo states_id para "Inativo".
   *
   * GLPI não suporta DELETE REST — exclusão lógica é via states_id.
   * Retorna erro se states_id não estiver acessível.
   *
   * @return array Resultado padronizado da operação
   */
  public function delete(string $itemtype, int $id): array
  {
    $this->assertSupportedOperation($itemtype, 'delete');

    $before = $this->readAsset($itemtype, $id);
    if ($before === null) {
      return $this->operationResult($itemtype, $id, 'delete', [], false, "Ativo {$itemtype}:{$id} não encontrado.");
    }

    $inactiveStateId = $this->resolveStateId('Inativo');
    if ($inactiveStateId === null) {
      return $this->operationResult($itemtype, $id, 'delete', [], false, 'Não foi possível resolver ID do estado "Inativo". Coleção State pode estar inacessível.');
    }

    $payload = ['states_id' => $inactiveStateId];
    $this->glpi->put("/{$itemtype}/{$id}", $this->session, [
      'input' => $payload,
    ]);

    $after = $this->readAsset($itemtype, $id);

    return $this->operationResult($itemtype, $id, 'delete', $payload, $after !== null, null, [
      'before' => $before,
      'after'  => $after,
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RESTORE
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Restaura um ativo definindo states_id para "Em uso".
   *
   * @return array Resultado padronizado da operação
   */
  public function restore(string $itemtype, int $id): array
  {
    $this->assertSupportedOperation($itemtype, 'restore');

    $before = $this->readAsset($itemtype, $id);
    if ($before === null) {
      return $this->operationResult($itemtype, $id, 'restore', [], false, "Ativo {$itemtype}:{$id} não encontrado.");
    }

    $activeStateId = $this->resolveStateId('Em uso');
    if ($activeStateId === null) {
      return $this->operationResult($itemtype, $id, 'restore', [], false, 'Não foi possível resolver ID do estado "Em uso". Coleção State pode estar inacessível.');
    }

    $payload = ['states_id' => $activeStateId];
    $this->glpi->put("/{$itemtype}/{$id}", $this->session, [
      'input' => $payload,
    ]);

    $after = $this->readAsset($itemtype, $id);

    return $this->operationResult($itemtype, $id, 'restore', $payload, $after !== null, null, [
      'before' => $before,
      'after'  => $after,
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Retorna campos editáveis para um itemtype.
   */
  public static function editableFields(string $itemtype): array
  {
    return self::EDITABLE_FIELDS[$itemtype] ?? [];
  }

  /**
   * Retorna campos que são dropdowns (requerem ID, não label).
   */
  public static function dropdownFields(): array
  {
    return self::DROPDOWN_FIELDS;
  }

  /**
   * Retorna operações suportadas para um itemtype.
   */
  public static function supportedOperations(string $itemtype): array
  {
    return self::SUPPORTED_OPERATIONS[$itemtype] ?? [];
  }

  /**
   * Verifica se um itemtype é suportado para operação.
   */
  public static function isSupported(string $itemtype, string $operation): bool
  {
    return in_array($operation, self::SUPPORTED_OPERATIONS[$itemtype] ?? [], true);
  }

  /**
   * Resolve um nome de estado para seu ID.
   * Busca na coleção State do GLPI.
   */
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
      // Fallback: tenta resolver por fixtures
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

      // Campo dropdown: se valor é 0 ou string vazia, limpa
      if (in_array($key, self::DROPDOWN_FIELDS, true)) {
        if ($value === 0 || $value === '0' || $value === '') {
          $filtered[$key] = 0;
        } elseif (is_int($value)) {
          $filtered[$key] = $value;
        } elseif (is_string($value) && ctype_digit($value)) {
          $filtered[$key] = (int) $value;
        }
        // Se não for ID válido, ignora (não aceita label)
        continue;
      }

      // Campo string: trim, preserva null para limpeza
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

  private function operationResult(
    string $itemtype,
    ?int $id,
    string $action,
    array $requestedFields,
    bool $verified,
    ?string $error = null,
    array $extra = []
  ): array {
    $result = [
      'operation_id' => uniqid('op_', true),
      'itemtype'     => $itemtype,
      'id'           => $id,
      'action'       => $action,
      'requested_fields' => $requestedFields,
      'verified'     => $verified,
      'timestamp'    => date('c'),
    ];

    if ($error !== null) {
      $result['status'] = 'failed';
      $result['error']  = $error;
    } elseif ($verified) {
      $result['status'] = 'completed_verified';
    } else {
      $result['status'] = 'completed_unverified';
    }

    foreach ($extra as $key => $value) {
      $result[$key] = $value;
    }

    return $result;
  }
}
