<?php
/**
 * GLPI Control Center - AgentExecution.php
 * -----------------------------------------------------------------------------
 * Execução de propostas confirmadas pelo agente de IA.
 *
 * Valida política, permissões, idempotência e concorrência.
 * Executa via AssetWriteService e atualiza cache.
 * Registra auditoria completa.
 *
 * Sprint 07: Execução de operações
 */

declare(strict_types=1);

class AgentExecution {

  private array $glpiConfig;
  private ?string $userId;
  private array $policies;
  private OperationTracker $tracker;

  private static string $auditDir = __DIR__ . '/../../logs';

  public function __construct(array $glpiConfig, ?string $userId = null) {
    $this->glpiConfig = $glpiConfig;
    $this->userId = $userId;
    $this->policies = $this->loadPolicies();
    $this->tracker = new OperationTracker();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUÇÃO INDIVIDUAL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Executa uma proposta confirmada pelo usuário.
   */
  public function executeProposal(string $proposalId, ?string $confirmedHash = null): array {
    if (!$confirmedHash) return ['success' => false, 'status' => 'confirmation_required', 'error' => 'Confirme a prévia pelo botão do painel.'];
    $lock = AgentProposal::lock($proposalId);
    if ($lock === null) return ['success' => false, 'status' => 'in_progress', 'error' => 'Proposta indisponível ou em execução.'];
    try {
      return $this->executeConfirmedProposal($proposalId, $confirmedHash);
    } catch (\Throwable $e) {
      return ['success' => false, 'status' => 'unknown', 'error' => 'Não foi possível concluir: ' . $e->getMessage() . '. Consulte a operação antes de tentar novamente.'];
    } finally { flock($lock, LOCK_UN); fclose($lock); }
  }

  private function executeConfirmedProposal(string $proposalId, string $confirmedHash): array {
    $startTime = microtime(true);

    // 1. Carregar proposta
    $proposal = AgentProposal::get($proposalId);
    if ($proposal === null) {
      return ['success' => false, 'error' => 'Proposta não encontrada', 'status' => 'not_found'];
    }

    // 2. Validar dono
    if ($proposal['created_by'] !== $this->userId) {
      $this->auditProposalDecision($proposal, 'rejected_owner_mismatch');
      return ['success' => false, 'error' => 'Proposta pertence a outro usuário', 'status' => 'unauthorized'];
    }

    if (!AgentProposal::canWrite($proposal['itemtype'])) {
      return ['success' => false, 'status' => 'no_permission', 'error' => 'Sem permissão de edição para este ativo.'];
    }
    if (!isset($proposal['content_hash']) || !hash_equals($proposal['content_hash'], $confirmedHash) || !hash_equals(AgentProposal::contentHash($proposal), $confirmedHash)) {
      return ['success' => false, 'status' => 'confirmation_mismatch', 'error' => 'A prévia mudou ou é antiga. Prepare uma nova proposta.'];
    }
    if (in_array($proposal['status'], ['executed', 'failed'], true) && isset($proposal['result'])) {
      return array_merge($proposal['result'], ['replayed' => true]);
    }

    // 3. Validar estado
    if ($proposal['status'] !== 'pending') {
      return ['success' => false, 'error' => 'Proposta não está pendente: ' . $proposal['status'], 'status' => $proposal['status']];
    }

    // 4. Validar expiração
    if (strtotime($proposal['expires_at'] ?? '') < time()) {
      AgentProposal::updateStatus($proposalId, 'expired');
      $this->auditProposalDecision($proposal, 'expired');
      return ['success' => false, 'error' => 'Proposta expirada', 'status' => 'expired'];
    }

    // 5. Verificar política
    $policyCheck = $this->checkPolicy($proposal);
    if (!$policyCheck['allowed']) {
      $this->auditProposalDecision($proposal, 'rejected_policy', ['reason' => $policyCheck['reason']]);
      return ['success' => false, 'error' => $policyCheck['reason'], 'status' => 'policy_rejected'];
    }

    // 6. Verificar permissões do usuário (re-validar)
    $perms = $proposal['permissions'] ?? [];
    if (!($perms['can_write'] ?? false)) {
      $this->auditProposalDecision($proposal, 'rejected_no_permission');
      return ['success' => false, 'error' => 'Sem permissão de escrita', 'status' => 'no_permission'];
    }

    // 7. Re-validar concorrência (date_mod)
    $validation = AgentProposal::validateForExecution($proposalId);
    if (!$validation['valid']) {
      $this->auditProposalDecision($proposal, 'rejected_stale', ['reason' => $validation['error']]);
      return ['success' => false, 'error' => $validation['error'], 'status' => 'stale'];
    }

    // 8. Verificar idempotência
    $idempotencyKey = 'agent:' . $proposalId;
    $existingOp = $this->findExistingOperation($proposal);
    if ($existingOp !== null) {
      $state = $existingOp['state'] ?? 'unknown';
      if (in_array($state, ['completed', 'partial'])) {
        $this->auditProposalDecision($proposal, 'already_executed', ['operation_id' => $existingOp['operation_id']]);
        return [
          'success' => true,
          'status' => 'already_executed',
          'operation' => $existingOp,
          'message' => 'Proposta já foi executada',
        ];
      }
      if (in_array($state, ['executing', 'verifying', 'prepared'])) {
        $this->auditProposalDecision($proposal, 'already_in_progress', ['operation_id' => $existingOp['operation_id']]);
        return [
          'success' => false,
          'status' => 'in_progress',
          'operation' => $existingOp,
          'message' => 'Proposta já está em execução',
        ];
      }
    }

    // 9. Marcar proposta como executing
    if (AgentProposal::updateStatus($proposalId, 'executing', [
      'confirmed_by' => $this->userId, 'confirmed_at' => date('c'), 'confirmed_hash' => $confirmedHash,
    ]) === null) return ['success' => false, 'error' => 'A proposta não pode mais executar.'];

    // 10. Executar via AssetWriteService
    $result = $this->executeAssetOperation($proposal, $idempotencyKey);

    // 12. Auditar
    $this->auditProposalDecision($proposal, $result['success'] ? 'executed' : 'execution_failed', $result);

    // 13. Verificação por camadas (sem repetir gravação) — Sprint 08
    $verification = null;
    $opId = $result['operation_id'] ?? null;
    if ($opId) {
      try {
        require_once __DIR__ . '/VerificationService.php';
        require_once __DIR__ . '/FieldNormalizer.php';
        $vs = new VerificationService(null, $this->tracker);
        $isLocal = $this->isLocalProposal($proposalId);
        $verification = $vs->verify($opId, $this->glpiConfig, $isLocal);
      } catch (\Throwable $e) {
        $verification = ['error' => $e->getMessage(), 'state' => 'unknown'];
      }
    }

    $duration = round((microtime(true) - $startTime) * 1000);

    $out = array_merge($result, ['duration_ms' => $duration]);
    if ($verification !== null) {
      $out['verification'] = $verification;
      $overall = $verification['overall'] ?? 'unknown';
      $out['verified'] = in_array($overall, ['verified', 'verified_glpi', 'partial_cache_pending'], true);
      $out['success'] = $result['success'] && $out['verified'];
      $out['status'] = $overall;
      if (!$out['success']) $out['error'] = $result['error'] ?? 'Gravação sem confirmação do valor solicitado. Consulte o comprovante; não repita a escrita.';
    }
    AgentProposal::updateStatus($proposalId, $out['success'] ? 'executed' : 'failed', [
      'operation_id' => $opId, 'result' => $out,
    ]);
    return $out;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUÇÃO EM LOTE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Executa múltiplas propostas em lote.
   * Cada item tem estado e resultado próprios. Persiste lote para sobreviver ao fechamento da aba.
   */
  public function executeBatch(array $proposalIds, array $confirmations = []): array {
    foreach ($proposalIds as $id) {
      if (!is_string($id) || !isset($confirmations[$id]) || !is_string($confirmations[$id])) return ['success' => false, 'error' => 'Confirme a prévia de cada item do lote.'];
    }
    require_once __DIR__ . '/BatchStore.php';
    require_once __DIR__ . '/VerificationService.php';
    $store = new BatchStore();
    $batch = $store->create($proposalIds, $this->userId ?? 'anonymous');
    $batchId = $batch['batch_id'];

    $items = [];
    $totalSuccess = 0;
    $totalFailed = 0;
    $totalSkipped = 0;

    foreach ($proposalIds as $proposalId) {
      $result = $this->executeProposal($proposalId, $confirmations[$proposalId]);
      // Enriquecer com verificação
      $opId = $result['operation_id'] ?? null;
      $verif = null;
      if ($opId) {
        try {
          $vs = new VerificationService(null, $this->tracker);
          $verif = $vs->verify($opId, $this->glpiConfig, $this->isLocalProposal($proposalId));
        } catch (\Throwable $e) { $verif = ['error' => $e->getMessage()]; }
      }
      $item = array_merge(['proposal_id' => $proposalId], $result);
      if ($verif) $item['verification'] = $verif;
      $items[] = $item;
      $store->updateItem($batchId, $item);

      if ($result['success'] === true) {
        $totalSuccess++;
      } elseif ($result['success'] === false && in_array($result['status'] ?? '', ['expired', 'cancelled', 'not_found'])) {
        $totalSkipped++;
      } else {
        $totalFailed++;
      }
    }

    $batch = $store->find($batchId);
    return [
      'batch_id' => $batchId,
      'total' => count($proposalIds),
      'success' => $totalSuccess,
      'failed' => $totalFailed,
      'skipped' => $totalSkipped,
      'items' => $items,
      'partial' => $totalFailed > 0 && $totalSuccess > 0,
      'totals' => $batch['totals'] ?? null,
      'persisted' => true,
    ];
  }

  private function isLocalProposal(string $proposalId): bool
  {
    $p = AgentProposal::get($proposalId);
    if ($p === null) return false;
    $fields = $p['proposed_values'] ?? [];
    $localFields = ['lamp_hours','last_maintenance','next_maintenance','horas','manutencao'];
    foreach (array_keys($fields) as $f) if (in_array($f, $localFields, true)) return true;
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POLÍTICAS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Verifica se a política permite a execução.
   */
  public function checkPolicy(array $proposal): array {
    $action = $proposal['action'] ?? '';
    $itemtype = $proposal['itemtype'] ?? '';

    // Verificar overrides de usuário
    $userMode = $this->getUserMode();

    // Verificar restrições por itemtype
    $typeRestrictions = $this->policies['itemtype_restrictions'][$itemtype] ?? null;
    if ($typeRestrictions === null) {
      return ['allowed' => false, 'reason' => "Itemtype '{$itemtype}' não suportado pelo agente"];
    }

    if (!in_array($userMode, $typeRestrictions['allowed_modes'] ?? [], true)) {
      return ['allowed' => false, 'reason' => "Modo '{$userMode}' não permitido para '{$itemtype}'"];
    }

    // Verificar se operação é permitida no modo
    $modeConfig = $this->policies['modes'][$userMode] ?? [];
    if (!in_array($action, $modeConfig['allowed_operations'] ?? [], true)) {
      return ['allowed' => false, 'reason' => "Operação '{$action}' não permitida no modo '{$userMode}'"];
    }

    // Verificar restrições de campos para auto_execute
    if ($userMode === 'auto_execute' && !($modeConfig['require_confirmation'] ?? true)) {
      $fieldRestrictions = $this->policies['field_restrictions']['auto_execute'][$itemtype] ?? null;
      if ($fieldRestrictions !== null) {
        $proposedValues = $proposal['proposed_values'] ?? [];
        $blockedFields = array_intersect(array_keys($proposedValues), $fieldRestrictions['blocked_fields'] ?? []);
        if (!empty($blockedFields)) {
          return ['allowed' => false, 'reason' => 'Campos bloqueados para execução automática: ' . implode(', ', $blockedFields)];
        }
      }
    }

    return ['allowed' => true, 'mode' => $userMode];
  }

  /**
   * Retorna o modo de autonomia do usuário atual.
   */
  public function getUserMode(): string {
    if ($this->userId === null) return $this->policies['default_mode'] ?? 'prepare_confirm';

    $overrides = $this->policies['user_overrides'] ?? [];
    if (isset($overrides[$this->userId])) {
      return $overrides[$this->userId]['mode'] ?? $this->policies['default_mode'];
    }

    return $this->policies['default_mode'] ?? 'prepare_confirm';
  }

  /**
   * Retorna a política completa (para exibição).
   */
  public function getPolicies(): array {
    return $this->policies;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUÇÃO VIA ASSETWRITESERVICE
  // ══════════════════════════════════════════════════════════════════════════

  private function executeAssetOperation(array $proposal, string $idempotencyKey): array {
    $action = $proposal['action'];
    $itemtype = $proposal['itemtype'];
    $id = $proposal['id'] ?? null;
    $proposedValues = $proposal['proposed_values'] ?? [];

    try {
      $service = new AssetWriteService($this->glpiConfig, $this->userId);

      switch ($action) {
        case 'create':
          $input = $this->prepareCreateInput($itemtype, $proposedValues);
          $result = $service->create($itemtype, $input, $idempotencyKey);
          break;

        case 'update':
          $input = $this->prepareUpdateInput($itemtype, $proposedValues);
          $result = $service->update($itemtype, (int) $id, $input, $idempotencyKey);
          break;

        case 'delete':
          $result = $service->delete($itemtype, (int) $id);
          break;

        case 'restore':
          $result = $service->restore($itemtype, (int) $id);
          break;

        default:
          return ['success' => false, 'error' => "Ação desconhecida: {$action}"];
      }

      return [
        'success' => $result['status'] === 'completed_verified' || $result['status'] === 'completed_partial',
        'operation_id' => $result['operation_id'] ?? null,
        'status' => $result['status'] ?? 'unknown',
        'verified' => $result['verified'] ?? false,
        'error' => $result['error'] ?? null,
        'itemtype' => $itemtype,
        'id' => $result['id'] ?? $id,
        'action' => $action,
      ];

    } catch (\Throwable $e) {
      return ['success' => false, 'error' => 'Erro na execução: ' . $e->getMessage()];
    }
  }

  private function prepareCreateInput(string $itemtype, array $proposedValues): array {
    $editable = AssetWriteService::editableFields($itemtype);
    $input = [];
    foreach ($proposedValues as $field => $value) {
      if (in_array($field, $editable, true)) {
        $input[$field] = $value;
      }
    }
    return $input;
  }

  private function prepareUpdateInput(string $itemtype, array $proposedValues): array {
    return $this->prepareCreateInput($itemtype, $proposedValues);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // IDEMPOTÊNCIA
  // ══════════════════════════════════════════════════════════════════════════

  private function findExistingOperation(array $proposal): ?array {
    $ops = $this->tracker->findByCriteria([
      'itemtype' => $proposal['itemtype'],
      'id' => $proposal['id'] ?? 0,
      'action' => $proposal['action'],
    ]);

    foreach ($ops as $op) {
      $idempotencyKey = $op['idempotency_key'] ?? '';
      if ($idempotencyKey === 'agent:' . $proposal['proposal_id']) {
        return $op;
      }
    }

    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUDITORIA
  // ══════════════════════════════════════════════════════════════════════════

  private function auditProposalDecision(array $proposal, string $event, array $context = []): void {
    $entry = [
      'timestamp' => date('c'),
      'proposal_id' => $proposal['proposal_id'] ?? '',
      'user_id' => $this->userId,
      'action' => $proposal['action'] ?? '',
      'itemtype' => $proposal['itemtype'] ?? '',
      'id' => $proposal['id'] ?? null,
      'event' => $event,
      'context' => $context,
    ];

    if (!($this->policies['audit']['log_policy_decisions'] ?? true)) return;

    $dir = self::$auditDir;
    if (!is_dir($dir)) {
      @mkdir($dir, 0755, true);
    }

    $auditFile = $dir . '/agent_audit_' . date('Y-m-d') . '.log';
    @file_put_contents($auditFile, json_encode($entry) . "\n", FILE_APPEND | LOCK_EX);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÃO
  // ══════════════════════════════════════════════════════════════════════════

  private function loadPolicies(): array {
    $defaults = [
      'default_mode' => 'prepare_confirm',
      'modes' => [
        'read_only' => ['allowed_operations' => []],
        'prepare_confirm' => ['allowed_operations' => ['create', 'update', 'delete', 'restore'], 'require_confirmation' => true],
        'auto_execute' => ['allowed_operations' => ['update'], 'require_confirmation' => false],
      ],
      'itemtype_restrictions' => [
        'Computer' => ['allowed_modes' => ['read_only', 'prepare_confirm', 'auto_execute']],
        'Printer' => ['allowed_modes' => ['read_only', 'prepare_confirm', 'auto_execute']],
      ],
      'field_restrictions' => ['auto_execute' => []],
      'batch_limits' => ['max_items_per_batch' => 10, 'max_auto_items_per_batch' => 1],
      'user_overrides' => [],
      'protected_fields' => ['entities_id', 'is_recursive', 'is_deleted'],
      'audit' => ['log_policy_decisions' => true],
    ];

    $customPath = __DIR__ . '/../../config/agent_policies.php';
    if (file_exists($customPath)) {
      $custom = require $customPath;
      if (is_array($custom)) {
        return array_replace_recursive($defaults, $custom);
      }
    }

    return $defaults;
  }
}
