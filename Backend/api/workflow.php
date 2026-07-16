<?php
/**
 * api/workflow.php
 * -----------------------------------------------------------------------------
 * Endpoint do Workflow Inteligente de Chamados — v2.0 (Assistance Flows).
 *
 * Fornece:
 * - Criação de chamados com dados estendidos do workflow
 * - Registro de ações executadas na assistência (auditoria)
 * - Lista de assistências técnicas disponíveis
 * - Categorias GLPI (busca automática)
 */

declare(strict_types=1);

final class WorkflowEndpoint
{
  private static array $assistencias = [
    ['id' => 'torino',    'nome' => 'Torino',    'descricao' => 'Suporte técnico Torino'],
    ['id' => 'hbb',       'nome' => 'HBB',       'descricao' => 'Suporte técnico HBB'],
    ['id' => 'acer_geek', 'nome' => 'Acer Geek', 'descricao' => 'Suporte técnico Acer Geek'],
    ['id' => 'acer',      'nome' => 'Acer',      'descricao' => 'Suporte técnico Acer'],
  ];

  private const WORKFLOW_VERSION = '2.0.0';

  public static function assistencias(): void
  {
    Responde::ok(['data' => self::$assistencias]);
  }

  // ── Categorias GLPI ──────────────────────────────────────────────────────

  public static function categorias(array $config): void
  {
    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    try {
      $raw = $glpi->get('/ITILCategory?range=0-100&expand_dropdowns=true', $session);
      $items = [];

      if (is_array($raw)) {
        foreach ($raw as $cat) {
          if (!is_array($cat)) continue;
          $items[] = [
            'id'   => (int) ($cat['id'] ?? 0),
            'nome' => $cat['completename'] ?? $cat['name'] ?? '',
          ];
        }
      }

      Responde::ok(['data' => $items, 'count' => count($items)]);
    } catch (Throwable $e) {
      Responde::ok(['data' => [], 'count' => 0, 'error' => 'Não foi possível carregar categorias.']);
    } finally {
      $glpi->killSession($session);
    }
  }

  // ── Cria chamado via workflow com dados estendidos ────────────────────────

