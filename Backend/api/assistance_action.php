<?php
/**
 * api/assistance_action.php
 * -----------------------------------------------------------------------------
 * Endpoint para registro de ações executadas no fluxo de assistência.
 *
 * Sprint 2: Validação apenas — não persiste em banco.
 * Sprint 3: Será integrado com IntegrationEngine e persistência.
 */

declare(strict_types=1);

final class AssistanceActionEndpoint
{
  private const VALID_EVENTS = [
    'portal-opened',
    'clipboard-copied',
    'instructions-copied',
    'email-generated',
    'email-template-copied',
    'serial-copied',
  ];

  private const VALID_ASSISTANCES = [
    'torino',
    'hbb',
    'acer_geek',
    'acer',
  ];

  public static function register(array $config): void
  {
    $body = json_decode(file_get_contents('php://input'), true);

    if (!$body || !is_array($body)) {
      Responde::erro('Body JSON inválido.', 400);
    }

    $event          = trim($body['event'] ?? '');
    $assistanceId   = trim($body['assistanceId'] ?? '');
    $assetGlpiId    = isset($body['assetGlpiId']) ? (int) $body['assetGlpiId'] : null;
    $workflowVersion = trim($body['workflowVersion'] ?? '');
    $timestamp      = trim($body['timestamp'] ?? '');
    $data           = is_array($body['data'] ?? null) ? $body['data'] : [];

    $errors = self::validate($event, $assistanceId, $assetGlpiId, $timestamp);

    if ($errors !== []) {
      Responde::erro('Dados inválidos.', 422, ['errors' => $errors]);
    }

    // ── Sprint 2: Apenas validar e registrar em log ──────────────────────

    $logEntry = [
      'action' => 'assistance-action-registered',
      'event' => $event,
      'assistanceId' => $assistanceId,
      'assetGlpiId' => $assetGlpiId,
      'workflowVersion' => $workflowVersion,
      'timestamp' => $timestamp,
      'data' => $data,
      'registeredAt' => date('c'),
    ];

    self::logAction($logEntry);

    Responde::ok([
      'data' => [
        'registered' => true,
        'event' => $event,
      ],
    ]);
  }

  private static function validate(string $event, string $assistanceId, ?int $assetGlpiId, string $timestamp): array
  {
    $errors = [];

    if ($event === '') {
      $errors[] = 'event é obrigatório.';
    } elseif (!in_array($event, self::VALID_EVENTS, true)) {
      $errors[] = 'event inválido. Valores aceitos: ' . implode(', ', self::VALID_EVENTS) . '.';
    }

    if ($assistanceId === '') {
      $errors[] = 'assistanceId é obrigatório.';
    } elseif (!in_array($assistanceId, self::VALID_ASSISTANCES, true)) {
      $errors[] = 'assistanceId inválido. Valores aceitos: ' . implode(', ', self::VALID_ASSISTANCES) . '.';
    }

    if ($timestamp === '') {
      $errors[] = 'timestamp é obrigatório.';
    }

    return $errors;
  }

  private static function logAction(array $entry): void
  {
    $logDir = __DIR__ . '/../logs';
    if (!is_dir($logDir)) {
      @mkdir($logDir, 0755, true);
    }

    $logFile = $logDir . '/assistance_actions_' . date('Y-m-d') . '.jsonl';
    $line = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";

    @file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
  }
}
