<?php
/**
 * api/integration_audit_service.php
 * -----------------------------------------------------------------------------
 * Camada de serviço para auditoria de integrações.
 *
 * Camada: Service (orquestração entre Controller e Repository)
 *
 * Sprint 3: Orquestração de validação e log.
 * Sprint 5: Integração com IntegrationAuditRepository para persistência.
 *
 * Arquitetura:
 *   Controller (integration_audit.php) → Service (este arquivo) → Repository
 */

declare(strict_types=1);

final class IntegrationAuditService
{
  /**
   * Processa um lote de registros de auditoria.
   * @param array $records
   * @return array - { processed, errors, details }
   */
  public static function processBatch(array $records): array
  {
    $processed = [];
    $errors = [];

    foreach ($records as $index => $record) {
      try {
        $normalized = self::normalize($record);
        $validation = IntegrationAuditController::validateRecord($normalized);

        if ($validation['valid']) {
          $result = IntegrationAuditRepository::insert($normalized);
          $processed[] = [
            'index' => $index,
            'id' => $result['id'] ?? null,
            'inserted' => $result['inserted'] ?? false,
          ];
        } else {
          $errors[] = [
            'index' => $index,
            'errors' => $validation['errors'],
          ];
        }
      } catch (\Throwable $e) {
        $errors[] = [
          'index' => $index,
          'errors' => [$e->getMessage()],
        ];
      }
    }

    return [
      'processed' => count($processed),
      'errors' => count($errors),
      'details' => [
        'processed' => $processed,
        'errors' => $errors,
      ],
    ];
  }

  /**
   * Normaliza um registro recebido.
   * Aceita tanto o formato novo (integrationKey) quanto o antigo (integrationId).
   * @param array $record
   * @return array
   */
  public static function normalize(array $record): array
  {
    return [
      'integrationKey' => trim($record['integrationKey'] ?? $record['integrationId'] ?? ''),
      'fornecedor' => trim($record['fornecedor'] ?? ''),
      'usuario' => trim($record['usuario'] ?? 'sistema'),
      'equipamento' => is_array($record['equipamento'] ?? null) ? $record['equipamento'] : [
        'nome' => '',
        'patrimonio' => '',
        'serial' => '',
        'glpiId' => null,
      ],
      'acao' => trim($record['acao'] ?? $record['actionId'] ?? ''),
      'resultado' => trim($record['resultado'] ?? ''),
      'auditEvent' => trim($record['auditEvent'] ?? ''),
      'horario' => trim($record['horario'] ?? $record['timestamp'] ?? ''),
      'data' => is_array($record['data'] ?? null) ? $record['data'] : [],
    ];
  }

  /**
   * Retorna estatísticas de auditoria.
   * @return array
   */
  public static function getStats(): array
  {
    return IntegrationAuditRepository::getStats();
  }
}