  public static function createWorkflowTicket(array $config): void
  {
    $body = json_decode(file_get_contents('php://input'), true);

    if (!$body || !is_array($body)) {
      Responde::erro('Body JSON inválido.', 400);
    }

    // ── Extração e sanitização ────────────────────────────────────────────
    $titulo          = trim($body['titulo'] ?? '');
    $descricao       = trim($body['descricao'] ?? '');
    $glpiId          = (int)  ($body['glpiId'] ?? 0);
    $itemtype        = trim($body['itemtype'] ?? 'Computer');
    $prioridade      = max(1, min(5, (int) ($body['prioridade'] ?? 3)));
    $categoria       = (int)  ($body['categoria'] ?? 0);
    $assistencia     = trim($body['assistencia'] ?? '');
    $assistenciaNome = trim($body['assistenciaNome'] ?? '');
    $checklist       = is_array($body['checklist'] ?? null) ? $body['checklist'] : [];
    $regras          = is_array($body['regras'] ?? null) ? $body['regras'] : [];
    $auditData       = is_array($body['auditData'] ?? null) ? $body['auditData'] : [];

    // ── Validação backend ─────────────────────────────────────────────────
    $erros = [];

    if ($titulo === '') {
      $erros[] = 'título é obrigatório';
    }
    if ($descricao === '') {
      $erros[] = 'descrição é obrigatória';
    }
    if ($glpiId <= 0) {
      $erros[] = 'ID do equipamento é obrigatório';
    }
    if ($assistencia === '') {
      $erros[] = 'assistência técnica é obrigatória';
    }

    $assistenciaValida = false;
    foreach (self::$assistencias as $a) {
      if ($a['id'] === $assistencia) {
        $assistenciaValida = true;
        $assistenciaNome = $a['nome'];
        break;
      }
    }
    if (!$assistenciaValida) {
      $erros[] = 'assistência técnica inválida';
    }

    $mauUso = ($checklist['mau_uso'] ?? '') === 'sim';
    $contratoObrigatorio = !$mauUso;

    if (empty($checklist['tipo_problema'])) {
      $erros[] = 'tipo do problema é obrigatório';
    }
    if (empty($checklist['equipamento_liga'])) {
      $erros[] = 'informação sobre equipamento ligar é obrigatória';
    }
    if (empty($checklist['dano_fisico'])) {
      $erros[] = 'informação sobre dano físico é obrigatória';
    }
    if (empty($checklist['mau_uso'])) {
      $erros[] = 'informação sobre mau uso é obrigatória';
    }

    if ($mauUso && empty($checklist['mau_uso_detalhe'])) {
      $erros[] = 'descrição do mau uso é obrigatória quando há mau uso';
    }

    if (!empty($checklist['dano_fisico']) && $checklist['dano_fisico'] === 'sim' && empty($checklist['tipo_dano'])) {
      $erros[] = 'tipo de dano é obrigatório quando há dano físico';
    }

    if (count($erros) > 0) {
      Responde::erro('Dados inválidos: ' . implode('; ', $erros), 400, ['erros' => $erros]);
    }

    // ── Monta conteúdo estendido ──────────────────────────────────────────
    $contentLinhas = [];
    $contentLinhas[] = "Assistência: {$assistenciaNome}";
    $contentLinhas[] = "Tipo de problema: " . ($checklist['tipo_problema'] ?? 'Não informado');
    $contentLinhas[] = "Equipamento liga: " . ($checklist['equipamento_liga'] ?? 'Não informado');
    $contentLinhas[] = "Dano físico: " . (($checklist['dano_fisico'] ?? '') === 'sim' ? 'Sim' : 'Não');

    if (($checklist['dano_fisico'] ?? '') === 'sim' && !empty($checklist['tipo_dano'])) {
      $contentLinhas[] = "Tipo de dano: " . $checklist['tipo_dano'];
    }
    if (($checklist['dano_fisico'] ?? '') === 'sim' && !empty($checklist['dano_detalhe'])) {
      $contentLinhas[] = "Detalhe do dano: " . $checklist['dano_detalhe'];
    }

    $contentLinhas[] = "Mau uso: " . ($mauUso ? 'Sim' : 'Não');
    if ($mauUso && !empty($checklist['mau_uso_detalhe'])) {
      $contentLinhas[] = "Detalhe mau uso: " . $checklist['mau_uso_detalhe'];
    }
    $contentLinhas[] = "Contrato: " . ($contratoObrigatorio ? 'Obrigatório' : 'Não obrigatório');

    if (!empty($checklist['observacoes'])) {
      $contentLinhas[] = "Observações: " . $checklist['observacoes'];
    }

    $content = implode("\n", $contentLinhas);

    // ── Monta comment (JSON para auditoria) ───────────────────────────────
    $auditPayload = [
      'workflow' => [
        'version'  => self::WORKFLOW_VERSION,
        'timestamp' => $auditData['timestamp'] ?? date('c'),
      ],
      'assistencia' => [
        'id'   => $assistencia,
        'nome' => $assistenciaNome,
      ],
      'checklist' => [
        'tipo_problema'    => $checklist['tipo_problema'] ?? '',
        'equipamento_liga' => $checklist['equipamento_liga'] ?? '',
        'dano_fisico'      => $checklist['dano_fisico'] ?? '',
        'tipo_dano'        => $checklist['tipo_dano'] ?? '',
        'mau_uso'          => $checklist['mau_uso'] ?? '',
        'observacoes'      => $checklist['observacoes'] ?? '',
      ],
      'regras' => [
        'mauUso'              => $mauUso,
        'contratoObrigatorio' => $contratoObrigatorio,
      ],
    ];

    $comment = json_encode($auditPayload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

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

    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

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
        'assistenciaNome' => $assistenciaNome,
        'mauUso'        => $mauUso,
        'contrato'      => $contratoObrigatorio,
        'workflowVersion' => self::WORKFLOW_VERSION,
      ],
    ]);
  }

  // ── Registro de ação executada na assistência ────────────────────────────

  public static function assistanceAction(): void
  {
    $body = json_decode(file_get_contents('php://input'), true);

    if (!$body || !is_array($body)) {
      Responde::erro('Body JSON inválido.', 400);
    }

    $ticketId    = (int) ($body['ticketId'] ?? 0);
    $assistencia = trim($body['assistencia'] ?? '');
    $actionId    = trim($body['actionId'] ?? '');
    $actionType  = trim($body['actionType'] ?? '');
    $actionData  = is_array($body['actionData'] ?? null) ? $body['actionData'] : [];

    if ($ticketId <= 0) {
      Responde::erro('ID do ticket é obrigatório.', 400);
    }
    if ($assistencia === '') {
      Responde::erro('Assistência é obrigatória.', 400);
    }
    if ($actionId === '') {
      Responde::erro('ID da ação é obrigatório.', 400);
    }

    $auditLog = [
      'ticketId'    => $ticketId,
      'assistencia' => $assistencia,
      'actionId'    => $actionId,
      'actionType'  => $actionType,
      'actionData'  => $actionData,
      'timestamp'   => date('c'),
      'workflow'    => self::WORKFLOW_VERSION,
    ];

    Responde::ok([
      'data' => [
        'logged' => true,
        'audit'  => $auditLog,
      ],
    ]);
  }
}
