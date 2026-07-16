<?php
/**
 * api/workflow.php
 * -----------------------------------------------------------------------------
 * Endpoint do Workflow Inteligente de Chamados.
 *
 * Fornece:
 * - Criação de chamados com dados estendidos do workflow
 * - Lista de assistências técnicas disponíveis
 */

declare(strict_types=1);

final class WorkflowEndpoint
{
  // ── Lista de assistências técnicas (configurável) ─────────────────────────

  private static array $assistencias = [
    ['id' => 'torino',    'nome' => 'Torino',    'descricao' => 'Suporte técnico Torino'],
    ['id' => 'hbb',       'nome' => 'HBB',       'descricao' => 'Suporte técnico HBB'],
    ['id' => 'acer_geek', 'nome' => 'Acer Geek', 'descricao' => 'Suporte técnico Acer Geek'],
    ['id' => 'acer',      'nome' => 'Acer',      'descricao' => 'Suporte técnico Acer'],
  ];

  public static function assistencias(): void
  {
    Responde::ok(['data' => self::$assistencias]);
  }

  // ── Cria chamado via workflow com dados estendidos ────────────────────────

  public static function createWorkflowTicket(array $config): void
  {
    $body = json_decode(file_get_contents('php://input'), true);

    if (!$body) {
      Responde::erro('Body JSON inválido.', 400);
    }

    $titulo          = trim($body['titulo'] ?? '');
    $descricao       = trim($body['descricao'] ?? '');
    $glpiId          = (int)  ($body['glpiId'] ?? 0);
    $itemtype        = trim($body['itemtype'] ?? 'Computer');
    $prioridade      = (int)  ($body['prioridade'] ?? 3);
    $categoria       = (int)  ($body['categoria'] ?? 0);
    $assistencia     = trim($body['assistencia'] ?? '');
    $assistenciaNome = trim($body['assistenciaNome'] ?? '');
    $checklist       = is_array($body['checklist'] ?? null) ? $body['checklist'] : [];
    $regras          = is_array($body['regras'] ?? null) ? $body['regras'] : [];

    if ($titulo === '' || $descricao === '' || $glpiId === 0) {
      Responde::erro('Campos obrigatórios: titulo, descricao, glpiId.', 400);
    }

    if ($assistencia === '') {
      Responde::erro('Campo obrigatório: assistência.', 400);
    }

    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    // ── Monta conteúdo estendido ──────────────────────────────────────────
    $contentLinhas = [$descricao];

    if ($assistenciaNome !== '') {
      array_unshift($contentLinhas, "Assistência: {$assistenciaNome}");
    }

    $mauUso = ($checklist['mau_uso'] ?? '') === 'sim';
    $contratoObrigatorio = !$mauUso;

    $contentLinhas[] = 'Contrato: ' . ($contratoObrigatorio ? 'Obrigatório' : 'Não obrigatório');

    $content = implode("\n", $contentLinhas);

    // ── Monta comment (dados extras para auditoria) ──────────────────────
    $commentParts = [
      '[G.C.C. Workflow v1]',
      "Assistência: {$assistenciaNome}",
      "Tipo problema: " . ($checklist['tipo_problema'] ?? 'Não informado'),
      "Mau uso: " . ($mauUso ? 'Sim' : 'Não'),
    ];

    if ($mauUso && !empty($checklist['mau_uso_detalhe'])) {
      $commentParts[] = "Detalhe mau uso: " . $checklist['mau_uso_detalhe'];
    }

    $commentParts[] = "Contrato: " . ($contratoObrigatorio ? 'Obrigatório' : 'Não obrigatório');

    if (!empty($checklist['observacoes'])) {
      $commentParts[] = "Observações: " . $checklist['observacoes'];
    }

    $comment = implode("\n", $commentParts);

    // ── 1ª chamada: cria o ticket ──────────────────────────────────────────
    $payloadTicket = [
      'input' => [
        'name'     => $titulo,
        'content'  => $content,
        'urgency'  => $prioridade,
        'priority' => $prioridade,
        'impact'   => $prioridade,
        'status'   => 1,
        'type'     => 1,
        'comment'  => $comment,
      ],
    ];

    if ($categoria > 0) {
      $payloadTicket['input']['itilcategories_id'] = $categoria;
    }

    $ticketResult = $glpi->post('/Ticket', $session, $payloadTicket);

    if (empty($ticketResult['id'])) {
      $glpi->killSession($session);
      Responde::erro('GLPI não retornou o ID do chamado.', 502, ['glpi' => $ticketResult]);
    }

    $ticketId = (int) $ticketResult['id'];

    // ── 2ª chamada: vincula ao ativo ───────────────────────────────────────
    $glpi->post('/Item_Ticket', $session, [
      'input' => [
        'tickets_id' => $ticketId,
        'itemtype'   => $itemtype,
        'items_id'   => $glpiId,
      ],
    ]);

    $glpi->killSession($session);

    Responde::ok([
      'data' => [
        'ticketId'      => $ticketId,
        'assistencia'   => $assistencia,
        'mauUso'        => $mauUso,
        'contrato'      => $contratoObrigatorio,
      ],
    ]);
  }
}
