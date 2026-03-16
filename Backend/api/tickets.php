<?php
/**
 * api/tickets.php
 * -----------------------------------------------------------------------------
 * Operações de chamados: listar todos, listar por ativo, criar.
 */

declare(strict_types=1);

final class TicketsEndpoint
{
  // ── Lista todos os chamados ────────────────────────────────────────────────

  public static function listAll(array $config): void
  {
    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();
    $raw     = $glpi->get('/Ticket?range=0-200&expand_dropdowns=true', $session);
    $glpi->killSession($session);

    $items = [];
    foreach ($raw as $t) {
      if (is_array($t)) {
        $items[] = self::mapTicket($t);
      }
    }

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  // ── Lista chamados de um ativo específico ──────────────────────────────────

  public static function listByAsset(array $config, int $glpiId): void
  {
    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    $vinculos = $glpi->get(
      '/Item_Ticket?itemtype=Computer&items_id=' . $glpiId . '&expand_dropdowns=true',
      $session
    );

    $items = [];

    if (is_array($vinculos)) {
      foreach ($vinculos as $v) {
        if (!is_array($v) || empty($v['tickets_id'])) continue;

        $ticket = $glpi->get('/Ticket/' . $v['tickets_id'] . '?expand_dropdowns=true', $session);
        if (is_array($ticket) && isset($ticket['id'])) {
          $items[] = self::mapTicket($ticket);
        }
      }
    }

    $glpi->killSession($session);

    Responde::ok(['data' => $items, 'count' => count($items)]);
  }

  // ── Cria chamado e vincula ao ativo ────────────────────────────────────────

  public static function create(array $config): void
  {
    $body = json_decode(file_get_contents('php://input'), true);

    if (!$body) {
      Responde::erro('Body JSON inválido.', 400);
    }

    $titulo     = trim($body['titulo']    ?? '');
    $descricao  = trim($body['descricao'] ?? '');
    $glpiId     = (int)  ($body['glpiId']     ?? 0);
    $itemtype   = trim($body['itemtype']  ?? 'Computer');
    $prioridade = (int)  ($body['prioridade'] ?? 3);
    $categoria  = (int)  ($body['categoria']  ?? 0);

    if ($titulo === '' || $descricao === '' || $glpiId === 0) {
      Responde::erro('Campos obrigatórios: titulo, descricao, glpiId.', 400);
    }

    $glpi    = new GlpiClient($config['glpi'] ?? []);
    $session = $glpi->initSession();

    // ── 1ª chamada: cria o ticket ──────────────────────────────────────────
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

    Responde::ok(['data' => ['ticketId' => $ticketId]]);
  }

  // ── Mapper ─────────────────────────────────────────────────────────────────

  private static function mapTicket(array $t): array
  {
    return [
      'id'          => $t['id']                   ?? null,
      'titulo'      => $t['name']                 ?? '',
      'descricao'   => $t['content']              ?? '',
      'status'      => self::mapStatus((int)   ($t['status']             ?? 1)),
      'prioridade'  => self::mapPrioridade((int) ($t['priority']          ?? 3)),
      'categoria'   => is_string($t['itilcategories_id'] ?? null) ? $t['itilcategories_id'] : '',
      'ativo'       => is_string($t['items_id']          ?? null) ? $t['items_id']          : '',
      'abertura'    => $t['date']                 ?? '',
      'solicitante' => is_string($t['users_id_recipient'] ?? null) ? $t['users_id_recipient'] : '',
    ];
  }

  private static function mapStatus(int $id): string
  {
    return match ($id) {
      1       => 'aberto',
      2, 3    => 'em_andamento',
      4       => 'pendente',
      5       => 'resolvido',
      6       => 'fechado',
      default => 'aberto',
    };
  }

  private static function mapPrioridade(int $id): string
  {
    return match ($id) {
      1       => 'muito_baixa',
      2       => 'baixa',
      3       => 'media',
      4       => 'alta',
      5       => 'muito_alta',
      default => 'media',
    };
  }
}