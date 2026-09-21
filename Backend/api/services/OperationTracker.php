<?php
/**
 * api/services/OperationTracker.php
 * -----------------------------------------------------------------------------
 * Rastreamento de operações de escrita com identificador persistente e estados.
 *
 * Estados: prepared → executing → verifying → completed | partial | failed | refused
 *
 * Cada operação tem:
 * - operation_id único (UUID v4)
 * - Estados e timestamps de cada etapa
 * - Audit trail (quem, o que, quando, resultado)
 * - Persistência em arquivo para recuperação
 */

declare(strict_types=1);

final class OperationTracker
{
  private string $logDir;

  private const STATES = [
    'prepared',    // Payload validado, pronto para enviar
    'executing',   // Enviado ao GLPI, aguardando resposta
    'verifying',   // Releitura após gravação
    'completed',   // Gravação + releitura confirmadas
    'partial',     // Gravação OK mas releitura ou cache falhou
    'failed',      // Gravação não executada
    'refused',     // Rejeitado por validação, concorrência ou idempotência
  ];

  public function __construct(?string $logDir = null)
  {
    $this->logDir = $logDir ?? (realpath(__DIR__ . '/../../logs') ?: __DIR__ . '/../../logs');
    if (!is_dir($this->logDir)) {
      @mkdir($this->logDir, 0755, true);
    }
  }

  /**
   * Gera um UUID v4 para identificação da operação.
   */
  public static function generateId(): string
  {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
  }

  /**
   * Cria uma nova operação em estado 'prepared'.
   */
  public function prepare(
    string $itemtype,
    int|string $id,
    string $action,
    array $requestedFields,
    string $userId,
    ?string $idempotencyKey = null
  ): array {
    $operation = [
      'operation_id'     => self::generateId(),
      'itemtype'         => $itemtype,
      'id'               => $id,
      'action'           => $action,
      'requested_fields' => $requestedFields,
      'user_id'          => $userId,
      'idempotency_key'  => $idempotencyKey,
      'state'            => 'prepared',
      'timestamps'       => [
        'prepared'   => date('c'),
        'executing'  => null,
        'verifying'  => null,
        'completed'  => null,
        'partial'    => null,
        'failed'     => null,
        'refused'    => null,
      ],
      'glpi_result'      => null,
      'readback_result'  => null,
      'cache_result'     => null,
      'error'            => null,
      'attempts'         => 0,
    ];

    $this->persist($operation);
    return $operation;
  }

  /**
   * Transição de estado com validação.
   */
  public function transition(array $operation, string $newState, array $extra = []): array
  {
    if (!in_array($newState, self::STATES, true)) {
      throw new \InvalidArgumentException("Estado inválido: {$newState}");
    }

    $validTransitions = [
      'prepared'   => ['executing', 'refused'],
      'executing'  => ['verifying', 'failed'],
      'verifying'  => ['completed', 'partial', 'failed'],
      'completed'  => [],
      'partial'    => ['verifying'],
      'failed'     => ['executing'],
      'refused'    => [],
    ];

    $current = $operation['state'];
    if (!in_array($newState, $validTransitions[$current] ?? [], true)) {
      throw new \RuntimeException(
        "Transição inválida: {$current} → {$newState}"
      );
    }

    $operation['state'] = $newState;
    $operation['timestamps'][$newState] = date('c');

    foreach ($extra as $key => $value) {
      $operation[$key] = $value;
    }

    $operation['attempts'] = ($operation['attempts'] ?? 0) + 1;

    $this->persist($operation);
    return $operation;
  }

  /**
   * Registra resultado da gravação GLPI.
   */
  public function recordGlpiResult(array $operation, bool $success, ?array $response = null, ?string $error = null): array
  {
    $operation['glpi_result'] = [
      'success'   => $success,
      'response'  => $response,
      'error'     => $error,
      'recorded_at' => date('c'),
    ];
    $this->persist($operation);
    return $operation;
  }

  /**
   * Registra resultado da releitura.
   */
  public function recordReadback(array $operation, bool $verified, ?array $data = null): array
  {
    $operation['readback_result'] = [
      'verified'    => $verified,
      'data'        => $data,
      'recorded_at' => date('c'),
    ];
    $this->persist($operation);
    return $operation;
  }

  /**
   * Registra resultado da atualização do cache.
   */
  public function recordCacheUpdate(array $operation, bool $success, ?string $error = null): array
  {
    $operation['cache_result'] = [
      'success'     => $success,
      'error'       => $error,
      'recorded_at' => date('c'),
    ];
    $this->persist($operation);
    return $operation;
  }

  /**
   * Busca operação por ID.
   */
  public function find(string $operationId): ?array
  {
    $file = $this->logDir . '/ops/' . $operationId . '.json';
    if (!file_exists($file)) return null;

    $content = @file_get_contents($file);
    if ($content === false) return null;

    return json_decode($content, true) ?? null;
  }

  /**
   * Busca operações por critérios.
   */
  public function findByCriteria(array $criteria): array
  {
    $dir = $this->logDir . '/ops';
    if (!is_dir($dir)) return [];

    $results = [];
    $files = glob($dir . '/*.json');
    if ($files === false) return [];

    foreach ($files as $file) {
      $content = @file_get_contents($file);
      if ($content === false) continue;

      $op = json_decode($content, true);
      if (!is_array($op)) continue;

      $match = true;
      foreach ($criteria as $key => $value) {
        if (($op[$key] ?? null) !== $value) {
          $match = false;
          break;
        }
      }

      if ($match) {
        $results[] = $op;
      }
    }

    return $results;
  }

  /**
   * Verifica se existe operação equivalente (idempotência).
   */
  public function findEquivalent(string $itemtype, int|string $id, string $action, array $fields): ?array
  {
    $ops = $this->findByCriteria([
      'itemtype' => $itemtype,
      'id'       => $id,
      'action'   => $action,
    ]);

    foreach ($ops as $op) {
      if ($op['state'] === 'refused' || $op['state'] === 'failed') continue;
      if ($op['requested_fields'] === $fields) return $op;
    }

    return null;
  }

  /**
   * Registra entrada de auditoria.
   */
  public function audit(array $operation, string $event, array $context = []): void
  {
    $entry = [
      'timestamp'    => date('c'),
      'operation_id' => $operation['operation_id'],
      'user_id'      => $operation['user_id'],
      'itemtype'     => $operation['itemtype'],
      'id'           => $operation['id'],
      'action'       => $operation['action'],
      'event'        => $event,
      'state'        => $operation['state'],
      'context'      => $context,
    ];

    $auditFile = $this->logDir . '/audit_' . date('Y-m-d') . '.log';
    @file_put_contents($auditFile, json_encode($entry) . "\n", FILE_APPEND | LOCK_EX);
  }

  /**
   * Persiste operação em arquivo.
   */
  private function persist(array $operation): void
  {
    $dir = $this->logDir . '/ops';
    if (!is_dir($dir)) {
      @mkdir($dir, 0755, true);
    }

    $file = $dir . '/' . $operation['operation_id'] . '.json';
    @file_put_contents($file, json_encode($operation, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
  }
}
