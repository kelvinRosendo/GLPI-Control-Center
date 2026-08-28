<?php
/**
 * api/workflow.php
 * -----------------------------------------------------------------------------
 * Endpoint para criação de chamados via Workflow Wizard.
 *
 * Fluxo:
 *   WorkflowEndpoint::create()
 *     → valida input
 *     → monta titulo/descricao
 *     → delega para GlpiClient (initSession → post → killSession)
 *
 * Este endpoint NÃO conhece URLs, headers nem sessões do GLPI.
 * Toda comunicação com o GLPI é feita via GlpiClient.
 */

declare(strict_types=1);

final class WorkflowEndpoint
{
  private const ASSISTENCIA_LABELS = [
    'torino'    => 'Torino',
    'hbb'       => 'HBB',
    'acer_geek' => 'Acer Geek',
    'acer'      => 'Acer',
  ];

  private const PRIORIDADE_LABELS = [
    1 => 'Muito Baixa',
    2 => 'Baixa',
    3 => 'Média',
    4 => 'Alta',
    5 => 'Muito Alta',
  ];

  // ── Endpoint principal ─────────────────────────────────────────────────────

  public static function create(array $config): void
  {
    $body = Request::json();

    if (!$body || !is_array($body)) {
      Responde::erro('Body JSON inválido.', 400);
    }

    // ── Extrair e validar campos obrigatórios ──────────────────────────────

    $glpiId      = (int) ($body['glpiId'] ?? 0);
    $itemtype    = trim($body['itemtype'] ?? 'Computer');
    $assistance  = trim($body['assistance'] ?? '');
    $checklist   = is_array($body['checklist'] ?? null) ? $body['checklist'] : [];
    $observacoes = trim($body['observations'] ?? '');

    $errors = self::validate($glpiId, $assistance, $checklist);

    if ($errors !== []) {
      Responde::erro('Dados inválidos.', 422, ['errors' => $errors]);
    }
    if (!in_array($itemtype, ['Computer', 'Printer'], true)) {
      Responde::erro('itemtype inválido.', 422);
    }

    // ── Montar titulo e descricao ──────────────────────────────────────────

    $titulo    = self::buildTitulo($assistance, $glpiId);
    $descricao = self::buildDescricao($assistance, $checklist, $observacoes);

    // ── Delegar para GlpiClient ────────────────────────────────────────────

    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    $prioridade = (int) ($checklist['prioridade'] ?? 3);

    $payloadTicket = [
      'input' => [
        'name'     => $titulo,
        'content'  => $descricao,
        'urgency'  => $prioridade,
        'priority' => $prioridade,
        'impact'   => $prioridade,
        'status'   => 1,
        'type'     => 1,
      ],
    ];

    $ticketResult = $glpi->post('/Ticket', $session, $payloadTicket);

    if (empty($ticketResult['id'])) {
      $glpi->killSession($session);
      Responde::erro('GLPI não retornou o ID do chamado.', 502, ['glpi' => $ticketResult]);
    }

    $ticketId = (int) $ticketResult['id'];

    // ── Vincular ao ativo ──────────────────────────────────────────────────

    $glpi->post('/Item_Ticket', $session, [
      'input' => [
        'tickets_id' => $ticketId,
        'itemtype'   => $itemtype,
        'items_id'   => $glpiId,
      ],
    ]);

    $glpi->killSession($session);

    Responde::ok(['data' => ['ticketId' => $ticketId]]);
  }

  // ── Validação ──────────────────────────────────────────────────────────────

  private static function validate(int $glpiId, string $assistance, array $checklist): array
  {
    $errors = [];

    if ($glpiId <= 0) {
      $errors[] = 'glpiId é obrigatório e deve ser um número positivo.';
    }

    if ($assistance === '') {
      $errors[] = 'assistance é obrigatória.';
    } elseif (!array_key_exists($assistance, self::ASSISTENCIA_LABELS)) {
      $errors[] = 'assistance inválida. Valores aceitos: ' . implode(', ', array_keys(self::ASSISTENCIA_LABELS)) . '.';
    }

    $tipoProblema = trim($checklist['tipoProblema'] ?? '');
    if ($tipoProblema === '') {
      $errors[] = 'checklist.tipoProblema é obrigatório.';
    }

    return $errors;
  }

  // ── Helpers de construção ──────────────────────────────────────────────────

  private static function buildTitulo(string $assistance, int $glpiId): string
  {
    $label = self::ASSISTENCIA_LABELS[$assistance] ?? ucfirst($assistance);
    return "[{$label}] Chamado Workflow - GLPI #{$glpiId}";
  }

  private static function buildDescricao(string $assistance, array $checklist, string $observacoes): string
  {
    $labelAssistencia = self::ASSISTENCIA_LABELS[$assistance] ?? ucfirst($assistance);
    $labelPrioridade  = self::PRIORIDADE_LABELS[(int) ($checklist['prioridade'] ?? 3)] ?? 'Média';
    $tipoProblema     = trim($checklist['tipoProblema'] ?? '');
    $mauUso           = !empty($checklist['mauUso']);
    $mauUsoDesc       = trim($checklist['mauUsoDescricao'] ?? '');

    $linhas   = [];
    $linhas[] = "Assistência: {$labelAssistencia}";
    $linhas[] = "Tipo do problema: {$tipoProblema}";
    $linhas[] = "Prioridade: {$labelPrioridade}";
    $linhas[] = "Mau uso: " . ($mauUso ? 'Sim' : 'Não');

    if ($mauUso && $mauUsoDesc !== '') {
      $linhas[] = "Descrição do mau uso: {$mauUsoDesc}";
    }

    if ($observacoes !== '') {
      $linhas[] = "Observações: {$observacoes}";
    }

    return implode("\n", $linhas);
  }
}
