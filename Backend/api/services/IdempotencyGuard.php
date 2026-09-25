<?php
/**
 * api/services/IdempotencyGuard.php
 * -----------------------------------------------------------------------------
 * Prevenção de duplicações via chave de idempotência.
 *
 * Pedidos repetidos:
 * - Retornam operação existente quando equivalentes
 * - Rejeitam quando reutilizam chave com conteúdo diferente
 * - Não executam duas gravações concorrentes
 *
 * Persiste estado antes do envio ao GLPI.
 * Após timeout, não repete cegamente — investiga se operação aconteceu.
 */

declare(strict_types=1);

final class IdempotencyGuard
{
  private OperationTracker $tracker;

  public function __construct(OperationTracker $tracker)
  {
    $this->tracker = $tracker;
  }

  /**
   * Gera chave de idempotência a partir dos parâmetros da operação.
   *
   * Formato: {action}:{itemtype}:{id}:{hash dos campos ordenados}
   */
  public static function generateKey(string $action, string $itemtype, int|string $id, array $fields): string
  {
    ksort($fields);
    $fieldsHash = md5(json_encode($fields));
    return "{$action}:{$itemtype}:{$id}:{$fieldsHash}";
  }

  /**
   * Verifica se já existe uma operação equivalente.
   *
   * @return array{allowed: bool, existing?: array, reason?: string}
   */
  public function check(
    string $itemtype,
    int|string $id,
    string $action,
    array $fields,
    ?string $clientKey = null,
    ?string $userId = null
  ): array {
    // Busca operações existentes para o mesmo alvo
    $existing = null;
    if ($clientKey !== null) {
      foreach ($this->tracker->findByCriteria(['user_id' => $userId]) as $candidate) {
        if (($candidate['idempotency_key'] ?? null) !== $clientKey) continue;
        if ($candidate['itemtype'] !== $itemtype || $candidate['action'] !== $action || ($action !== 'create' && (string)$candidate['id'] !== (string)$id) || $candidate['requested_fields'] != $fields) {
          return ['allowed' => false, 'existing' => $candidate, 'reason' => 'Conflito: chave reutilizada com conteúdo diferente.'];
        }
        $existing = $candidate;
        break;
      }
    }

    if ($existing === null) {
      return ['allowed' => true];
    }

    // Operação já em andamento ou concluída
    $state = $existing['state'] ?? 'unknown';

    if (in_array($state, ['completed', 'partial'], true)) {
      return [
        'allowed'  => false,
        'existing' => $existing,
        'reason'   => "Operação equivalente já {$state}: {$existing['operation_id']}",
      ];
    }

    if ($state === 'executing' || $state === 'verifying') {
      return [
        'allowed'  => false,
        'existing' => $existing,
        'reason'   => "Operação equivalente em andamento: {$existing['operation_id']} (estado: {$state})",
      ];
    }

    if ($state === 'prepared') {
      // Operação preparada mas não executada — pode reutilizar
      return [
        'allowed'  => true,
        'existing' => $existing,
        'reason'   => 'Operação preparada mas não executada. Reutilizando.',
      ];
    }

    if ($state === 'failed') {
      // Operação falhou — permite retry
      return [
        'allowed'  => true,
        'existing' => $existing,
        'reason'   => "Operação falhou anteriormente. Permitindo retry.",
      ];
    }

    if ($state === 'refused') {
      // Operação recusada — permite nova tentativa
      return [
        'allowed'  => true,
        'existing' => $existing,
        'reason'   => "Operação recusada anteriormente. Permitindo nova tentativa.",
      ];
    }

    return ['allowed' => true];
  }

  /**
   * Registra uma operação pendente para prevenir duplicatas concorrentes.
   */
  public function registerPending(
    string $itemtype,
    int|string $id,
    string $action,
    array $fields,
    string $userId,
    ?string $clientKey = null
  ): array {
    $operation = $this->tracker->prepare($itemtype, $id, $action, $fields, $userId, $clientKey);
    $this->tracker->audit($operation, 'operation_registered', [
      'fields_count' => count($fields),
    ]);
    return $operation;
  }

  /**
   * Marca operação como em execução.
   */
  public function markExecuting(array $operation): array
  {
    $operation = $this->tracker->transition($operation, 'executing');
    $this->tracker->audit($operation, 'operation_executing');
    return $operation;
  }

  /**
   * Verifica e recupera de timeout.
   *
   * Se a operação ficou em estado 'executing' por muito tempo,
   * pode ter acontecido. Não repete cegamente.
   */
  public function recoverFromTimeout(array $operation, int $timeoutSeconds = 30): array
  {
    $executingAt = $operation['timestamps']['executing'] ?? null;
    if ($executingAt === null) return $operation;

    $elapsed = time() - strtotime($executingAt);
    if ($elapsed < $timeoutSeconds) return $operation;

    // Timeout — marca como falha para permitir retry
    if ($operation['state'] === 'executing') {
      $operation = $this->tracker->transition($operation, 'failed', [
        'error' => "Timeout após {$elapsed}s. Operação pode ter sido executada no GLPI.",
      ]);
      $this->tracker->audit($operation, 'operation_timeout', [
        'elapsed_seconds' => $elapsed,
      ]);
    }

    return $operation;
  }
}
