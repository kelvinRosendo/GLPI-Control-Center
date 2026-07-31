<?php
/**
 * api/integration_audit.php
 * -----------------------------------------------------------------------------
 * Controller para auditoria de integrações.
 *
 * Camada: Controller (recebe requisição, delega para Service)
 *
 * Sprint 3: Validação apenas — persistência preparada para Sprint 5.
 *
 * Arquitetura:
 *   Controller (este arquivo) → Service → Repository → (Banco: Sprint 5)
 */

declare(strict_types=1);

final class IntegrationAuditController
{
  private const VALID_INTEGRATIONS = [
    'torino',
    'hbb',
    'acer_geek',
    'acer',
  ];

  private const VALID_EVENTS = [
    'portal-opened',
    'clipboard-copied',
    'instructions-copied',
    'email-generated',
    'email-template-copied',
    'serial-copied',
    'integration:start',
    'integration:success',
    'integration:error',
    'integration:cancel',
    'iframe-attempt',
    'iframe-loaded',
    'iframe-blocked',
    'iframe-error',
    'iframe-retry',
    'fallback-start',
    'fallback-finished',
    'fallback-opened-manual',
  ];

  private const VALID_RESULTADOS = [
    'sucesso',
    'falha',
  ];

  /**
   * POST /api/integration/audit
   * Recebe registros de auditoria para validação e processamento.
   */
  public static function receive(array $config): void
  {
    $body = json_decode(file_get_contents('php://input'), true);

    if (!$body || !is_array($body)) {
      Responde::erro('Body JSON inválido.', 400);
    }

    $records = $body['records'] ?? [];
    $metadata = $body['metadata'] ?? [];

    if (!is_array($records) || $records === []) {
      Responde::erro('Nenhum registro de auditoria fornecido.', 422);
    }

    // Delegar validação e processamento para o Service
    $result = IntegrationAuditService::processBatch($records);

    if ($result['errors'] > 0) {
      Responde::erro('Registros com dados inválidos.', 422, [
        'processed' => $result['processed'],
        'errors' => $result['details']['errors'],
      ]);
    }

    Responde::ok([
      'data' => [
        'received' => $result['processed'],
        'validated' => true,
        'synced' => false,
        'message' => 'Registros validados. Persistência pendente (Sprint 5).',
      ],
    ]);
  }

  /**
   * GET /api/integration/audit
   * Retorna registros de auditoria (placeholder para Sprint 5).
   */
  public static function list(array $config): void
  {
    $stats = IntegrationAuditService::getStats();

    Responde::ok([
      'data' => [
        'records' => [],
        'count' => 0,
        'stats' => $stats,
        'message' => 'Consulta de auditoria disponível a partir do Sprint 5.',
      ],
    ]);
  }

  /**
   * Valida um registro individual (usado pelo Service).
   * @param array $record
   * @return array - { valid: bool, errors: string[] }
   */
  public static function validateRecord(array $record): array
  {
    $errors = [];

    $integrationKey = trim($record['integrationKey'] ?? $record['integrationId'] ?? '');
    if ($integrationKey === '') {
      $errors[] = 'integrationKey é obrigatório.';
    } elseif (!in_array($integrationKey, self::VALID_INTEGRATIONS, true)) {
      $errors[] = 'integrationKey inválido.';
    }

    $fornecedor = trim($record['fornecedor'] ?? '');
    if ($fornecedor === '') {
      $errors[] = 'fornecedor é obrigatório.';
    }

    $acao = trim($record['acao'] ?? $record['actionId'] ?? '');
    if ($acao === '') {
      $errors[] = 'acao é obrigatória.';
    }

    $resultado = trim($record['resultado'] ?? '');
    if ($resultado === '') {
      $errors[] = 'resultado é obrigatório.';
    } elseif (!in_array($resultado, self::VALID_RESULTADOS, true)) {
      $errors[] = 'resultado inválido. Valores aceitos: sucesso, falha.';
    }

    $horario = trim($record['horario'] ?? $record['timestamp'] ?? '');
    if ($horario === '') {
      $errors[] = 'horário é obrigatório.';
    } elseif (strtotime($horario) === false) {
      $errors[] = 'horário em formato inválido.';
    }

    return [
      'valid' => empty($errors),
      'errors' => $errors,
    ];
  }
}
